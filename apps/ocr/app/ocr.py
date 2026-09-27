"""PaddleOCR 3 adapter; all returned coordinates refer to the original image."""
from __future__ import annotations
import asyncio
import io
import os
import threading
from typing import Any

ENGINE_VERSION = "3.7.0"
MODEL_NAME = "PP-OCRv6_medium"
_engine: Any = None
_engine_lock = threading.Lock()
_semaphore = asyncio.Semaphore(1)
_engine_ready = False


def get_engine():
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                from paddleocr import PaddleOCR
                _engine = PaddleOCR(
                    device="cpu", enable_mkldnn=False, cpu_threads=int(os.environ.get("OCR_CPU_THREADS", "2")),
                    text_detection_model_name=f"{MODEL_NAME}_det",
                    text_recognition_model_name=f"{MODEL_NAME}_rec",
                    use_doc_orientation_classify=True, use_doc_unwarping=False,
                    use_textline_orientation=True,
                )
    return _engine


def is_engine_ready():
    return _engine_ready


def _original_point(x, y, angle, width, height):
    # The pipeline rotates clockwise by -angle to normalize the page.
    if angle == 90:
        return [width - y, x]
    if angle == 180:
        return [width - x, height - y]
    if angle == 270:
        return [y, height - x]
    return [x, y]


def _to_lines(results, width, height):
    lines = []
    for result in results:
        data = result.json
        if callable(data):
            data = data()
        data = data.get("res", data)
        angle = data.get("doc_preprocessor_res", {}).get("angle", 0)
        angle = angle if angle in (0, 90, 180, 270) else 0
        texts, scores = data.get("rec_texts", []), data.get("rec_scores", [])
        polygons = data.get("rec_polys", [])
        for i, text in enumerate(texts):
            if not text.strip():
                continue
            poly = polygons[i] if i < len(polygons) else None
            box = None
            if poly is not None:
                points = [_original_point(float(x), float(y), angle, width, height) for x, y in poly]
                box = [[max(0, min(1, x / width)), max(0, min(1, y / height))] for x, y in points]
            lines.append({"text": text.strip(), "box": box, "confidence": float(scores[i]) if i < len(scores) else None, "rotation": angle})
    return lines


def _run_sync(image_bytes):
    import numpy as np
    from PIL import Image, ImageOps
    with Image.open(io.BytesIO(image_bytes)) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
        image.thumbnail((2560, 2560))
        result = _to_lines(get_engine().predict(np.array(image)), *image.size)
        image.close()
    return result


async def run_ocr(image_bytes):
    async with _semaphore:
        return await asyncio.to_thread(_run_sync, image_bytes)


async def warmup():
    global _engine_ready
    from PIL import Image, ImageDraw
    image = Image.new("RGB", (240, 80), "white")
    ImageDraw.Draw(image).text((15, 20), "OCR 12345", fill="black")
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    result = await run_ocr(buffer.getvalue())
    if not any("12345" in line["text"].replace(" ", "") for line in result):
        _engine_ready = False
        raise RuntimeError("OCR 就绪样例未识别出校验数字")
    _engine_ready = True
    return result


async def ocr_pdf_page(pdf_bytes, page_index, scale=2.0):
    import pypdfium2 as pdfium
    with pdfium.PdfDocument(pdf_bytes) as pdf:
        page = pdf[page_index]
        bitmap = page.render(scale=min(scale, 2560 / max(page.get_size())))
        image = bitmap.to_pil()
        buf = io.BytesIO()
        image.save(buf, "PNG")
        bitmap.close()
        page.close()
    return await run_ocr(buf.getvalue())
