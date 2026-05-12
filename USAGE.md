# 使用说明

本文档对应当前版本 `1.2.44`，面向日常使用和运维操作。

## 1. 启动

### 1.1 推荐：Docker Web 服务

适用于 Windows 电脑和手机共用同一套台账。

1. 安装并启动 Docker Desktop。
2. 在项目根目录双击 `start_docker_server.bat`。
3. Windows 本机打开 `http://localhost:8000`。
4. 手机打开脚本打印的局域网地址，例如 `http://192.168.1.23:8000`。

默认端口是 `8000`。如需调整，修改 `.env` 中的 `OFFICE_SUPPLIES_PORT`。

更多步骤见 [Windows 与手机共用的 Docker Web 服务](./docs/shared-web-service.md)。

### 1.2 单机桌面模式

只在一台 Windows 电脑上使用时，双击：

```text
start_windows.bat
```

桌面版更适合单机使用。需要手机长期访问时，优先使用 Docker Web 服务。

### 1.3 开发模式

```bash
./start.sh
```

Windows PowerShell 可使用：

```powershell
.\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

打开 `http://localhost:8000`。

## 2. 首次使用

首次进入系统时，需要设置管理员密码。请妥善保存恢复码。

之后使用管理员密码登录。系统会使用本地 Cookie 会话保持登录状态。

## 3. 导入单据

1. 点击 `导入单据` 或概览页的 `上传采购单据`。
2. 上传 `PDF / PNG / JPG / JPEG / JFIF` 文件。
3. 系统创建后台解析任务，前端自动轮询任务状态。
4. 解析完成后检查预览结果。
5. 根据需要校正流水号、部门、经办人、申领日期、物品名称、数量和采购链接。
6. 确认导入。

解析默认使用本地 PaddleOCR：

- 无需配置 API Key
- 单据文件不会上传到云端解析服务
- PDF 优先使用文本/表格解析，必要时使用 PaddleOCR 兜底
- 图片文件直接使用 PaddleOCR 解析

## 4. 台账

台账支持：

- 按关键词、采购状态、部门、月份筛选
- 分页浏览，支持每页 20/50/100 条
- 在线编辑流水号、部门、经办人、物品名称、数量、单价、状态、日期和备注
- 批量修改状态或付款状态
- 批量删除到回收站

手机窄屏会自动切换为卡片视图，便于现场查询和更新状态。

## 5. 执行看板

执行看板固定三列：

- 待采购
- 待到货
- 待分发

可拖拽卡片跨列流转，也可以使用“一键流转”。到货和分发阶段可填写日期与签收备注。

## 6. 统计报表

报表页包含：

- 当前费用总计
- 已计价金额
- 单价缺失笔数
- 部门支出占比
- 状态金额占比
- 月度金额趋势
- 采购周期和执行漏斗

台账筛选条件变化后，切换到报表页会自动按最新筛选重算数据。

## 7. 数据治理

系统设置中包含：

- 回收站：恢复或彻底删除记录
- 数据巡检：扫描质量问题和重复键组
- 审计日志：查看新增、更新、删除记录，并支持部分回滚

## 8. 备份与恢复

本地备份会导出 zip，包含数据库和上传文件。

恢复时上传 zip，系统会先执行健康检查，再恢复数据。恢复期间接口可能短暂返回 `503`，稍后重试即可。

WebDAV 云同步支持：

- 保存 WebDAV 配置
- 测试连接
- 上传当前备份
- 查看远端备份并恢复

## 9. 数据落盘位置

源码/桌面模式默认位于运行目录：

- `data/office_supplies.db`
- `uploads/`
- `.webdav_config.json`
- `.auth_cookie_secret`

Docker 模式默认位于：

```text
office-supplies-state/
```

迁移或备份 Docker 服务时，优先备份整个 `office-supplies-state/` 目录。

## 10. 常见问题

### 解析效果不稳定

- 优先使用可复制文本的 PDF
- 图片尽量保持清晰，裁掉无关区域
- 导入前在预览页校正关键字段

### 手机打不开

- 手机和部署机器是否在同一个局域网
- 手机访问的是局域网 IP，不是 `127.0.0.1` 或 `localhost`
- Docker 服务是否正在运行
- Windows 防火墙、服务器防火墙或云服务器安全组是否开放 `8000`

### Windows 打包报错

建议顺序：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup_windows_env.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_windows.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_windows_installer.ps1
```

## 11. 开发与测试

```bash
pip install pytest pytest-asyncio
pytest tests/ -v
```

当前完整测试集共 98 个用例。
