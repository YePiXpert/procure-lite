# 升级验收记录

日期：2026-09-27。生产发布状态：**阻断，外部验收输入未齐**。

机器可读证据及本地镜像摘要见 [验证记录](./upgrade-validation.json)。镜像和应用测试对应其中记录的实现快照；随后补充了发布脚本与文档，部署隔离测试已重新运行（包括版本持久化、保留本机配置、缺卷/缺镜像停机前拦截及回退前快照）。

本轮已执行下列自动化与合成测试。真实样本、第三方调用及目标部署环境回退没有被这些测试替代。

| 验收 | 状态与证据 |
| --- | --- |
| OCR 解析回归 | 43 项，表格、A/B/A、未知数量、逐页混合/失败、旋转坐标 |
| CPU 真实模型 | PaddleOCR 3.7.0 / PP-OCRv6 medium / PaddlePaddle 3.3.1，断网、2 CPU、4GB 合成连续推理通过 |
| 最终合成性能记录 | 冷启动 1.82 秒，12 次热启动 P95 0.27 秒，峰值 RSS 653132KB；不是业务页性能证明 |
| 服务端回归 | 86 项通过，包含草稿版本、GPT 不覆盖人工值、重复写入、丢失原件、恢复故障注入及 Responses 协议错误 |
| 浏览器 | 2 条流程通过；合成 OCR/GPT，真实 API/数据库；测试覆盖 AI 关闭与自动 GPT、恢复草稿、采购、到货、入库/发放、原件和导出 |
| 前端单测与构建 | 40 项通过；Vue 类型检查、生产构建通过 |
| 部署与审计脚本 | 11 项部署隔离测试、2 项精度/评测脚本测试通过 |
| API 正式镜像 | 断网、2 CPU/1GB、全新临时数据，迁移启动、OCR 不可用的人工导入、原件恢复及会话失效通过 |
| 第三方实际能力 | 未执行：未提供服务商地址、凭据和实际模型 ID |
| 真实准确率/收益 | 未执行：没有 30—50 份脱敏样本和人工校对计时 |
| 真实业务页 P95/内存趋势 | 未执行：必须在相同资源限制下测试保留样本 |
| 历史 Float 差异 | 未执行：没有历史数据库；只读报告脚本已提供 |
| 目标部署与完整回退演练 | 未执行：发布脚本和隔离恢复故障测试不等同于生产环境演练 |

## 样本协议

固定 30—50 份脱敏单据，至少 1/3 标记为 holdout，调试期间不读取其金标准。四个独立版本：old、fixed_old、new_ocr、new_ocr_gpt；固定同一环境、配置和样本顺序，记录镜像、源码、模型、提示词版本及时间。

由人工给物理来源行标注 sourceRowId，不能按名称归并。每个文档记录如下 JSON；runs 的行 ID 对齐金标准需人工独立校核，不能采用被测模型生成的名称作匹配依据。

```json
[
  {
    "documentId": "anonymized-001",
    "split": "holdout",
    "gold": [{"sourceRowId":"page1-row1","quantity":3,"unitPrice":2.5}],
    "runs": {
      "old": {"rows":[],"humanEdits":null,"reviewSeconds":null},
      "fixed_old": {"rows":[],"humanEdits":null,"reviewSeconds":null},
      "new_ocr": {"rows":[],"humanEdits":null,"reviewSeconds":null},
      "new_ocr_gpt": {"rows":[],"humanEdits":null,"reviewSeconds":null}
    }
  }
]
```

```sh
python3 scripts/evaluate-imports.py /path/to/private-evaluation.json --split holdout
```

脚本统计漏行率、额外行、数字错误率及人工修改/耗时；缺少数据不会输出通过。发布要求新 OCR 和 OCR+GPT 均不劣于修复后旧版，且 OCR+GPT 至少改善一项人工指标。另行完成 2 CPU/4GB 无 OOM、连续真实任务内存稳定、单页热启动 P95 ≤30 秒，以及第三方与完整回退验收。
