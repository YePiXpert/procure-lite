# 数值精度决策与差异报告

本次不批量转换既有 SQLite Float，也不改变现有金额报表的历史语义。后续迁移目标：数量最多 6 位小数、单价最多 4 位小数、金额 2 位；十进制运算，每行采用 ROUND_HALF_UP，再把行金额相加。先确定货币与舍入约定，再选择定点整数或十进制字符串存储，禁止直接依赖 JavaScript 二进制浮点舍入。

`scripts/precision-audit.py` 以 SQLite `mode=ro` 和 `query_only=ON` 读取数据，逐行报告数量/价格精度裁剪、金额逐行舍入及汇总差异，不写库：

```sh
python3 scripts/precision-audit.py /path/to/snapshot/procure.db > precision-impact.json
```

历史差异报告状态：**待数据输入**。当前工作区没有生产数据库，不能据合成记录声称历史差异为零。上线前对备份副本运行，核对 `affectedRows`、`difference` 及每条 `itemId`；迁移和人工处理清单另行交付。脚本会分别给出未舍入合计、原始精度逐行舍入合计、目标精度逐行舍入合计。
