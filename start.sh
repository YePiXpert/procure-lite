#!/bin/bash
# 办公用品采购系统启动脚本

set -euo pipefail

cd "$(dirname "$0")"

echo "正在启动办公用品采购系统..."
echo "系统地址: http://localhost:8000"
echo "按 Ctrl+C 停止服务"
echo ""

if [ ! -f "venv/bin/activate" ]; then
  echo "未检测到虚拟环境，请先执行："
  echo "python3 -m venv venv && source venv/bin/activate && pip install -r requirements-dev.txt"
  exit 1
fi

source venv/bin/activate
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload
