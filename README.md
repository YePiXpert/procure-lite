# Procure Lite v2

自部署的办公用品采购台账：OA 审批单拍照/上传 → 本地 OCR 解析 → 采购执行看板 → 库存与领用发放 → 统计报表。单管理员、单机 Docker 部署、数据完全自持。

## 架构

```
┌──────────┐   /api    ┌──────────┐  HTTP(内网Key) ┌──────────────┐
│  nginx   │ ────────▶ │  NestJS  │ ─────────────▶ │ Python OCR   │
│ 静态前端  │           │ Prisma + │                │ PaddleOCR    │
│ (Vue 3)  │           │ SQLite   │  HTTPS(可配置) │ pdfplumber   │
└──────────┘           └────┬─────┘  ────────────▶ └──────────────┘
                            │ state/ (db·uploads·backups·secret)  LLM API
                                                                (GLM/DeepSeek…)
```

- **apps/web** — Vue 3.5 + Vite + TypeScript + Tailwind v4 + Reka UI（shadcn 风格自建组件）+ ECharts + PWA
- **apps/server** — NestJS 11 + Fastify + Prisma(SQLite) + argon2 认证 + 审计日志 + 备份恢复
- **apps/ocr** — FastAPI + PaddleOCR：PDF 文本层优先、栅格化 OCR 兜底、OA 界面噪音过滤、表格重建
- **packages/shared** — zod API 契约与状态枚举（前后端共享）

## AI 能力（可选）

在「系统设置 → AI 助手」配置任意 OpenAI 兼容接口（默认预填 DeepSeek）后可用，数据面完全自持、开箱降级：

- **自然语言问答**：顶栏「AI 助手」抽屉，直接问「上月各部门采购金额」「谁领用最多」；服务端 tool-calling 只读查询台账/库存/发放/报表，回答附带查询轨迹
- **智能搜索**：台账与库存搜索自动做同义词扩展（搜「打印纸」命中「A4复印纸」），扩展词以库内真实品名落地，AI 关闭时退回普通关键字匹配
- **AI OCR 校对**：导入校对页一键让 LLM 对齐既有品名/部门写法、标记数量单价异常，建议逐项应用、改动始终由人确认

未启用时以上入口自动隐藏或降级，不影响原有功能。开启后提问与所涉台账内容会发送给所配置的模型服务商（API Key 明文存本机数据库）。首次默认值可用 `LLM_BASE_URL / LLM_API_KEY / LLM_MODEL` 环境变量注入，运行时配置存 Setting 表、改完即生效。


## 核心流程

1. **导入**：上传 OA 审批单（PDF/截图，手机可拍照）→ OCR 解析出流水号/部门/经办人/明细 → 校对去重后入台账
2. **执行**：看板流转 待采购 → 待到货 → 待分发；供应商价格记忆提供比价建议
3. **发放**：按领用人拆分发放（结余自动入库），或整单入库后从库存按需出库
4. **管理**：Excel 导出、修改历史回滚、审计日志、自动备份与一键恢复

## 本地开发

```bash
corepack enable && pnpm install
pnpm --filter @procure-lite/shared build

# 终端 1：OCR 服务（首次需 pip install -e "apps/ocr[paddle]"，或跳过仅做轻依赖测试）
cd apps/ocr && python -m venv .venv && . .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"           # 轻依赖（解析逻辑可测，不含 paddle）
pip install -e ".[paddle]"        # 完整 OCR 能力（较重）
uvicorn app.main:app --port 8000

# 终端 2：API + 前端
pnpm db:migrate                   # 初始化开发数据库
pnpm dev                          # API :3000 + Vite :5173（自动代理 /api）
```

访问 http://localhost:5173，首次进入设置管理员密码。

## 测试

```bash
pnpm test          # 前后端全部（vitest）
cd apps/ocr && pytest   # 解析器单测 + API 集成（无需 paddle）
```

## Docker 部署（VPS）

每次 push 到 `main`，GitHub Actions 会自动跑完全部测试后把三个镜像构建并推送到 GHCR（`ghcr.io/yepixpert/procure-lite-{web,server,ocr}`），**VPS 上不需要编译**，直接拉镜像。

> GHCR 包默认私有。首次发布后到 GitHub → 你的 Packages → 各镜像 → Settings → Change visibility 改为 **Public**（公开仓库无敏感信息）；或保持私有并在 VPS 上 `docker login ghcr.io`（PAT 勾选 `read:packages`）。

**首次部署**（服务器上装好 git 与 docker，并以 root 或具有目标目录写权限的用户运行）：

```bash
curl -fsSL https://raw.githubusercontent.com/YePiXpert/procure-lite/main/deploy/deploy.sh | bash
# 自定义端口：同一命令末尾改为 bash -s -- 9000
# 自定义目录：同一命令末尾改为 bash -s -- 8080 /srv/procure-lite
```

默认部署目录为 `/opt/procure-lite`，不存在时自动克隆；已有仓库和 `.env` 会复用。源码开发副本可放在 `/workspace/procure-lite`，不会被脚本自动选为部署目标。目录优先级为显式参数 → `PROCURE_REPO` → `/opt/procure-lite`。

脚本自动完成：生成 `.env`（随机 OCR_API_KEY）→ 从 GHCR 拉镜像并启动（拉取失败自动回退本地构建）→ 健康检查。首次访问 `http://<服务器IP>:8080` 设置管理员密码。

**版本升级**（一行命令，任意目录执行；默认操作 `/opt/procure-lite`）：

```bash
curl -fsSL https://raw.githubusercontent.com/YePiXpert/procure-lite/main/deploy/upgrade.sh | bash
```

旧部署或自定义部署在其他位置时，必须显式指定目录（`PROCURE_REPO` 环境变量也行）。即使从开发仓库运行脚本，默认目标仍是 `/opt/procure-lite`：

```bash
curl -fsSL https://raw.githubusercontent.com/YePiXpert/procure-lite/main/deploy/upgrade.sh | bash -s -- /path/to/procure-lite
bash deploy/upgrade.sh --build     # 不等 CI，直接本地构建（--full 连 OCR 一起）
bash deploy/upgrade.sh --no-pull   # 只更新镜像，不动代码
```

升级前会自动把数据卷（数据库 + 附件 + 配置）打包到 `pre-upgrade-backups/`（保留最近 5 份），脚本末尾附带失败时的回滚命令。数据落在 `procure-state` 卷，日常还可在「系统设置」中开启自动备份并下载异地保存。

## 安全模型

- 单管理员，argon2id 密码哈希，登录失败 5 次锁定 15 分钟
- HttpOnly + SameSite=Strict 签名 Cookie 会话（30 分钟滑动过期），恢复码重置密码
- 所有 `/api/*` 经全局守卫鉴权；OCR 服务仅内网通信且校验 API Key
- 上传类型/大小白名单，备份恢复含 zip-slip 与解压限额防护
