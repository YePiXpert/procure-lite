# Procure Lite 前端设计与维护规范 —「墨与纸」

## 0. 定位与使用方式

- 本文描述**当前**前端的设计语言、组件选用与约束，供之后改 UI 的人对照。2026-09 的视觉重设计已经完成，本文不是待办清单，也不记录施工过程。
- 具体取值以源码为准：颜色、圆角、阴影、字体、动效在 `src/styles/main.css`（`@theme` 与 `.dark`）；组件的 props / 事件 / 插槽在 `src/components/ui/*.vue`、`button.ts`、`tabs.ts`；外壳在 `src/components/layout/AppShell.vue`、`SettingsLayout.vue`；图表配色在 `src/components/charts/chartTheme.ts`。本文只写语义、选择和约束：颜色、阴影、动效的取值不抄（见 `main.css`）；文字层级、外壳尺寸与 `--main-*` 这几项结构尺寸为了便于对照列在 §2 / §3，改代码时要同步更新本文。
- 改 UI 时：先在 §5 找现成组件、§6 找通用写法，按 §3 / §4 核对外壳与手机规则，§8 看目标页面有没有特例，按 §9 验证。组件或令牌的行为变了，在同一次改动里更新本文。

## 1. 设计方向与原则

**「墨与纸」**：温润的纸色画布、墨色文字与主按钮、一种品牌绿做点睛（链接、当前项、焦点、成功）；语义色（琥珀 = 等待、蓝 = 进行中、红 = 危险）只用于状态。层级靠**字号与留白**，不靠卡片描边。

五条原则（冲突时按顺序取舍）：

1. **一页一个标题**：每页以 `PageHeader` 开头（标题 + 一行说明），右侧放本页动作。
2. **一层容器**：内容直接放在面板上，面板之间用留白分隔；不允许卡片套卡片。
3. **表格就是表格**：表头小而淡，行高约 44px，数字右对齐且等宽（tabular），操作按钮平时淡、悬停才显眼。
4. **控件全部自绘**：复选、单选、开关、分段、日期、文件上传都用本规范的组件或全局类，深浅色一致，不露原生外观。
5. **颜色是信息**：只有状态和警示上色；不用彩色图标底、渐变、彩色标题这类装饰色块。

## 2. 令牌与主题

令牌定义在 `main.css` 的 `@theme static`（浅色）与 `@layer base` 里的 `.dark`（深色），具体值见这两处。工具类直接用令牌名：`bg-surface`、`text-muted`、`border-line`、`bg-accent-soft/40` …

| 令牌 | 语义 |
| --- | --- |
| `canvas` | 页面画布（暖纸色），侧栏同色 |
| `surface` / `surface-2` | 面板、表格、弹窗 / 行悬停、次级区域、禁用输入框底 |
| `ink` / `text` | 标题与强调数字 / 正文 |
| `muted` / `faint` | 次要文字 / 辅助信息、占位与图标；`faint` 在白底上的对比度不够正文要求，需要读清的文字用 `muted` 以上 |
| `line` / `line-strong` | 发丝分隔线 / 控件描边 |
| `primary` / `primary-hover` / `primary-fg` | 主按钮底 = 墨色（深色下近白）/ 悬停 / 实心底上的文字（浅色白、深色墨） |
| `primary-soft` | 中性的选中与悬停底（分段控件轨道、导航悬停、gray Badge） |
| `accent` / `accent-hover` / `accent-soft` | 品牌绿：链接、当前导航图标、焦点环、成功与完成性动作 |
| `teal` / `teal-soft` | `accent` 的兼容别名：`tone="teal"` 就是品牌绿 |
| `blue` / `amber` / `red`（及 `-soft`） | 进行中与信息 / 等待与提醒 / 危险、错误、低库存；`-soft` 是同色柔底 |
| `panel` / `panel-soft` | 深色浮层（Toast、批量操作条），两个主题下都保持深色 |
| `--radius-card` / `--radius-control` | 面板与卡片 / 按钮与输入框；药丸用 `rounded-full`，弹窗 `rounded-[14px]` |
| `--shadow-xs` / `--shadow-card` / `--shadow-pop` | 经 `--elevation-*` 间接取值：Tailwind 会把命名阴影的值内联进工具类，直接在 `.dark` 覆盖 `--shadow-*` 无效；面板默认无阴影，只有弹窗、下拉、Toast 用 `shadow-pop` |
| `animate-fade-in` / `animate-pop-in` / `animate-sheet-in` | 遮罩 / 下拉与弹层 / 底部抽屉的进场动效，时长与曲线见 `main.css` |
| `--font-sans` / `--font-mono` | 系统中文字体栈（Segoe UI、PingFang SC、Microsoft YaHei …）/ 流水号与代码 |

文字层级：

| 角色 | 写法 |
| --- | --- |
| 页标题 `h1`（PageHeader） | 桌面 22px、手机 20px / 600 / `tracking-tight` / `text-ink` |
| 页说明 | 14px `text-muted` |
| 区块标题 `h2`（Panel） | 15px / 600 / `text-ink`；区块说明 13px `text-muted` |
| 弹窗标题 | 17px / 600 / `text-ink`；弹窗内分组标题 13px / 600 |
| 正文 | 14px `text-text`，行高 1.5 |
| 表格 | 13.5px；表头 12px / 500 / `text-muted` |
| 表单 label | 13px / 500 / `text-text` |
| 元信息 `.text-meta` | 12px / 18px，默认 `faint`，可叠颜色类 |
| KPI 数值（StatCard） | 26px / 600 / `text-ink` / `tabular-nums` |
| 数字 `.num` | 只加 `tabular-nums`，不换等宽字体；流水号用 `font-mono`（表格里 12.5px） |

深色模式：

- 只改令牌：`html.dark` 下 `.dark` 块覆盖令牌值，工具类自动翻转。页面颜色只用令牌；`dark:` 变体只留给令牌表达不了的少数细节（遮罩加深、分段控件当前项）。
- `html.dark { color-scheme: dark }`，原生日期面板、滚动条、`<select>` 弹层跟着变深。
- 面板靠 1px `line` 描边分层，不靠阴影；`shadow-pop` 与 `shadow-(--shadow-pop)` 两种写法都跟随主题。
- 实心底上的字用 `text-primary-fg`（`bg-primary text-primary-fg`，Button 已处理）；不要写 `bg-primary text-white`，深色下 primary 近白。
- 局部翻转：深色浮层（Toast 图标、台账批量条）在子树上挂 `.dark`，令牌就地换成深色主题的值（别名也在 `.dark` 里重新求值）。
- 主题由 `useThemeStore` 管理，`localStorage` 键 `pl-theme`（`light` / `dark` / `system`）；`index.html` 在首帧前预置 `.dark`，避免闪烁。

## 3. 布局与外壳

外壳全部由 `AppShell.vue` 负责，页面只管 `<main>` 里的内容。

**桌面（≥ `lg`）**

- 左侧 240px 侧栏（`bg-canvas`，右侧发丝线），从上到下：品牌行；整宽主动作「导入 OA 单」（在导入页换成二级按钮「查看台账」，不做自我跳转）；「日常」（工作台 / 采购台账 / 领用发放 / 库存管理）与「管理」（统计报表 / 系统设置）两组导航；底部 AI 助手、深浅色切换、退出登录。当前项白底浮起、图标变绿，精确匹配时 `aria-current="page"`。
- 没有顶栏，页标题只在 PageHeader 里；页面里不要再做导入、AI、主题、退出入口。

**手机（< `lg`）**

- 52px 顶栏只放品牌，右侧是 AI 助手图标按钮和主动作（「导入」，导入页里换成「台账」）。
- 60px 底部标签栏（另加安全区）：工作台 / 台账 / 发放 / 库存 / 更多。「更多」是底部抽屉，放底栏放不下的导航（统计报表、系统设置）以及深浅色切换、退出。
- 路由路径变化时外壳收起「更多」，并把 `<main>` 滚回顶部。

**`<main>` 是唯一的滚动容器**，并声明外壳内边距变量（它自己的 padding 就读这些变量）：

| 变量 | 手机 | 桌面 | 用途 |
| --- | --- | --- | --- |
| `--main-px` | 16px | `max(32px, 居中留白)` | 左右留白；宽屏时把内容居中到 1440px |
| `--main-pt` | 20px | 32px | 顶部留白 |
| `--main-pb` | 96px（另加安全区） | 40px | 底部留白；手机上给底部标签栏让位 |

- 抵消外壳留白只引用变量：通栏 `-mx-(--main-px) px-(--main-px)`、撑到底边 `lg:-mb-(--main-pb)`、贴顶 sticky `-top-(--main-pt)`；不要写死 `-mx-4`、`-top-8` 这类数值。
- 页面根元素不加外边距；表格随内容自然增高，不用 `h-full flex-1 min-h-0` 撑满屏（工作台看板例外，见 §8）。
- `<main>` 带 `relative`：没有定位祖先的 `absolute` / `sr-only` 元素以它为包含块并跟着滚动，不会把文档撑出第二个滚动条。
- 滚动的是 `<main>` 而不是 window，路由的 `scrollBehavior` 不起作用；只改 query 的页内切换不会自动回顶，需要时由页面自己滚动 `<main>`（导入页切换任务就是这样）。
- 内容宽度：正文最宽 1440px（由 `--main-px` 实现）；设置类三个子页由 `SettingsLayout` 限制在 960px。
- **PageHeader 每页一个**：系统设置 / 供应商与比价 / 审计日志三个子页的页头与分区标签由 `SettingsLayout` 统一给出，子页里不再放 PageHeader。
- **StickyActionBar** 钉在 `<main>` 底边：桌面贴视口底边，手机贴在底部标签栏之上；内容不满一屏时跟在内容后面。
- **钉表头**：`.table-sticky` 默认相对 `<main>` 钉住（桌面贴视口顶边、手机贴顶栏下沿）；表格放在自己的 `overflow-auto` 纵向滚动容器里时钉在容器顶边。表格和 `<main>` 之间只要夹着别的滚动容器（`overflow-x-auto` 外层、`overflow-hidden` 面板），表头就钉不住——横向滚动与钉表头不能兼得，这是 CSS 的限制。需要钉时让外层在放得下时 `overflow-visible`（台账用容器查询 `@min-[1080px]:overflow-visible`），面板用 `Panel`（`overflow-clip` 不是滚动容器）。

## 4. 响应式与手机规则

- 断点：`lg`（1024px）以上是桌面外壳；`sm`（640px）以上表单双列、表格按表格排；`< 640px` 表格改为卡片（`.table-cards`）。
- 触控目标 ≥ 40px：`.row-action` 在触屏（`hover: none`）下放大到 40px 并常亮；底栏每项 60px 高；FileDropzone 的「拍照上传」是整宽 `lg` 按钮。
- `.table-cards`：`<table class="table-base table-cards">`，每个 `td` 写 `data-label="列名"`（用列头原文）。
  - 没有 `data-label` 或为空串的格整行显示（品名这类主字段）；主字段不在第一列时给它加 `card-title` 排到卡片首行；操作格加 `card-actions`，成为卡片底部的操作行。
  - `td` 上桌面专用的工具类（`pl-5`、`py-*`、`w-full max-w-0`、`whitespace-nowrap` …）一律加 `sm:` 前缀，否则会压过卡片规则；卡片里要显示的列不要用 `hidden sm:table-cell`。
  - 不要用 `before:` 变体改列名样式（Tailwind 会注入空的 `content`，列名消失）；列名固定 `font-normal`，单元格的字重写在内部 `<span>` 上。
  - 卡片模式下表头只留给读屏，表头里的控件（全选框）在手机上要另给入口。

```vue
<table class="table-base table-cards min-w-[700px]">
  <thead><tr><th>物品</th><th>分类</th><th class="text-right">当前库存</th><th class="text-right">操作</th></tr></thead>
  <tbody>
    <tr v-for="p in products" :key="p.id">
      <td><span class="font-medium text-ink">{{ p.name }}</span></td>
      <td data-label="分类"><Badge>{{ p.category }}</Badge></td>
      <td data-label="当前库存" class="text-right num"><span class="font-semibold">{{ p.stockQty }}</span></td>
      <td class="card-actions">
        <button type="button" class="row-action" title="编辑" @click="edit(p)"><Icon name="edit" :size="16" /></button>
      </td>
    </tr>
  </tbody>
</table>
```

- KPI 行在手机上通栏横向滑动（`snap-x`），桌面是网格。
- 弹窗在 `< sm` 默认全屏、无圆角，页脚让开安全区；只有 `ConfirmDialog` 保持居中小卡片。
- 输入框在手机上用 16px 字（`text-base sm:text-sm`），避免 iOS 聚焦时整页放大；自己写的输入控件照此处理。
- PageHeader 与 Panel 头部的动作在窄屏换到标题下一行、靠左。
- 导入页在 `< lg` 用分段 Tabs 在「明细 / 原件」之间切换；台账在 `< 640px` 渲染单独的卡片列表（与表格二选一渲染，同一批 `aria-label` 不会同时出现两份）。
- 底部有三样固定 / 粘性的东西：底部标签栏、StickyActionBar（已按标签栏高度偏移）、Toast（手机上居中叠在标签栏之上，最多 4 条，数秒后消失）；页面不要再加新的底部固定元素。

## 5. 组件选用与速查

组件都在 `@/components/ui/`。下面是选用原则和关键 API，完整签名以源码为准。

### 5.1 Button 与 buttonClass

- `variant`：`primary`（墨色主动作，一个区域通常只放一个）、`secondary`（默认）、`ghost`（低强调、工具按钮）、`danger`（危险确认）、`danger-ghost`（低强调的危险动作，如「清空回收站」）、`accent`（品牌绿，**只**用于「确认入账 / 确认发放 / 确认全部内容并导入」这类完成性动作）。
- `size`：`sm`（h-8）、`md`（h-9，默认）、`lg`（h-10，登录与整宽主动作）。`iconOnly`：正方形图标按钮，必须配 `aria-label`。
- `pressed`：开关按钮（「只看低库存」「筛选」）。传了才渲染 `aria-pressed`，`true` 时换成中性选中底。按钮已经带 `aria-expanded`（展开器）时只借样式、不加 `aria-pressed`——一个按钮不该既是开关又是展开器。
- `loading`（转圈并禁用）、`disabled`、`type`（默认 `button`）。
- 长得像按钮的链接（`router-link` / `<a>`）用同一套类：`buttonClass({ variant, size, iconOnly, pressed })`，从 `@/components/ui/button` 引入。

```vue
<Button variant="accent" :loading="busy" @click="confirm">确认全部内容并导入</Button>
<Button variant="ghost" icon-only aria-label="刷新" @click="load()"><Icon name="refresh" :size="16" /></Button>
<Button :pressed="!!state.low" @click="toggleLow"><Icon name="alert" :size="16" />只看低库存</Button>
<router-link to="/ledger" :class="buttonClass({ variant: 'secondary', size: 'sm' })">查看台账</router-link>
```

### 5.2 Input / Textarea / SearchInput / Select / NativeSelect

- `Input`：`label`、`required`（红星）、`hint`、`error`（红框 + 字段下方原因）、`suggestions`（datalist）、`size`（`sm` = h-8，表格行内与明细行；`md` = h-9）、`hideLabel`（label 只留给读屏，列头已说明字段时用）；事件 `update:modelValue`、`blur`、`enter`。根元素是 `<label>`，外部传的 `class`、`aria-label`、`@change` 落在 label 上。`type="date"` 自动套 `.input-date`（右侧日历图标、点整个框打开、空值占位变淡），不要再给它写 `px-*`。
- `Textarea`：`label` / `hint` / `error` 与 Input 一致，`rows` 默认 3。
- `SearchInput`：停止输入 `delay`（默认 350ms）后发 `search`；`delay` 为 0 时只在回车时搜；Esc 清空。
- `Select`（reka 弹层）：表单里的单个选择；`options: { label, value }[]`、`clearable`、`error`、`size`（`sm` 与 `Input size="sm"` 同高）。`value` 为空串的选项会当成占位文字（reka 不接受空串值），清空走 `clearable`。
- `NativeSelect`：表格行内、批量条这类高密度位置（不挂 portal，手机上是原生滚轮）；`size="sm"` 用于表格行内；`placeholder` 渲染为空值选项。

```vue
<Input v-model="l.quantity" size="sm" type="number" label="数量" hide-label placeholder="数量：待确认" />
<Select v-model="supplierId" label="统一指定供应商（可空）" :options="supplierOptions" clearable />
```

### 5.3 Checkbox / Radio / Switch

- 都是原生 `<input>`（`appearance: none` 自绘），role、键盘、label 关联都是原生的；Switch 底下也是 checkbox，role 仍是 checkbox，Playwright 的 `check()` / `uncheck()` 照常可用。
- `description` 走 `aria-describedby`，不进可访问名称；补充说明不要塞进 `label`（e2e 按精确名称找复选框）。
- Checkbox：`v-model` 绑布尔，或配合 `value` 绑数组 / Set（返回新数组 / 新 Set）；也可以 `:checked` + `@change`（原生事件）受控；`indeterminate`；`size="sm"`（14px）。有 label / description / 插槽时整行是 `<label>`，否则只渲染 input，此时必须给 `ariaLabel`。
- Radio：同组传同一个 `name`；`change` 只在被选中时触发；`size="sm"`。
- Switch：`labelPosition="left"`（设置行文字在左、开关在右，配 `class="w-full justify-between"`）；没有 `size`。
- 表格行内可以直接用全局类 `<input type="checkbox" class="checkbox">` / `class="radio"`（14px 加 `checkbox-sm` / `radio-sm`），尺寸固定，不要叠 `size-*` / `accent-*`。

```vue
<Checkbox v-model="form.rememberPrice" label="单价记入比价库（下次采购同一品名时自动提示）" />
<Checkbox v-model="selected" :value="row.id" :aria-label="`选择 ${row.itemName}`" />
```

### 5.4 Tabs / RouteTabs

- `Tabs`（按值切换）：`tabs: TabItem[]`（`value`、`label`、`count?`、`icon?`、`disabled?`）；`variant`：`segmented` 用于面板顶部的视图切换和分段控件，`underline` 只配合页级分区；`block`（撑满一行、各项等宽）；`ariaLabel`（整组 `role="group"`）。每项是普通 `<button>`，当前项 `aria-pressed="true"`；事件 `update:modelValue`、`change`（点当前项不触发）。
- `RouteTabs`（路由版 underline，`SettingsLayout` 在用）：`tabs: RouteTabItem[]`（`to`、`label`、`icon?`、`count?`、`exact?`），渲染为 `<nav aria-label>`，当前项 `aria-current="page"`。
- 按 query 区分的列表行（如 `/import?task=…`）不要直接用 `<router-link>`：它判断「当前」时不看 query，会给每一行都加 `aria-current="page"`。用 `custom` 插槽自己渲染 `<a>`，「当前」由页面标注。

```vue
<Tabs :model-value="tab" variant="segmented" :tabs="[{ value: 'active', label: '台账' }, { value: 'recycle', label: '回收站' }]" @change="switchTab" />
<Tabs v-model="mobileTab" variant="segmented" block class="lg:hidden" :tabs="[{ value: 'draft', label: '明细' }, { value: 'original', label: '原件' }]" />
```

### 5.5 PageHeader / Panel / StickyActionBar

- `PageHeader`：`title`、`description?`；默认插槽 = 本页动作（右侧，窄屏换行靠左）；`#meta` 放标题上方的小字，`#description` 替代说明文本（需要链接或高亮数字时）。自带 `mb-6`，页面不再给它外边距。
- `Panel`：一层面板（`.card` + `overflow-clip`：按圆角裁掉贴边内容，但不是滚动容器）；`title?`（h2）、`description?`、`flush`（body 无内边距，表格与列表贴边）、`bodyClass`（整体替换 body 的类，默认 `p-5`）；插槽 `#actions`（头部右侧，放 ghost 按钮时加 `-mr-2`）、默认、`#footer`（分页、计数）。新写的面板优先用它。
- `StickyActionBar`：页面底部的保存 / 确认条；默认插槽放按钮（靠右，手机整宽加 `max-sm:flex-1`），`#start` 放提示与错误（`role="alert"` 由调用方给；什么都没渲染时整块隐藏）。

```vue
<PageHeader title="采购台账" :description="`${total} 条记录`">
  <Button variant="primary" @click="openCreate"><Icon name="plus" :size="16" />新增</Button>
</PageHeader>
<Panel title="备份管理" description="恢复会覆盖当前数据库与附件，操作前请先创建备份" flush>
  <template #actions><Button variant="secondary" size="sm" @click="createBackup">…</Button></template>
  <div class="max-h-96 overflow-auto"><table class="table-base table-sticky">…</table></div>
</Panel>
```

### 5.6 FileDropzone

- 点击或拖入上传。内部始终只有一个 `<input type="file">`（`sr-only`，整块是可键盘聚焦的 `<label>`），e2e 直接对它 `setInputFiles`。
- props：`accept`（拖入的文件也按它过滤）、`multiple`（默认只交出第一个文件）、`label`、`hint`、`disabled`、`capture`（手机上多一个「拍照上传」，临时给同一个 input 加 `capture`）；默认插槽追加在文案下方。
- 事件：`files(File[])`（交出后清空 input，同一文件可以再选）；`rejected(File[])`——组件已经弹了错误 Toast，调用方不要再弹。组件用到 toast store，单测挂载需要活动的 pinia（见 `FileDropzone.spec.ts`）。

### 5.7 Badge / StatusBadge / StatCard / Pagination

- `Badge`：`tone`（`blue` / `teal` / `amber` / `red` / `gray`，默认 gray）、`dot`（文字前 6px 圆点）；柔底同色字、不描边。根元素带 `.badge`，表格里 `td:has(.badge)` 自动收紧上下留白，行高保持 44px。
- `StatusBadge`：传台账状态或付款状态码，组件内映射颜色：待采购 gray、待到货 amber、待分发 blue、已发放 绿、已入库 gray + 对勾；未付款 amber、已付款 绿、已报销 gray；未知值原样显示。
- `StatCard`：KPI 瓦片；`label`、`value`、`unit?`、`hint?`、`icon`（必填）、`tone?`（只画标签前的圆点，gray 不画）、`to?`（可点：悬停描边加深、图标换成箭头）。
- `Pagination`：`page`、`pageSize`（默认 20）、`total`；事件 `change(page)`；放在表格面板底部。

### 5.8 Dialog / ConfirmDialog

- `Dialog`：`open`（`update:open`）、`title`、`description?`、`width`（默认 560px）、`dirty`（有未保存改动时关闭前二次确认）、`persistent`（只能用明确的按钮关闭，如恢复码）、`mobileFullscreen`（默认 `true`）；默认插槽 + `#footer`（按钮靠右，可先放一段 `mr-auto` 小字）。遮罩在 pointerdown 时关闭，从面板拖选文字到遮罩不会误关；Esc 先取消内层的放弃确认。
- `ConfirmDialog`：一句话确认；`message`、`confirmText`、`danger`、`loading`；事件 `confirm`、`update:open`；宽 420，手机上不全屏。

### 5.9 EmptyState / ErrorState / Skeleton / Toast

- `EmptyState`：`title`、`description?`、`illustration?`（`box`、`ledger`、`scan`、`chart`、`truck`、`search`、`empty`）或 `icon`；动作按钮放默认插槽，用 `variant="secondary" size="sm"`。
- `ErrorState`：`title`（默认「加载失败」）、`message`、`retrying`；事件 `retry`（按钮「重新加载」）。
- `Skeleton`：用尺寸类拼出占位形状（`<Skeleton class="h-4 w-40" />`），代替「加载中…」文字。
- Toast：`useToastStore()` 的 `success(msg, action?)`、`error(msg)`、`info(msg)`；墨色浮层，桌面右下、手机居中在标签栏之上，最多同时 4 条；错误是 `role="alert"`，其余 `role="status"`；带动作（如「撤销」）的成功提示停留更久。

### 5.10 Icon

- `<Icon name="…" :size="16" />`：内联线性图标（24 视窗、2px 描边），`aria-hidden`；未知名字回退为 `box`。不要引入图标库，缺图标就在 `Icon.vue` 里补 path。
- 现有名字：`dashboard` `ledger` `kanban` `import` `distribution` `inventory` `report` `supplier` `audit` `settings` `plus` `search` `download` `upload` `trash` `restore` `edit` `close` `chevron-left` `chevron-right` `chevron-down` `check` `alert` `box` `logout` `history` `camera` `file` `key` `clock` `users` `refresh` `copy` `undo` `sort` `sort-asc` `sort-desc` `paperclip` `image` `filter` `sparkles` `send` `sun` `moon` `calendar` `upload-cloud` `menu` `check-circle` `info` `external` `truck` `layers` `arrow-right` `bell` `minus` `eye` `eye-off` `package` `receipt` `wallet` `building` `user` `tag` `more-horizontal` `arrow-up-right` `x-circle` `clipboard` `scan` `dot`。

### 5.11 图表主题

ECharts 画在 canvas 上读不到 CSS 变量：用 `useChartTheme()`（主题切换时重新取色的 computed）或 `getChartTheme()`。字段：`colors`（accent → blue → amber → red → muted → faint）、`axis`（无轴线、无刻度、11px muted，含 `nameTextStyle`）、`splitLine`、`surface`、`muted`、`textStyle`（放进 `option.textStyle`）、`bar`（最大宽 28、顶部圆角，展开进柱状系列）、`tooltip`（surface 底 + line 边 + `shadow-pop`，限制在容器内）、`axisPointer`（类目轴阴影带，放进 `tooltip.axisPointer`，`z: 1` 垫在系列下面）、`legend`（居中 12px，`top` / `bottom` 与 `selectedMode` 由调用方补）。

```ts
tooltip: { ...ct.tooltip, trigger: 'axis', axisPointer: ct.axisPointer },
legend: { ...ct.legend, top: 0, selectedMode: false },
series: [{ type: 'bar', ...ct.bar, data }],
```

## 6. 通用规则

**表单**

- 字段用 Input / Select / Textarea 自带的 `label`；必填用 `required`；补充说明用 `hint`；校验错误用 `error` 显示在字段下方（`.field-error` + alert 图标），不要只靠 Toast。
- 前后端共用 `packages/shared` 的 zod 契约，校验信息用中文（如数字的「必须大于 0」「不能为负数」）；新增校验延续中文文案。
- 弹窗表单字段用 `grid gap-4 sm:grid-cols-2`，分组之间 `border-t border-line pt-4` 加 13px / 600 的分组标题；明细行（下单登记、发放登记）是 `bg-surface-2` 小块，行内控件统一 `size="sm"`。

**表格与列表**

- `<table class="table-base">`：数字列在 th / td 上加 `text-right` 并用 `.num`（表格里自动不折行）；主字段 `text-ink font-medium`，副行 `.text-meta`；选中行 `bg-accent-soft/40`。
- 操作列用 `.row-action` 图标按钮（危险动作叠 `.row-action-danger`），平时淡、行悬停或聚焦时显出、触屏常亮 40px，必须有 `aria-label` 或 `title`。`td:has(.row-action)`、`td:has(.badge)` 已自动调好上下留白，操作列、状态列不要手写 `py-*`。
- 工具栏、表格、分页放在**同一个面板**里：顶部工具栏 `flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line`（分段 Tabs、搜索、筛选同行，右侧动作 `ml-auto`），表格贴边，底部 Pagination；不再单独做筛选卡片。筛选项多时收进「筛选」展开按钮（`pressed` 样式 + `aria-expanded`）。
- 多选时工具栏位置换成墨色批量条（`bg-panel text-white`，内部挂 `.dark` 让下拉和按钮用深色配色），不要另加一行。

```vue
<section class="card overflow-hidden">
  <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
    <Tabs :model-value="tab" variant="segmented" :tabs="tabs" @change="switchTab" />
    <SearchInput v-model="filters.search" class="w-full sm:w-72" placeholder="搜索物品名" @search="load" />
    <div class="ml-auto flex items-center gap-2"><!-- 统计文字、右侧动作 --></div>
  </div>
  <div class="overflow-x-auto"><table class="table-base table-cards">…</table></div>
  <div class="px-4 py-3 border-t border-line">
    <Pagination :page="filters.page" :page-size="pageSize" :total="total" @change="goPage" />
  </div>
</section>
```

- 非表格的列表（发放单、导入任务）用 `<ul class="divide-y divide-line">` 的行；行内动作是按钮或按钮样式的链接，窄屏时行内容换行、不横向溢出。

**面板与卡片**

- 一层容器：面板里不再套带描边的卡片；分组用留白、发丝线或 `bg-surface-2` 区块。
- `.card`（白底、发丝线、圆角，无阴影）是最基本的面板；带标题或页脚的面板用 `Panel`。要钉表头的表格面板不要加 `overflow-hidden`（§3）。

**弹窗**

- 页脚按钮靠右：取消 = ghost，主动作 = primary 或 accent，危险 = danger；表单弹窗有未保存内容时传 `dirty`。
- 详情类信息用键值网格（手机两列、桌面三列），附件与历史等分区用 `border-t border-line pt-4` 隔开。

**加载、空与错误**

- 首次加载用 Skeleton 拼出形状；刷新时保留旧内容，不闪空。
- 空数据用 EmptyState（有筛选时说明「没有符合条件的…」并给出清除筛选的动作）；请求失败用 ErrorState，或在局部给一行错误加重试。
- 异步列表用 `createRequestGuard()`（`@/utils/request`）丢弃过期响应；页面内切换对象（如导入任务）时，异步回调写状态前先核对对象是否仍是当前的。

**Toast**

- 用于操作结果与后台事件；字段校验错误写在字段旁边。可以带一个动作（如「撤销」）。

## 7. 可访问性与操作

- 焦点：全局 `:focus-visible` 是 2px 品牌绿外框，输入类控件用 `ring`；不要去掉焦点样式。
- 原生语义优先：复选、单选、开关都是原生 input；Tabs 项是 `<button>`（当前项 `aria-pressed`）；RouteTabs 是 `<nav>` 里的链接（`aria-current="page"`）。
- `aria-pressed` 只给开关按钮；展开器用 `aria-expanded`，两者不同时出现。
- 补充说明走 `description`（`aria-describedby`），不进可访问名称。
- 纯图标按钮必须有 `aria-label`（`.row-action` 可以用 `title`）；`Icon` 本身 `aria-hidden`。
- 键盘顺序跟随阅读顺序：导入页的 StickyActionBar 放在草稿之后、历史与上传区之前，Tab 顺序是「明细 → 保存 / 确认」。
- 触屏没有悬停：行内操作在触屏上常亮，不要让可操作的控件只在 `:hover` 时出现。
- 提示与错误区用 `role="alert"`；同一时刻不要出现多个意思重复的 alert（e2e 用 `getByRole('alert')` 定位）。
- `prefers-reduced-motion`：全局把过渡与动画缩到近 0（写在所有 `@layer` 之外，不需要 `!important`），页面不必另写。
- `forced-colors`（高对比度模式）：自绘复选框与单选框退回系统外观。
- 文案、`aria-label`、`role` 和按钮名是测试接口：`e2e/import.spec.ts`、`src/**/*.spec.ts` 与服务端测试都依赖它们，改之前先搜测试。

## 8. 页面特例

- **登录**：单个居中面板；保留 `input[type=password]` 与按钮文字「登 录」（e2e 用 `/^登\s*录$/` 匹配）。
- **工作台 `/workbench`**：KPI 行 + 待采购 / 待到货 / 待分发三列看板；桌面端看板撑满剩余视口、列内滚动（`lg:-mb-(--main-pb)` 吃掉底部留白，留白挪进列内），手机上三列上下排。单据卡片是 `article`，e2e 用它和按钮名定位。
- **采购台账 `/ledger`**：≥ 640px 是表格（放得下时钉表头，放不下时横向滚动、表头不钉）；< 640px 是单独渲染的卡片列表；多选时工具栏换成墨色批量条，手机上它钉在顶栏下沿。
- **导入 `/import`**：
  - 从上到下：步骤条（上传原件 → 本地识别 → GPT 复核 → 核对入账）、状态条（文件名、「本地：…」「GPT：…」、「草稿已保存」、停止 / 重试）、页级核对复选框；桌面双栏（原件预览 : 草稿 = 5 : 7，`lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`），手机用「明细 / 原件」分段切换。
  - StickyActionBar：「保存草稿」「确认全部内容并导入」（accent），保存失败与其它错误放在 `#start`；其后是修改历史与 GPT 用量、上传区（有任务时在页尾，方便导入下一份），页面最后是「未完成的导入」面板。
  - 「未完成的导入」：只按 `confirmedAt` 区分，分段 Tabs「未完成 / 已入账」；每行文件名、上传时间和状态（本地识别中 / GPT 复核中 / 本地识别失败，待人工核对 / 待人工核对 / 待核对入账 / 已入账，原件不在时追加「· 原件缺失」；未确认的任务不叫「已完成」），右侧「继续处理」或「查看」；当前任务行 `aria-current="true"` 并带「当前」Badge；底部「显示更多（共 N 条）」追加下一页。
  - 当前任务只由地址里的 `task` 决定：切换前先保存草稿（保存失败就拦下并说明原因），切换时清空上一个任务的状态、丢弃迟到的响应，并把 `<main>` 滚回顶部。已确认的任务只读。
  - 重复上传相同内容的原件时显示琥珀提示条：「打开已有任务」「这是新的业务，继续处理」「取消本次上传」。
  - 地址里的任务不存在时显示 `role="alert"` 的说明卡片，不轮询、不自动新建任务。
- **系统设置 `/settings`**：`SettingsLayout` 给出页头与分区标签（系统设置 / 供应商与比价 / 审计日志），内容最宽 960px；每个区块一个 `Panel`（外观、账号安全、系统状态、AI 助手、自动备份、备份管理）。AI 区的文案被 e2e 依赖（「服务已配置 · 修改连接」「服务器已配置 Key，无需填写」「接口地址」「API Key」「模型」「获取模型列表」）。
- **统计报表 `/reports`**：两个 `Panel`（金额图表、领用排行），图表用 §5.11 的主题与预设；领用排行在手机上是卡片表格。
- **领用发放、库存、供应商、审计**：都是「工具栏 + 表格或行列表 + 分页」的一层面板，表格用 `.table-cards`；发放单是可展开的行列表。库存页统计只显示物品种数与低库存项数——各物品单位不同，库存数量不相加。

## 9. 修改守则与验证

不做的事：

- 颜色只用令牌（`text-muted`、`bg-surface`、`border-line`、`text-accent` …）；不用 Tailwind 调色板颜色（`text-red-600`、`bg-blue-50` …），不写内联颜色，不用 `!important`。
- 不引入新的运行时依赖（UI 库、图标库、字体文件、Google Fonts）；缺的图标在 `Icon.vue` 里补。
- 视觉改动不顺带改业务逻辑、API 调用、store 和路由；不改用户可见文案、`aria-*`、`role`、按钮名，确需改动时同步修改测试并在提交说明里写清。
- 先用 §5 的组件和 §6 的全局类，不新建与现有组件重复的基元；确需新增时写进本文。
- 不在页面里重复外壳的职责（导入 / AI / 主题 / 退出入口、`<main>` 的留白、给底栏让位）。

验证：

```bash
pnpm --filter @procure-lite/shared build     # 改了 packages/shared 时先构建
pnpm --filter @procure-lite/web typecheck
pnpm --filter @procure-lite/web lint
pnpm --filter @procure-lite/web test
pnpm --filter @procure-lite/web build
pnpm --filter @procure-lite/server build     # e2e 前先构建 API（原因见 README「测试」）
pnpm --filter @procure-lite/web test:e2e
```

截图检查（浅 / 深色 × 1440 / 390 宽）：

- 没有原生控件外观穿帮（复选、日期、文件框、下拉），没有卡片套卡片，深色下面板边界可辨、实心按钮文字可读；
- 390px 下没有横向滚动，表格按 §4 变成卡片；
- 底部标签栏、StickyActionBar、Toast 不挡住可操作的控件，滚到页尾能点到最后一个按钮；
- 无头浏览器截图只是模拟，安全区、软键盘、iOS Safari 等仍需真机确认。
