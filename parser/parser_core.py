import logging
import os
import re
from typing import Optional, Union

from .ocr_utils import (
    _get_ocr,
    _run_ocr,
    _preprocess_image,
    _filter_ui_elements,
    _is_ui_text,
    _group_ocr_by_line_with_coords,
    _resolve_ocr_configs,
    UI_REGEX_PATTERNS,
)
from .strategies import (
    ParserStrategy,
    PDFTableStrategy,
    PDFTextStrategy,
    PDFOCRStrategy,
    OCRImageStrategy,
    ParserContext,
)
from .department_extractor import (
    DEPARTMENT_LABEL_ALIASES,
    DEPARTMENT_LABEL_PATTERN,
    looks_like_department as _looks_like_department,
    clean_department_text as _clean_department_text,
    extract_department_from_row_cells as _extract_department_from_row_cells,
    _contains_department_label,
    _contains_opinion_label,
    _normalize_label_text,
)

logger = logging.getLogger(__name__)

_OCR_RETRY_PREPROCESS, _OCR_MIN_IMAGE_SIDE, _OCR_ENABLE_BINARIZE = _resolve_ocr_configs()


class DocumentParser:
    """采购单据解析器"""

    MAX_PDF_PAGES = 5
    MIN_TEXT_LENGTH_FOR_PDF_PARSE = 40
    HEADER_FIELD_KEYS = ("serial_number", "department", "handler", "request_date")
    DEPARTMENT_LABEL_ALIASES = DEPARTMENT_LABEL_ALIASES
    DEPARTMENT_LABEL_PATTERN = DEPARTMENT_LABEL_PATTERN
    OCR_TABLE_SERIAL_HEADER = "序号"
    OCR_TABLE_ITEM_HEADERS = ("物品", "名称", "品名", "物品名称", "物品名")
    OCR_PRIMARY_ITEM_HEADER = "物品"
    OCR_COLUMN_HEADERS = ("序号", "物品", "数量", "单价", "备注")
    OCR_QUANTITY_MAX = 1000
    OCR_QUANTITY_UNIT_PATTERN = r"(?:个|本|支|盒|包|只|条|件|台|把|套|张|卷|瓶|桶)"
    TABLE_HEADER_KEYWORDS = ("物品名称", "品名", "序号", "名称")
    TABLE_HEADER_REQUIRED_KEYWORDS = ("数量",)
    TABLE_SERIAL_ALIASES = ("序号", "编号")
    TABLE_ITEM_ALIASES = ("物品", "品名", "名称", "物品名", "物品名称")
    TABLE_QUANTITY_HEADER = "数量"
    TABLE_UNIT_PRICE_HEADER = "单价"
    TABLE_REMARK_HEADER = "备注"

    # 正则表达式模式
    PATTERNS = {
        "serial_number": [
            r"(?:流水号|单号|编号|No\.?|NO\.?)[：:\s]*([A-Z0-9\-]+)",
            r"([A-Z]{2,}\d{6,})",
        ],
        "department": [
            rf"{DEPARTMENT_LABEL_PATTERN}[：:\s]*([^\n\r]+)",
        ],
        "handler": [
            r"经办人[：:\s]*([^\s\n（]+)",
            r"申领人[：:\s]*([^\s\n（]+)",
            r"人[：:\s]*([^\s\n（]+)",
        ],
        "date": [
            r"(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})",
            r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})",
        ],
    }

    # 非物品关键词（用于过滤）
    SKIP_KEYWORDS = [
        "插入项",
        "删除项",
        "总金额",
        "合计",
        "金额",
        "【",
        "】",
        "同意",
        "元",
        "部门领导",
        "管理员",
        "意见",
        "归属月份",
        "审批",
        "领用单",
        "序号",
        "编号",
        "No",
        "办公用品",
        "管理员意见",
    ]

    UI_PATTERNS = [
        r"^转发|^转事件|^回退|^指定回退|^打印|^意见|^查找",
        r"^同意|^不同意|^消息|^跟踪|^全部|^指定人",
        r"^处理后归档|^草稿|^暂存|^待办|^附言",
        r"^发起人|^附件|^隐藏|^中国瑞达|^CHINARIDA",
        r"^\d+\(\d+\)$",
        r"^《|^》|^○",
        r"^ds/",
    ]
    UI_REGEX_PATTERNS = tuple(re.compile(pattern) for pattern in UI_PATTERNS)

    OCR_SKIP_KEYWORDS = SKIP_KEYWORDS + [
        "转发",
        "回退",
        "指定",
        "打印",
        "查找",
        "跟踪",
        "全部",
        "草稿",
        "暂存",
        "待办",
        "附言",
        "发起人",
        "附件",
        "隐藏",
        "中国瑞达",
        "CHINARIDA",
    ]

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.file_type = self._detect_file_type()
        self.text = ""
        self.tables = []

    def _detect_file_type(self) -> str:
        """检测文件类型"""
        import os

        ext = os.path.splitext(self.file_path)[1].lower()
        if ext in [".pdf"]:
            return "pdf"
        elif ext in [".png", ".jpg", ".jpeg", ".jfif"]:
            return "image"
        return "unknown"

    def parse(self) -> dict:
        """主解析方法"""
        return ParserContext(self).parse()

    def _parse_pdf(self) -> dict:
        """解析 PDF 文件"""
        try:
            import pdfplumber
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "缺少 pdfplumber 依赖，请先安装 requirements.txt"
            ) from exc

        with pdfplumber.open(self.file_path) as pdf:
            if not pdf.pages:
                return self._get_empty_result()

            pages = pdf.pages[: self.MAX_PDF_PAGES]
            text_parts = []
            table_parts = []

            for page in pages:
                page_text = (page.extract_text() or "").strip()
                if page_text:
                    text_parts.append(page_text)

                page_tables = page.extract_tables() or []
                if not page_tables:
                    # 文本策略对部分表格线不完整的 PDF 更稳。
                    try:
                        page_tables = (
                            page.extract_tables(
                                table_settings={
                                    "vertical_strategy": "text",
                                    "horizontal_strategy": "text",
                                    "snap_tolerance": 3,
                                    "intersection_tolerance": 8,
                                }
                            )
                            or []
                        )
                    except Exception:
                        page_tables = []
                if page_tables:
                    table_parts.extend(page_tables)

            self.text = "\n".join(text_parts)
            self.tables = table_parts

            parsed = self._parse_from_tables_and_text()
            parsed["items"] = self._deduplicate_items(parsed.get("items", []))
            return parsed

    def _merge_pdf_and_ocr_result(self, parsed: dict, ocr_parsed: dict) -> dict:
        """合并 PDF 文本/表格解析与 OCR 兜底结果。

        策略：
        - 已有明细时，优先保留原始明细，避免 OCR 误识别覆盖。
        - 明细为空时，使用 OCR 明细兜底。
        - 表头字段仅在缺失时由 OCR 补齐。
        """
        base = self._get_empty_result()
        base.update(parsed or {})

        parsed_items = self._deduplicate_items((parsed or {}).get("items") or [])
        ocr_items = self._deduplicate_items((ocr_parsed or {}).get("items") or [])
        base["items"] = parsed_items if parsed_items else ocr_items

        for key in self.HEADER_FIELD_KEYS:
            if not str(base.get(key) or "").strip():
                candidate = str((ocr_parsed or {}).get(key) or "").strip()
                if candidate:
                    base[key] = candidate

        return base

    def _score_parse_result(self, result: dict) -> int:
        """综合评分：明细数×4 + 头字段数×3 + 有链接行数×1 + 非默认数量行数×2。"""
        items = result.get("items") or []
        header_fields = sum(
            1 for k in self.HEADER_FIELD_KEYS if str(result.get(k) or "").strip()
        )
        link_rows = sum(
            1 for item in items if str(item.get("purchase_link") or "").strip()
        )
        non_default_qty_rows = sum(
            1 for item in items if item.get("quantity") not in (None, 1)
        )
        return len(items) * 4 + header_fields * 3 + link_rows + non_default_qty_rows * 2

    def _parse_image(self) -> dict:
        """解析图片文件（OCR），支持预处理重试。"""
        result = self._parse_image_from_path(self.file_path)
        if _OCR_RETRY_PREPROCESS and self._is_parse_result_weak(result):
            preprocessed = None
            try:
                preprocessed = _preprocess_image(
                    self.file_path,
                    min_side=_OCR_MIN_IMAGE_SIDE,
                    enable_binarize=_OCR_ENABLE_BINARIZE,
                )
                result2 = self._parse_image_from_path(preprocessed)
                if self._score_parse_result(result2) > self._score_parse_result(result):
                    result2.setdefault("_fallbacks_used", []).append("preprocess_retry")
                    return result2
            except Exception as exc:
                logger.warning("OCR preprocess retry failed: %s", exc)
            finally:
                if preprocessed:
                    try:
                        os.unlink(preprocessed)
                    except OSError:
                        pass
        return result

    def _parse_image_from_path(self, path: str) -> dict:
        """OCR 并解析单张图片路径（内部复用方法）。"""
        raw_result = _run_ocr(path)
        ocr_pages = self._extract_ocr_pages(raw_result)
        ocr_results = ocr_pages[0] if ocr_pages else []

        lines = self._group_ocr_by_line_with_coords(ocr_results)
        filtered_lines = self._filter_ui_elements(lines)

        lines_text = [
            " ".join([item[1][0] for item in line]) for line in filtered_lines
        ]
        self.text = "\n".join(lines_text)

        parsed = self._parse_from_ocr_with_coords(filtered_lines)
        parsed["items"] = self._deduplicate_items(parsed.get("items", []))
        return parsed

    def _is_parse_result_weak(self, result: dict) -> bool:
        """判断解析结果是否不充分（需要预处理重试）。"""
        items = result.get("items") or []
        has_header = any(
            str(result.get(k) or "").strip() for k in self.HEADER_FIELD_KEYS
        )
        return len(items) == 0 or (len(items) <= 1 and not has_header)

    def _should_fallback_pdf_ocr(self, parsed: dict) -> bool:
        items = parsed.get("items") or []
        if items and parsed.get("department"):
            return False
        compact_text = re.sub(r"\s+", "", self.text or "")
        has_header = any(parsed.get(key) for key in self.HEADER_FIELD_KEYS)
        missing_department = not str(parsed.get("department") or "").strip()
        return (
            len(compact_text) < self.MIN_TEXT_LENGTH_FOR_PDF_PARSE
            or not has_header
            or missing_department
        )

    def _is_ocr_item(self, value) -> bool:
        return (
            isinstance(value, (list, tuple))
            and len(value) >= 2
            and isinstance(value[0], (list, tuple))
            and isinstance(value[1], (list, tuple))
            and len(value[1]) >= 1
        )

    def _extract_ocr_pages(self, raw_result) -> list[list]:
        """兼容 PaddleOCR 图片/PDF 的不同返回结构。"""
        if not isinstance(raw_result, list) or not raw_result:
            return []

        pages: list[list] = []

        # 情况1：图片常见结构 [[item, item, ...]]
        if len(raw_result) == 1 and isinstance(raw_result[0], list):
            first = raw_result[0]
            if first and self._is_ocr_item(first[0]):
                return [first]

        # 情况2：PDF 多页结构 [[page1_items], [page2_items], ...]
        for entry in raw_result:
            if not isinstance(entry, list) or not entry:
                continue
            if self._is_ocr_item(entry[0]):
                pages.append(entry)
                continue
            # 情况3：嵌套结构 [[[page_items]], ...]
            if (
                isinstance(entry[0], list)
                and entry[0]
                and self._is_ocr_item(entry[0][0])
            ):
                pages.extend(
                    [
                        sub
                        for sub in entry
                        if isinstance(sub, list) and sub and self._is_ocr_item(sub[0])
                    ]
                )

        # 情况4：少数版本直接返回 [item, item, ...]
        if not pages and self._is_ocr_item(raw_result[0]):
            pages.append(raw_result)

        return pages

    def _parse_pdf_via_ocr(self) -> dict:
        """PDF OCR 兜底：优先用 pypdfium2 渲染页图（240 DPI）再 OCR；不可用时直接喂 PDF。"""
        try:
            return self._parse_pdf_via_ocr_with_pypdfium2()
        except ImportError:
            pass
        except Exception as exc:
            logger.warning("pypdfium2 PDF OCR failed, falling back to direct: %s", exc)
        return self._parse_pdf_via_ocr_direct()

    def _parse_pdf_via_ocr_with_pypdfium2(self) -> dict:
        """用 pypdfium2 渲染 PDF 页为图片（240 DPI），逐页 OCR。"""
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(self.file_path)
        page_count = min(len(pdf), self.MAX_PDF_PAGES)
        if page_count == 0:
            pdf.close()
            return self._get_empty_result()

        text_parts: list[str] = []
        all_items: list[dict] = []
        tmp_files: list[str] = []

        try:
            for page_idx in range(page_count):
                page = pdf[page_idx]
                # 240 DPI; PDF 使用 72pt/inch，scale = 240/72
                scale = 240 / 72
                bitmap = page.render(scale=scale, rotation=0)
                pil_image = bitmap.to_pil()

                import tempfile

                fd, tmp_path = tempfile.mkstemp(suffix=".png")
                os.close(fd)
                pil_image.save(tmp_path)
                tmp_files.append(tmp_path)

                try:
                    raw_result = _run_ocr(tmp_path)
                except Exception as exc:
                    logger.warning("OCR failed on PDF page %d: %s", page_idx, exc)
                    continue

                ocr_pages = self._extract_ocr_pages(raw_result)
                page_results = ocr_pages[0] if ocr_pages else []
                lines = self._group_ocr_by_line_with_coords(page_results)
                filtered_lines = self._filter_ui_elements(lines)
                if not filtered_lines:
                    continue
                lines_text = [
                    " ".join([item[1][0] for item in line]) for line in filtered_lines
                ]
                text_parts.append("\n".join(lines_text))
                all_items.extend(self._extract_items_from_ocr_lines(filtered_lines))
        finally:
            pdf.close()
            for tmp in tmp_files:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass

        if not text_parts and not all_items:
            return self._get_empty_result()

        original_text = self.text
        self.text = "\n".join(text_parts)
        result = self._get_empty_result()
        result.update(self._extract_header_info())
        result["items"] = self._deduplicate_items(all_items)

        if not result["items"]:
            result["items"] = self._deduplicate_items(
                self._extract_items_from_text_lines(self.text.split("\n"))
            )

        if original_text and not any(result.get(k) for k in self.HEADER_FIELD_KEYS):
            self.text = original_text
            result.update(self._extract_header_info())

        return result

    def _parse_pdf_via_ocr_direct(self) -> dict:
        """直接将 PDF 路径喂给 PaddleOCR（pypdfium2 不可用时的兜底）。"""
        try:
            raw_result = _run_ocr(self.file_path)
        except Exception as exc:
            logger.warning("PDF OCR fallback failed: %s", exc)
            return self._get_empty_result()

        ocr_pages = self._extract_ocr_pages(raw_result)[: self.MAX_PDF_PAGES]
        if not ocr_pages:
            return self._get_empty_result()

        text_parts = []
        all_items = []
        for page_results in ocr_pages:
            lines = self._group_ocr_by_line_with_coords(page_results)
            filtered_lines = self._filter_ui_elements(lines)
            if not filtered_lines:
                continue
            lines_text = [
                " ".join([item[1][0] for item in line]) for line in filtered_lines
            ]
            text_parts.append("\n".join(lines_text))
            all_items.extend(self._extract_items_from_ocr_lines(filtered_lines))

        if not text_parts and not all_items:
            return self._get_empty_result()

        original_text = self.text
        self.text = "\n".join(text_parts)
        result = self._get_empty_result()
        result.update(self._extract_header_info())
        result["items"] = self._deduplicate_items(all_items)

        if not result["items"]:
            result["items"] = self._deduplicate_items(
                self._extract_items_from_text_lines(self.text.split("\n"))
            )

        # OCR 没拿到表头时，回退到原 PDF 文本再尝试一次。
        if original_text and not any(result.get(k) for k in self.HEADER_FIELD_KEYS):
            self.text = original_text
            result.update(self._extract_header_info())

        return result

    def _group_ocr_by_line_with_coords(
        self, ocr_results: list, line_threshold: Optional[float] = None
    ) -> list:
        """将OCR结果按行分组（保留坐标），阈值自适应 OCR 框高度。"""
        if not ocr_results:
            return []

        # 若未传入阈值，根据框高度中位数自适应计算
        if line_threshold is None:
            box_heights: list[float] = []
            for item in ocr_results:
                try:
                    coords = item[0]
                    top = min(pt[1] for pt in coords)
                    bot = max(pt[1] for pt in coords)
                    h = bot - top
                    if h > 0:
                        box_heights.append(h)
                except (TypeError, IndexError, ValueError):
                    pass
            if box_heights:
                median_h = sorted(box_heights)[len(box_heights) // 2]
                line_threshold = max(8.0, median_h * 0.6)
            else:
                line_threshold = 20.0

        lines = []
        current_line = [ocr_results[0]]
        current_y = ocr_results[0][0][0][1]

        for item in ocr_results[1:]:
            y = item[0][0][1]
            if abs(y - current_y) <= line_threshold:
                current_line.append(item)
            else:
                current_line.sort(key=lambda x: x[0][0][0])
                lines.append(current_line)
                current_line = [item]
                current_y = y

        if current_line:
            current_line.sort(key=lambda x: x[0][0][0])
            lines.append(current_line)

        return lines

    def _filter_ui_elements(self, lines: list) -> list:
        """过滤UI元素（按钮、标签等）"""
        filtered = []
        for line in lines:
            line_text = " ".join([item[1][0] for item in line])
            if not self._is_ui_text(line_text):
                # 过滤掉纯UI元素的item
                filtered_items = []
                for item in line:
                    text = item[1][0]
                    if not self._is_ui_text(text):
                        filtered_items.append(item)
                if filtered_items:
                    filtered.append(filtered_items)

        return filtered

    def _is_ui_text(self, text: str) -> bool:
        return any(pattern.search(text) for pattern in self.UI_REGEX_PATTERNS)

    def _parse_from_ocr_with_coords(self, lines: list) -> dict:
        """从OCR结果（带坐标）解析数据"""
        result = self._get_empty_result()

        # 提取表头信息
        header_info = self._extract_header_info()
        result.update(header_info)

        result["items"] = self._extract_items_from_ocr_lines(lines)

        return result

    def _extract_items_from_ocr_lines(self, lines: list) -> list[dict]:
        table_start = -1
        for idx, line in enumerate(lines):
            line_text = " ".join([item[1][0] for item in line])
            has_item_header = any(
                keyword in line_text for keyword in self.OCR_TABLE_ITEM_HEADERS
            )
            has_serial = self.OCR_TABLE_SERIAL_HEADER in line_text
            # 首选：序号 + 物品/名称/品名
            if has_serial and has_item_header:
                table_start = idx
                break
            # 备选：有物品/名称头 + 数量/单价/规格（无序号也可识别）
            if has_item_header and any(
                kw in line_text for kw in ("数量", "单价", "金额", "规格")
            ):
                table_start = idx
                break
        if table_start == -1:
            return self._extract_items_simple(lines)
        return self._extract_items_from_ocr_merged(lines[table_start:])

    def _extract_items_from_ocr_merged(self, lines: list) -> list[dict]:
        """从OCR行中提取明细（基于表格结构）"""
        items = []

        # 找到表头行，确定列位置
        header_line = None
        header_idx = -1
        for idx, line in enumerate(lines):
            line_text = " ".join([item[1][0] for item in line])
            if (
                self.OCR_TABLE_SERIAL_HEADER in line_text
                and self.OCR_PRIMARY_ITEM_HEADER in line_text
            ):
                header_line = line
                header_idx = idx
                break

        if not header_line:
            # 找不到表头，使用简单方法
            return self._extract_items_simple(lines)

        # 确定各列的X坐标范围
        col_ranges = self._determine_column_ranges(header_line)

        # 解析数据行
        for i in range(header_idx + 1, len(lines)):
            line = lines[i]
            line_text = " ".join([item[1][0] for item in line])

            # 跳过明显不是数据的行
            if self._should_skip_ocr_line(line_text):
                continue

            # 从列中提取数据
            item = self._extract_item_from_columns(line, col_ranges)
            if item and item.get("item_name"):
                items.append(item)

        return items

    def _determine_column_ranges(self, header_line: list) -> dict:
        """确定表格列的X坐标范围（使用中心点坐标，支持列头别名）。"""
        col_keywords = list(self.OCR_COLUMN_HEADERS)
        col_positions: dict = {}

        for item in header_line:
            text = item[1][0]
            # 使用中心点 X 坐标，定位更准确
            try:
                x_center = (item[0][0][0] + item[0][1][0]) / 2
            except (IndexError, TypeError):
                x_center = item[0][0][0]

            # 检查主要列关键字
            for keyword in col_keywords:
                if keyword in text:
                    if (
                        keyword not in col_positions
                        or x_center < col_positions[keyword]
                    ):
                        col_positions[keyword] = x_center

            # 物品名称列别名 → 统一映射到 "物品" 键
            if "物品" not in col_positions:
                for alias in self.OCR_TABLE_ITEM_HEADERS:
                    if alias != "物品" and alias in text:
                        col_positions["物品"] = x_center
                        break

        # 根据关键词位置确定列范围
        (
            serial_header,
            item_header,
            quantity_header,
            unit_price_header,
            remark_header,
        ) = self.OCR_COLUMN_HEADERS
        ranges = {
            "serial": (
                col_positions.get(serial_header, 0),
                col_positions.get(item_header, 1000),
            ),
            "item_name": (
                col_positions.get(item_header, 0),
                col_positions.get(quantity_header, 1000),
            ),
            "quantity": (
                col_positions.get(quantity_header, 0),
                col_positions.get(unit_price_header, 1000),
            ),
            "remark": (col_positions.get(remark_header, 0), 9999),
        }

        return ranges

    def _extract_item_from_columns(
        self, line: list, col_ranges: dict
    ) -> Optional[dict]:
        """从列中提取物品信息"""
        # 按X坐标分类
        item_name_parts = []
        quantity_text = ""
        remark_text = ""

        for item in line:
            text = item[1][0]
            # 使用中心点 X 坐标，与 _determine_column_ranges 保持一致
            try:
                x = (item[0][0][0] + item[0][1][0]) / 2
            except (IndexError, TypeError):
                x = item[0][0][0]

            # 判断属于哪一列
            if col_ranges["item_name"][0] <= x <= col_ranges["item_name"][1]:
                # 物品名称列
                if re.search(r"[\u4e00-\u9fff]", text):
                    item_name_parts.append(text)
            elif col_ranges["quantity"][0] <= x <= col_ranges["quantity"][1]:
                # 数量列
                qty_match = re.search(r"(\d+(?:\.\d+)?)", text)
                if qty_match:
                    quantity_text = qty_match.group(1)
            elif col_ranges["remark"][0] <= x <= col_ranges["remark"][1]:
                # 备注列
                remark_text += " " + text

        # 合并物品名称
        item_name = " ".join(item_name_parts).strip()
        item_name = self._clean_item_name(item_name)
        if not item_name:
            return None

        # 解析数量
        quantity = 1
        if quantity_text:
            try:
                qty = float(quantity_text)
                if 0 < qty <= self.OCR_QUANTITY_MAX:
                    quantity = int(qty) if qty == int(qty) else qty
            except (ValueError, TypeError):
                pass

        # 提取链接
        purchase_link = None
        url_match = re.search(
            r"(?:https?://|www\.)[^\s\u4e00-\u9fff]+", remark_text, re.IGNORECASE
        )
        if url_match:
            purchase_link = self._normalize_purchase_link(url_match.group(0))

        return {
            "item_name": item_name,
            "quantity": quantity,
            "purchase_link": purchase_link,
        }

    def _extract_items_simple(self, lines: list) -> list[dict]:
        """简单提取物品（没有表头时的备用方法）"""
        items = []

        for line in lines:
            line_text = " ".join([item[1][0] for item in line])

            # 跳过非数据行
            if self._should_skip_ocr_line(line_text):
                continue

            item = self._parse_ocr_coord_line_smart(line, line_text)
            if item:
                items.append(item)

        return items

    def _should_skip_ocr_line(self, line_text: str) -> bool:
        """判断是否应该跳过该行"""
        for kw in self.OCR_SKIP_KEYWORDS:
            if kw in line_text:
                return True

        # 跳过纯数字行（可能是数量列）
        if re.match(r"^\d+\.?\d*$", line_text.strip()):
            return True

        return False

    def _parse_ocr_coord_line_smart(self, line: list, line_text: str) -> Optional[dict]:
        """智能解析OCR坐标行"""
        # 查找数量（通常是小数格式的纯文本）
        quantity = None
        qty_match = re.search(r"\b(\d+\.?\d*)\b", line_text)
        if qty_match:
            potential_qty = float(qty_match.group(1))
            # 只把看起来像数量的值当作数量（1-1000之间的小数或整数）
            if 0 < potential_qty <= self.OCR_QUANTITY_MAX:
                # 首选：行中有单位词时精确提取
                if re.search(self.OCR_QUANTITY_UNIT_PATTERN, line_text):
                    quantity = self._smart_extract_quantity_from_line(line_text)

        # 备选：无单位词时，尝试提取行中独立出现的小整数作为数量
        if quantity is None:
            standalone = re.search(
                r"(?<![a-zA-Z0-9\u4e00-\u9fff])([2-9]\d{0,2}|1\d{1,2})(?![a-zA-Z0-9\u4e00-\u9fff])",
                line_text,
            )
            if standalone:
                qty_val = int(standalone.group(1))
                if 2 <= qty_val <= self.OCR_QUANTITY_MAX:
                    quantity = qty_val

        # 提取物品名称（最左侧的中文字符）
        item_name = ""
        for item in line:
            text = item[1][0]
            # 跳过明显的数字/数量文本
            if re.match(r"^\d+\.?\d*$", text):
                continue
            if re.search(r"[\u4e00-\u9fff]", text):
                item_name = text
                break

        if not item_name:
            item_name = line_text.split()[0] if line_text.split() else ""

        # 清理物品名称
        item_name = self._clean_item_name(item_name)
        if not item_name:
            return None

        # 如果没有找到数量，使用默认值1
        if quantity is None:
            quantity = 1

        # 提取链接
        purchase_link = None
        url_match = re.search(
            r"(?:https?://|www\.)[^\s\u4e00-\u9fff]+", line_text, re.IGNORECASE
        )
        if url_match:
            purchase_link = self._normalize_purchase_link(url_match.group(0))

        return {
            "item_name": item_name,
            "quantity": quantity,
            "purchase_link": purchase_link,
        }

    def _smart_extract_quantity_from_line(self, line_text: str) -> Union[int, float]:
        """从行文本中智能提取数量"""
        # 优先匹配带单位的数字
        unit_patterns = [
            rf"(\d+\.?\d*)\s*{self.OCR_QUANTITY_UNIT_PATTERN}",
        ]

        for pattern in unit_patterns:
            match = re.search(pattern, line_text)
            if match:
                try:
                    qty = float(match.group(1))
                    if 0 < qty <= self.OCR_QUANTITY_MAX:
                        return int(qty) if qty == int(qty) else qty
                except (ValueError, TypeError):
                    pass

        # 如果没有找到，返回1
        return 1

    def _get_empty_result(self) -> dict:
        """返回空结果"""
        return {
            "serial_number": "",
            "department": "",
            "handler": "",
            "request_date": "",
            "items": [],
        }

    def _parse_from_tables_and_text(self) -> dict:
        """从表格和文本中解析数据"""
        result = self._get_empty_result()

        # 从文本中提取表头信息
        header_info = self._extract_header_info()
        result.update(header_info)

        # 从表格中提取明细
        items = []
        if self.tables:
            items = self._extract_items_from_tables()
        if not items and self.text:
            items = self._extract_items_from_text_lines(self.text.split("\n"))
        result["items"] = self._deduplicate_items(items)

        return result

    def _parse_from_text_only(self) -> dict:
        """仅从文本中解析（用于图片OCR）"""
        result = self._get_empty_result()

        # 提取表头信息
        header_info = self._extract_header_info()
        result.update(header_info)

        # 按行解析明细
        lines = self.text.split("\n")
        items = self._extract_items_from_text_lines(lines)
        result["items"] = items

        return result

    def _extract_header_info(self) -> dict:
        """提取表头信息"""
        info = {
            "serial_number": "",
            "department": "",
            "handler": "",
            "request_date": "",
        }

        # 流水号
        for pattern in self.PATTERNS["serial_number"]:
            match = re.search(pattern, self.text, re.IGNORECASE)
            if match:
                info["serial_number"] = match.group(1).strip()
                break

        # 部门：严格锚定“申领部门”，优先从顶部表格取右侧值
        info["department"] = self._extract_department()

        # 经办人
        info["handler"] = self._extract_handler()

        # 日期
        info["request_date"] = self._extract_request_date()

        return info

    def _clean_department_text(self, value: str) -> str:
        """清理部门文本，严格执行换行/空格清洗并去掉干扰字段。"""
        if not value:
            return ""
        value = str(value).replace("\n", "").replace(" ", "")
        value = value.replace("\r", "").replace("\t", "")
        value = re.sub(
            rf"^(?:.*?){self.DEPARTMENT_LABEL_PATTERN}[：:\s]*", "", value, count=1
        )
        value = re.split(
            r"(?:经办人|申领人|申请人|申领日期|日期|时间|流水号|单号|编号|联系电话|部门领导意见|管理员意见|审批意见)",
            value,
            maxsplit=1,
        )[0]
        value = value.strip("：:，,。；;")
        if any(
            kw in value
            for kw in (
                "部门领导",
                "领导意见",
                "管理员意见",
                "审批意见",
                "同意",
                "审批",
                "意见",
            )
        ):
            return ""
        if not value or re.fullmatch(r"[\W_]+", value):
            return ""
        return value

    def _normalize_label_text(self, value: str) -> str:
        return re.sub(r"[\s:：]", "", str(value or ""))

    def _contains_department_label(self, value: str) -> bool:
        compact = self._normalize_label_text(value)
        return any(alias in compact for alias in self.DEPARTMENT_LABEL_ALIASES)

    def _contains_opinion_label(self, value: str) -> bool:
        compact = self._normalize_label_text(value)
        return "部门领导意见" in compact or "管理员意见" in compact

    # 常见部门名称后缀，用于区分部门值与人名/日期等旁路字段
    _DEPT_SUFFIX_HINT = re.compile(
        r"[部局处室厅委院所中心站队组科办事业]$|委员会$|管理中心$|办公室$"
    )
    # 纯日期或纯数字形态，不可能是部门名
    _DATE_LIKE = re.compile(r"^[\d\-/年月日\.]+$")

    def _looks_like_department(self, value: str) -> bool:
        """粗略判断候选值是否可能是部门名称。

        规则（宽松）：
        - 包含常见部门后缀词 → 接受
        - 全为日期/数字格式 → 拒绝
        - 长度 >= 4 且不含明显非部门特征 → 接受（防止截断的短部门名）
        - 其余短串（< 4 字）无后缀 → 拒绝（可能是人名或编号）
        """
        if not value:
            return False
        if self._DATE_LIKE.fullmatch(value):
            return False
        if self._DEPT_SUFFIX_HINT.search(value):
            return True
        if len(value) < 4:
            return False
        return True

    def _extract_department_from_row_cells(self, row: list, start_idx: int = 0) -> str:
        """从同一行中提取部门值，容忍空单元格与跨列。

        候选值额外经过 _looks_like_department 初筛，防止把人名、日期等
        旁路字段误写成部门。
        """
        if not row:
            return ""
        for idx in range(max(0, start_idx), len(row)):
            cell_text = str(row[idx] or "").strip()
            if not cell_text:
                continue
            if self._contains_opinion_label(
                cell_text
            ) or self._contains_department_label(cell_text):
                continue
            dept = self._clean_department_text(cell_text)
            if dept and self._looks_like_department(dept):
                return dept
        return ""

    def _extract_department_from_text(self) -> str:
        """从文本中提取申领部门，严格锚定“申领部门”标签。"""
        lines = [line for line in self.text.splitlines() if line and line.strip()]
        stop_labels = r"(?:经办人|申领人|申请人|申领日期|日期|时间|流水号|单号|编号|联系电话|部门领导意见|管理员意见|审批意见)"

        def has_unclosed_bracket(text: str) -> bool:
            return (text.count("（") + text.count("(")) > (
                text.count("）") + text.count(")")
            )

        for idx, line in enumerate(lines):
            if self._contains_department_label(
                line
            ) and not self._contains_opinion_label(line):
                current = re.sub(
                    rf"^.*?{self.DEPARTMENT_LABEL_PATTERN}[：:\s]*", "", line, count=1
                )
                parts = [current] if current else []
                if not current or has_unclosed_bracket(current):
                    for next_line in lines[idx + 1 : idx + 4]:
                        if re.search(
                            stop_labels, next_line
                        ) and not self._contains_department_label(next_line):
                            break
                        parts.append(next_line)
                        if not has_unclosed_bracket("".join(parts)):
                            break
                    current = "".join(parts)
                dept = self._clean_department_text(current)
                if dept:
                    return dept

        patterns = [
            rf"{self.DEPARTMENT_LABEL_PATTERN}[：:\s]*([\s\S]{{1,80}}?)(?={stop_labels}[：:\s]|$)",
        ]
        for pattern in patterns:
            match = re.search(pattern, self.text)
            if match:
                dept = self._clean_department_text(match.group(1))
                if dept:
                    return dept

        # 兜底：保留原有模式匹配
        for pattern in self.PATTERNS["department"]:
            match = re.search(pattern, self.text)
            if match:
                dept = self._clean_department_text(match.group(1))
                if dept:
                    return dept
        return ""

    def _extract_department_from_tables(self) -> str:
        """从PDF表格中提取申领部门（严格取“申领部门”右侧单元格或同格值）。"""
        if not self.tables:
            return ""

        for table in self.tables:
            for row_index, row in enumerate(table):
                if not row:
                    continue
                for idx, cell in enumerate(row):
                    cell_text = str(cell or "").strip()
                    if not cell_text:
                        continue

                    if self._contains_opinion_label(cell_text):
                        continue

                    next_text = (
                        str(row[idx + 1] or "").strip() if idx + 1 < len(row) else ""
                    )
                    pair_compact = self._normalize_label_text(cell_text + next_text)
                    has_split_label = any(
                        alias in pair_compact for alias in self.DEPARTMENT_LABEL_ALIASES
                    )

                    if self._contains_department_label(cell_text) or has_split_label:
                        # 情况1：同单元格“申领部门: XXX”
                        inline_match = re.search(
                            rf"{self.DEPARTMENT_LABEL_PATTERN}[：:\s]*(.+)", cell_text
                        )
                        if inline_match:
                            dept = self._clean_department_text(inline_match.group(1))
                            if dept:
                                return dept

                        # 情况2：值在同一行右侧（可能隔空单元格）
                        start_idx = idx + 2 if has_split_label else idx + 1
                        dept = self._extract_department_from_row_cells(
                            row, start_idx=start_idx
                        )
                        if dept:
                            return dept

                        # 情况3：下一行（或下几行）是值（处理表格换行）
                        # 严格锚定：只扫与情况2相同的列区域（start_idx），
                        # 避免抓到下一行中本属于其他字段的第一个非空单元格。
                        for next_idx in range(
                            row_index + 1, min(row_index + 3, len(table))
                        ):
                            next_row = table[next_idx]
                            dept = self._extract_department_from_row_cells(
                                next_row, start_idx=start_idx
                            )
                            if dept:
                                return dept
        return ""

    def _extract_department(self) -> str:
        """综合提取申领部门：表格优先，其次文本。"""
        dept = self._extract_department_from_tables()
        if dept:
            return dept
        return self._extract_department_from_text()

    def _extract_handler(self) -> str:
        """提取经办人信息，避免被其他“意见”字段干扰。"""
        patterns = [
            r"经办人[：:\s]*([^\s\n（(，,。；;]+)",
            r"申领人[：:\s]*([^\s\n（(，,。；;]+)",
            r"申请人[：:\s]*([^\s\n（(，,。；;]+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, self.text)
            if match:
                return match.group(1).strip()
        return ""

    def _extract_request_date(self) -> str:
        """提取申领日期，统一转为 YYYY-MM-DD。"""
        for pattern in self.PATTERNS["date"]:
            match = re.search(pattern, self.text)
            if match:
                year, month, day = match.groups()
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        return ""

    def _extract_items_from_tables(self) -> list[dict]:
        """从表格中提取明细"""
        items = []

        for table in self.tables:
            # 找到表头行
            header_row_idx = self._find_header_row(table)
            if header_row_idx == -1:
                continue

            # 找到列映射
            col_mapping = self._find_column_mapping(table[header_row_idx])

            # 解析数据行
            for row in table[header_row_idx + 1 :]:
                item = self._parse_table_row(row, col_mapping)
                if item:
                    items.append(item)

        return items

    def _find_header_row(self, table: list) -> int:
        """找到表头行"""
        for idx, row in enumerate(table):
            row_text = " ".join([str(cell or "") for cell in row])
            if any(keyword in row_text for keyword in self.TABLE_HEADER_KEYWORDS):
                if any(
                    keyword in row_text
                    for keyword in self.TABLE_HEADER_REQUIRED_KEYWORDS
                ):
                    return idx
        return -1

    def _find_column_mapping(self, header_row: list) -> dict:
        """找到列的映射关系"""
        mapping = {
            "serial": None,
            "item_name": None,
            "quantity": None,
            "unit_price": None,
            "remark": None,
        }

        for idx, cell in enumerate(header_row):
            cell_text = str(cell or "").strip()
            if any(keyword in cell_text for keyword in self.TABLE_SERIAL_ALIASES):
                mapping["serial"] = idx
            elif any(keyword in cell_text for keyword in self.TABLE_ITEM_ALIASES):
                mapping["item_name"] = idx
            elif self.TABLE_QUANTITY_HEADER in cell_text:
                mapping["quantity"] = idx
            elif self.TABLE_UNIT_PRICE_HEADER in cell_text:
                mapping["unit_price"] = idx
            elif self.TABLE_REMARK_HEADER in cell_text:
                mapping["remark"] = idx

        return mapping

    def _parse_table_row(self, row: list, col_mapping: dict) -> Optional[dict]:
        """解析表格行"""
        # 跳过空行
        if not any(row):
            return None

        # 提取各列数据
        serial = self._get_cell_value(row, col_mapping.get("serial"))
        item_name = self._get_cell_value(row, col_mapping.get("item_name"))
        quantity = self._get_cell_value(row, col_mapping.get("quantity"))
        unit_price = self._get_cell_value(row, col_mapping.get("unit_price"))
        remark = self._get_cell_value(row, col_mapping.get("remark"))

        # 如果没有找到列映射，尝试智能识别
        if not item_name:
            item_name = self._smart_extract_item_name(row)

        # 跳过无效行
        if not item_name or self._should_skip_row(item_name, serial):
            return None

        # 提取数量（从整行文本中）
        quantity_value = self._parse_quantity(quantity)

        # 查找购买链接
        purchase_link = self._extract_link_from_row(row)

        # 清理物品名称
        item_name = self._clean_item_name(item_name)

        if not item_name:
            return None

        return {
            "item_name": item_name,
            "quantity": quantity_value,
            "purchase_link": purchase_link,
        }

    def _get_cell_value(self, row: list, col_idx: Optional[int]) -> str:
        """获取单元格值（空单元格返回空字符串，不跨列回退避免列数据串扰）"""
        if col_idx is None or col_idx >= len(row):
            return ""
        cell = row[col_idx]
        if cell is None or str(cell).strip() == "":
            return ""
        return str(cell).strip()

    def _smart_extract_item_name(self, row: list) -> str:
        """智能提取物品名称"""
        # 找到包含中文且最长的单元格
        candidates = []
        for cell in row:
            if cell:
                cell_str = str(cell).strip()
                if re.search(r"[\u4e00-\u9fff]", cell_str):
                    # 排除明显不是物品名称的单元格
                    if not any(
                        kw in cell_str for kw in ["部门", "经办", "日期", "链接"]
                    ):
                        candidates.append(cell_str)

        # 返回最长的候选
        if candidates:
            return max(candidates, key=len)
        return ""

    def _should_skip_row(self, item_name: str, serial: str) -> bool:
        """判断是否应该跳过该行"""
        # 检查物品名称
        if any(kw in item_name for kw in self.SKIP_KEYWORDS):
            return True

        # 检查序号
        if serial and not serial.isdigit():
            if any(kw in serial for kw in self.SKIP_KEYWORDS):
                return True

        # 空行
        if not item_name or len(item_name) < 2:
            return True

        # 纯数字或特殊字符
        if re.match(r"^[\d\s\-\/\.]+$", item_name):
            return True

        return False

    def _parse_quantity(self, quantity_str: str) -> Union[int, float]:
        """解析数量"""
        if not quantity_str:
            return 1

        # 去除空白
        quantity_str = (
            str(quantity_str)
            .replace("，", ".")
            .replace("。", ".")
            .replace("０", "0")
            .replace("１", "1")
            .replace("２", "2")
            .replace("３", "3")
            .replace("４", "4")
            .replace("５", "5")
            .replace("６", "6")
            .replace("７", "7")
            .replace("８", "8")
            .replace("９", "9")
            .strip()
        )

        # 直接提取数字
        match = re.search(r"(\d+(?:\.\d+)?)", quantity_str)
        if match:
            try:
                qty = float(match.group(1))
                if 0 < qty < 10000:
                    return int(qty) if qty == int(qty) else qty
            except (ValueError, TypeError):
                pass

        return 1

    def _deduplicate_items(self, items: list[dict]) -> list[dict]:
        """去重并做轻量规范化，避免多页/多策略重复提取。"""
        unique_items = []
        seen = set()
        for raw in items:
            item_name = self._clean_item_name(str((raw or {}).get("item_name") or ""))
            if not item_name:
                continue
            quantity = self._parse_quantity(str((raw or {}).get("quantity") or "1"))
            purchase_link = self._normalize_purchase_link(
                (raw or {}).get("purchase_link") or ""
            )
            key = (item_name, quantity, purchase_link or "")
            if key in seen:
                continue
            seen.add(key)
            unique_items.append(
                {
                    "item_name": item_name,
                    "quantity": quantity,
                    "purchase_link": purchase_link,
                }
            )
        return unique_items

    def _extract_link_from_row(self, row: list) -> Optional[str]:
        """从行中提取链接（处理cemall等需要拼接ID的情况）"""
        for cell in row:
            if cell:
                cell_str = str(cell)
                # 查找URL和可能的商品ID
                url_match = re.search(
                    r"((?:https?://|www\.)[^\s\u4e00-\u9fff]+)", cell_str, re.IGNORECASE
                )
                if url_match:
                    url = url_match.group(0).strip()

                    # 检查是否需要拼接商品ID（cemall特殊处理）
                    if "cemall.com.cn/goods/" in url:
                        # 查找URL后面的数字ID（在换行符或空格后）
                        id_match = re.search(
                            r"[\s\n]+(\d{10,})", cell_str[url_match.end() :]
                        )
                        if id_match:
                            product_id = id_match.group(1)
                            # 拼接ID到商品号后面
                            url = re.sub(
                                r"/goods/(\d+)",
                                lambda m: f"/goods/{m.group(1)}{product_id}",
                                url,
                            )

                    normalized = self._normalize_purchase_link(url)
                    if normalized:
                        return normalized

        return None

    def _normalize_purchase_link(self, value: str) -> Optional[str]:
        text = str(value or "").strip()
        if not text:
            return None
        text = (
            text.replace("：", ":")
            .replace("／", "/")
            .replace("．", ".")
            .replace("　", " ")
            .strip()
        )
        text = re.sub(r"\s+", "", text)
        text = re.sub(r"[，。；;、）)\]>》]+$", "", text)
        if re.match(r"^www\.", text, re.IGNORECASE):
            text = f"https://{text}"
        if not re.match(r"^https?://", text, re.IGNORECASE):
            return None
        return text

    def _clean_item_name(self, name: str) -> Optional[str]:
        """清理物品名称，保留型号、规格、括号后缀，避免过度清洗。"""
        if not name:
            return None

        # 移除换行符和多余空白
        name = re.sub(r"[\n\r\t]+", "", name)
        # 处理多余空格（但保留单个空格）
        name = re.sub(r" {2,}", " ", name).strip()

        # 移除序号
        name = re.sub(r"^\d+[\.\s、]*", "", name)

        # 移除完整 URL（http/https 开头）
        name = re.sub(r"https?://[^\s\u4e00-\u9fff]+", "", name)

        # 移除"单位"标注（仅在"单位"关键字明确出现时才清洗，不影响型号/规格括号）
        unit_patterns = [
            r"\s*[（(]\s*单位\s*[:：][^）)]*[）)]\s*",  # (单位:个)
            r"\s*单位\s*[:：]\s*\S+\s*$",  # 末尾的 单位:包
            r"\s*京东\s*",
            r"\s*淘宝\s*",
            r"\s*购买\s*$",  # 仅末尾单独出现的"购买"
        ]
        for pattern in unit_patterns:
            name = re.sub(pattern, "", name)

        # 仅在"链接"后跟 URL 时才截断，保留不含链接的括号内容
        name = re.sub(
            r"\s*(?:采购链接|关联链接|购买链接|链接)\s*[:：]?\s*(?:https?://|www\.)\S*",
            "",
            name,
            flags=re.IGNORECASE,
        )
        # 清理残留的 www. 片段
        name = re.sub(r"\s*www\.[^\s\u4e00-\u9fff]+", "", name, flags=re.IGNORECASE)

        name = name.strip()

        # 验证是否为有效物品名称
        if not self._is_valid_item_name(name):
            return None

        return name

    def _is_valid_item_name(self, name: str) -> bool:
        """检查是否为有效的物品名称"""
        if not name or len(name) < 2:
            return False

        # 必须包含中文
        if not re.search(r"[\u4e00-\u9fff]", name):
            return False

        # 排除特定模式
        exclude_patterns = [
            r"^插入项$",
            r"^删除项$",
            r"^总金额",
            r"^合计",
            r"^【.*】$",
            r"^\[.*\]$",
            r".*意见.*",
            r".*审批.*",
            r"^办公用品$",
            r"^归属月份",
        ]

        for pattern in exclude_patterns:
            if re.search(pattern, name):
                return False

        return True

    def _extract_items_from_text_lines(self, lines: list[str]) -> list[dict]:
        """从文本行中提取明细（用于图片OCR）"""
        items = []

        for line in lines:
            line = line.strip()
            if not line or self._should_skip_row(line, ""):
                continue

            # 简单的行解析
            item = self._parse_text_line(line)
            if item:
                items.append(item)

        return items

    def _parse_text_line(self, line: str) -> Optional[dict]:
        """解析单行文本"""
        # 提取链接
        url_match = re.search(r"(?:https?://|www\.)[^\s]+", line, re.IGNORECASE)
        purchase_link = (
            self._normalize_purchase_link(url_match.group(0)) if url_match else None
        )

        # 移除URL后的文本
        if url_match:
            line = line.replace(url_match.group(0), "")

        # 提取数量
        quantity = self._parse_quantity(line)

        # 清理物品名称
        item_name = self._clean_item_name(line)

        if not item_name:
            return None

        return {
            "item_name": item_name,
            "quantity": quantity,
            "purchase_link": purchase_link,
        }


def parse_document(file_path: str) -> dict:
    """解析文档的入口函数"""
    parser = DocumentParser(file_path)
    return parser.parse()
