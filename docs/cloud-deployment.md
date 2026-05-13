# 云端部署与手机直接访问

如果是在 Windows 电脑上用 Docker 同时服务 Windows 和手机，优先看 [`shared-web-service.md`](./shared-web-service.md)，可以直接使用根目录的 `start_docker_server.bat`。本文更偏向服务器、NAS 或云主机上的长期部署。

这个部署方式适合“手机直接打开，不依赖办公室电脑开机”的场景。系统运行在一台长期在线的服务器、NAS 或云主机上，手机和电脑都通过浏览器访问同一个地址、同一份数据。

云端版与本地 Windows Docker 版使用同一套后端接口和前端页面，台账、导入、编辑、报表、备份、WebDAV、回收站、数据质检和审计日志功能保持一致。导出和备份文件都由浏览器下载。

## 1. 准备服务器

服务器需要：

- Linux 服务器、NAS、云主机或其他能运行 Docker 的机器
- 建议使用 x86_64/amd64 架构；OCR 依赖在部分 ARM 设备上可能需要单独适配
- 已安装 Docker 和 Docker Compose
- 对外开放端口 `8000`，或通过域名/反向代理转发到容器的 `8000`

如果只在公司内网使用，让手机能访问服务器内网 IP 即可。  
如果要在外面送货时访问，需要公网 IP、域名或内网穿透，并建议配置 HTTPS。

## 2. 上传项目

在服务器上进入项目目录，例如：

```bash
git clone https://github.com/YePiXpert/office-supplies-tracker.git
cd office-supplies-tracker
```

复制环境变量示例：

```bash
cp .env.example .env
```

按需编辑 `.env`：

```bash
OFFICE_SUPPLIES_PORT=8000
OFFICE_AUTH_COOKIE_SECURE=auto
```

默认使用内置 PaddleOCR 本地解析，不需要 API Key。

## 3. 启动服务

```bash
docker compose pull
docker compose up -d
```

查看运行状态：

```bash
docker compose ps
docker compose logs -f office-supplies-tracker
```

浏览器打开：

```text
http://服务器IP:8000
```

首次进入会要求设置管理员密码。请保存恢复码。

## 4. 手机使用

手机直接打开：

```text
http://服务器IP:8000
```

如果配置了域名和 HTTPS，则打开：

```text
https://你的域名
```

手机窄屏会自动使用台账卡片视图，适合送货途中查询物品、部门、状态、到货日期和分发日期。

## 5. 数据保存位置

Docker 部署会把所有运行数据保存到项目目录下：

```text
office-supplies-state/
```

其中包含：

- `data/office_supplies.db`：SQLite 数据库
- `uploads/`：上传附件
- `logs/`：运行日志
- `.auth_cookie_secret`：登录会话和 WebDAV 密码加密密钥
- `.webdav_config.json`：WebDAV 配置

迁移服务器时，备份整个 `office-supplies-state/` 目录即可。

## 6. 更新版本

```bash
git pull --ff-only
docker compose pull
docker compose up -d
```

数据库迁移会在服务启动时自动执行。

## 7. 常见问题

### 手机打不开

检查：

- 服务器是否正在运行：`docker compose ps`
- 云服务器安全组是否开放 `8000`
- 服务器防火墙是否开放 `8000`
- 手机访问的是服务器 IP，不是电脑本机的 `127.0.0.1`

### 外网访问建议

如果要在公司外、路上或客户现场访问，建议用域名和 HTTPS。可以使用 Nginx、Caddy、宝塔面板、群晖反向代理或云厂商负载均衡，把外部 `https://你的域名` 转发到本机 `127.0.0.1:8000`。

反向代理需要保留：

```text
X-Forwarded-Proto: https
Host: 你的域名
```

系统会根据 `X-Forwarded-Proto` 自动决定是否设置 Secure Cookie。
