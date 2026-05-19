# 办公用品采购系统

用于内部办公用品采购、台账维护、执行跟踪、报表统计和备份恢复的单用户 Web 工具。

当前版本：`1.2.64`

本项目只面向 VPS Docker 部署。服务运行在一台 Linux VPS 上，电脑和手机都通过浏览器访问同一个公网地址、同一份数据。文档解析默认使用 PaddleOCR 本地离线处理，不需要 API Key，也不会把单据上传到云端解析服务。

## 快速开始

### 1. 准备 VPS

需要一台已安装 Docker 和 Docker Compose 的 Linux VPS，并在云厂商安全组或防火墙开放访问端口，默认是 `8000`。

Ubuntu/Debian 可参考：

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2. 部署服务

```bash
git clone https://github.com/YePiXpert/office-supplies-tracker.git
cd office-supplies-tracker
cp .env.example .env
docker compose pull
docker compose up -d
```

访问：

```text
http://VPS公网IP:8000
```

如果绑定域名，建议用 Caddy、Nginx 或宝塔面板配置 HTTPS，并把域名反向代理到 `127.0.0.1:8000`。

## 常用命令

已有部署更新：

```bash
cd /opt/office-supplies-tracker
git pull --ff-only
docker compose pull
docker compose up -d
```

如果项目安装在其他目录，请把 `cd` 路径换成实际路径。首次部署才需要执行 `git clone`。

```bash
docker compose ps
docker compose logs -f office-supplies-tracker
docker compose pull
docker compose up -d
docker compose down
```

也可以在 VPS 上运行：

```bash
./start.sh
```

## 数据目录

运行数据统一保存在：

```text
office-supplies-state/
```

这个目录包含数据库、上传文件、自动备份、日志、登录密钥和 WebDAV 配置。迁移或备份 VPS 时，优先备份整个 `office-supplies-state/` 目录。

## 核心能力

- 上传 PDF 或图片后自动提取流水号、部门、经办人、日期和物品明细
- PaddleOCR 本地离线解析，无需 API Key
- 台账筛选、分页、在线编辑、批量修改和批量删除
- 手机浏览器卡片视图和全屏编辑抽屉，适合送货途中查询和更新状态
- 执行看板、运营工作台、统计报表、审计日志、回收站、数据质检
- 今日行动队列支持快速下单、确认收货和标记报销提交，减少跨页面跳转
- 台账列表展示采购闭环阶段，帮助快速判断待下单、待收货、待分发、待报销或已完成
- 供应商与价格记忆可沉淀历史单价、采购链接和交期，用于后续下单推荐
- 自动本机备份、本地 zip 备份和 WebDAV 云备份/恢复

## 文档

- [使用说明](./USAGE.md)
- [VPS 部署教程](./docs/vps-deployment.md)
- [文档索引](./docs/README.md)
