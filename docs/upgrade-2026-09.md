# 可信导入、OCR 3 与 Responses 升级

本次保留 Vue、Nest/Fastify、SQLite、Python 和六项业务导航。原件上传后本地逐页解析，启用并检测合格的 GPT 会自动复核每一页；人工保存草稿、明确处理数量/价格建议后才能入账。

## 实现与默认值

| 范围 | 行为 |
| --- | --- |
| 草稿 | 未知数量为 null，申请日期不补当天；独立行、稳定 lineId、逐页来源、乐观版本号、修改历史 |
| 确认 | 严格数量/价格校验；同名行须明确区分或合并；已有台账默认跳过；任务只能确认一次 |
| 原件 | 内容哈希提示重复，用户明确继续才创建新任务；未确认原件保留 30 天，上传及每 6 小时清理到期任务；确认后的来源长期保留 |
| OCR | Python 3.11、PaddleOCR 3.7.0、PaddlePaddle 3.3.1、PP-OCRv6 medium；方向识别开启，去畸变关闭 |
| OCR 资源 | 一个进程/推理实例/活动解析，2 CPU、4GB 内存、2 推理线程，页面最大边 2560；30MB、自动最多 30 页 |
| GPT | Responses，第三方 baseURL 可配置；主模型建议值 gpt-6-sol，识别/问答/搜索可各自覆盖；能力按实际请求检测 |
| 请求 | 智能导入并发 1，单页输出最多 4096 tokens，120 秒；429/500/502/503 最多重试一次，不确定超时不自动重发 |
| 用量 | 输入/输出 tokens、模型、耗时、请求标识；缺少用量为未知，未配置价格不计算费用 |
| 库存 | 入库/直发结余归并校验单位，已有库存单位未知也必须先处理；终态单位不可修改或回滚 |
| 写防重 | 确认、下单、入库、发放、手工库存变动必须带 Idempotency-Key；同事务持久化请求指纹及结果 |

模型文件在构建期预下载，以 `apps/ocr/models.sha256` 校验；依赖来自 `apps/ocr/requirements.lock`。禁止运行时补下载作为正常启动流程。真实 CPU 测试发现当前 oneDNN 路径不兼容，已明确关闭 MKLDNN；更新此设置需重跑真实容器测试。

本地结果、GPT 建议和人工草稿分开保存。后台迟到结果不能覆盖人工编辑；重试保留历史。GPT 只有页级定位，不会伪造坐标。原件文本只作为数据，自动识别不携带业务写工具；问答仍使用只读工具白名单、参数校验和六轮工具上限。

## 配置第三方 Responses

1. 设置 `LLM_BASE_URL`、`LLM_MODEL` 和服务器 `LLM_API_KEY`，或将 secret 文件挂载到服务器并设置 `LLM_API_KEY_FILE`。不要把 secret 放到 uploads。Compose 使用 secret 文件时用 `docker-compose.override.yml` 增加只读挂载和环境变量（示例见下）。该文件不提交到仓库，升级保留它。
2. 服务器密钥配置一次后，设置页显示“服务器已配置 Key，无需填写”。已有密钥时自动从已保存服务的 `GET /models` 获取模型，主模型和三个任务模型可直接选择，任务模型可留空继承。服务地址或密钥改动后先保存，再获取列表；服务商不支持列表时可手动填写。列表不代表 Responses 能力，也不会自动更改模型或启用 AI。旧数据库密钥兼容；服务器密钥优先，界面及日志不返回明文。
3. 点击能力检测。测试使用合成图像和固定文本，分别验证文本、图像、严格 JSON Schema、工具调用与结果回传。更换服务、密钥或模型会使结果失效。
4. 图像和结构化输出通过后，明确打开自动智能导入并保存。工具检测失败仅限制问答。
5. 新单自动执行 GPT，失败时保留本地结果。用户可取消后台处理，核对原件并继续。本地成功但 GPT 失败、取消、结果未知或缺少结果的页面，也必须重试完成或逐页记录人工核对；后端返回统一的 `reviewPages` 清单，并在确认事务中按同一规则校验。上传时记录是否安排 GPT，后续停用配置不能抹去核对要求。关闭 AI 上传的任务不增加 GPT 核对要求。

secret 文件示例（文件路径由管理员在 VPS 上准备，权限应仅允许服务读取）：

```yaml
# /opt/procure-lite/docker-compose.override.yml
services:
  server:
    environment:
      LLM_API_KEY_FILE: /run/secrets/llm_api_key
    volumes:
      - /etc/procure-lite/llm_api_key:/run/secrets/llm_api_key:ro
```

`store:false` 只是请求参数，不代表第三方零留存。模型名称不代表能力。服务商单价需管理员填写，币种由服务商决定；预算默认关闭。月预算按已记录的导入估算费用停止后续请求，单页请求可能跨过阈值；它不是第三方账单硬限额。问答和搜索不计入导入预算。

识别成功与费用记账分开：截断、拒绝、JSON/Schema 错误只要带有可信用量，就按该次配置单价估算费用。发出后没有用量的失败调用费用为未知，启用预算时阻止后续自动请求；在页面渲染等发送前步骤失败的调用标记为 `NOT_SENT`，费用为 0，不占预算。旧记录缺少费用依据时仍保持未知，不使用当前单价补造历史账单。预算拦截只结束 GPT 阶段，保留已完成的本地草稿，允许明确人工核对后继续入账。

## API 与数据兼容

- `GET /api/imports/tasks/:id`：阶段状态、草稿版本、逐页结果、`reviewPages`（页码、原因、人工核对状态）、建议及调用记录。
- `PUT .../:id/draft`：`{version,draft}`；旧版本返回 409，不覆盖当前编辑。
- `GET .../:id/revisions`：本地识别与人工草稿版本记录。
- `GET .../:id/original`、`GET .../:id/pages/:page`：鉴权读取，服务端路径不对外暴露。
- `POST .../:id/retry`：`{stage:"local"|"ai",pages?:number[]}`；`POST .../:id/cancel` 取消当前代次。
- `POST /api/imports/confirm`：严格最终值、taskId、version，以及 Idempotency-Key 请求头。
- `POST /api/ai/capabilities`：检测 Responses 的实际能力。
- OCR `/health` 为进程存活；`/ready` 要求加载模型并完成小样例推理。

新增迁移 `20260927000000_trusted_import`，增加 ImportTask 字段、ImportRevision、OperationReceipt、AiCall。历史解析读取时补稳定历史 ID，未知值保持空；没有依据的历史字段不创建框选。历史台账和 Float 数据不自动重归并或转换。

## 验证命令

```sh
pnpm install --frozen-lockfile
pnpm --filter @procure-lite/shared build
pnpm --filter @procure-lite/server build
pnpm --filter @procure-lite/server test
pnpm --filter @procure-lite/web typecheck
pnpm --filter @procure-lite/web test
pnpm --filter @procure-lite/web exec playwright install --with-deps chromium
pnpm --filter @procure-lite/web test:e2e
python3 -m unittest discover -s deploy/tests -v
python3 -m unittest discover -s scripts/tests -v
docker build -f deploy/Dockerfile.ocr -t procure-lite-ocr:runtime-test .
docker build -f deploy/Dockerfile.ocr-test -t procure-lite-ocr:test .
docker run --rm --network none --cpus 2 --memory 4g procure-lite-ocr:test
docker run --rm --network none --cpus 2 --memory 4g procure-lite-ocr:test python -m tests.smoke_engine
```

浏览器测试启动独立临时 SQLite 和真实 API，OCR/GPT 使用明确的合成替身；不访问生产数据。协议错误测试另外覆盖 Responses 请求与异常。真实 OCR 在断网、资源限制下运行真实模型。

## 备份、恢复与回退

新业务备份包含数据库、uploads、格式版本、schema 指纹和逐文件 SHA256 清单，不包含外部 secret。维护门禁拒绝新请求并排空已开始的任务，保证引用与文件一致。恢复先在临时目录检查数据库、外键、文件及哈希；旧备份在隔离副本执行迁移。替换时保留旧数据库与原件目录，并写入持久恢复日志。

中断恢复在 Prisma 打开数据库前执行；容器入口也在迁移前执行恢复。WAL/SHM 在切换时处理，连接设置重新应用，旧会话失效，配置和定时任务刷新。数据库与文件切换失败会恢复完整旧状态。

生产发布是独立步骤。本轮不会运行部署脚本修改现网。

```sh
# 构建或拉取同一源码标签的全部三个镜像；OCR 失败必须失败退出
bash deploy/upgrade.sh /opt/procure-lite --build
# 回退必须同时恢复旧数据和固定的旧镜像
bash deploy/rollback.sh /opt/procure-lite /opt/procure-lite/pre-upgrade-backups/release-TIMESTAMP
```

升级脚本先检查旧数据卷、旧镜像和备份工具，拉取或构建三个新镜像后才停机。仓库更新使用 `git merge --ff-only origin/main`，已跟踪文件有改动时退出，不再清理本机未跟踪的配置。成功获取镜像后将源码标签持久化为 `.env` 中的 `RELEASE_TAG`；首次部署同样如此。日常 `docker compose up` 沿用该版本，不会自行切换到 latest。默认项目名和数据卷为 `procure-lite` / `procure-lite_procure-state`，自定义项目名需单独调整部署流程。

发布记录包含旧/新源码、迁移校验、三个镜像 ID、OCR 版本及模型就绪结果。自动回退点不会清理，稳定后由管理员归档。不要仅回退代码而继续使用迁移后的数据库。旧版服务器凭据仍由部署环境管理，应用不会自动替换服务商或密钥。

回退前会验证备份、旧镜像和数据卷；停止服务后，先另存 `before-rollback-*.tar.gz`，再恢复升级前的数据。回退会移除升级后新增的业务记录，但这些记录保留在回退前快照中。恢复旧版使用保存的旧 Compose 配置、当前本机 override 和固定旧镜像；外部 secret 由管理员保持兼容。中途失败时服务保持停止，应先核对日志和两份完整数据快照后恢复，不能直接启动残留数据。

回退后源码仍为新版本，**管理旧版容器必须显式使用旧配置与旧镜像文件**。不要直接运行普通的 `docker compose up` 或 `--build`，以免重新启动新版：

```bash
cd /opt/procure-lite
release_dir="$PWD/pre-upgrade-backups/release-TIMESTAMP"
# 有本机 override 时，在 old-compose.yml 和 old-images.yml 之间追加
# -f "$PWD/docker-compose.override.yml"
docker compose --env-file .env -p procure-lite --project-directory "$PWD" \
  -f "$release_dir/old-compose.yml" -f "$release_dir/old-images.yml" ps
# 把最后的 ps 换成 logs、restart 或 up -d --no-build --pull never 管理旧版。
```

再次升级使用 `upgrade.sh`，会重新备份当时运行的数据和旧镜像。不要删除仍需回退的目录或清理其中引用的镜像。`.env` 和外部 secret 不在业务备份中；`pre-upgrade-backups/`、本机 override 和 `secrets/` 已从 Git 与构建上下文排除。

## 仍需完成的外部验收

见 [验收记录](./upgrade-acceptance.md)。真实第三方地址/密钥、30—50 份脱敏业务单据以及生产数据库未提供。模拟测试和合成样例不能代替第三方能力、业务准确率、真实页面 P95/持续内存、历史精度差异或目标部署环境回退演练。因此发布验收保持未通过。

协议参考：[Responses 迁移](https://developers.openai.com/api/docs/guides/migrate-to-responses)、[结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)、[无状态推理条目回传](https://developers.openai.com/api/docs/guides/reasoning)。使用 SDK 的 `toResponseInputItems` 保留可回传条目及不透明的加密推理内容。
