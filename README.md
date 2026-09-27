# Procure Lite v2

自部署的办公用品采购台账：OA 审批单拍照/上传 → 本地 OCR 解析 → 工作台按单下单、到货、发放 → 库存与领用记录 → 统计报表。单管理员、单机 Docker 部署；台账和原件保存在本机，启用 GPT 后按配置发送单据原件进行复核。

本次升级的实现、配置、回退方式及待完成验收见 [升级说明](docs/upgrade-2026-09.md) 和 [验收记录](docs/upgrade-acceptance.md)。

## 架构

```
┌──────────┐   /api    ┌──────────┐  HTTP(内网Key) ┌──────────────┐
│  nginx   │ ────────▶ │  NestJS  │ ─────────────▶ │ Python OCR   │
│ 静态前端  │           │ Prisma + │                │ PaddleOCR    │
│ (Vue 3)  │           │ SQLite   │  HTTPS(可配置) │ pdfplumber   │
└──────────┘           └────┬─────┘  ────────────▶ └──────────────┘
                            │ state/ (db·uploads·backups·secret)  LLM API
                                                                (GPT / Responses)
```

- **apps/web** — Vue 3.5 + Vite + TypeScript + Tailwind v4 + Reka UI（shadcn 风格自建组件）+ ECharts + PWA
- **apps/server** — NestJS 11 + Fastify + Prisma(SQLite) + argon2 认证 + 审计日志 + 备份恢复
- **apps/ocr** — FastAPI + PaddleOCR：PDF 文本层优先、栅格化 OCR 兜底、OA 界面噪音过滤、表格重建
- **packages/shared** — zod API 契约与状态枚举（前后端共享）

## AI 能力（可选）

在「系统设置 → AI 助手」配置支持 Responses API 的第三方 GPT 服务；通过实际能力检测后才可开启每单自动识别。关闭 AI 或服务失败时保留本地解析和人工导入：

- **自然语言问答**：顶栏「AI 助手」抽屉，直接问「上月各部门采购金额」「谁领用最多」；服务端 tool-calling 只读查询台账/库存/发放/报表，回答附带查询轨迹
- **智能搜索**：台账与库存搜索自动做同义词扩展（搜「打印纸」命中「A4复印纸」），扩展词以库内真实品名落地，AI 关闭时退回普通关键字匹配
- **自动原件复核**：本地逐页 OCR 后自动发送每页原件与本页解析结果给 GPT；数量/价格差异及新增候选须明确处理，草稿自动保存，最后人工确认入账

未启用时以上入口自动隐藏或降级，不影响原有功能。开启后提问、相关台账内容及启用自动识别的单据原件会发送给所配置的模型服务商。密钥优先使用服务器 `LLM_API_KEY` 或 `LLM_API_KEY_FILE`，兼容已有数据库密钥；页面不返回明文。服务地址、模型和任务配置可在设置页管理，相关配置修改后必须重新检测能力。


## 核心流程

1. **导入**：上传 OA 审批单（PDF/截图，手机可拍照）→ OCR 解析出流水号/部门/经办人/明细 → 校对去重后导入台账
2. **工作台**：以 OA 单据为卡片，按 待采购 → 待到货 → 待分发 推进。动作默认作用于整单（一次下单登记共用供应商、逐条填价并记入比价库；整单到货；整单发放给经办人）；只到了一部分或只领走一部分时，取消勾选对应明细即可拆开处理
3. **发放 / 入库**：按领用人拆分发放（结余自动入库），或整单入库后从库存按需出库
4. **管理**：Excel 导出、修改历史回滚、审计日志、自动备份与一键恢复

**状态规则**：执行中三态（待采购/待到货/待分发）之间可手工推进或退回；「已发放」「已入库」只能由发放单、入库动作产生（它们同时写发放记录与库存流水），台账里不能直接改，也不能改回——撤销发放请作废发放单，库存差异用盘点调整。终态记录的品名、数量和单位同样锁定。

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

## 隔离试用候选版

候选业务版本固定为 `b10744b`。独立数据卷、本机端口和不可变镜像的启动、访问及清理方式见 [隔离试用说明](docs/trial-b10744b.md)。试用环境不继承正式数据库或 AI 设置，真实接口与业务效果仍待验收。

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
bash deploy/upgrade.sh --build     # 不等 CI，直接本地构建全部三个镜像
bash deploy/upgrade.sh --no-pull   # 按当前源码 SHA 获取或构建镜像，不拉取代码
```

脚本使用快进更新，保留本机未跟踪文件；已跟踪文件有本机改动时退出。三个服务绑定同一源码的 `sha-xxxxxxx` 标签，并写入 `.env` 的 `RELEASE_TAG`，后续 Compose 操作沿用该版本。缺少任一镜像时构建全部三个服务，OCR 就绪失败则升级失败。

升级前将数据卷和三个旧镜像引用保存到 `pre-upgrade-backups/release-TIMESTAMP/`；回退必须同时恢复旧数据和旧镜像，稳定后由管理员归档回退点。数据落在 `procure-state` 卷，日常还可在「系统设置」中开启自动备份并下载异地保存。

完整回退与回退后的管理命令见 [升级说明](docs/upgrade-2026-09.md#备份恢复与回退)。推送源码和发布 GHCR 镜像不会自动更新 VPS；本次升级的真实样本、第三方接口及目标环境回退验收仍待完成。

## 安全模型

- 单管理员，argon2id 密码哈希，登录失败 5 次锁定 15 分钟
- HttpOnly + SameSite=Strict 签名 Cookie 会话（30 分钟滑动过期），恢复码重置密码
- 所有 `/api/*` 经全局守卫鉴权；OCR 服务仅内网通信且校验 API Key
- 上传类型/大小白名单，备份恢复含 zip-slip 与解压限额防护
