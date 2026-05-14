# VPS Docker 部署教程

这份文档说明如何把办公用品采购系统部署到一台 Linux VPS 上，并通过浏览器长期访问。项目只推荐 Docker Compose 部署：应用运行在容器内，数据保存在 VPS 本机目录中，后续更新和迁移都围绕这个目录进行。

## 部署目标

完成后你会得到：

- 一个运行中的 Docker 服务：`office-supplies-tracker`
- 一个持久化数据目录：`office-supplies-state/`
- 一个访问地址：`http://VPS公网IP:8000`，或配置 HTTPS 后的域名

## 1. 准备 VPS

推荐环境：

- Ubuntu 22.04/24.04 或 Debian 12
- x86_64/amd64 架构
- 至少 2GB 内存；如果经常解析 PDF/图片，建议 4GB 或以上
- 至少 10GB 可用磁盘空间，并根据上传附件数量预留更多空间
- 已开放 TCP `8000` 端口，或准备好域名并开放 `80/443`

安装 Docker 和 Docker Compose：

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version
```

如果 `docker compose version` 能正常输出版本号，说明 Docker Compose 已可用。

## 2. 拉取项目

在 VPS 上选择一个固定目录，例如 `/opt`：

```bash
cd /opt
sudo git clone https://github.com/YePiXpert/office-supplies-tracker.git
sudo chown -R $USER:$USER office-supplies-tracker
cd office-supplies-tracker
cp .env.example .env
```

默认 `.env` 内容如下：

```bash
OFFICE_SUPPLIES_PORT=8000
OFFICE_AUTH_COOKIE_SECURE=auto
```

含义：

- `OFFICE_SUPPLIES_PORT`：VPS 对外暴露的访问端口，默认 `8000`
- `OFFICE_AUTH_COOKIE_SECURE`：登录 Cookie 安全策略，保持 `auto` 即可

## 3. 启动服务

拉取镜像并启动：

```bash
docker compose pull
docker compose up -d
```

查看状态：

```bash
docker compose ps
docker compose logs -f office-supplies-tracker
```

浏览器访问：

```text
http://VPS公网IP:8000
```

首次进入系统时，需要设置管理员密码。请保存页面提示的恢复码。

也可以使用项目自带脚本启动：

```bash
./start.sh
```

脚本会自动创建 `.env`、拉取镜像并启动服务。

## 4. 开放端口

如果直接用 `http://VPS公网IP:8000` 访问，需要同时检查云厂商安全组和系统防火墙。

Ubuntu UFW 示例：

```bash
sudo ufw allow 8000/tcp
sudo ufw status
```

如果后面使用域名和 HTTPS 反向代理，可以只对公网开放 `80` 和 `443`，应用端口 `8000` 只给 VPS 本机访问。

## 5. 配置域名和 HTTPS

推荐使用 Caddy，配置少，且会自动申请 HTTPS 证书。

安装 Caddy：

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

编辑配置：

```bash
sudo nano /etc/caddy/Caddyfile
```

写入：

```text
你的域名 {
    reverse_proxy 127.0.0.1:8000
}
```

重新加载：

```bash
sudo systemctl reload caddy
```

访问：

```text
https://你的域名
```

如果只希望应用端口监听本机，可以把 `.env` 改成：

```bash
OFFICE_SUPPLIES_PORT=127.0.0.1:8000
OFFICE_AUTH_COOKIE_SECURE=auto
```

然后重启：

```bash
docker compose up -d
```

使用 Nginx、宝塔面板或云厂商负载均衡时，请确保反向代理传递 `Host` 和 `X-Forwarded-Proto`，这样系统能正确判断 HTTPS Cookie。

## 6. 数据目录

Docker Compose 会把 VPS 当前项目目录下的这个目录挂载进容器：

```text
office-supplies-state/
```

目录内容包括：

- `data/office_supplies.db`：SQLite 数据库
- `uploads/`：上传的单据和附件
- `logs/`：运行日志
- `.auth_cookie_secret`：登录会话密钥
- `.webdav_config.json`：WebDAV 备份配置

不要删除这个目录。迁移、备份、恢复时优先处理整个 `office-supplies-state/`。

## 7. 备份和迁移

创建本机压缩备份：

```bash
docker compose down
tar -czf office-supplies-state-$(date +%F).tar.gz office-supplies-state
docker compose up -d
```

恢复到新 VPS：

```bash
cd /opt/office-supplies-tracker
docker compose down
tar -xzf /path/to/office-supplies-state-YYYY-MM-DD.tar.gz
docker compose up -d
```

也可以在系统设置里使用 WebDAV 云备份/恢复。WebDAV 适合日常异地备份；整目录备份适合迁移 VPS 或灾难恢复。

## 8. 更新版本

如果 VPS 上已经部署过项目，不要重新执行 `git clone`。进入已有项目目录，拉取最新代码和镜像：

```bash
cd /opt/office-supplies-tracker
git pull --ff-only
docker compose pull
docker compose up -d
```

如果你的项目不在 `/opt/office-supplies-tracker`，把第一行改成实际目录即可。

如果刚刚向 GitHub 推送了新代码，建议先等待镜像发布完成，再执行 `docker compose pull`。否则可能仍然拉到旧的 `latest` 镜像。

查看更新后的状态：

```bash
docker compose ps
docker compose logs -f office-supplies-tracker
```

数据库结构会在服务启动时自动迁移。

首次部署才需要执行完整克隆流程：

```bash
git clone https://github.com/YePiXpert/office-supplies-tracker.git
cd office-supplies-tracker
cp .env.example .env
docker compose pull
docker compose up -d
```

## 9. 停止、重启和日志

停止：

```bash
docker compose down
```

重启：

```bash
docker compose up -d
```

查看日志：

```bash
docker compose logs -f office-supplies-tracker
```

查看容器健康状态：

```bash
docker compose ps
```

## 10. 常见问题

### 页面打不开

依次检查：

- `docker compose ps` 中服务是否为 `running` 或 `healthy`
- `docker compose logs -f office-supplies-tracker` 是否有启动错误
- 云厂商安全组是否开放了 `8000`，或域名访问所需的 `80/443`
- VPS 防火墙是否放行对应端口
- 域名 DNS 是否已经解析到 VPS 公网 IP
- 反向代理是否转发到 `127.0.0.1:8000`

### 域名可以访问，但登录状态异常

保持 `.env` 中：

```bash
OFFICE_AUTH_COOKIE_SECURE=auto
```

同时确认反向代理传递了 HTTPS 协议信息。Caddy 默认会正确处理；Nginx 或宝塔面板需要保留 `X-Forwarded-Proto: https`。

### OCR 解析慢或失败

- 优先使用文字可复制的 PDF
- 图片尽量清晰，避免倾斜、阴影和过度压缩
- VPS 内存不足时升级到 4GB 或以上
- 查看日志确认是否出现内存不足或依赖加载错误

### 磁盘空间不足

检查目录大小：

```bash
du -sh office-supplies-state
df -h
```

如果上传附件很多，先备份 `office-supplies-state/`，再在系统内清理不需要的数据。

## 11. 推荐运维习惯

- 定期备份 `office-supplies-state/`
- 更新前先创建一次数据目录备份
- 使用 HTTPS 域名访问正式环境
- 不要把 `.env`、`office-supplies-state/` 或备份包提交到 Git
- VPS 迁移时优先迁移整个 `office-supplies-state/` 目录
