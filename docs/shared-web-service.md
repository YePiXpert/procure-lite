# Windows 与手机共用的 Docker Web 服务

这个模式把系统运行成一个长期在线的 Web 服务。Windows 电脑、手机、平板或其他电脑都通过浏览器访问同一个地址，因此看到的是同一套页面、同一份数据。

适合场景：

- Windows 电脑和手机都要使用同一个办公用品台账
- 希望手机在送货或现场处理时直接查询、更新状态
- 希望备份、升级和数据保存只维护一套服务
- 有一台可以长期运行 Docker 的 Windows 电脑、NAS、Linux 服务器或云主机

## 1. 在 Windows 上一键启动

先安装并启动 Docker Desktop，然后在项目根目录双击：

```text
start_docker_server.bat
```

脚本会自动完成：

- 检查 Docker 和 Docker Compose 是否可用
- 如果没有 `.env`，从 `.env.example` 创建
- 首次启动时兼容导入旧 Windows 版本地数据
- 拉取已发布镜像并执行 `docker compose up -d`
- 打印 Windows 浏览器和手机浏览器应该访问的地址

默认端口是 `8000`。如果需要改端口，编辑 `.env` 里的 `OFFICE_SUPPLIES_PORT`，取值必须是 `1` 到 `65535` 之间的端口号。

启动成功后，Windows 本机打开：

```text
http://localhost:8000
```

手机和同一局域网内的其他设备打开脚本打印的局域网地址，例如：

```text
http://192.168.1.23:8000
```

如果 Windows 防火墙弹窗，请允许 Docker 或该端口在专用网络中访问。

## 2. 在服务器或 NAS 上启动

在服务器上进入项目目录：

```bash
cp .env.example .env
docker compose pull
docker compose up -d
```

默认使用内置 PaddleOCR 本地解析，不需要 API Key，也不会把单据上传到云端解析服务。

然后用浏览器访问：

```text
http://服务器IP:8000
```

如果配置了域名和 HTTPS，则访问：

```text
https://你的域名
```

## 3. 数据保存位置

Docker 模式会把运行数据保存到项目目录下：

```text
office-supplies-state/
```

这个目录包含数据库、上传文件、日志、登录会话密钥和 WebDAV 配置。迁移服务器或备份系统时，优先备份整个 `office-supplies-state/` 目录。

## 4. 旧 Windows 本地数据兼容

从旧 Windows 本地数据切换到 Docker Web 服务时，推荐直接运行：

```text
start_docker_server.bat
```

如果 `office-supplies-state/data/office_supplies.db` 还不存在，脚本会自动查找旧数据并复制：

- 项目目录：`data/office_supplies.db`、`uploads/`
- Windows 应用数据目录：`%APPDATA%\OfficeSuppliesTracker\data\office_supplies.db`、`uploads/`
- 同目录下的 `.webdav_config.json` 和 `.auth_cookie_secret`

这一步只在 Docker 状态目录没有数据库时执行；如果 `office-supplies-state/data/office_supplies.db` 已存在，脚本会直接使用现有 Docker 数据，不会覆盖。

复制后，应用启动时会自动补齐数据库表和字段，并兼容历史状态命名。旧版数据进入新版后可以继续使用；新版数据再回到旧版不建议直接覆盖。

## 5. 更新和停止

更新到最新代码并拉取最新镜像：

```bash
git pull --ff-only
docker compose pull
docker compose up -d
```

停止服务：

```bash
docker compose down
```

查看服务状态和日志：

```bash
docker compose ps
docker compose logs -f office-supplies-tracker
```

## 6. 手机打不开时检查

- 手机和部署机器是否在同一个局域网
- 手机访问的是部署机器的局域网 IP，不是 `127.0.0.1` 或 `localhost`
- Docker 服务是否正在运行：`docker compose ps`
- Windows 防火墙、服务器防火墙或云服务器安全组是否开放 `8000`
- 如果在公司外访问，是否已经配置公网 IP、域名、VPN、内网穿透或反向代理

## 7. 本地构建

默认推荐使用已发布镜像，避免在普通服务器上重复下载和安装 PaddleOCR/PaddlePaddle 依赖。需要从当前源码本地构建时，可以显式执行：

```bash
docker compose up -d --build
```
