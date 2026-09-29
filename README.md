# Procure Lite v2

自部署的办公用品采购台账：OA 审批单拍照/上传 → 本地 OCR 解析 → 工作台按单下单、到货、发放 → 库存与领用记录 → 统计报表。单管理员、单机 Docker 部署；台账和原件保存在本机，启用 GPT 后按配置发送单据原件进行复核。

文档：导入 / OCR / AI 接口与备份、升级、回退的当前参考见 [升级说明](docs/upgrade-2026-09.md)；验收状态见 [验收记录](docs/upgrade-acceptance.md)；候选版 `b10744b` 的历史试用见 [隔离试用说明](docs/trial-b10744b.md)；前端设计与维护规范见 [apps/web/DESIGN.md](apps/web/DESIGN.md)。

## 适用范围与不做什么

- 面向一位管理员、自部署在一台机器上的办公用品采购记录：导入 OA 单据、下单、到货、发放或入库、库存与领用统计。
- 不做：多用户 / 多租户与权限分级、审批流、预算管理、合同管理、供应商评分、单位换算 / SKU / 批次库存、多模型路由（AI 功能共用一个模型）。

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

- **apps/web** — Vue 3.5 + Vite + TypeScript + Tailwind v4 + Reka UI（自建组件）+ ECharts + PWA；设计令牌、组件用法与页面约束见 [apps/web/DESIGN.md](apps/web/DESIGN.md)
- **apps/server** — NestJS 11 + Fastify + Prisma(SQLite) + argon2 认证 + 审计日志 + 备份恢复
- **apps/ocr** — FastAPI + PaddleOCR：PDF 文本层优先、栅格化 OCR 兜底、OA 界面噪音过滤、表格重建
- **packages/shared** — zod API 契约与状态枚举（前后端共享）

## 核心流程

1. **导入**：上传 OA 审批单（PDF/截图，手机可拍照）→ 本地 OCR 逐页解析出流水号/部门/经办人/明细（启用 GPT 时自动逐页复核）→ 人工核对草稿、处理重复 → 确认导入台账
   - 草稿自动保存并带版本号，版本过期的保存会被拒绝、不覆盖别处的编辑；本地或 GPT 没有完成的页面要逐页记录人工核对后才能确认；确认时原件作为附件关联到台账记录
   - 导入页底部的「未完成的导入」列出已上传、尚未确认入账的任务，随时可以「继续处理」；列表按是否已确认入账区分，不看识别状态，「已入账」页签只读查看
   - 再次上传相同内容的原件时提示「打开已有任务」，也可以明确选择作为新的业务继续
   - 已确认的任务只读、不能重复入账；未确认的原件保留 30 天后清理；打开不存在的任务时页面给出说明，不会自动新建
2. **工作台**：以 OA 单据为卡片，按 待采购 → 待到货 → 待分发 推进。动作默认作用于整单（一次下单登记共用供应商、逐条填价并记入比价库；整单到货；整单发放给经办人）；只到了一部分或只领走一部分时，取消勾选对应明细即可拆开处理
3. **发放 / 入库**：按领用人拆分发放（结余自动入库），或整单入库后从库存按需出库。库存按物品各自的单位记账；库存页只统计物品种数与低库存项数，不把不同单位的数量相加
4. **管理**：Excel 导出、修改历史回滚、审计日志、自动备份与一键恢复

**状态规则**：执行中三态（待采购/待到货/待分发）之间可手工推进或退回；「已发放」「已入库」只能由发放单、入库动作产生（它们同时写发放记录与库存流水），台账里不能直接改，也不能改回——撤销发放请作废发放单，库存差异用盘点调整。终态记录的品名、数量和单位同样锁定。

## AI 能力（可选）

在「系统设置 → AI 助手」连接一个支持 Responses API 的服务并选择一个模型，识别、问答和搜索共用这个模型。能力检测用合成样例实测文本、图像、结构化输出和工具调用：图像与结构化输出通过后才能开启每单自动识别，工具调用不通过只限制问答。关闭 AI 或服务失败时保留本地解析和人工导入，相关入口自动隐藏或降级：

- **自然语言问答**：桌面侧栏的「AI 助手」（手机为顶栏的 AI 图标）打开抽屉，直接问「上月各部门采购金额」「谁领用最多」；服务端 tool-calling 只读查询台账/库存/发放/报表，回答附带查询轨迹
- **智能搜索**：台账与库存搜索自动做同义词扩展（搜「打印纸」命中「A4复印纸」），扩展词以库内真实品名落地，AI 关闭时退回普通关键字匹配
- **自动原件复核**：本地逐页 OCR 后自动发送每页原件与本页解析结果给 GPT；数量/价格差异及新增候选须明确处理，草稿自动保存，最后人工确认入账

密钥优先使用服务器的 `LLM_API_KEY_FILE` 或 `LLM_API_KEY`（设置页显示“服务器已配置 Key，无需填写”），否则使用设置页保存的密钥；页面和日志不返回明文。服务地址、模型列表、secret 挂载和能力检测的细节见 [升级说明 · 配置第三方 Responses](docs/upgrade-2026-09.md#配置第三方-responses)；启用后哪些数据会发给服务商见下方 [数据与安全提醒](#数据与安全提醒)。

## 本地开发

```bash
corepack enable && pnpm install
pnpm --filter @procure-lite/shared build

# 终端 1：OCR 服务（首次需 pip install -e "apps/ocr[paddle]"，或跳过仅做轻依赖测试）
cd apps/ocr && python -m venv .venv && . .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"           # 轻依赖（解析逻辑可测，不含 paddle）
pip install -e ".[paddle]"        # 完整 OCR 能力（较重）
uvicorn app.main:app --port 8000

# 终端 2：API + 前端（API 默认把数据放在 apps/server/state/；迁移命令需要指向同一个数据库文件）
export DATABASE_URL="file:$PWD/apps/server/state/procure.db"
pnpm db:migrate                   # 初始化开发数据库
pnpm dev                          # API :3000 + Vite :5173（自动代理 /api）
```

访问 http://localhost:5173，首次进入设置管理员密码。

## 测试

```bash
pnpm --filter @procure-lite/shared build            # 前后端测试都依赖 shared 的构建产物
pnpm test                                           # 前端单测 + 服务端测试（vitest）
pnpm --filter @procure-lite/server build            # 浏览器测试的 API（apps/server/test/browser-server.cjs）加载 dist
pnpm --filter @procure-lite/web exec playwright install --with-deps chromium   # 首次运行浏览器测试前
pnpm --filter @procure-lite/web test:e2e            # 浏览器流程：临时 SQLite + 真实 API，OCR/GPT 为合成替身
python3 -m unittest discover -s deploy/tests -v     # 部署脚本（伪 git/docker，不接触真实服务）
python3 -m unittest discover -s scripts/tests -v    # 精度审计与导入评测脚本
(cd apps/ocr && pytest)                             # 解析器单测 + API 集成（无需 paddle）
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

脚本自动完成：生成 `.env`（随机 OCR_API_KEY）→ 从 GHCR 拉镜像并启动（拉取失败自动回退本地构建）→ API 与 OCR 就绪检查。首次访问 `http://<服务器IP>:8080` 设置管理员密码。

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

升级脚本只做快进更新（已跟踪文件有本机改动时退出），三个服务绑定同一源码的 `sha-xxxxxxx` 标签并写入 `.env` 的 `RELEASE_TAG`；新镜像就绪后才停机，停机后先把整个数据卷和三个旧镜像引用保存到 `pre-upgrade-backups/release-TIMESTAMP/` 再启动新版本。这些回退点不会自动删除，稳定后由管理员归档；回退必须同时恢复旧数据和旧镜像，回退与回退后的管理命令见 [升级说明](docs/upgrade-2026-09.md#备份恢复与回退)。推送源码和发布 GHCR 镜像不会自动更新 VPS。

## 数据与安全提醒

- **数据在哪**：Docker 部署的全部状态在 `procure-state` 卷里（本地开发默认是 API 运行目录下的 `state/`，即 `apps/server/state/`，可用 `DATA_DIR` 指定）：`procure.db`（SQLite）、`uploads/`（单据原件与附件）、`backups/`（系统设置里生成的备份）、`session-secret`（会话签名密钥）。
- **什么会离开本机**：启用 AI 后，问答的问题、近几轮对话与只读查询结果，智能搜索的搜索词和库内品名词表，以及开启自动识别的单据每页原件图像与本页解析结果，会发送给所配置的服务商（服务商侧的留存说明见 [升级说明](docs/upgrade-2026-09.md#配置第三方-responses)）。不启用 AI 时不发送。
- **备份**：系统设置里的备份包含数据库与 `uploads/`（附清单和逐文件哈希），不含 `.env`、`session-secret` 和外部 secret；备份就放在同一个数据卷里，请下载后异地保存。自动备份默认关闭。
- **恢复**会覆盖当前数据库与附件，恢复前先创建一份备份；恢复后现有登录会话失效。升级回退点见上文「版本升级」。
- 未确认入账的导入原件保留 30 天后自动清理；已确认的原件作为台账附件长期保留。
- `.env`、`secrets/`、`docker-compose.override.yml`、`state/`、`pre-upgrade-backups/` 已在 `.gitignore` 中；密钥文件放在仓库之外（如 `/etc/procure-lite/`），不要提交到仓库，也不要放进 `uploads/`。

## 安全模型

- 单管理员，argon2id 密码哈希，登录失败 5 次锁定 15 分钟
- HttpOnly + SameSite=Strict 签名 Cookie 会话（30 分钟滑动过期），恢复码重置密码
- 所有 `/api/*` 经全局守卫鉴权；OCR 服务仅内网通信且校验 API Key
- 上传类型/大小白名单，备份恢复含 zip-slip 与解压限额防护

## 开发约定

- 改动前先对照上面的「适用范围与不做什么」；超出范围的需求先讨论，不顺手加。
- 如无必要勿增实体：优先复用现有页面、数据表、接口和 `apps/web/src/components/ui` 组件；没有真实需要不加表、字段、页面或依赖。
- 这些规则不能削弱：终态（已发放 / 已入库）只能由发放单、入库动作产生且锁定；确认导入、下单登记、入库、发放、手工库存变动必须带 `Idempotency-Key`；草稿按版本号保存，过期版本返回 409；有未完成页面时须逐页人工核对才能确认；确认时关联原件，原件缺失不能确认；接口和日志不输出明文密钥。
- 提交前至少运行 `pnpm --filter @procure-lite/shared build && pnpm typecheck && pnpm lint && pnpm test`；改到导入、工作台、库存流程时再跑浏览器测试（见「测试」）。
- 前端遵循 [apps/web/DESIGN.md](apps/web/DESIGN.md)；导入、OCR、AI、备份与回退的行为和接口以 [升级说明](docs/upgrade-2026-09.md) 为准，行为变了同步更新这两份文档。

## 隔离试用（历史记录）

2026-09-27 为候选版本 `b10744b` 准备过一套隔离试用环境（独立数据卷、本机端口、固定镜像摘要）。当前主分支已超过该版本，之后的改动（如导入草稿找回）不在试用镜像里；启动、检查与清理方式见 [隔离试用说明](docs/trial-b10744b.md)。
