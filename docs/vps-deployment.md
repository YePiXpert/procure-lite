# VPS 部署教程

这份教程只覆盖 Linux VPS 部署。系统以 Docker Compose 方式长期运行，电脑和手机都访问同一个 VPS 公网地址或域名。

## 1. VPS 要求

- Linux VPS，推荐 Ubuntu 22.04/24.04 或 Debian 12
- 建议 x86_64/amd64 架构
- 至少 2GB 内存；OCR 解析较多时建议 4GB 或以上
- 已开放 `8000` 端口，或准备好域名和反向代理
- 已安装 Docker 和 Docker Compose

Ubuntu/Debian 安装 Docker：

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version
```

## 2. 拉取项目

```bash
git clone https://github.com/YePiXpert/office-supplies-tracker.git
cd office-supplies-tracker
cp .env.example .env
```

按需修改 `.env`：

```bash
OFFICE_SUPPLIES_PORT=8000
OFFICE_AUTH_COOKIE_SECURE=auto
```

如果直接用 `http://VPS公网IP:8000` 访问，保持 `auto` 即可。如果通过 HTTPS 域名访问，也保持 `auto`，系统会根据反向代理传入的 `X-Forwarded-Proto` 判断 Cookie 安全属性。

## 3. 启动服务

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

首次进入系统时，需要设置管理员密码。请妥善保存恢复码。

## 4. 开放端口

云厂商控制台的安全组需要放行 TCP `8000`。如果 VPS 自带防火墙，也需要放行：

```bash
sudo ufw allow 8000/tcp
sudo ufw status
```

如果只通过 HTTPS 反向代理访问，可以只对公网开放 `80` 和 `443`，让应用端口 `8000` 只监听给本机反向代理使用。

## 5. 配置域名和 HTTPS

推荐使用 Caddy，配置最少：

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

编辑 Caddyfile：

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

如果使用 Nginx、宝塔面板或云厂商负载均衡，请确保反向代理保留：

```text
Host: 你的域名
X-Forwarded-Proto: https
```

## 6. 数据目录和备份

运行数据保存在项目目录下：

```text
office-supplies-state/
```

里面包含：

- `data/office_supplies.db`：SQLite 数据库
- `uploads/`：上传文件
- `logs/`：运行日志
- `.auth_cookie_secret`：登录会话密钥
- `.webdav_config.json`：WebDAV 配置

迁移或备份 VPS 时，优先备份整个目录：

```bash
tar -czf office-supplies-state-$(date +%F).tar.gz office-supplies-state
```

## 7. 更新版本

```bash
git pull --ff-only
docker compose pull
docker compose up -d
```

数据库表结构会在服务启动时自动补齐。

## 8. 停止和重启

停止：

```bash
docker compose down
```

重启：

```bash
docker compose up -d
```

## 9. 排障

页面打不开时依次检查：

- `docker compose ps` 中服务是否为 `running` 或 `healthy`
- `docker compose logs -f office-supplies-tracker` 是否有启动错误
- VPS 安全组是否开放 `8000`，或域名的 `80/443`
- VPS 防火墙是否放行对应端口
- 域名 DNS 是否已经解析到 VPS 公网 IP
- 反向代理是否转发到 `127.0.0.1:8000`
