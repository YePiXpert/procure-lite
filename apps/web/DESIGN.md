# Procure Lite 前端视觉规范 —「墨与纸」

> 本文是 2026-09 前端重设计的施工图。所有页面与组件都按这里的令牌、尺寸和构图实现；
> 与本文冲突的旧样式一律以本文为准。业务逻辑、API 调用、状态管理、文案与可访问性属性
> **不在重设计范围内**，只动视觉层。

## 0. 为什么要重做（诊断）

对现有页面（浅/深色 × 桌面/手机）逐页截图后的结论：

1. **没有个性**：默认蓝 + 白卡片 + 灰底 + 深蓝侧栏，是最典型的「后台模板」组合；页面标题只有 15px 塞在顶栏里，字号层级扁平，所有东西看起来一样重要。
2. **大面积空白与失衡**：登录页右侧一个小表单漂在巨大空白里；导入页只有一个小卡片和一个**原生文件选择框**（"Choose File"）；设置页「外观」小卡片下面一整列空白；供应商/库存/发放等页面 4～6 行数据的表格被拉到整屏高度。
3. **原生控件穿帮**：复选框、单选框、日期框、文件框全是浏览器默认样式，深色模式下变成白色方块；`mm/dd/yyyy` 占位与中文界面不搭。
4. **卡片套卡片**：筛选卡片 + 表格卡片 + 分页条，层层描边，信息密度低而视觉噪音高。
5. **导入页与其它页面不是一个体系**：裸文本状态行、`text-red-600` 这类非令牌颜色、无步骤感，而它是用户最先接触的流程。
6. **深色模式只是「把颜色翻过来」**：侧栏与画布同为深蓝、卡片边界几乎不可见。

## 1. 设计方向

**「墨与纸」**：温润的纸色画布、墨色文字与主按钮、一种品牌绿做点睛（链接、当前项、焦点、成功），
语义色（琥珀 = 等待、蓝 = 进行中、红 = 危险）只用于状态。层级靠**字号与留白**而不是靠卡片描边。

五条原则（做决定时按这个顺序）：

1. **一页一个标题**：每个页面都有 22px 的页标题和一行说明，右侧放本页动作。
2. **一层容器**：内容直接放在白色面板上，面板之间用留白分隔；不允许卡片套卡片。
3. **表格就是表格**：表头小而淡，行高 44px，数字右对齐且等宽（tabular），操作列在悬停时才显眼。
4. **控件全部自绘**：复选框、单选、开关、分段控件、日期、文件上传都按本规范绘制，深浅色一致。
5. **颜色是信息**：只有状态和警示才上色；装饰性色块（彩色图标底、渐变、彩色标题）一律去掉。

## 2. 设计令牌（`src/styles/main.css` 的 `@theme`）

### 2.1 浅色（默认）

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--color-canvas` | `#f5f4f0` | 页面画布（暖纸色） |
| `--color-surface` | `#ffffff` | 面板 / 表格 / 弹窗 |
| `--color-surface-2` | `#faf9f6` | 行悬停、次级面板、输入框禁用底 |
| `--color-ink` | `#1b1a17` | 标题、强调数字 |
| `--color-text` | `#2b2a26` | 正文 |
| `--color-muted` | `#5f5d57` | 次要文字（白底对比 ≥ 6:1） |
| `--color-faint` | `#7b7973` | 辅助文字、占位（白底对比 ≥ 4.5:1） |
| `--color-line` | `#e7e5df` | 发丝分隔线 |
| `--color-line-strong` | `#d6d3cb` | 控件描边 |
| `--color-primary` | `#1b1a17` | 主按钮底色（= 墨色） |
| `--color-primary-hover` | `#2f2e2a` | 主按钮悬停 |
| `--color-primary-fg` | `#ffffff` | 主按钮文字 |
| `--color-primary-soft` | `#efede8` | 中性选中底（选中行、分段控件当前项） |
| `--color-accent` | `#1f7a53` | 品牌绿：链接、当前导航、焦点环、成功 |
| `--color-accent-hover` | `#196343` | |
| `--color-accent-soft` | `#e4f2ea` | 绿色柔底 |
| `--color-teal` / `--color-teal-soft` | = accent / accent-soft | **兼容别名**（Badge/StatCard 的 `tone="teal"`） |
| `--color-blue` | `#2f6bd6` | 进行中 / 信息 |
| `--color-blue-soft` | `#e6eefb` | |
| `--color-amber` | `#b26a12` | 等待 / 提醒 |
| `--color-amber-soft` | `#fbf0dc` | |
| `--color-red` | `#c2412d` | 危险 / 错误 / 低库存 |
| `--color-red-soft` | `#fbe8e4` | |
| `--color-panel` | `#1b1a17` | 深色浮层（Toast、tooltip）在两个主题下都保持深色 |
| `--color-panel-soft` | `#2a2925` | |

### 2.2 深色（`html.dark`，在 `@layer base { .dark { … } }` 覆盖）

| 令牌 | 值 |
| --- | --- |
| canvas `#131311` · surface `#1b1b19` · surface-2 `#222220` |
| ink `#f3f2ed` · text `#dfded8` · muted `#a3a199` · faint `#85837b` |
| line `#2b2b28` · line-strong `#3b3a36` |
| primary `#f3f2ed` · primary-hover `#e2e1db` · primary-fg `#1b1a17` · primary-soft `#262622` |
| accent `#4cc38a` · accent-hover `#5fd39b` · accent-soft `rgb(76 195 138 / 0.14)` |
| blue `#6d9ef2` · blue-soft `rgb(109 158 242 / 0.16)` |
| amber `#e0a24a` · amber-soft `rgb(224 162 74 / 0.14)` |
| red `#ef6d5c` · red-soft `rgb(239 109 92 / 0.15)` |
| panel `#262622` · panel-soft `#33332e` |

深色模式额外规则：`html.dark { color-scheme: dark }`（修正原生日期框、滚动条、`<select>` 弹层）；
面板不用阴影而用 1px `line` 描边区分层级；`shadow-*` 令牌在深色下改为纯黑低透明度。

### 2.3 圆角 / 阴影 / 动效

- `--radius-card: 12px`（面板、弹窗 14px 用 `rounded-[14px]`）、`--radius-control: 8px`（按钮、输入框）、药丸用 `rounded-full`。
- `--shadow-xs`: `0 1px 2px rgb(27 26 23 / 0.06)`；`--shadow-card`: `0 1px 2px rgb(27 26 23 / 0.04), 0 1px 3px rgb(27 26 23 / 0.06)`；`--shadow-pop`: `0 8px 24px -8px rgb(27 26 23 / 0.18), 0 24px 48px -16px rgb(27 26 23 / 0.16)`。
- 面板默认**只有描边没有阴影**（`border border-line`）；只有弹窗、下拉、Toast 用 `shadow-pop`。
- 过渡 150ms ease-out；按钮按下 `active:scale-[0.98]`；遵守 `prefers-reduced-motion`。

## 3. 字体与文字层级

```
--font-sans: "Segoe UI Variable Text", "Segoe UI", -apple-system, "PingFang SC",
  "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC",
  "Source Han Sans SC", system-ui, sans-serif;
--font-mono: "Cascadia Mono", "SF Mono", ui-monospace, Consolas, monospace;
```

| 角色 | 规格 |
| --- | --- |
| 页标题 `h1` | 22px / 600 / `tracking-tight` / `text-ink`（移动端 20px） |
| 页说明 | 14px / `text-muted`，标题下 4px |
| 区块标题 `h2` | 15px / 600 / `text-ink`；区块说明 13px `text-muted` |
| 正文 | 14px / `text-text` |
| 表格正文 | 13.5px（`text-[13.5px]`），表头 12px / 500 / `text-muted` |
| 元信息 `.text-meta` | 12px / 18px 行高 / `text-faint` |
| KPI 数值 | 26px / 600 / `text-ink` / `tabular-nums` / `tracking-tight` |
| 金额与数量 `.num` | `font-variant-numeric: tabular-nums`，**不再用等宽字体**；只有流水号（`OA-…`）用 `font-mono text-[12.5px]` |
| 标签（表单 label） | 13px / 500 / `text-text`，下方 6px |

全局 `html { -webkit-font-smoothing: antialiased; }`；正文行高 1.5，表格 1.4。

## 4. 布局

### 4.1 应用外壳 `AppShell.vue`

```
┌───────────────┬─────────────────────────────────────────────┐
│ 侧栏 240px    │ <main> 滚动容器                              │
│ 纸色 canvas   │   px-8 py-8（移动端 px-4 py-5） max-w 1440   │
│ 右侧 1px line │   ┌ PageHeader ───────────────────────────┐ │
│               │   │ 22px 标题 + 说明        [本页动作按钮] │ │
│ · 品牌行      │   └────────────────────────────────────────┘ │
│ · [导入 OA 单]│   内容区块，区块间 gap 24px                   │
│ · 日常 / 管理 │                                             │
│   导航组      │                                             │
│ · 底部：AI 助手│                                             │
│   深浅色 / 退出│                                             │
└───────────────┴─────────────────────────────────────────────┘
```

- **桌面端不再有顶栏**。原顶栏的「导入 OA 单」变成侧栏品牌行下的整宽主按钮（h-9，`bg-primary`，在导入页时变为「查看台账」二级按钮）；「AI 助手」变成侧栏底部导航项（sparkles 图标）。
- 侧栏：`bg-canvas`，右侧 `border-r border-line`。品牌行 56px：24px 圆角 6px 的品牌标（`bg-ink` 底、白色 `inventory` 图标，深色下反转）+ "Procure Lite"（14px/600）+ "采购台账"（12px faint）。
- 导航项：h-9，px-3，圆角 8，13.5px；图标 16px 与文字间距 10px。默认 `text-muted`；悬停 `bg-primary-soft/70 text-ink`；当前项 `bg-surface text-ink font-medium border border-line shadow-(--shadow-xs)`，左侧不再画蓝色小竖条。
- 导航分组标题：11px / 500 / `text-faint` / `tracking-wider`，上方间距 20px。
- 侧栏底部（`border-t border-line`）：AI 助手、深色/浅色、退出登录，三个与导航项同样式的按钮。
- `<main>` 是**唯一的滚动容器**；页面内容不再用 `h-full flex-1 min-h-0` 把表格拉满屏，表格随内容自然增高（工作台三列看板例外，见 §7.1）。

移动端（`< lg`）：
- 顶栏 52px：`bg-surface/90 backdrop-blur border-b border-line`，左侧品牌标 + 页标题（16px/600），右侧 AI 助手图标按钮 + 「导入」主按钮（h-8）。
- 底部标签栏 60px + safe-area：5 项（工作台/台账/发放/库存/更多），图标 20px + 11px 文字；当前项 `text-ink`，图标外有 `bg-primary-soft` 圆角 8 的 28×44 底；其它 `text-faint`。
- 「更多」面板：底部抽屉，圆角顶 16px，4 列图标网格；图标底 `bg-surface border border-line`。

### 4.2 页头 `PageHeader.vue`（新增）

```vue
<PageHeader title="采购台账" description="共 35 条记录 · 含回收站 0 条">
  <Button variant="secondary">导出</Button>
  <Button variant="primary">新增</Button>
</PageHeader>
```

- 结构：`flex flex-wrap items-end justify-between gap-4 mb-6`；左侧 `h1` + `p`；默认插槽渲染在右侧 `flex items-center gap-2`。
- 可选 `#meta` 插槽渲染在标题上方（面包屑/小标签，12px faint）。
- 移动端标题 20px，动作按钮自动换行到下一行、靠左。

### 4.3 内容宽度与间距

- 正文最大宽度 1440px 居中；设置类页面（系统设置/供应商/审计）内容最大宽度 960px。
- 区块间距 24px；面板内边距 20px（`p-5`），表格面板 `p-0`。
- 页面底部留 `pb-24 lg:pb-10`，给移动端底栏让位。

## 5. 组件规范（`src/components/ui/`）

所有组件保持现有 props / emits / 插槽 API 向后兼容（可以新增可选 prop），
文案、`aria-*`、`role` 不变。以下尺寸均为桌面端，移动端沿用。

### Button
| variant | 样式 |
| --- | --- |
| `primary` | `bg-primary text-primary-fg hover:bg-primary-hover shadow-(--shadow-xs)`；深色模式自动变成浅色按钮 |
| `secondary` | `bg-surface text-text border border-line-strong hover:bg-surface-2 hover:border-faint` |
| `ghost` | `text-muted hover:text-ink hover:bg-primary-soft` |
| `danger` | `bg-red text-white hover:brightness-95` |
| `accent`（新增） | `bg-accent text-white hover:bg-accent-hover`，仅用于「确认入账 / 确认发放」这类完成性动作 |

尺寸：`sm` h-8 px-3 text-xs gap-1.5；`md` h-9 px-3.5 text-sm gap-2；`lg`（新增）h-10 px-4 text-sm。圆角 8。图标按钮（仅图标）：`size-8` 或 `size-9`，用 `variant="ghost"`。
焦点：`focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2`。
loading 态保留转圈，禁用 `opacity-50`。

### Input / Textarea / SearchInput
- 高度 h-9，`px-3 text-sm bg-surface border border-line-strong rounded-(--radius-control)`；悬停 `border-faint`；焦点 `border-accent ring-2 ring-accent/20`；错误 `border-red ring-red/20`；禁用 `bg-surface-2 text-muted`。
- label：13px/500 `text-text` 下方 6px；必填星号 `text-red`；hint 12px faint；error 12px red 带 `alert` 图标。
- `type="date"`：给 `input[type=date]` 加 `.input-date` 类：右侧自绘 `calendar` 图标、隐藏原生指示器（`::-webkit-calendar-picker-indicator { opacity:0; position:absolute; inset:0; cursor:pointer }` 保留可点击）、`min-w-36`；深色靠 `color-scheme: dark`。
- SearchInput：左侧 `search` 图标 16px `text-faint`，h-9，清除按钮 `size-6 rounded-full hover:bg-primary-soft`。
- Textarea：同 Input，`py-2 leading-relaxed`。

### Select（reka）/ NativeSelect
- 触发器与 Input 完全同高同边；右侧 `chevron-down` 16px faint；占位 `text-faint`。
- 弹层：`bg-surface border border-line rounded-[10px] shadow-pop p-1`；选项 h-8 px-2 rounded-md 13.5px；高亮 `bg-primary-soft text-ink`；选中项左侧 `check` 图标 `text-accent`。
- NativeSelect `sm`：h-7 text-xs，用于表格行内。

### Checkbox / Radio（新增 `Checkbox.vue`、`Radio.vue` + 全局类 `.checkbox` `.radio`）
- 两种用法都要有：组件（`v-model`/`checked`/`indeterminate`/`ariaLabel`/`disabled`，可带 `label` 文字）和直接给 `<input type="checkbox" class="checkbox">` 用的全局类，方便表格行内。
- 视觉：16×16，`rounded-[4px] border border-line-strong bg-surface`；选中 `bg-ink border-ink` + 白色对勾（`background-image` 内联 SVG）；半选 `bg-ink` + 白色短横；焦点 `ring-2 ring-accent/30`；禁用 `opacity-40`。Radio 同样但圆形，选中为墨色环 + 中心白点。
- 实现用 `appearance-none`，不要用 `sr-only` 隐藏再自绘（保持原生键盘与 `getByRole('checkbox')` 行为）。

### Switch（新增，可选）
- 36×20 药丸，关 `bg-line-strong`，开 `bg-accent`；用于设置页的开关项（自动备份、AI 启用）。

### Tabs（新增 `Tabs.vue`）
- props：`modelValue`、`tabs: { value, label, count?, icon? }[]`、`variant: 'underline' | 'segmented'`。
- `underline`：h-10，标签 14px，当前项 `text-ink font-medium` 底部 2px `bg-ink`；其它 `text-muted hover:text-ink`；整行底部 `border-b border-line`。count 用 `text-faint` 小字跟在标签后。
- `segmented`：外框 `bg-primary-soft rounded-[9px] p-0.5`，项 h-8 px-3 text-[13px] rounded-[7px]；当前项 `bg-surface text-ink shadow-(--shadow-xs)`。用于 台账/回收站、库存物品/流水、发放单/领用统计、供应商/价格记忆、直发/库存发放、主题切换。
- 也提供 `SettingsLayout.vue` 使用的路由版（router-link 渲染，同 `underline` 视觉）。

### Badge / StatusBadge
- 药丸 h-6 px-2.5 text-xs/500，`bg-*-soft text-*`，**不再描边**；可选 `dot` 属性在文字前画 6px 圆点。
- tone 映射：`blue`→blue、`teal`→accent（绿）、`amber`、`red`、`gray`→`bg-primary-soft text-muted`。
- StatusBadge 的状态色在组件内本地映射（不改 `packages/shared`）：待采购 `gray`、待到货 `amber`、待分发 `blue`、已发放 `teal`（绿）、已入库 `gray` 且带 `check` 图标。付款状态：未付款 `amber`、已付款 `teal`、已报销 `gray`。

### StatCard（KPI 瓦片）
- `bg-surface border border-line rounded-(--radius-card) p-4`；**去掉彩色大图标方块**。
- 第一行：label 12px muted（左）+ 16px 图标 `text-faint`（右）；第二行：数值 26px/600 ink tabular + 单位 12px muted；第三行：hint 12px faint。
- tone 只影响一个 6px 圆点（放在 label 前）或图标颜色，`gray` 不显示圆点。
- 可点击（`to`）：悬停 `border-line-strong` + 右上角 `chevron-right` 淡入；不要位移动画。

### Table（全局类 `.table-base`、`.table-sticky`）
- `th`：h-10，12px/500 `text-muted`，`bg-surface`，`border-b border-line`，`px-4 whitespace-nowrap`；数字列 `text-right`。
- `td`：13.5px，`py-3 px-4`，`border-b border-line/80`，行高约 44px；最后一行无底边。
- 行悬停 `bg-surface-2`；选中行 `bg-accent-soft/40`。
- 操作列：图标按钮 `size-8 rounded-md text-faint`，默认 `opacity-60`，行悬停 `opacity-100`；危险动作悬停 `text-red bg-red-soft`。
- 首列品名等主字段 `text-ink font-medium`，副行（日期/经办人）用 `.text-meta`。
- 表格外层面板：`bg-surface border border-line rounded-(--radius-card) overflow-hidden`；工具栏（搜索/筛选）放在**同一个面板顶部** `px-4 py-3 border-b border-line`，不再单独做一张卡片；分页放在面板底部 `px-4 py-3 border-t border-line`。
- 移动端：面板 `overflow-x-auto`，表格 `min-w` 保留横向滚动。

### Toolbar 模式（筛选行）
- `flex flex-wrap items-center gap-2`；搜索框 `w-full sm:w-72`；筛选 Select 宽 `w-36`；右侧动作 `ml-auto`。
- 超过 3 个筛选控件时，其余收进「筛选」二级按钮（带 `filter` 图标与已选数量角标），点开显示 `bg-surface-2 border-t border-line px-4 py-3` 的展开区（桌面端也可以直接展开）。
- 已选筛选条件用可关闭的 chip（h-7 rounded-full bg-primary-soft text-xs）显示在工具栏下一行，末尾「清除全部」。
- 多选批量条：选中 > 0 时在面板顶部工具栏位置**替换**为墨色条 `bg-panel text-white`（"已选 3 条 · [批量改付款] [移入回收站] [取消]"），而不是再加一行蓝色框。

### Pagination
- 左侧 `text-xs text-muted` "共 35 条 · 第 1-20 条"；右侧 `size-8` 页码按钮，当前 `bg-ink text-surface`，其它 `text-muted hover:bg-primary-soft`。

### Dialog / ConfirmDialog
- 遮罩 `bg-ink/40 backdrop-blur-[2px]`（深色 `bg-black/60`）。
- 面板 `bg-surface rounded-[14px] shadow-pop border border-line`；头部 `px-6 pt-5 pb-4`：标题 17px/600 ink，描述 13px muted；**头部无底边线**；内容 `px-6 pb-2`；页脚 `px-6 py-4 border-t border-line bg-surface`（不再用半透明画布色）。
- 关闭按钮 `size-8 rounded-md text-faint hover:bg-primary-soft`。
- 二次确认层（放弃修改）沿用现有逻辑，只换样式。
- ConfirmDialog：宽 420，危险动作按钮 `danger`，取消 `ghost`。

### Toast
- **墨色浮层**：`bg-panel text-white rounded-[10px] shadow-pop px-4 py-3`，左侧类型图标（成功 `text-accent`、错误 `text-red`、信息 `text-blue`），动作按钮 `text-white/90 underline underline-offset-2`，关闭 `text-white/60`。
- 位置：桌面右下 `bottom-6 right-6`；移动端 `bottom-20` 居中，宽 `calc(100vw-2rem)`。

### EmptyState / ErrorState
- 插画尺寸 120；标题 14px/600 ink；描述 13px muted `max-w-xs`；动作按钮 `secondary sm`；上下内边距 `py-14`。
- 插画 `tone.ts`：`blue` → `main: var(--color-accent)`、`soft: var(--color-accent-soft)`；`teal` 同上；`gray` → `main: var(--color-faint)`、`soft: var(--color-primary-soft)`。

### Skeleton
- `bg-primary-soft rounded-md animate-pulse`。

### FileDropzone（新增 `FileDropzone.vue`，导入页用）
- props：`accept`、`disabled`、`hint`、`capture?`；emit `files(File[])`。
- 视觉：`border-2 border-dashed border-line-strong rounded-(--radius-card) bg-surface hover:border-accent hover:bg-accent-soft/30 p-10 text-center`，中间 `upload` 图标 28px（`text-faint`，悬停/拖入 `text-accent`），主文案「点击选择或把文件拖到这里」14px/500，副文案「PDF / PNG / JPG / WEBP · 最大 30MB · 最多 30 页」12px faint；拖入时 `border-accent bg-accent-soft/40`。
- 内部仍然是真实的 `<input type="file">`（`sr-only`，覆盖整块可点击 `<label>`），e2e 通过 `input[type=file]` 上传。
- 移动端额外一个 `secondary` 按钮「拍照上传」（`capture="environment"`）。

### Icon
- 继续用内联 path 集；新增：`calendar`, `upload-cloud`（或复用 `upload`）, `menu`, `check-circle`, `info`, `external`, `truck`, `layers`, `arrow-right`, `bell`（按需要补，不要引入图标库）。

## 6. 登录页 `LoginView.vue`

- 整页 `bg-canvas` 居中一张 `w-full max-w-[420px]` 的面板：`bg-surface border border-line rounded-2xl shadow-pop p-8`（移动端 `p-6`，去阴影，四周 `mx-4`）。
- 面板内：品牌标 40px + "Procure Lite" 18px/600 + "采购台账 · 单管理员" 13px muted；20px 后是当前模式标题（登录 / 设置管理员密码 / 用恢复码重置密码）17px/600 与说明；表单；主按钮整宽 `lg`；底部链接 13px `text-accent`。
- 背景装饰：面板后方一个 `PatternGrid`（`text-ink/[0.05]`）和左上角一团 `accent-soft` 径向渐变（`bg-[radial-gradient(...)]`），克制。页脚一行 `text-meta text-faint`："本地部署 · 数据自持 · v2.0"。
- 恢复码卡片、后端不可达卡片沿用同一面板，只换内部样式（恢复码用 `font-mono text-lg tracking-[0.2em] bg-surface-2 border border-line rounded-lg py-3`）。
- 保留 `input[type=password]`、按钮文字「登 录」（e2e 用 `/^登\s*录$/` 匹配）。

## 7. 页面构图

每页都以 `PageHeader` 开头，标题即路由 `meta.title`。以下列出各页的区块顺序与要点。

### 7.1 工作台 `/workbench`
1. PageHeader：标题「工作台」，说明「2026年9月28日 · 待处理 8 单 · 23 条明细」（日期用本地化字符串），动作：刷新（ghost 图标按钮）。
2. KPI 行：5 个 StatCard，`grid-cols-2 lg:grid-cols-5 gap-3`；移动端横向滚动（`flex overflow-x-auto snap-x`，每张 `min-w-[46%]`）。
3. 筛选搜索框 `w-full sm:w-80`。
4. 看板三列：`grid lg:grid-cols-3 gap-4`，列为 `bg-canvas`（与画布同色）**无描边**；列头：8px 状态圆点 + 列名 14px/600 + "4 单 · 13 条" 12px faint；列头下一行 12px faint 提示文字。桌面端三列高度撑满剩余视口，列内滚动（保留现有 `lg:h-full` 逻辑）。
5. 单据卡片：`bg-surface border border-line rounded-(--radius-card) p-4`，悬停 `border-line-strong`；头部：流水号 `font-mono text-[13px] font-semibold text-ink` + 右侧金额 13px/600 tabular；第二行 12px faint「市场部 · 赵敏 · 2026-09-20」；明细列表 13px，勾选框用 `.checkbox`，数量右对齐 tabular；页脚按钮：主动作 `primary sm`，次动作 `secondary sm`，退回类 `ghost sm`。
6. 保留 `article` 元素与所有按钮文案（e2e 用 `article` + 按钮名定位）。

### 7.2 采购台账 `/ledger`
1. PageHeader：说明「35 条记录 · 本页 20 条」，动作：导出（secondary）、新增（primary）。
2. 一个表格面板：顶部 Tabs（segmented：台账 / 回收站）+ 工具栏（搜索、状态、付款、部门、经办人；日期区间与排序收进「筛选」展开区）；批量条按 §5 Toolbar 规则；表格；分页。
3. 列：`[✓] 流水号 · 品名/申请日期 · 部门/经办人 · 数量 · 金额/单价 · 供应商 · 状态 · 付款 · 操作`；数量与金额右对齐；流水号 `font-mono`；付款列的行内 NativeSelect 保留。
4. 表格 `min-w-[1080px]` 保留横向滚动。

### 7.3 导入单据 `/import`
1. PageHeader：标题「导入 OA 单据」，说明「保存原件 · 本地识别 · GPT 复核 · 人工确认」。
2. 步骤条：4 步（上传原件 → 本地识别 → GPT 复核 → 核对入账），`flex` 横排，每步 24px 圆形序号（当前 `bg-ink text-surface`，已完成 `bg-accent text-white` + check，未到 `border border-line-strong text-faint`）+ 13px 文字，步与步之间 1px 连接线；根据 `task.status / aiStatus / confirmed` 计算当前步。
3. 未上传：`FileDropzone` 占整行，下方 12px faint 说明（启用自动智能导入时的隐私提示）。
4. 处理中/待核对：
   - 状态条：一个 `bg-surface border border-line rounded-(--radius-card) px-5 py-4` 面板，左侧文件名 14px/500 + 一行 12px muted「本地：已完成 · GPT：已完成 · 1/1 页」（**保持现有文案片段**「本地：…」「GPT：…」「草稿已保存」），右侧动作按钮（停止处理 / 重试本地失败页 / 重试 GPT 未完成页）。
   - 警告用 `bg-amber-soft text-amber rounded-lg px-3 py-2 text-[13px]` 列表；页级核对确认用 `Checkbox` 组件（label 文案不变）。
   - 双栏 `grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 items-start`：左侧原件预览面板（顶部工具行：上一页 / 页码 / 下一页 / 打开原件链接；图片 `rounded-lg border border-line`），右侧草稿：单据头四个字段用 Input 组件 2×2 网格；明细表用 `.table-base`，每行品名/数量/单位/单价/链接为 Input（`sm` 高度 h-8），重复行提示用 Badge；「识别依据与 GPT 建议」保持 `<details>` 但样式化为 `bg-surface-2 rounded-lg`。
   - 底部固定操作条（`sticky bottom-0 bg-surface/95 backdrop-blur border-t border-line px-5 py-3 flex gap-2 justify-end`）：保存草稿（secondary）、确认全部内容并导入（`accent`）。
5. 完成：`bg-accent-soft/60 border border-accent/20 rounded-(--radius-card) p-6` 成功面板，`check-circle` 图标 + 「已创建 1 条 …」文案不变 + 查看台账按钮。
6. 移动端：明细 / 原件用 segmented Tabs 切换（保留现有 `mobileTab` 逻辑）。

### 7.4 领用发放 `/distributions`
1. PageHeader：动作「发放登记」primary。
2. 面板：Tabs（发放单 / 领用统计）+ 工具栏（领用人搜索、部门搜索、日期区间）；列表每行：左侧展开箭头、日期 14px/600、来源 Badge、部门 muted、下一行 13px muted 摘要；右侧「2 笔」+ 创建时间 12px faint + 删除图标按钮；展开区 `bg-surface-2` 内嵌明细表与签收附件。
3. 领用统计：表格 + 「累计数量」列内嵌 4px 高的比例条（`bg-accent/70`）。

### 7.5 库存管理 `/inventory`
1. PageHeader：动作「记一笔流水」secondary、「新增物品」primary。
2. 面板：Tabs（库存物品 / 库存流水）+ 工具栏（搜索、只看低库存 toggle 按钮、右侧统计文字）。
3. 物品表：库存数值 `font-semibold tabular`，低库存行数值 `text-red` + StatusBadge 风格药丸「低库存」（红）/「充足」（绿）；分类为 gray Badge；操作列图标按钮。
4. 流水表：类型用 Badge（入库绿 / 出库蓝 / 盘点琥珀），数量带符号右对齐（正绿负红）。

### 7.6 统计报表 `/reports`
1. PageHeader：说明为当前区间描述；动作：快捷区间 segmented Tabs（本月 / 上月 / 本年 / 全部）。
2. 第二行工具栏：日期起止 Input + 统计维度 Select，放在一个 `bg-surface border border-line rounded-(--radius-card) px-4 py-3` 条里。
3. KPI 4 个瓦片。
4. 图表面板：标题 15px/600 + 说明 + 右侧「合计 ¥…」与导出；图表配色：柱 = `accent`，折线 = `blue`，网格线 `line`，坐标轴无轴线、无刻度，标签 11px muted，tooltip `surface` 底 + `line` 边 + `shadow-pop`；柱圆角 `[4,4,0,0]`，`barMaxWidth 28`。
5. 领用排行表 + 「累计数量」比例条。

### 7.7 系统设置 `/settings`（含 `SettingsLayout`）
- `SettingsLayout`：PageHeader「系统设置」+ 路由版 underline Tabs（系统设置 / 供应商与比价 / 审计日志），内容最大宽度 960px，`space-y-6`。
- 每个区块一个面板：头部 `px-5 py-4 border-b border-line`（h2 15px/600 + 13px muted 说明），内容 `p-5`。
- 外观：一行「主题」+ 右侧 segmented Tabs（浅色 / 深色 / 跟随系统），不再是孤零零的小卡片。
- 账号安全：两列表单（当前密码 / 新密码 / 确认新密码），按钮行右对齐。
- 系统状态：2×3 的键值网格（键 12px faint，值 14px/500 ink），OCR 不可用用红色 Badge + 「重测」链接；提示条 `bg-amber-soft text-amber`。
- AI 助手：连接信息折叠区用 `bg-surface-2 rounded-lg p-4`，模型选择 + 「获取模型列表」按钮同行，启用开关用 Switch；**所有文案与 label 保持不变**（e2e 依赖：「服务已配置 · 修改连接」「服务器已配置 Key，无需填写」「接口地址」「API Key」「模型」「获取模型列表」）。
- 自动备份 / 备份管理：开关 + 表格。

### 7.8 供应商与比价 `/settings/suppliers`、审计日志 `/settings/audit`
- 供应商：比价查询做成一个 `bg-surface-2 rounded-(--radius-card) p-4` 的搜索条（不是独立卡片）+ 结果表；供应商 / 价格记忆用 Tabs 切换，表格按 §5。
- 审计：工具栏 + 表格；操作类型 Badge 按动作分色（登录 gray、修改 blue、删除 red、导入/发放 green）；详情列 `text-[13px] text-muted`，IP `font-mono text-meta`。

### 7.9 弹窗（PurchaseDialog / DistributionCreateDialog / ItemEditDialog / ItemDetailDialog / AiPanel）
- 表单弹窗：字段 `grid sm:grid-cols-2 gap-4`，分组之间用 `border-t border-line pt-4 mt-2` + 13px/600 分组标题。
- 明细行（下单登记、发放登记）：`bg-surface-2 border border-line rounded-lg p-3`，行内输入用 h-8 `sm` 尺寸；删除按钮 ghost 图标。
- 详情弹窗：键值网格 `grid grid-cols-3 gap-x-6 gap-y-4`（键 12px faint，值 14px ink）；状态 Badge 一行；附件区与修改历史用 `border-t border-line pt-4` 分隔，历史记录是时间线（左侧 2px 竖线 + 8px 圆点）。
- AiPanel 抽屉：宽 `sm:max-w-[440px]`，`bg-surface`，头部 `h-14 border-b border-line`；用户消息 `bg-ink text-surface`，助手消息 `bg-surface-2`；输入区 `border-t border-line p-3`。所有文案不变（单测断言 `AI 助手尚未启用`、`已查询 1 次数据`、`AI 服务调用失败：` 等）。

## 8. 移动端通用规则

- 断点：`lg`（1024）以上为桌面布局；`sm`（640）以上表单双列。
- 触控目标 ≥ 40px；表格允许横向滚动，首列不固定。
- KPI 行横向滚动；工具栏筛选收进「筛选」按钮；弹窗在 `< sm` 时全屏（`inset-0 rounded-none`）。
- 页头动作在移动端换到标题下一行。

## 9. 不允许做的事

- 不改任何 API 调用、store、composable、路由、业务分支；不改 `packages/shared`、`apps/server`。
- 不改用户可见文案、`aria-label`、`role`、按钮名（e2e 与单测依赖，见 `e2e/import.spec.ts` 与各 `*.spec.ts`）。
- 不引入新的运行时依赖（图标库、UI 库、字体文件）；不加 Google Fonts。
- 不使用 Tailwind 调色板颜色（`text-red-600`、`bg-blue-50` 等），只用令牌。
- 不用 `!important`；不用内联 style 写颜色。

## 10. 验收清单

- `pnpm --filter @procure-lite/web typecheck && pnpm --filter @procure-lite/web lint && pnpm --filter @procure-lite/web test && pnpm --filter @procure-lite/web build` 全绿。
- 10 个路由 × 浅/深 × 桌面/手机 截图逐张检查：无原生控件穿帮、无卡片套卡片、页标题 22px、表格行高 44px、深色下面板边界可辨。
- 登录 → 工作台 → 台账 → 导入 → 设置 全流程可用；e2e `pnpm --filter @procure-lite/web test:e2e` 通过。

## 11. 组件 API 速查（第一阶段已交付，第二阶段照此使用）

组件都在 `@/components/ui/`，全部 `<script setup lang="ts">`。旧组件的 props / emits / 插槽**完全兼容**，只新增了可选项；下面只写新增的东西和用法约定。

### 11.0 先看这几条（最容易踩的坑）

1. **`primary` 现在是墨色**：`text-primary` / `bg-primary` / `border-primary` 在浅色下是 `#1b1a17`、深色下是近白，不再是蓝色。实心底上的字用 `text-primary-fg`（浅色白、深色墨）。**不要写 `bg-primary text-white`**：深色主题里是白字压近白底（`components/ai/AiPanel.vue` 现有 3 处就是这样，需要改成 `bg-ink text-surface` 或 `text-primary-fg`）。
2. **品牌绿是 `accent`**：`text-accent` / `bg-accent` / `bg-accent-soft` / `border-accent` / `ring-accent/20`。`teal` 是它的兼容别名（`tone="teal"` 就是绿）。信息蓝用新令牌 `blue` / `blue-soft`。
3. **阴影**：`shadow-pop`、`shadow-(--shadow-pop)`（以及 `-xs` / `-card`）两种写法都会随深浅主题切换。面板默认**只有描边、没有阴影**；只有弹窗、下拉、Toast 用 `shadow-pop`。
4. **`.card` 已去掉阴影**，就是「白底 + 发丝线 + 12px 圆角」的面板。
5. **`.num` 不再是等宽字体**，只剩 `tabular-nums`；流水号改用 `font-mono text-[12.5px]`。表格里的 `.num` 自动不折行。
6. **`.text-meta` 自带 faint 色**（12px / 18px），要别的颜色直接叠颜色类。
7. **原生复选框 / 单选框**：去掉 `size-3.5 accent-primary`，改成 `class="checkbox"` / `class="radio"`（尺寸固定 16px，别再叠 `size-*`），或者用 `Checkbox` / `Radio` 组件。
8. **页面骨架**：`<main>` 的内边距、1440 居中、底部给移动端底栏的留白都由 AppShell 负责；页面根元素别再加外边距，别再用 `h-full flex-1 min-h-0` 把表格拉满屏（工作台三列看板例外）。每页第一个元素是 `PageHeader`；**系统设置 / 供应商与比价 / 审计日志三个子页的页头与分区标签由 `SettingsLayout` 统一给出，子页里不要再放 PageHeader**（内容区最宽 960px 也已处理）。
9. **弹窗在手机（< 640px）上默认全屏、无圆角**；只有 `ConfirmDialog` 保持居中小卡片。
10. **动效工具类**：`animate-fade-in`（遮罩）、`animate-pop-in`（下拉 / 弹层）、`animate-sheet-in`（底部抽屉），150～200ms ease-out；系统开启「减少动态效果」时全局自动失效，不用另写。
11. **说明文字不要塞进 label**：`Checkbox` / `Radio` / `Switch` 的补充说明请用 `description` prop——它走 `aria-describedby`，不会并进可访问名称（e2e 用精确名称找复选框，比如「单价记入比价库（下次采购同一品名时自动提示）」）。
12. 桌面端没有顶栏了：「导入 OA 单」「AI 助手」「深色模式」「退出登录」都在侧栏；页面里不要再做这些入口。

### 11.1 Button（新增 `accent` variant、`lg` 尺寸、`iconOnly`）

| prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger' \| 'accent'` | `'secondary'` | `accent`（新）= 绿色实心，**只用于**「确认入账 / 确认发放 / 确认全部内容并导入」这类完成性动作 |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | sm h-8 · md h-9 · **lg h-10（新，登录按钮、整宽主动作）** |
| `iconOnly` | `boolean` | `false` | 新：正方形图标按钮（sm 32 / md 36 / lg 40），**必须**配 `aria-label` |
| `loading` | `boolean` | – | 显示转圈并禁用 |
| `disabled` | `boolean` | – | `opacity-50` |
| `type` | `'button' \| 'submit'` | `'button'` | |

插槽：默认插槽（图标 + 文字，图标 16px、sm 用 14px）。事件：原生 `click` 透传。

```vue
<Button variant="primary"><Icon name="plus" :size="16" />新增</Button>
<Button variant="secondary" size="sm" :loading="exporting" @click="exportXlsx"><Icon name="download" :size="14" />导出</Button>
<Button variant="accent" :loading="saving" @click="confirmAll">确认全部内容并导入</Button>
<Button variant="ghost" icon-only aria-label="刷新" @click="load()"><Icon name="refresh" :size="16" /></Button>
```

需要「长得像按钮的链接」时（router-link / `<a>`）用同一套类：

```ts
import { buttonClass } from '@/components/ui/button';
```
```vue
<router-link to="/ledger" :class="buttonClass({ variant: 'secondary', size: 'sm' })">查看台账</router-link>
<a :href="url" target="_blank" :class="buttonClass({ variant: 'ghost', size: 'sm' })"><Icon name="external" :size="14" />打开原件</a>
```

### 11.2 Input / Textarea / SearchInput / Select / NativeSelect

- **Input**：新增 `size?: 'sm' | 'md'`（`sm` = h-8，表格行内与明细行用；默认 `md` = h-9）。
  - `type="date"` 时组件自动加 `.input-date`：右侧自绘 calendar 图标、点整个框都能打开日期面板，值为空时「年/月/日」显示成占位色。**不用另外做任何事**，也不要再给它写 `px-*`。
  - 根元素仍是 `<label>`：`class`、`aria-label`、`@change` 都落在 label 上（`change` 从 input 冒泡上来），台账 / 发放页现有的 `<Input type="date" class="w-38" aria-label="申请日期起" @change="applyFilters" />` 写法照常有效。
  - 其余 props 不变：`label` / `required`（红色星号）/ `hint`（12px faint）/ `error`（红框 + alert 图标 + 文案）/ `suggestions`（datalist，悬停时显示的是自绘 chevron）。
- **Textarea**：新增 `hint?`、`error?`，与 Input 一致。
- **SearchInput / Select / NativeSelect**：API 不变，已按 §5 换皮。`NativeSelect size="sm"`（h-7）用于表格行内。
- 手机上输入框字号是 16px（iOS 对小于 16px 的输入框聚焦会整页放大），桌面端 14px。

```vue
<Input v-model="line.quantity" size="sm" type="number" placeholder="数量：待确认" />
<Input v-model="form.arrivalDate" label="到货日期" type="date" hint="留空表示未到货" />
<Textarea v-model="form.note" label="备注" placeholder="可空" :error="errors.note" />
```

### 11.3 Checkbox（新）

| prop | 类型 | 说明 |
| --- | --- | --- |
| `modelValue` | `boolean \| unknown[] \| Set<unknown>` | `v-model`。绑数组 / Set 时配合 `value`，与原生 `v-model` 同语义（返回**新**数组 / **新** Set） |
| `value` | `unknown` | 绑数组 / Set 时本项代表的值 |
| `checked` | `boolean` | 受控单向（传了就以它为准，优先于 `modelValue`），配合 `@change` 用 |
| `indeterminate` | `boolean` | 半选（墨底白横） |
| `label` | `string` | 文字；也可以用默认插槽 |
| `description` | `string` | label 下方 12px faint 说明（走 `aria-describedby`，不进可访问名称） |
| `ariaLabel` | `string` | 没有可见文字时（表格行内）必须传 |
| `disabled` / `required` / `name` / `id` | | 透传给 input |

事件：`update:modelValue(value)`；`change(event: Event)`——**原生事件**，`($event.target as HTMLInputElement).checked` 照样能读。
插槽：默认插槽 = label 内容。
渲染：有 `label` / `description` / 默认插槽时根元素是整行可点的 `<label>`（inline-flex，要竖排请外面包 `flex flex-col gap-2`）；否则只渲染一个 `<input type="checkbox" class="checkbox">`。role 始终是原生 checkbox。

```vue
<!-- 布尔 -->
<Checkbox v-model="form.rememberPrice" label="单价记入比价库（下次采购同一品名时自动提示）" />
<!-- 受控 + 原生事件（导入页的页级核对：原来的 reviewed(p.page, $event) 不用改） -->
<Checkbox
  :checked="reviewedPages.some((r) => r.page === p.page)"
  :label="`第 ${p.page} 页${p.reasons.join('、')}：我已核对原件全部相关明细`"
  @change="reviewed(p.page, $event)"
/>
<!-- 绑 Set（台账多选）；表格行内没有可见文字，给 ariaLabel -->
<Checkbox v-model="selected" :value="row.id" :aria-label="`选择 ${row.itemName}`" />
<!-- 半选 -->
<Checkbox :checked="allSelected" :indeterminate="someSelected" :aria-label="`全选 ${g.serialNumber} 的明细`" @change="toggleGroup(g)" />
```

表格里也可以直接用全局类（最省事，保留原来的 `v-model` / `@change` 写法）：
`<input v-model="selected" :value="row.id" type="checkbox" class="checkbox" :aria-label="`选择 ${row.itemName}`" />`

### 11.4 Radio（新）

| prop | 类型 | 说明 |
| --- | --- | --- |
| `modelValue` | `T` | `v-model`：当前选中值 |
| `value` | `T` | 本项的值 |
| `checked` | `boolean` | 受控单向 |
| `name` | `string` | 同组请传同一个 name（方向键切换是原生行为） |
| `label` / `description` / `ariaLabel` / `disabled` / `id` | | 同 Checkbox |

事件：`update:modelValue(value)`、`change(event)`（只在被选中时触发）。插槽：默认插槽 = label。全局类版：`<input type="radio" class="radio">`。

```vue
<div class="flex items-center gap-4">
  <Radio v-model="uploadKind" name="kind" value="INVOICE" label="发票" />
  <Radio v-model="uploadKind" name="kind" value="SIGNOFF" label="签收单" />
</div>
```

### 11.5 Switch（新）

36×20 药丸，关 `line-strong`、开 `accent`。**底下仍是原生 `<input type="checkbox">`，role 还是 checkbox**，把设置页原有的复选框换成它不会改变可访问角色，Playwright 的 `check()` / `uncheck()` 照常可用。

| prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `modelValue` | `boolean` | – | `v-model` |
| `checked` | `boolean` | – | 受控单向 |
| `label` / `description` / `ariaLabel` / `disabled` / `name` / `id` | | | 同 Checkbox |
| `labelPosition` | `'left' \| 'right'` | `'right'` | `left`：文字在左、开关在右（设置行配 `class="w-full justify-between"`） |

事件：`update:modelValue(boolean)`、`change(event)`。插槽：默认插槽 = label。

```vue
<Switch v-model="aiForm.enabled" label="启用 AI 助手" />
<!-- 设置行：文字在左、开关在右；label / description 沿用页面原有文案，不要新写 -->
<Switch v-model="backupForm.enabled" label="（原有文案）" label-position="left" class="w-full justify-between" />
```

### 11.6 Tabs（新，按值切换）

| prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `modelValue` | `string \| number` | – | `v-model`，当前项的 value |
| `tabs` | `{ value, label, count?, icon?, disabled? }[]` | – | `count` 以 faint 小字跟在标签后；`icon` 是 Icon 名 |
| `variant` | `'underline' \| 'segmented'` | `'underline'` | segmented：面板顶部的视图切换（台账 / 回收站、发放单 / 领用统计、库存物品 / 流水、供应商 / 价格记忆）以及分段控件（快捷区间、主题、直发 / 库存发放、手机上的明细 / 原件）；underline：只用于 `RouteTabs` 这类页级分区（设置页三个子页），与 §5 一致 |
| `block` | `boolean` | `false` | 撑满一行、各项等分（手机上的 segmented） |
| `ariaLabel` | `string` | – | 给整组一个名字（`role="group"`） |

事件：`update:modelValue(value)`、`change(value)`——点当前项不会触发。
每项是普通 `<button type="button">`，当前项带 `aria-pressed="true"`；与原来手写的按钮组 role 一致（仍是 button）。类型可从 `@/components/ui/tabs` 引入：`import type { TabItem } from '@/components/ui/tabs'`。

```vue
<!-- 面板顶部视图切换：segmented；切换后要拉数据时用 @change -->
<Tabs
  :model-value="tab"
  variant="segmented"
  :tabs="[{ value: 'active', label: '台账' }, { value: 'recycle', label: '回收站' }]"
  @change="(v) => switchTab(v as 'active' | 'recycle')"
/>
<!-- 分段控件 -->
<Tabs v-model="themeMode" variant="segmented" :tabs="[
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'system', label: '跟随系统', icon: 'settings' },
]" />
<Tabs v-model="mobileTab" variant="segmented" block class="lg:hidden" :tabs="[{ value: 'draft', label: '明细' }, { value: 'original', label: '原件' }]" />
```

segmented 放在面板顶部工具栏时：外层面板 `card overflow-hidden`，工具栏 `px-4 py-3 border-b border-line`，Tabs 与搜索 / 筛选控件同行。underline 自己画整行底部发丝线，外层不要再加 `border-b`。

### 11.7 RouteTabs（新，路由版 underline，SettingsLayout 已在用）

| prop | 类型 | 说明 |
| --- | --- | --- |
| `tabs` | `{ to, label, icon?, count?, exact? }[]` | `exact: true` 时只在完全匹配时高亮（`/settings` 不应在 `/settings/audit` 时高亮） |
| `ariaLabel` | `string` | 渲染为 `<nav aria-label>` |

当前项带 `aria-current="page"`（与 router-link 默认行为一致）。类型：`import type { RouteTabItem } from '@/components/ui/tabs'`。

```vue
<RouteTabs aria-label="设置分区" :tabs="[
  { to: '/settings', label: '系统设置', icon: 'settings', exact: true },
  { to: '/settings/suppliers', label: '供应商与比价', icon: 'supplier' },
]" />
```

### 11.8 PageHeader（新）

| prop / 插槽 | 说明 |
| --- | --- |
| `title: string` | 页标题 `h1`：桌面 22px / 手机 20px，600，ink |
| `description?: string` | 标题下一行 14px muted |
| 默认插槽 | 本页动作按钮，渲染在右侧 `flex items-center gap-2`；手机上自动换到标题下一行、靠左 |
| `#meta` | 标题上方的小字（面包屑 / 小标签，12px faint） |
| `#description` | 替代 `description` 文本（需要高亮数字、带链接时） |

自带 `mb-6`（与下一个区块间距 24px），页面里不要再给它外边距。标题用路由 `meta.title`。

```vue
<PageHeader title="采购台账" :description="`${total} 条记录 · 本页 ${rows.length} 条`">
  <Button variant="secondary" :loading="exporting" @click="exportXlsx"><Icon name="download" :size="16" />导出</Button>
  <Button variant="primary" @click="openCreate"><Icon name="plus" :size="16" />新增</Button>
</PageHeader>
```

### 11.9 FileDropzone（新，导入页用）

| prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `accept` | `string` | – | 同原生 accept；**拖入**的文件也按它过滤 |
| `disabled` | `boolean` | – | |
| `multiple` | `boolean` | `false` | 单选时只交出第一个文件 |
| `label` | `string` | `'点击选择或把文件拖到这里'` | 主文案 14px/500 |
| `hint` | `string` | – | 副文案 12px faint |
| `capture` | `boolean` | `false` | 手机（< lg）额外显示「拍照上传」按钮 |

事件：`files(files: File[])`——点击选择或拖入后触发（组件会清空 input，同一个文件还能再选一次）；`rejected(files: File[])`——拖入了不符合 `accept` 的文件。插槽：默认插槽追加在文案下方。

内部**始终只有一个** `<input type="file">`（`sr-only`，整块是 `<label>`，可点、可键盘聚焦）；「拍照上传」临时给同一个 input 加 `capture="environment"` 再打开，不会多出第二个 file input——e2e 的 `page.locator('input[type=file]').setInputFiles(...)` 照常可用（走 `files` 事件）。

导入页改法：把原来吃 `Event` 的 `upload(event)` 改成吃 `File[]`，逻辑与文案不变：

```vue
<FileDropzone
  accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp"
  :disabled="busy || !!active"
  hint="PDF / PNG / JPG / WEBP · 最大 30MB · 最多 30 页"
  capture
  @files="upload"
/>
```
```ts
async function upload(files: File[]) {
  await persist();
  if (!saved.value && loaded) {
    error.value = '请先保存当前草稿';
    return;
  }
  const file = files[0];
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) {
    error.value = '文件超过 30MB';
    return;
  }
  await uploadFile(file);
}
```

### 11.10 Badge / StatusBadge

- **Badge**：`tone?: 'blue' | 'teal' | 'amber' | 'red' | 'gray'`（默认 gray），新增 **`dot?: boolean`**：文字前画 6px 同色圆点。药丸 h-6、柔底同色字、不描边；`teal` = 绿，`gray` = `bg-primary-soft text-muted`。

  ```vue
  <Badge tone="blue" dot>进行中</Badge>
  <Badge :tone="p.isLow ? 'red' : 'teal'">{{ p.isLow ? '低库存' : '充足' }}</Badge>
  ```
- **StatusBadge**：`status: string`、新增 `dot?: boolean`。状态色在组件内本地映射（不改 `packages/shared`）：待采购 gray、待到货 amber、待分发 blue、已发放 绿、已入库 gray + 对勾。**付款状态也能直接传**：`UNPAID` 未付款 amber、`PAID` 已付款 绿、`REIMBURSED` 已报销 gray。未知值原样显示。

  ```vue
  <StatusBadge :status="row.status" />
  <StatusBadge :status="row.paymentStatus" />
  ```

### 11.11 StatCard / Dialog / ConfirmDialog / 其它

- **StatCard**：API 不变（`label` / `value` / `unit?` / `hint?` / `icon` / `tone?` / `to?`）。已去掉彩色图标方块：`tone` 只体现在标签前的 6px 圆点（gray 不画）；有 `to` 时悬停描边加深、右上角图标换成箭头。卡片自带 `p-4` 与描边，外面只管网格。
- **Dialog**：新增 **`mobileFullscreen?: boolean`（默认 `true`）**——手机上全屏、无圆角，页脚贴底并让开安全区；桌面端 `rounded-[14px]`、最高 88vh、内容区单独滚动。头部无底线（标题 17px/600 + 13px 说明），页脚 `px-6 py-4 border-t border-line bg-surface`、按钮 `gap-2` 靠右；页脚插槽里可以先放一段 `mr-auto` 的小字（如「共 2 笔 · 合计 2006 件」）。`width` / `persistent` / `dirty`（关闭前二次确认）不变。
- **ConfirmDialog**：API 不变；宽 420、取消 = ghost、危险动作 = danger；手机上保持居中小卡片（`mobileFullscreen=false`）。
- **Pagination**：API 不变；放在表格面板底部 `px-4 py-3 border-t border-line` 里。
- **EmptyState**：API 不变；插画 120px、上下 `py-14`；动作按钮请用 `variant="secondary" size="sm"`，放默认插槽。插画 tone：`blue` / `teal` 都画成品牌绿，`gray` = faint + 中性柔底。
- **ErrorState / Skeleton / ToastHost**：API 不变（Toast 已是墨色浮层，调用方式 `toast.success/error/info` 不变）。
- **Icon** 新增：`calendar` `upload-cloud` `menu` `check-circle` `info` `external` `truck` `layers` `arrow-right` `bell` `minus` `eye` `eye-off` `package` `receipt` `wallet` `building` `user` `tag` `more-horizontal` `arrow-up-right` `x-circle` `clipboard` `scan` `dot`。
- **图表**（`@/components/charts/chartTheme`）：系列色依次 accent → blue → amber → red → muted → faint（柱 = accent、折线 = blue）；`axis` 已是无轴线、无刻度、11px muted 标签，并多了 `axis.nameTextStyle`；新增 `ct.textStyle`（放进 `option.textStyle`，字体与页面一致）和 `ct.bar`（`{ barMaxWidth: 28, itemStyle: { borderRadius: [4, 4, 0, 0] } }`，展开进柱状系列）；tooltip 自带 `padding`。

### 11.12 全局类（`src/styles/main.css`）

| 类 | 用在哪 | 说明 |
| --- | --- | --- |
| `.card` | 所有面板 | `bg-surface border border-line rounded-(--radius-card)`，无阴影；表格面板再加 `overflow-hidden` |
| `.table-base` | `<table>` | 表头 h-10 / 12px / 500 / muted / 白底；单元格 `px-4 py-3`、13.5px、行高约 44px；行悬停 `bg-surface-2`；最后一行无底线。数字列在 th / td 上加 `text-right`，选中行加 `bg-accent-soft/40` |
| `.table-sticky` | 与 `.table-base` 同写 | 表头钉住（外层容器需 `max-h-* overflow-auto`）；钉住时底线用内阴影画，不会丢 |
| `.row-action` / `.row-action-danger` | 表格操作列的图标按钮 | `size-8` 淡色、默认 60% 不透明，行悬停 / 聚焦时 100%（触屏常亮）；危险动作叠 `.row-action-danger`，悬停转红底 |
| `.num` | 金额、数量、日期数字 | `tabular-nums`（不再换等宽字体）；在 `.table-base` 里自动不折行 |
| `.text-meta` | 副行、时间戳、辅助说明 | 12px / 18px，默认 faint，可叠颜色类覆盖 |
| `.field-error` | 表单字段错误 | `mt-1.5 flex items-start gap-1 text-xs text-red`，前面放 `<Icon name="alert" :size="12" class="mt-0.5 shrink-0" />` |
| `.checkbox` | `<input type="checkbox">` | 16px 自绘复选框：选中墨底白勾、半选墨底白横（深色自动反转）、焦点绿环、禁用 40%。保留原生 `v-model` / `:indeterminate` / 键盘 |
| `.radio` | `<input type="radio">` | 同上，圆形；选中 = 墨色圆 + 中心点 |
| `.input-date` | `<input type="date">` | 右侧自绘 calendar、原生指示器透明铺满（点哪都能开面板）、`min-w-36`；**不要同时写 `px-*`**（会盖掉右侧留位），用 `pl-3`；加 `data-empty` 属性时空值占位显示为 faint。用 Input 组件则全部自动处理 |
| `.md` | AI 回复的 Markdown 容器 | 链接 `text-accent`；行内代码 `bg-primary-soft`；代码块白底描边 |

表格面板的标准写法（§5 Table / Toolbar：工具栏、表格、分页在**同一个面板**里）：

```vue
<section class="card overflow-hidden">
  <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
    <SearchInput v-model="filters.search" class="w-full sm:w-72" placeholder="搜索流水号 / 品名 / 部门 / 经办人" @search="applyFilters" />
    <Select v-model="filters.status" :options="statusOptions" placeholder="全部状态" clearable class="w-36" @update:model-value="applyFilters" />
    <div class="ml-auto flex items-center gap-2"><!-- 右侧动作 --></div>
  </div>
  <div class="overflow-x-auto">
    <table class="table-base min-w-[1080px]">
      <thead>
        <tr>
          <th class="w-10"><input type="checkbox" class="checkbox" :checked="allChecked" aria-label="全选本页" @change="toggleAll" /></th>
          <th>流水号</th>
          <th>品名</th>
          <th class="text-right">数量</th>
          <th class="w-24">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" :class="selected.has(row.id) ? 'bg-accent-soft/40' : ''">
          <td><input v-model="selected" :value="row.id" type="checkbox" class="checkbox" :aria-label="`选择 ${row.itemName}`" /></td>
          <td class="font-mono text-[12.5px] text-muted whitespace-nowrap">{{ row.serialNumber }}</td>
          <td><p class="text-ink font-medium">{{ row.itemName }}</p><p class="text-meta num">{{ row.requestDate }}</p></td>
          <td class="text-right num">{{ row.quantity }}</td>
          <td>
            <!-- aria-label / title 沿用页面原有的，不要改 -->
            <button class="row-action" aria-label="…"><Icon name="edit" :size="16" /></button>
            <button class="row-action row-action-danger" aria-label="…"><Icon name="trash" :size="16" /></button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="px-4 py-3 border-t border-line">
    <Pagination :page="filters.page" :page-size="pageSize" :total="total" @change="goPage" />
  </div>
</section>
```
