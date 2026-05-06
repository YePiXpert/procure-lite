# 办公用品采购系统

用于内部办公用品采购、台账维护、执行跟踪、报表统计和备份恢复的单用户工具。

当前版本：`1.2.38`

详细页面操作、字段说明和常见问题见 [`USAGE.md`](./USAGE.md)。

## 核心能力

- 上传 PDF 或图片后自动提取流水号、部门、经办人、日期和物品明细
- 支持 `local` 与 `cloud` 两类 OCR/视觉解析模式
- 台账支持筛选、分页、在线编辑、批量修改和批量删除
- 执行看板支持状态流转
- 支持报表、审计日志、回收站、数据质检
- 支持本地备份和 WebDAV 云备份/恢复
- 支持 Windows 桌面版、便携版和安装包发布

## 快速开始

### 源码运行

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
./start.sh
```

访问：`http://localhost:8000`

### 运行测试

```bash
pip install pytest pytest-asyncio
pytest tests/ -v
```

当前覆盖率：auth (11 tests)、backup (11 tests)、import (25 tests)、parser (28 tests)，共 75 个。

### Windows 桌面运行

- 直接双击 `start_windows.bat`
- 或运行 `python desktop.py`

### 获取安装包

- 直接从 GitHub Releases 下载最新 `office-supplies-portable.exe`
- 或下载 `office-supplies-setup.exe`

## 最近更新

### v1.2.35 (开发中)

- 数据库访问层从裸 aiosqlite 统一迁移到 SQLAlchemy async
- `parser.py` 拆分为 `parser/` 包 (ocr_utils, strategies, department_extractor, parser_core)
- 路由器拆分：`routers/items.py` → items + reports + history + audit
- 新增安全响应头中间件 (CSP, X-Frame-Options, Referrer-Policy)
- WebDAV 密码改为加密存储
- 新增 `api_utils.validate_pagination` / `normalize_item_filters` 消除 router 重复代码
- 修复 Cookie Secret 多进程竞态条件
- 修复 `update_supplier`/`delete_supplier` 不检查 rowcount 的问题
- 新增 75 个单元测试 (pytest: auth, backup, import, parser)

### v1.2.12

- 前端第三方依赖已内置到 `static/vendor/`，不再依赖公网 CDN
- Windows 安装包和便携版可以离线打开前端界面
- 版本号统一从根目录 `VERSION` 读取
- 新增 `/api/app/metadata`，前端启动时读取版本和 Gemini 运行元数据
- Gemini 默认模型统一由 `gemini_config.py` 中的 `DEFAULT_GEMINI_MODEL_NAME` 定义
- README 精简，详细说明迁移到 `USAGE.md`

### v1.2.11

- 修复 Windows 构建链路中的回归校验输出问题
- 自动发布链路恢复正常

### v1.2.6

- 引入本地管理员密码、恢复码、Cookie 会话和锁定策略

## 技术栈

- 后端：FastAPI + SQLite + SQLAlchemy (async) + Alembic
- 文档解析：pdfplumber + PaddleOCR + pypdfium2
- 前端：Vue 3 + TailwindCSS + Axios
- 桌面容器：pywebview
- 导出：openpyxl
- 测试：pytest + pytest-asyncio

## 项目结构

```
├── main.py                 # FastAPI 入口（中间件、路由注册）
├── auth_security.py        # 认证（argon2 密码哈希、Cookie 签名、登录锁定）
├── api_utils.py            # 共享工具（分页校验、筛选器归一化）
├── security_headers.py     # 安全响应头中间件
├── import_flow.py          # 导入流程（归一化、去重、合并）
├── parser/                 # 文档解析器（策略模式）
│   ├── parser_core.py      #   DocumentParser 主类
│   ├── strategies.py       #   解析策略类
│   ├── ocr_utils.py        #   OCR 工具函数
│   └── department_extractor.py  # 部门提取
├── db/                     # 数据库层（SQLAlchemy async）
│   ├── orm.py              #   引擎、Session 工厂、SQL 工具
│   ├── sqlalchemy_models.py  # ORM 模型 + 审计事件监听
│   ├── items.py            #   物品 CRUD
│   ├── operations.py       #   供应商/采购单/发票
│   ├── reports.py          #   统计报表
│   ├── security.py         #   认证数据
│   ├── history.py          #   变更历史
│   ├── audit.py            #   审计日志
│   ├── filters.py          #   SQL 筛选条件构造
│   ├── schema.py           #   DDL 迁移
│   └── constants.py        #   枚举与常量
├── routers/                # FastAPI 路由
│   ├── auth.py / items.py / imports.py / ops.py
│   ├── reports.py / history.py / audit.py
│   └── system.py           #   备份/恢复/WebDAV/主页
├── static/                 # 前端静态资源 (Vue + Tailwind)
├── tests/                  # 单元测试 (pytest)
│   ├── test_auth.py        #   认证流程
│   ├── test_backup.py      #   备份安全
│   ├── test_import_flow.py #   导入归一化
│   └── test_parser.py      #   文档解析
├── samples/regression/     # 回归测试样本
└── scripts/                # 构建脚本
```

## 运行与配置说明

### 版本来源

- 根目录 `VERSION` 是唯一版本来源
- 后端通过 `app_metadata.py` 读取版本
- 前端通过 `/api/app/metadata` 显示版本号

### Gemini 默认配置

- 默认模型常量在 `gemini_config.py`
- Google 协议下未手动填写模型名时，会使用后端统一默认值

### 离线运行

- `Vue`、`Tailwind`、`Axios` 已内置到 `static/vendor/`
- 不再依赖 `jsdelivr`、`cdn.tailwindcss.com`、Google Fonts

## 常用接口

| 方法 | 路径 | 路由器 | 说明 |
|---|---|---|---|
| GET | `/` | system | 主页 |
| GET | `/api/app/metadata` | system | 应用版本与 Gemini 运行元数据 |
| POST | `/api/auth/setup` | auth | 初始化管理员密码 |
| POST | `/api/auth/login` | auth | 登录 |
| GET | `/api/items` | items | 台账列表（筛选/分页） |
| GET | `/api/execution-board` | items | 执行看板 |
| GET | `/api/autocomplete` | items | 自动补全数据 |
| GET | `/api/stats` | items | 统计概览 |
| POST | `/api/upload-ocr` | imports | 上传并创建解析任务 |
| GET | `/api/tasks/{task_id}` | imports | 查询解析任务状态 |
| POST | `/api/import/confirm` | imports | 确认导入 |
| GET | `/api/export` | reports | 导出台账 Excel |
| GET | `/api/reports/amount` | reports | 金额统计报表 |
| GET | `/api/reports/operations` | reports | 执行分析报表 |
| GET | `/api/reports/suppliers` | reports | 供应商采购分析 |
| GET | `/api/history` | history | 变更历史 |
| GET | `/api/audit-logs` | audit | 字段级审计日志 |
| GET | `/api/backup` | system | 下载本地备份 |
| POST | `/api/restore` | system | 上传备份并恢复 |
| GET | `/api/webdav/backups` | system | 列出 WebDAV 备份 |
| POST | `/api/webdav/backup` | system | 上传备份到 WebDAV |
| POST | `/api/webdav/restore` | system | 从 WebDAV 恢复 |
| GET | `/api/ops/center` | ops | 运营工作台 |

## 相关文档

- 使用说明：[`USAGE.md`](./USAGE.md)
- 回归样例：`samples/regression/`
- 构建脚本：`scripts/`
