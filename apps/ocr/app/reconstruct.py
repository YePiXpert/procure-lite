"""OCR 行重建：过滤 OA 界面噪音，提取表头字段与物品明细行。"""

from __future__ import annotations

import re

from .normalize import (
    clean_item_name,
    extract_url,
    parse_price,
    parse_quantity,
    to_halfwidth,
)

# OA 审批流的界面按钮/流程文字（这些行的坐标往往混在单据正文旁）
UI_NOISE_PATTERNS = [
    r"^同意$", r"^驳回$", r"^退回$", r"^回退$", r"^转交$", r"^加签$", r"^减签$",
    r"^撤回$", r"^提交$", r"^暂存$", r"^保存$", r"^打印$", r"^下载$", r"^导出$",
    r"^关闭$", r"^返回$", r"^详情$", r"^展开$", r"^收起$", r"^更多$",
    r"^审\s*批$", r"^审\s*核$", r"^意\s*见$", r"^流\s*程$", r"^节\s*点$", r"^环\s*节$",
    r"^已阅$", r"^知会$", r"^抄送$", r"^传阅$", r"^催办$", r"^关注$",
    r"^同意$", r"^处\s*理$", r"^待审批$", r"^审批中$", r"^已通过$", r"^已提交$",
    r"^[一-龥]{2,10}(申领单|申请单|采购单|领用单|采购清单)$",
    r"^手机查看$", r"^扫码.*$", r"^第\s*\d+\s*页(共\s*\d+\s*页)?$",
    r"^共\s*\d+\s*(条|项|个|页)", r"^\d+\s*/\s*\d+$",
    r"^上传附件$", r"^添加附件$", r"^附件\s*[(（]\d+[)）)]?$", r"^相关附件$",
    r"^申领明细$", r"^物品清单$", r"^采购明细$", r"^申请内容$", r"^基本信息$",
    r"^当前环节.*", r"^处理人[:：]?\s*$", r"^开始时间[:：]?", r"^结束时间[:：]?",
    r"^耗时.*", r"^流程编号.*流程状态.*",
]

UI_NOISE_RE = re.compile("|".join(UI_NOISE_PATTERNS))

# 表头行（列名行）
HEADER_KEYWORDS = ["品名", "物品名称", "物品", "名称", "规格", "型号", "数量", "单价", "金额",
                   "单位", "链接", "备注", "用途", "申领"]


def is_ui_noise(line: str) -> bool:
    text = to_halfwidth(line).strip()
    if not text:
        return True
    if UI_NOISE_RE.match(text):
        return True
    # 纯时间戳行（2026-08-27 14:30:25 之类，且无其他内容）
    if re.fullmatch(r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?", text):
        return True
    # 纯数字/纯符号
    if re.fullmatch(r"[\d\s:：.\-/|·—－-]+", text):
        return True
    return False


def is_header_row(line: str) -> bool:
    hits = sum(1 for kw in HEADER_KEYWORDS if kw in line)
    return hits >= 2


SERIAL_RE = re.compile(r"(?:流水号|申请编号|单号|编号|流水号[:：])[:：]?\s*([A-Za-z0-9][A-Za-z0-9\-_/]{3,31})")
DEPARTMENT_LABEL_RE = re.compile(
    r"(?:申领部门|申请部门|需求部门|使用部门|部门)[:：]\s*([\u4e00-\u9fa5A-Za-z0-9（）()]{2,24})"
)
DEPARTMENT_SUFFIX_RE = re.compile(r"([\u4e00-\u9fa5A-Za-z0-9]{2,10}(?:部|处|科|室|中心|组|所|局))")
# 标题/栏目行不参与部门启发式
TITLE_NOISE_RE = re.compile(r"(申请|申领|清单|明细|审批|流程|单据|表单)")
HANDLER_RE = re.compile(
    r"(?:经办人|申请人|提出人|需求人|填报人|发起人|申领人|领取人)[:：]?\s*([\u4e00-\u9fa5·]{2,10})"
)
DATE_LABEL_RE = re.compile(
    r"(?:申请日期|提交日期|申领日期|填报日期|单据日期|日期)[:：]?\s*(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)"
)


def extract_fields(lines: list[str]) -> dict:
    joined = "\n".join(lines)
    result: dict = {}

    m = SERIAL_RE.search(joined)
    if m:
        result["serialNumber"] = m.group(1).strip(" -_/")

    m = DEPARTMENT_LABEL_RE.search(joined)
    if m:
        result["department"] = m.group(1).strip()
    else:
        # 启发式：顶部区域里以「部/处/科/中心」结尾的短词（跳过标题行）
        for line in lines[:15]:
            if TITLE_NOISE_RE.search(line) or len(line) > 12:
                continue
            m = DEPARTMENT_SUFFIX_RE.search(line)
            if m:
                result["department"] = m.group(1)
                break

    m = HANDLER_RE.search(joined)
    if m:
        result["handler"] = m.group(1).strip()

    m = DATE_LABEL_RE.search(joined)
    if m:
        from .normalize import parse_date

        parsed = parse_date(m.group(1))
        if parsed:
            result["requestDate"] = parsed

    return result


def extract_item_lines(lines: list[str]) -> list[dict]:
    """从正文行中识别物品明细：行内同时出现可解析数量与合理名称。"""
    items: list[dict] = []

    for raw in lines:
        if is_ui_noise(raw) or is_header_row(raw):
            continue
        line = to_halfwidth(raw).strip()
        if len(line) < 3:
            continue

        url = extract_url(line)
        price = parse_price(line) if re.search(r"(?:单价|价格|[¥￥])", line) else None
        qty = parse_quantity(line)
        name = clean_item_name(line)

        # 数量缺失时保留行（必须人工确认），但要求名称足够像物品
        name_like = (
            len(name) >= 2
            and re.search(r"[\u4e00-\u9fa5A-Za-z]", name)
            and not re.fullmatch(r"[\u4e00-\u9fa5]{1,2}人", name)
        )
        if not name_like:
            continue
        # 排除字段标签行（如「申领部门：财务部」）
        if re.search(r"(部门|经办人|流水号|申请日期|经办|电话|邮箱|审批|意见)[:：]", line):
            continue

        items.append(
            {
                "rawText": raw,
                "itemName": name,
                "quantity": qty,
                "unitPrice": price,
                "purchaseLink": url,
            }
        )

    return items


def finalize_items(items: list[dict]) -> tuple[list[dict], list[str]]:
    """保留未知数量，不能把缺失值变成事实。"""
    warnings: list[str] = []
    cleaned: list[dict] = []
    for it in items:
        if it["quantity"] is None:
            warnings.append(f"「{it['itemName']}」未识别到数量，请对照原件确认")
        cleaned.append({k: v for k, v in it.items() if v is not None or k == "quantity"})
    return cleaned, warnings


def rebuild_from_lines(lines: list[str]) -> dict:
    fields = extract_fields(lines)
    items, warnings = finalize_items(extract_item_lines(lines))
    if not items:
        warnings.insert(0, "未识别到物品明细，请人工补录或换清晰的单据截图")
    for key, label in (("serialNumber", "流水号"), ("department", "申领部门"),
                       ("handler", "经办人"), ("requestDate", "申请日期")):
        if not fields.get(key):
            warnings.append(f"未识别到{label}，请人工确认")
    return {**fields, "items": items, "warnings": warnings}


def rows_from_table(table: list[list[str | None]]) -> list[dict]:
    """pdfplumber 表格行 → 物品行：按表头列名定位品名/数量/单价/链接列。"""
    if not table:
        return []
    header_idx, col_map = find_header(table)
    if col_map is None:
        return []

    items: list[dict] = []
    for row in table[header_idx + 1:]:
        name = (row[col_map["name"]] or "").strip() if col_map["name"] < len(row) else ""
        if not name or is_ui_noise(name):
            continue
        qty_raw = (row[col_map["qty"]] or "").strip() if col_map.get("qty") is not None and col_map["qty"] < len(row) else ""
        qty = parse_quantity(to_halfwidth(qty_raw)) if qty_raw else None
        price = None
        if col_map.get("price") is not None and col_map["price"] < len(row) and row[col_map["price"]]:
            price = parse_price(to_halfwidth(str(row[col_map["price"]])))
        link = None
        if col_map.get("url") is not None and col_map["url"] < len(row) and row[col_map["url"]]:
            link = extract_url(str(row[col_map["url"]]))
        items.append(
            {
                "itemName": clean_item_name(to_halfwidth(name)),
                "quantity": qty,
                "unitPrice": price,
                "purchaseLink": link,
            }
        )
    return [it for it in items if it["itemName"]]


def find_header(table: list[list[str | None]]) -> tuple[int, dict | None]:
    for i, row in enumerate(table[:6]):
        cells = [(c or "") for c in row]
        text = "".join(cells)
        if not text.strip():
            continue
        if not (("名称" in text or "品名" in text or "物品" in text) and "数量" in text):
            continue
        col_map: dict[str, int | None] = {"name": None, "qty": None, "price": None, "url": None}
        for j, cell in enumerate(cells):
            c = cell.strip()
            if not c:
                continue
            if col_map["name"] is None and ("品名" in c or "物品名称" in c or c == "名称" or "物品" in c):
                col_map["name"] = j
            elif col_map["qty"] is None and "数量" in c:
                col_map["qty"] = j
            elif col_map["price"] is None and "单价" in c:
                col_map["price"] = j
            elif col_map["url"] is None and ("链接" in c or "网址" in c):
                col_map["url"] = j
        if col_map["name"] is not None and col_map["qty"] is not None:
            return i, col_map
    return -1, None
