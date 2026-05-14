# 办公用品采购系统

用于内部办公用品采购、台账维护、执行跟踪、报表统计和备份恢复的单用户 Web 工具。

当前版本：`1.2.48`

本项目只按 Docker Web 服务部署。Windows 电脑、手机、NAS、服务器或云主机都通过浏览器访问同一个地址、同一份数据。文档解析默认使用 PaddleOCR 本地离线处理，不需要 API Key，也不会把单据上传到云端解析服务。

## 快速开始

### Windows

先安装并启动 Docker Desktop，然后在项目根目录双击：

```text
start_docker_server.bat
```

脚本会创建 `.env`、拉取已发布镜像、启动 Docker Compose，并打印访问地址：

- Windows 本机：`http://localhost:8000`
- 手机/其他电脑：`http://电脑局域网IP:8000`

如果检测到旧 Windows 版数据，并且 Docker 状态目录还没有数据库，脚本会自动把旧的 `office_supplies.db`、`uploads/`、WebDAV 配置和登录密钥复制到 `office-supplies-state/`，不会覆盖已有 Docker 数据。

### Linux、NAS 或云主机

```bash
cp .env.example .env
docker compose pull
docker compose up -d
```

访问：

```text
http://服务器IP:8000
```

如果在公网使用，建议通过反向代理配置 HTTPS，并把外部域名转发到容器端口 `8000`。

## 常用命令

```bash
docker compose ps
docker compose logs -f office-supplies-tracker
docker compose pull
docker compose up -d
docker compose down
```

## 数据目录

运行数据统一保存在：

```text
office-supplies-state/
```

这个目录包含数据库、上传文件、日志、登录密钥和 WebDAV 配置。迁移或备份时，优先备份整个 `office-supplies-state/` 目录。

## 核心能力

- 上传 PDF 或图片后自动提取流水号、部门、经办人、日期和物品明细
- PaddleOCR 本地离线解析，无需 API Key
- 台账筛选、分页、在线编辑、批量修改和批量删除
- 手机浏览器卡片视图，适合送货途中查询和更新状态
- 执行看板、统计报表、审计日志、回收站、数据质检
- 本地备份和 WebDAV 云备份/恢复

## 文档

- [使用说明](./USAGE.md)
- [Docker 部署与运维](./docs/shared-web-service.md)
- [文档索引](./docs/README.md)
