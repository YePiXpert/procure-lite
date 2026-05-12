# Windows 与手机共用的 Docker Web 服务

这个模式把系统运行成一个长期在线的 Web 服务。Windows 电脑、手机、平板或其他电脑都通过浏览器访问同一个地址，因此看到的是同一套页面、同一份数据。

适合场景：

- Windows 电脑和手机都要使用同一个办公用品台账
- 希望手机在送货或现场处理时直接查询、更新状态
- 希望备份、升级和数据保存只维护一套服务
- 有一台可以长期运行 Docker 的 Windows 电脑、NAS、Linux 服务器或云主机

如果只在单台 Windows 电脑上离线使用，可以继续使用 `start_windows.bat` 或 Windows 安装版。

## 1. 在 Windows 上一键启动

先安装并启动 Docker Desktop，然后在项目根目录双击：

```text
start_docker_server.bat
```

脚本会自动完成：

- 检查 Docker 和 Docker Compose 是否可用
- 如果没有 `.env`，从 `.env.example` 创建
- 执行 `docker compose up -d --build`
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
docker compose up -d --build
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

## 4. 更新和停止

更新到最新代码并重建服务：

```bash
git pull
docker compose up -d --build
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

## 5. 手机打不开时检查

- 手机和部署机器是否在同一个局域网
- 手机访问的是部署机器的局域网 IP，不是 `127.0.0.1` 或 `localhost`
- Docker 服务是否正在运行：`docker compose ps`
- Windows 防火墙、服务器防火墙或云服务器安全组是否开放 `8000`
- 如果在公司外访问，是否已经配置公网 IP、域名、VPN、内网穿透或反向代理

## 6. 这个模式和桌面版的区别

Docker Web 服务只有一个后台服务和一份数据。所有设备都用浏览器访问它，适合多设备共享。

Windows 桌面版更像本机单机应用，适合只在一台电脑上离线使用。需要手机长期稳定访问时，优先使用 Docker Web 服务。
