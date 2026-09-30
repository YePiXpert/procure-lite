"""Page-local extraction. Never concatenate OCR and text representations of a page."""
from __future__ import annotations

import asyncio
import io
import os
from .normalize import to_halfwidth
from .ocr import ocr_pdf_page, run_ocr
from .reconstruct import rebuild_from_entries, rebuild_from_lines, rows_from_table, finalize_items, extract_fields

MAX_PAGES = int(os.environ.get("OCR_MAX_PAGES", "30"))
PARSER_VERSION = "3"


def _source(items: list[dict], page: int, method: str, entries: list[dict] | None = None):
    for i, item in enumerate(items):
        item["lineId"] = f"p{page}-r{i + 1}"
        matches = [e for e in entries or [] if e["text"] == item.get("rawText")]
        entry = item.pop("_source", None) or (matches[0] if len(matches) == 1 else {})
        item["source"] = {"page": page, "method": method, "rawText": item.pop("rawText", item["itemName"]),
                          "box": entry.get("box"), "confidence": entry.get("confidence"), "rotation": entry.get("rotation", 0)}
    return items


def _result(parts: list[dict], total: int):
    result = {"schemaVersion": 2, "parserVersion": PARSER_VERSION, "items": [], "warnings": [], "pages": [], "pageCount": total}
    modes = set()
    for part in parts:
        modes.add(part["mode"])
        for field in ("serialNumber", "department", "handler", "requestDate"):
            if part.get(field):
                if result.get(field) and result[field] != part[field]:
                    result["warnings"].append(f"第 {part['page']} 页{field}与其他页面不一致，请人工确认")
                else:
                    result[field] = part[field]
        result["items"].extend(part["items"])
        result["warnings"].extend(part["warnings"])
        result["pages"].append({k: part[k] for k in ("page", "status", "mode", "error") if k in part})
    result["mode"] = next(iter(modes)) if len(modes) == 1 else "PDF_MIXED"
    result["warnings"] = list(dict.fromkeys(result["warnings"]))
    return result


def _page_result(result, page, mode):
    return {**result, "page": page, "mode": mode, "status": "DONE"}


async def parse_pdf(pdf_bytes: bytes, page_number: int | None = None) -> dict:
    import pdfplumber
    parts = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        total = len(pdf.pages)
        if total > MAX_PAGES:
            raise ValueError(f"共 {total} 页，超过 {MAX_PAGES} 页上限，请拆分后上传")
        if page_number is not None and not 1 <= page_number <= total:
            raise ValueError("页码超出范围")
        for index in ([page_number - 1] if page_number else range(total)):
            page = pdf.pages[index]
            number = index + 1
            try:
                text = page.extract_text() or ""
                lines = [to_halfwidth(ln).strip() for ln in text.splitlines() if ln.strip()]
                # A large image may contain a scanned table even when a text header exists.
                scanned = any((im.get("width", 0) * im.get("height", 0)) > page.width * page.height * .2 for im in page.images)
                tables = page.find_tables() if not scanned else []
                table_items = []
                covered = []
                for table in tables:
                    rows = rows_from_table(table.extract())
                    if rows:
                        table_items.extend(rows)
                        covered.append(table.bbox)
                if table_items:
                    def outside(obj):
                        x, y = (obj.get("x0", 0) + obj.get("x1", 0)) / 2, (obj.get("top", 0) + obj.get("bottom", 0)) / 2
                        return not any(a <= x <= c and b <= y <= d for a, b, c, d in covered)
                    rest = page.filter(outside).extract_text() or ""
                    result = rebuild_from_lines(rest.splitlines())
                    result.update(extract_fields(lines))
                    items, warnings = finalize_items(table_items)
                    result["items"] = items + result["items"]
                    result["warnings"] = warnings + [w for w in result["warnings"] if "未识别到物品明细" not in w]
                    mode = "PDF_TEXT"
                else:
                    result = rebuild_from_lines(lines)
                    mode = "PDF_TEXT"
                    if scanned or not result["items"]:
                        entries = await ocr_pdf_page(pdf_bytes, index)
                        result = rebuild_from_entries(entries)
                        mode = "PDF_OCR"
                        _source(result["items"], number, mode, entries)
                if not all("lineId" in it for it in result["items"]):
                    _source(result["items"], number, mode)
                parts.append(_page_result(result, number, mode))
            except Exception as error:
                parts.append({"page": number, "status": "FAILED", "mode": "PDF_OCR", "error": str(error), "items": [], "warnings": [f"第 {number} 页解析失败，请重试或人工核对"]})
    return _result(parts, total)


async def parse_image(image_bytes: bytes) -> dict:
    entries = await run_ocr(image_bytes)
    result = rebuild_from_entries(entries)
    _source(result["items"], 1, "IMAGE_OCR", entries)
    return _result([_page_result(result, 1, "IMAGE_OCR")], 1)


async def parse_text(text: str) -> dict:
    result = rebuild_from_lines([to_halfwidth(ln).strip() for ln in text.splitlines() if ln.strip()])
    _source(result["items"], 1, "TEXT")
    return _result([_page_result(result, 1, "TEXT")], 1)


async def parse_dispatch(data: bytes, filename: str, page: int | None = None) -> dict:
    if filename.lower().endswith(".pdf"):
        return await parse_pdf(data, page)
    if filename.lower().endswith(".txt"):
        return await parse_text(data.decode("utf-8", errors="replace"))
    return await parse_image(data)


def document_info(data: bytes, filename: str):
    if filename.lower().endswith(".pdf"):
        import pypdfium2 as pdfium
        with pdfium.PdfDocument(data) as pdf:
            count = len(pdf)
    else:
        count = 1
    if count > MAX_PAGES:
        raise ValueError(f"共 {count} 页，超过 {MAX_PAGES} 页上限，请拆分后上传")
    return {"pageCount": count}


def render_page(data: bytes, filename: str, page: int) -> bytes:
    from PIL import Image, ImageOps
    if filename.lower().endswith(".pdf"):
        import pypdfium2 as pdfium
        with pdfium.PdfDocument(data) as pdf:
            if not 1 <= page <= len(pdf):
                raise ValueError("页码超出范围")
            pg = pdf[page - 1]
            bitmap = pg.render(scale=min(2, 2560 / max(pg.get_size())))
            image = bitmap.to_pil().copy()
            bitmap.close()
            pg.close()
    else:
        if page != 1:
            raise ValueError("页码超出范围")
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    image.thumbnail((2560, 2560))
    out = io.BytesIO()
    image.save(out, "PNG")
    image.close()
    return out.getvalue()
