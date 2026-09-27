#!/bin/sh
# server 容器入口：完成中断恢复 → 增量迁移 → 启动 API
# 用脚本文件而非 Dockerfile CMD，绕开 JSON/exec-form 的转义解析坑
set -e
cd /app/apps/server

export DATABASE_URL="${DATABASE_URL:-file:${DATA_DIR:-/app/state}/procure.db}"

node -e 'require("./dist/system/restore-files").recoverRestore(process.env.DATA_DIR || "/app/state")'
npx prisma migrate deploy

exec node dist/main.js
