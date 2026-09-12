#!/usr/bin/env bash
# Procure Lite 升级脚本：拉代码 → 拉新镜像 → 备份数据 → 滚动升级 → 健康检查
# 用法（任意目录均可执行）：
#   bash deploy/upgrade.sh             # 默认操作 /opt/procure-lite
#   curl -fsSL https://raw.githubusercontent.com/YePiXpert/procure-lite/main/deploy/upgrade.sh | bash
#                                      # 一行升级：默认 /opt/procure-lite
#   curl -fsSL …/upgrade.sh | bash -s -- /path/to/repo
#                                      # 仓库在别处时指定目录（或用环境变量 PROCURE_REPO）
# 可选参数：--build 本地构建（--full 连 OCR 一起）；--no-pull 跳过 git pull
set -euo pipefail

info() { printf '\033[1;34m[升级]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[警告]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[错误]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 定位部署目录 ----------
# 优先级：首个非 -- 参数 > PROCURE_REPO > /opt/procure-lite。
# 不根据脚本位置或当前工作目录选择仓库，以免覆盖 /workspace 开发副本。
REPO_DIR="${PROCURE_REPO:-/opt/procure-lite}"
if [ $# -gt 0 ] && [ "${1:0:2}" != "--" ]; then REPO_DIR="$1"; shift; fi
[ -d "$REPO_DIR" ] || die "部署目录不存在：$REPO_DIR；请先部署，或用参数 / PROCURE_REPO 指定已有目录"
[ -d "$REPO_DIR/.git" ] && [ -f "$REPO_DIR/docker-compose.yml" ] \
  || die "部署目录不是有效仓库：$REPO_DIR"
cd "$REPO_DIR"
info "部署目录：$(pwd)"

BUILD=0
FULL=0
GIT_PULL=1
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    --full) FULL=1 ;;
    --no-pull) GIT_PULL=0 ;;
    *) echo "未知参数：$arg（支持 --build / --full / --no-pull）" >&2; exit 1 ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "缺少 docker"
docker compose version >/dev/null 2>&1 || die "缺少 docker compose 插件"
[ -f .env ] || die "未找到 .env（请先执行 deploy/deploy.sh）"

OLD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# ---------- 拉取新代码 ----------
if [ "$GIT_PULL" = 1 ]; then
  info "拉取最新代码…"
  git fetch --all --tags
  git reset --hard origin/main
  git clean -fd --exclude=.env --exclude=pre-upgrade-backups
fi
NEW_COMMIT=$(git rev-parse --short HEAD)
info "代码版本：$OLD_COMMIT → $NEW_COMMIT"

# ---------- 获取镜像（不停机） ----------
if [ "$BUILD" = 1 ]; then
  SERVICES="web server"
  [ "$FULL" = 1 ] && SERVICES="web server ocr"
  info "本地构建镜像：$SERVICES …"
  docker compose build $SERVICES
else
  info "拉取最新镜像（未变更的层不会重复下载）…"
  if ! docker compose pull; then
    warn "镜像拉取失败，回退本地构建（web + server）"
    docker compose build web server
  fi
fi

# ---------- 停机 + 备份 ----------
info "停止服务并备份当前数据…"
docker compose down --remove-orphans

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="pre-upgrade-backups"
mkdir -p "$BACKUP_DIR"
VOLUME="procure-lite_procure-state"
if ! docker volume ls --format '{{.Name}}' | grep -qx "$VOLUME"; then
  die "找不到数据卷 $VOLUME（compose 项目名若改过请手动调整脚本）"
fi
docker run --rm \
  -v "$VOLUME:/state:ro" \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/pre-upgrade-$STAMP.tar.gz" -C /state .
info "已备份：$BACKUP_DIR/pre-upgrade-$STAMP.tar.gz（数据库 + 附件 + 配置）"

# 最多保留最近 5 份升级备份
ls -1t "$BACKUP_DIR"/pre-upgrade-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f

# ---------- 启动新版本 ----------
info "启动新版本…"
docker compose up -d

WEB_PORT=$(grep '^WEB_PORT=' .env | cut -d= -f2 || true)
WEB_PORT="${WEB_PORT:-8080}"
info "健康检查…"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health" >/dev/null 2>&1; then
    info "升级完成 ✓  $OLD_COMMIT → $NEW_COMMIT"
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 3
done

cat <<EOF >&2
================================================================
健康检查超时。排查步骤：
  1. docker compose logs --tail 100 server web
  2. 若需回滚到升级前状态：
     docker compose down
     docker run --rm -v $VOLUME:/state -v "$(pwd)/$BACKUP_DIR:/backup" alpine \\
       sh -c "rm -rf /state/* && tar xzf /backup/pre-upgrade-$STAMP.tar.gz -C /state"
     git reset --hard $OLD_COMMIT
     docker compose up -d
     # 镜像回滚（如需）：docker tag <旧sha镜像> ghcr.io/... 或重新本地构建
================================================================
EOF
exit 1
