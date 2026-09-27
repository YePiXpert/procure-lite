from app.reconstruct import is_header_row, is_ui_noise, rebuild_from_lines


class TestNoiseFilter:
    def test_buttons(self):
        for text in ["同意", "驳回", "打印", "已阅", "提交"]:
            assert is_ui_noise(text), text

    def test_page_number(self):
        assert is_ui_noise("第 1 页")
        assert is_ui_noise("1/3")

    def test_timestamp(self):
        assert is_ui_noise("2026-08-27 14:30:25")

    def test_content_kept(self):
        assert not is_ui_noise("签字笔 5盒")


class TestHeaderRow:
    def test_header(self):
        assert is_header_row("品名 数量 单价 金额")

    def test_not_header(self):
        assert not is_header_row("签字笔 数量")


class TestRebuild:
    OA_LINES = [
        "办公用品申领单",
        "流水号：OA-2026-0817-003",
        "申领部门：综合管理部",
        "经办人：张伟",
        "申请日期：2026-08-17",
        "同意",
        "第 1 页",
        "品名 数量 单价 链接",
        "签字笔(黑) 20盒 ¥9.90",
        "A4复印纸 10箱 https://item.jd.com/100012345.html",
        "订书机 3个",
        "荧光笔",
    ]

    def test_full_flow(self):
        result = rebuild_from_lines(self.OA_LINES)
        assert result["serialNumber"] == "OA-2026-0817-003"
        assert result["department"] == "综合管理部"
        assert result["handler"] == "张伟"
        assert result["requestDate"] == "2026-08-17"

        names = [it["itemName"] for it in result["items"]]
        assert "订书机" in names
        assert "荧光笔" in names
        # UI 噪音不会成为物品行
        assert "同意" not in names
        assert all("品名" not in n for n in names)

        by_name = {it["itemName"]: it for it in result["items"]}
        assert by_name["签字笔(黑)"]["quantity"] == 20
        assert by_name["订书机"]["quantity"] == 3
        assert by_name["A4复印纸"]["purchaseLink"] == "https://item.jd.com/100012345.html"
        # 数量缺失 → 未知 + 警告
        assert by_name["荧光笔"]["quantity"] is None
        assert any("荧光笔" in w for w in result["warnings"])

    def test_missing_fields_warn(self):
        result = rebuild_from_lines(["随便一行文字 2"])
        assert "serialNumber" not in result
        assert any("流水号" in w for w in result["warnings"])

    def test_department_heuristic(self):
        lines = ["某某公司办公用品申请", "行政部", "物品：签字笔 5"]
        result = rebuild_from_lines(lines)
        assert result.get("department") == "行政部"


def test_duplicate_names_preserve_source_rows():
    result = rebuild_from_lines(["签字笔 2", "订书机 3", "签字笔 4"])
    assert [(r["itemName"], r["quantity"]) for r in result["items"]] == [("签字笔", 2), ("订书机", 3), ("签字笔", 4)]


def test_price_is_not_unknown_quantity():
    result = rebuild_from_lines(["荧光笔 ¥2.50"])
    assert result["items"][0]["quantity"] is None
