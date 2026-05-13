# 办公用品采购系统

用于内部办公用品采购、台账维护、执行跟踪、报表统计和备份恢复的单用户 Web 工具。

当前版本：`1.2.44`

推荐部署方式是 Docker Web 服务：Windows 电脑和手机都通过浏览器访问同一个地址、同一份数据。文档解析默认使用 PaddleOCR 本地离线处理，不需要 API Key，也不会把单据上传到云端解析服务。

## 快速开始

### 推荐：Windows + 手机共用

先安装并启动 Docker Desktop，然后在项目根目录双击：

```text
start_docker_server.bat
```

脚本会启动 Docker Compose，并打印访问地址：

- Windows 本机：`http://localhost:8000`
- 手机/其他电脑：`http://电脑局域网IP:8000`

如果检测到旧 Windows 版数据，并且 Docker 状态目录还没有数据库，脚本会自动把旧的 `office_supplies.db`、`uploads/`、WebDAV 配置和登录密钥复制到 `office-supplies-state/`，不会覆盖已有 Docker 数据。

详细说明见 [Windows 与手机共用的 Docker Web 服务](./docs/shared-web-service.md)。

### 服务器、NAS 或云主机

```bash
cp .env.example .env
docker compose up -d --build
```

访问：

```text
http://服务器IP:8000
```

长期部署、HTTPS 和排障见 [云端部署与手机直接访问](./docs/cloud-deployment.md)。

### 单机桌面使用

只在一台 Windows 电脑上离线使用时，可以双击：

```text
start_windows.bat
```

桌面版适合单机使用；如果手机也要长期访问，优先使用 Docker Web 服务。

### 开发运行

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
./start.sh
```

Windows PowerShell 可使用：

```powershell
.\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

## 核心能力

- 上传 PDF 或图片后自动提取流水号、部门、经办人、日期和物品明细
- PaddleOCR 本地离线解析，无需 API Key
- 台账筛选、分页、在线编辑、批量修改和批量删除
- 手机浏览器卡片视图，适合送货途中查询和更新状态
- 执行看板、统计报表、审计日志、回收站、数据质检
- 本地备份和 WebDAV 云备份/恢复
- Docker Web 服务部署，以及可选 Windows 桌面版/安装包

## 常用文档

- [使用说明](./USAGE.md)
- [文档索引](./docs/README.md)
- [Windows 与手机共用的 Docker Web 服务](./docs/shared-web-service.md)
- [云端部署与手机直接访问](./docs/cloud-deployment.md)

## 技术栈

- 后端：FastAPI + SQLite + SQLAlchemy async + Alembic
- 文档解析：pdfplumber + PaddleOCR + pypdfium2
- 前端：Vue 3 + TailwindCSS + Axios
- 桌面容器：pywebview
- 测试：pytest + pytest-asyncio

## 测试

```bash
pytest tests/ -v
```

当前完整测试集共 98 个用例，覆盖认证、备份、导入、解析、WebDAV、运营事务和桌面网络配置。
