# report-design-ref

报表类单页应用的设计参考库：视觉层、交互层、图表层。产物是**单个离线 HTML 文件**，零外链。

演示页：https://chuckieding.github.io/report-design-ref/

## 起步

`build.py` 的 `'starter'` 永远指向**它自身所在仓库**里的 `starter/index.html` 和 `starter/app.js`——跟当前工作目录无关，也不会去找 `../my-report/` 之类的外部路径。只复制 `starter/` 单独这一个目录出去是构建不了的（没有 `build.py` 和 `src/`），而在原仓库里直接跑 `build.py starter` 又只会用到仓库自带的 `starter/`，不会读到你复制出去改过的文件——两种误用都不会报错，产出一个看似正常、实际内容不对的 `starter.html`。

正确做法是**整仓复制或 clone**（`build.py`、`src/` 必须一起带走），再在新仓库里改 `starter/`：

```bash
git clone <本仓库地址> my-report   # 或 cp -r report-design-ref/ my-report/
cd my-report
# 改 my-report/starter/app.js 的 innerHTML 与图表配置
python3 build.py starter           # 产出 my-report/starter.html
```

新项目里用不到 `demo/`、`tests/` 的话可以自行删除。样式全部来自 `src/`，不要在项目里另写 token、不要在项目代码里写颜色字面量。

## 构建

```bash
python3 build.py demo      # → demo.html
python3 build.py starter   # → starter.html
```

`build.py` 把 `src/` 的分片（tokens / components / vendor / interactions / charts / sankey / waterfall / boxplot / charts-svg / gantt；`sankey.js`、`waterfall.js`、`boxplot.js` 拼在 `charts.js` 同一个占位符后面，`gantt.js` 拼在 `charts-svg.js` 后面）与页面自己的脚本内联进模板，并强制两条守卫：**零外链**（`guard()`，`<a>` 除外）、**无客户标识**。违反即构建失败并抛异常，不会静默产出坏文件。

`src/vendor/` 下现在是两个文件内联进同一个 `<script>` 标签：`chart.umd.js`（Chart.js 4.4.0 本体）在前，`chartjs-chart-sankey.umd.js`（桑基图插件）在后——顺序不能换，插件的 UMD 工厂函数在非 AMD/CommonJS 环境下读的是全局 `Chart`，Chart.js 必须先执行完才有这个全局可读。两个 vendor 文件都内联之后，产物体积比只有 Chart.js 时大了约 26 KB（`demo.html`/`index.html` 从约 437 KB 增至约 462 KB；`starter.html` 从约 306 KB 增至约 316 KB）——桑基插件本身压缩后约 10.6 KB，其余差值是新增的演示卡片内容和 `?selftest=1` 下的断言代码（只在带这个参数访问时才会被执行，但源码仍会内联进产物）。



### 去标识化词表：本地补充

`build.py` 里的 `DEFAULT_DENYLIST` 是一份**通用占位词**（`ACME`、`ExampleCorp` 之类），不对应任何真实机构或客户——**使用者请替换成自己项目实际要拦截的禁用词**。

纯换成占位词会让本地防护形同虚设，所以 `guard()` 还支持从仓库根目录的 `.denylist.local` 追加读取：

- 每行一个词；支持 `#` 开头的注释行和空行。
- 该文件已加入 `.gitignore`，不会被提交——真实的客户名/内部代号可以放心写在里面。
- 文件不存在时静默跳过（这是默认/正常情况），不会警告或报错。
- 仓库自带 `.denylist.local.example` 作为可提交的示例，复制成 `.denylist.local` 后按需编辑即可生效。

## API

| 调用 | 作用 |
|---|---|
| `DS.theme.init()` | 读存储并应用主题，页面加载时调一次 |
| `DS.theme.toggle()` | 深浅切换，自动持久化到 `localStorage` |
| `DS.theme.get()` | 读取当前主题（`'light'` / `'dark'`） |
| `DS.theme.set(mode)` | 程序化指定主题（如按系统偏好、URL 参数设定），自动持久化 |
| `DS.tabs.init(sel)` | 标签页切换；`sel` 是标签容器的选择器，面板按各 tab 的 `data-panel` 属性查找 |
| `DS.sidebar.init(root, {onChange, value, storageKey, collapsed, autoCollapseBelow})` | **侧边栏导航**（左侧菜单 + 右侧面板，中等宽度自动收成图标栏，窄屏变顶部横排）。`root` 是 `.ds-sidebar` 元素或选择器；菜单项是 `<button class="ds-side-item" data-panel="面板id">`（图标 `.ds-side-icon` + 文字 `.ds-side-label`），面板按 `data-panel` 找、不选中的自动 `hidden`。返回 `{select(id), showAll(), current(), collapse(bool), toggle(), isCollapsed(), isAuto(), autoCollapseBelow(), destroy()}`；重复 `init` 同一元素返回同一控制器。折叠状态存 `localStorage`（`storageKey`，默认 `ds-sidebar-collapsed`），存储不可用时静默降级。`autoCollapseBelow`（默认 `1100`，传 `0` 关闭）：视口宽 761 ~ 该值-1 时自动收成图标栏，不改写存储里的偏好；`isAuto()` = 此刻是否处在自动收起区间。见下方「侧边栏」 |
| `DS.charts.resizeIn(root?)` | 对 `root`（元素/选择器，省略 = 整个文档）内**此刻可见**的存活图表各调一次 `resize()`，返回被重算的数量；隐藏面板里 0x0 的图表在面板变可见后用它按真实尺寸重算。只 resize，不建实例、不挂监听器，可重复调用。`DS.sidebar` 切换面板时自动调用 |
| `DS.svg.redrawIn(root?)` | 同上，针对手写图（甘特/热力）：按宿主当前宽度重画 `root` 内可见的 `DS.svg.*` 图，返回重画数量 |
| `DS.tables.sortable(sel)` | 表头点击排序（默认首次点击升序；`<th data-sort-first="desc">` 的列首次点击降序，之后来回切换），数字列按数值（含千分位逗号、`%`、`h`/`min`/`s` 时长单位、`hh:mm` 式时长，见下方「数字列排序支持的格式」）；同时会把数字列的表头对齐成右对齐，见下方「数字列的表头对齐」 |
| `DS.charts.init({wheel, maxLabel})` | 图表全局配置。`wheel` 默认 `'ctrl-zoom'`（见下方滚轮缩放表）；`maxLabel` 是类目标签截断阈值（字符数），默认 `10`，Chart.js 刻度截断与 `DS.svg.heatmap` 的行列标签共用这一个配置（`DS.svg.gantt` 的行标签按自己的 120px 列宽截断，悬停 `title` 显示全称） |
| `DS.charts.create(canvas, config)` | 建图；数据为空时渲染空态并返回 `null`。`canvas` 必须包在 `.ds-chart-host` 容器里，见下方「图表宿主要求」。库自有的 config 扩展（Chart.js 会忽略）：`config.dsTable`（数据表，见 `attachTable`）、`options.dsZoom`（`'xy'` 给无类目的笛卡尔图打开矩形双向缩放；`scatter`/`bubble` 默认就是 `'xy'`，传 `'x'` 退回单轴）、`options.dsBubble`（气泡图的单位/标签阈值，见 `bubble`） |
| `DS.seg.mount(hostEl, {options, value, ariaLabel, onChange})` | **分段按钮**（互斥 toggle 按钮组，样式 `.ds-seg` / `.ds-seg-btn`，选中态 `aria-pressed="true"`，用 `--color-primary-tint`/`-ink`）。`options` 是 `[3,10,20]` 或 `[{value,label?,title?}]`；点未选中的按钮才触发 `onChange(value)`；返回 `{get(), set(value), destroy()}`（`set` 只改选中态、不触发 `onChange`）。放在卡片标题栏用 `.ds-card-head`（左标题 `.ds-card-title`、右操作区）。demo 的「数量级切换」就是它：`onChange` 里先 `DS.charts.destroy` 旧实例再用对应规模的合成数据（`demo/mockdata.js`，固定 seed）重建 |
| `DS.charts.fullscreen(chart, on?)` | 进/出全屏（`on` 省略 = 切换）。⛶ 按钮、标题栏 ×、Esc、点遮罩都走它。形态见下方「页面布局与全屏」 |
| `DS.charts.destroy(chart)` | 销毁图表实例、摘除工具条 DOM 与全屏状态、从内部 registry 注销；翻页/按筛选重建图表时的标准清理方式 |
| `DS.charts.all()` | 返回当前仍存活（未 `destroy()`）的 Chart.js 实例数组 |
| `DS.charts.isEmpty(config)` | 判断某个 Chart.js config 的全部 datasets 是否为空；`create()` 内部用它决定要不要走空态分支 |
| `DS.charts.themeColors()` | 返回当前主题下的图表配色 token：`{grid, axis, text, series: [s1..s6], seriesExt: [s1..s10]}`（`seriesExt` 是桑基图专用的十色扩展，其余图表只用六色 `series`）；`DS.svg.*` 自己画 SVG 图时就是从这里取色，自定义图表/图例也应该用它而不是硬编码颜色 |
| `DS.charts.rampColors(n, {alpha})` | **渐进色板（按排名/数值连续着色）**：返回 `n` 个 `hsla()` 字符串，第 `i` 个色相 = `i*360/n`（沿色轮连续渐进，相邻排名颜色相近），饱和度/亮度读 token `--chart-ramp-s` / `--chart-ramp-l`（浅色 65%/55%，深色 60%/55%），`alpha` 默认 1。气泡图默认用它（填充 0.7、描边 1）；分类色板 `--chart-s1…s10` 仍是其他图表的默认 |
| `DS.charts.dateTicks(fmt)` | 返回一个 `ticks.callback` 函数，把时间戳（毫秒）格式化成日期标签；`fmt` 为 `'md'`（默认，`M/D`）或 `'ymd'`（`YYYY-MM-DD`）。返回的函数带 `__dsDateTicks` 标记，`paint()` 据此把该轴的**悬浮框标题**自动改成同格式日期加星期（`1/11（周四）` / `2024-01-04（周四）`，调用方自写 `tooltip.callbacks.title` 时不覆盖）；也可直接调 `fn.title(ms)`。时间轴没有内置日期适配器时的退化方案，见下方「时间轴」一节 |
| `DS.charts.zoom(chart, factor)` | 以当前视图中心为基准按 `factor` 缩放（`>1` 放大、`<1` 缩小），工具条 `−`/`+` 按钮内部调的就是它 |
| `DS.charts.zoomAt(chart, factor, px, py)` | **以鼠标位置为锚点缩放**（滚轮内部调它）：`px/py` 为画布像素，每根参与缩放的轴取鼠标处的数据值 `a`，新视野 `a-(a-min)/factor … a+(max-a)/factor`，鼠标下的数据缩放前后停在同一像素；越过数据边界时整体平移而不压扁，缩出满量程收回 `null`；鼠标在绘图区外按最近边界点锚定 |
| `DS.charts.zoomRange(chart, i0, i1)` | 缩放**主轴**（类目轴；xy 图里是 x 轴）到显式的类目索引（或无类目图表的数据域）区间 `[i0, i1]`；会按数据边界钳位，钳位后过窄视为误触并忽略，拖框选内部调的就是它 |
| `DS.charts.zoomBox(chart, {x:[a,b], y:[c,d]})` | **xy 模式**（散点/气泡默认）的矩形缩放：横纵两个方向同时收窄到给定数据区间，返回是否生效；任一方向过窄（误触/细线）整体忽略。拖框选内部调的就是它，见下方「xy 框选缩放」 |
| `DS.charts.panBy(chart, dx, dy)` | 平移（画布像素，内容跟手走）：只动已经缩放过的轴，窗口宽度不变、钳在数据域内，返回是否真的动了；Shift+拖动内部调的就是它 |
| `DS.charts.resetZoom(chart)` | 清除缩放约束，交还 Chart.js 自动量程 |
| `DS.charts.isZoomed(chart)` | 当前是否处于缩放状态；非笛卡尔图（pie/doughnut/polarArea/radar）恒为 `false` |
| `DS.charts.bubble(canvas, items, opts)` | **气泡图一步建图**：`items = [{name, count, value}]`（x = `count` 数量，y = `value` 平均值），过滤 `count < minCount`（默认 5）→ 按数量降序取前 `topN`（默认 50）→ 面积∝数量的半径；颜色/标签/悬浮框/无图例/xy 框选缩放/数据表按钮全自动。`opts`：`minCount`、`topN`、`minRadius`（5）、`maxRadius`（35）、`xTitle`/`yTitle`（轴标题；两轴都从 0 开始）、`countUnit`/`valueUnit`（悬浮框单位，如 `'片'`/`'分钟平均'`，默认空）、`labelRatio`（默认 0.15）、`labelMax`（默认 12）、`table:false`（不要数据表）、`tableTitle`/`nameLabel`/`countLabel`/`valueLabel`（表格文案）。返回 Chart.js 实例（空数据返回 `null`）。见下方「气泡图」 |
| `DS.charts.bubbleData(items, opts)` | 上面的纯函数部分（过滤/排序/截取/半径），返回 `{points:[{x,y,r,name,count}], maxCount}`，可单独用或单测 |
| `DS.charts.waterfall(canvas, items, opts)` | **瀑布图一步建图**：`items = [{label, value, type}]`；`type:'total'` 是合计柱（从 0 画到当前累计），省略 `type` 是增减项（从上一个累计画到「累计 + value」）；合计柱 `value` 省略 = 取当前累计、给了 = 以它作新的累计基线（起始柱这样写）。库算累计并生成悬浮柱 `[start, end]`（Chart.js 原生，无插件）。`opts`：`indexAxis`（`'x'` 默认纵向 / `'y'` 横向）、`connector:false`（关掉相邻柱之间的连接线）、`label`、`valueTitle`。返回 Chart.js 实例（条目为空返回 `null`）。见下方「瀑布图」 |
| `DS.charts.waterfallData(items)` | 上面的纯函数部分，返回 `{labels, ranges:[[start,end]], cum, deltas, kinds}`（`kinds` 取 `'up'`/`'down'`/`'total'`），可单独用或单测 |
| `DS.charts.boxplot(canvas, groups, opts)` | **箱线图一步建图**：`groups = [{label, values:[…]}]`（原始数值，库算统计量），或已算好的 `[{label, stats:{min,q1,median,q3,max,n?,outliers?}}]`（`min`/`max` 即须线两端）。没有有效数据的组被丢弃。`opts`：`indexAxis`（`'x'` 默认纵向 / `'y'` 横向）、`valueTitle`、`label`。返回 Chart.js 实例（无有效数据返回 `null`）。统计规则与实现见下方「箱线图」 |
| `DS.charts.boxStats(values)` | 箱线图的统计纯函数：返回 `{n, min, q1, median, q3, max, outliers}`（`min`/`max` 是须线两端，不是数据最小/最大值），无有效数值返回 `null` |
| `DS.charts.attachTable(chart, spec)` | **给任何图表挂数据表**：工具条加一个「表格」按钮（内联 SVG）。`spec = {title, columns:[{key,label,num?,format?(v,row)}], rows: 数组\|function(chart), search:{key,placeholder?}\|false, index:false?}`；也可在 `create` 的 config 里直接写 `dsTable: spec`。没有工具条的图（饼图等）会补一条只有 表格/全屏 的工具条。见下方「图表数据表弹窗」 |
| `DS.charts.openTable(chart)` | 打开该图表的数据表弹窗（工具条按钮调的就是它）；每次打开都重建内容，搜索框与排序状态是干净的 |
| `DS.charts.setWheelMode(mode)` | 对所有已存在的笛卡尔实例立即切换滚轮模式（`'page'`\|`'zoom'`\|`'ctrl-zoom'`\|`'smart'`），无需重建图表；传入未知字符串会被拒绝并 `console.warn`，保留原模式 |
| `DS.charts.sankeyGroupTotals(flows, field)` | 桑基图专用：按 `field`（`'from'` 或 `'to'`）聚合 `flow` 总和，调用方常用它给节点筛选下拉的每一项配个计数，见下方「桑基图」一节 |
| `DS.charts.sankeySetBaseline(chart, keys)` | 桑基图专用：设置筛选基线（`keys` 是节点键的数组或 `Set`，空/`null` 表示没有筛选），同时把"点击产生的覆盖态"清零——和筛选重建配合用 |
| `DS.charts.sankeyClearHighlight(chart)` | 桑基图专用：把当前高亮强制回落到基线（不改筛选本身），"清除筛选"之类按钮按需调用 |
| `DS.sankey.mount(hostEl, flows, opts)` | **桑基图组件**：在 `hostEl` 里生成「流出端/流入端两个多选下拉 + 全选 + 计数 + 已选徽标 + 清除筛选」筛选条和图表宿主，画出桑基图，并负责基线高亮联动、筛选变化时销毁重建（连 canvas 一起换）、右上角全屏按钮。返回控制器 `{chart(), visibleFlows(), getSelection(), setSelection({from,to}), setFlows(flows), clear(), destroy()}`。`opts`：`id`（元素 id 前缀，默认 `'sankey'`，生成 `#<id>-from-btn/-from-list/-from-badge/-to-btn/-to-list/-to-badge/-clear-btn/-host` 与 `canvas#c-<id>`）、`topN`（流入端默认显示流量前 N，默认 `20`）、`maxToItems`（「流入端」下拉最多列出多少项，按流量降序取前 M，默认 `40`；Top-N 视图不受影响）、`datasetLabel`/`fromLabel`/`toLabel`/`clearLabel`（文案）、`chartOptions`（合并进 Chart.js options）、`onChart(chart)`（每次建出非空图表后回调）。见下方「桑基图」一节 |
| `DS.sankey.filterFlows(flows, {from, to}, {topN})` | 上面组件用的筛选纯函数，可单独使用/单测：返回 `{flows, sources, sinks, shownSinks}`。源端勾了只看勾选的、没勾是全部首层节点；目标端与源端一致：勾了任何项就只显示勾选的（榜外的也能勾进来），一项都没勾才默认显示流量前 N；保留"从所选源端出发、能到达目标端的所有路径上的流向" |
| `DS.sankey.endpoints(flows)` | 返回 `{sources, sinks}`：首层节点（没有入流）与末层节点（没有出流）；有环导致某一侧为空时退回全部 `from`/`to` |
| `DS.charts.paint(config)` | 内部方法：把当前主题色/字体/tooltip/scale 配置写进传入的 config。由 `create()` 和 `retheme()` 自动调用，一般不需要主动调用 |
| `DS.charts.retheme()` | 内部方法：主题切换时自动触发（监听 `ds:themechange`），对 registry 里所有存活的笛卡尔图重新 `paint()` + `update()`。一般不需要主动调用 |
| `DS.charts.options()` | 内部方法：返回当前全局配置对象 `{wheel, maxLabel}` 的引用，主要供 `DS.svg.*` 读取 `maxLabel` 共享截断阈值 |
| `DS.svg.gantt(host, rows, opts)` | **甘特图**（Chart.js 画不了；HTML 元素绘制，主题切换/`redrawIn` 整块重画）：整点时间轴（跨日 `⁺¹`）、资源行、按数值分档着色的任务条（条内数量+时长、字色自动黑/白）、标记线（标签自动避让）、图例、跟随鼠标的悬浮框、可折叠明细表。`rows = [{label, lanes?, bars:[{start, end, value?, count?, breakdown?, flags?, lane?, label?, series?, category?}]}]`，时间单位为分钟。**没有缩放/全屏工具条**，宽度不够时横向滚动。返回根元素 `[data-gantt]`。见下方「甘特图」 |
| `DS.svg.ganttLayoutMarkers(markers, W)` | 甘特标记线标签避让的纯函数：`markers = [{x, label, priority?, w?}]`，返回同序的 `[{row, anchor:'left'\|'right', range:[l, r], w}]`，规则见「甘特图」 |
| `DS.svg.fmtClock(min)` | 分钟 → `'HH:MM'`，跨日加上标天数（`1500 → '01:00⁺¹'`）；先对总分钟取整再拆时分 |
| `DS.svg.heatmap(host, matrix)` | 热力图（同上） |
| `DS.modal.open(html)` | 打开模态框，`html` 作为内容区 innerHTML；点击遮罩或按 Esc 会自动调用 `DS.modal.close()` |
| `DS.modal.close()` | 关闭当前模态框（隐藏遮罩），无参数 |
| `DS.toast.show(msg, ms)` | 提示条；`ms` 是自动消失时间（毫秒），省略时默认 `3000` |

`src/` 对外只暴露 `DS` 这一个全局变量。

### 页面布局与全屏（2026-10-22，沿用参照实现）

**页面布局**（库层面默认，`src/components.css`）：`.ds-wrap { max-width:100%; padding:24px 32px 80px }` 铺满窗口宽度；图表网格 `.ds-charts-grid`（旧类名 `.ds-grid-2` 同义）= **固定两列** `repeat(2, minmax(0,1fr))`、`gap:24px`，窗口再宽也只两列、卡片随窗口变宽，≤760px（手机宽度）才单列；demo 页「基础组件」分组里按钮/徽标/上传区等小卡片也放在同一网格；`.ds-card` 内边距 24、`--shadow-sm`；`.ds-chart-host` 高 350（大图在自己的宿主上单独加高；桑基图 520、气泡图 500，半宽卡片里标签仍不重叠；`.ds-card-wide` 是**可选**类，默认不用，给卡片加上它才占满一整行）；顶栏 `.ds-nav` 取 `--nav-bg`（浅色 `#1e293b` / 深色 `#0f172a`）、标题 15px/700、页签与按钮用顶栏专用 token（`--nav-text/-text-secondary/-accent/-border`，已验对比度）；页面背景是 135° 渐变，三段色取 `--page-bg-from/-mid/-to`（深色主题三段同为纯深色）。CSS 规则里不允许出现颜色字面量（`tests/test_build.py` 守着，仅 `.ds-btn.primary` 的白字与模态遮罩两处既有例外）。

**全屏 = 遮罩 + 居中面板 + 标题栏。** 面板就是图表宿主本身（加 `.ds-chart-fullscreen`），画布**不搬家**——Chart.js 靠"量容器"响应，搬动 DOM 会丢尺寸语义。进入时临时插入 `.ds-fs-head`（标题 `.ds-fs-title` 取所在 `.ds-card` 的 `.ds-card-title` 文本，没有卡片退回 `options.plugins.title.text`，再退回「图表」+ 关闭按钮 `[data-act="fs-close"]`），并在 `<body>` 末尾临时挂 `.ds-fs-backdrop`（`position:fixed; inset:0; z-index:149; background:var(--color-overlay); backdrop-filter:blur(4px)`）；退出时两者都摘掉，宿主 DOM 恢复原样。面板宽 `min(95vw,1400px)`、高 `92vh`、居中，`padding:64px 24px 24px`（顶部留标题栏），工具条并进标题栏、停在 × 左侧。四种退出方式：⛶、×、Esc、点遮罩；Esc 用 capture 阶段监听，数据表弹窗开着时 Esc 先关弹窗。**全屏中滚轮一律按 `zoom` 处理**（不论图表自己的模式；全屏视图里没有页面滚动冲突，遮罩上的滚轮也被拦住不滚背后的页面），退出后恢复原模式；工具条提示文字同步成「滚轮缩放」。同一时刻只有一个全屏。往返后画布与容器尺寸精确恢复的约束全部保留（`min-width:0`、测量前收起 inline 宽、`resize` 包装忽略传入尺寸、先改类再同步 `chart.resize()`）。`.ds-modal-backdrop`（160）> 面板（150）> 遮罩（149），所以全屏中打开的数据表弹窗盖在最上层。

### 侧边栏（DS.sidebar，2026-10-22，沿用参照实现的「左侧菜单分类」形态）

**标记由使用者写**（库提供 CSS 类与行为，不生成菜单内容）：

```html
<div class="ds-layout">                         <!-- flex：侧栏 + 内容，gap 24 -->
  <nav class="ds-sidebar" id="side" aria-label="分类">
    <div class="ds-side-group">组名（可选，折叠后收成一条分隔线）</div>
    <button type="button" class="ds-side-item" data-panel="p-a">
      <svg class="ds-side-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">…</svg>
      <span class="ds-side-label">菜单文字</span>
    </button>
  </nav>
  <div class="ds-side-main">                    <!-- flex:1; min-width:0 -->
    <section class="ds-side-panel" id="p-a">…</section>
  </div>
</div>
<script>var side = DS.sidebar.init('#side', { onChange: function (id, panel, info) {} });</script>
```

- **形态**：侧栏宽 230、`position:sticky`（`top` 取 `--ds-side-top`，默认 66px = 顶栏高 + 间距，顶栏高度不同时在 `.ds-layout` 上覆盖）、超高时内部滚动；菜单项 = 18px 线条图标 + 文字，选中项**左侧 3px 主色条** + `--color-primary-tint` 底 + 图标变主色（`aria-current="true"`）。顶部折叠按钮由库自动插入（`«` 折叠 / `»` 展开）；折叠后宽 52px 只剩图标，鼠标悬停/键盘聚焦浮出文字提示（`.ds-side-tip`，挂在 `<body>`、`position:fixed`，不被侧栏的 overflow 裁掉），折叠时菜单项自动补 `aria-label`。图标用 `stroke="currentColor"`，颜色跟随 token，**不要写颜色字面量**。
- **折叠状态**存 `localStorage`（键 `ds-sidebar-collapsed`，可用 `storageKey` 改），刷新后保持；存储读写抛错（隐私模式、`file://` 被禁）一律静默降级为"记不住"，与 `DS.theme` 同一做法。`opts.collapsed` 只在存储里没有（或值不认识）时作为初始值。
- **键盘**：菜单项是真 `<button>`，Tab 可达、Enter/Space 触发；库补上 ↑/↓/Home/End 在菜单项间移动焦点（只移焦点，不改选中）。
- **中等宽度自动收起**（`autoCollapseBelow`，默认 `1100`；传 `0` 关闭）：视口宽 **761–1099px** 时侧栏自动收成 52px 图标栏（与手动折叠同一视觉），把宽度让给两列卡片（实测 900 宽每张卡片 368px、1099 宽 467px；不收起的话 900 宽只有 279px）；**≥1100 恢复**用户原来的状态；≤760 仍是下面的顶部横排。规则：
  - 自动收起是视口决定的临时状态，**不写 `localStorage`**——存储里的偏好原样保留，回到宽屏就按它恢复（偏好是折叠就仍折叠）。
  - 自动收起区间内点折叠按钮（或调 `collapse()`/`toggle()`）= **临时展开/收起，不落盘**；在同一区间内改窗口宽度不会冲掉这个临时状态；离开区间（≥1100 或 ≤760）时丢弃，再次进入区间重新自动收起。宽屏下的手动折叠/展开照旧写存储。
  - 跨断点（窄屏 / 自动区间 / 宽屏三段之间）时同步切换并让可见图表按新宽度重量（与手动折叠后的重算是同一套 `resizeIn/redrawIn`，量两遍：第一遍时别的图表画布还是旧宽度，可能把页面短暂撑出滚动条），宽度过渡结束时 `transitionend` 再补量一次。同一段内的宽度变化交给 Chart.js 自己的响应式。
  - 实现只用 `resize` 事件 + `matchMedia` 的 `change` 事件（两者都同步重判，幂等），**不用 `requestAnimationFrame`**（本机 headless chromium 里它永不回调），也不用定时器（`tests/test_build.py` 静态守着 sidebar.js 里不出现 rAF/`setTimeout`）；`destroy()` 摘掉这些监听。
- **窄屏**（`<=760px`，与图表网格同一个断点）：`.ds-layout` 变纵向，侧栏变成顶部横排（`flex-wrap`，选中标记从左侧色条换成底边色条），折叠按钮与分组标题隐藏，持久化的折叠状态在窄屏下不生效。
- **切换面板**：不选中的面板加 `hidden`；选中的面板有 300ms 淡入——**纯 CSS 动画**（`@keyframes ds-side-fade`，`display:none → 显示` 会重新触发），库里没有任何 JS 动画/`requestAnimationFrame`/定时器；`prefers-reduced-motion` 下关闭。
- **隐藏面板里的图表**：宿主 `display:none` 时图表是 0x0（SVG 图按 640 兜底宽度取样）。库在每次切换后自动调 `DS.charts.resizeIn(面板)` 与 `DS.svg.redrawIn(面板)`，按真实尺寸重算——不依赖浏览器的 ResizeObserver 是否触发，也不会新建实例或叠加监听器（切换多次 `DS.charts.all()` 数量不变）。
- **`showAll()`**：让所有面板同时可见、清掉选中态（`onChange(null, null, {all:true})`），再点任何菜单项恢复分栏。用于打印、"全部展开"或测试里一次性读全部图表。
- demo 页（`demo/demo.js`）用它把原来的「交互演练场 / 组件全览」两个标签页合并成一页六个分组，见下方「demo 页的分组」。

### demo 页的分组（2026-10-22，合并两个标签页）

| 菜单（hash） | 卡片 |
|---|---|
| 基础组件（`#base`） | 四块统计瓦片（KPI）、按钮、徽标、上传区、卡片与模态、提示条（ok/info/warn/bad）、表格 |
| 对比（`#compare`，**默认**） | 柱状图、条形图、堆叠柱状图、双轴组合图、瀑布图 |
| 趋势（`#trend`） | 折线图、折线图（按日期）、面积图 |
| 构成（`#compose`） | 环形图、桑基图 |
| 分布（`#dist`） | 散点图、气泡图、箱线图、热力图 |
| 进度（`#progress`） | 甘特图（整行宽卡片） |

- **滚轮缩放方式不在侧栏里**：它是全页设置，放在顶栏「深 / 浅」按钮旁——小标签「滚轮」+ 一组 `DS.seg` 分段按钮（`ctrl-zoom / page / zoom / smart`，按钮 `title` 是各模式说明），点击即时 `DS.charts.setWheelMode()` 并弹 toast，出厂默认 `ctrl-zoom`、不落盘（与原来的单选组行为一致）。原来的「交互设置」分组已删除，`#interact` 现在是未知 hash（加载时回落默认分组，`hashchange` 时不动）。顶栏控件样式见 `.ds-nav-ctl` / `.ds-nav .ds-seg`（顶栏 token：选中 = `--nav-accent` 底 + `--nav-bg` 字）；≤760px 顶栏换行（360 宽为标题 / 滚轮 / 深浅三行），任何宽度都不横向溢出。
- **去重**：原两页里重复的三对卡片各并成一张，保留数据更丰富/交互更完整的那张，另一张的独有能力并进去——柱状图（保留带数量级切换的 `c-bar`，原 `c-long` 的"超长类目名截断 + 悬停全称"变成卡片里的「加入一个超长类目名」开关）；折线图（保留 40 周双线的 `c-line`，原 `c-empty` 的"空数据占位提示"变成「显示为空数据」开关）；表格（保留 6 列的 `#t-detail`，原 `#t-table` 的"百分比/中文数字前缀按数值排序"由新增的「达标率」列和既有的「仪器」列（一号/二号/三号/备用）演示）。
- **URL hash**：点菜单用 `history.replaceState` 写 `#短名`（不往历史栈塞记录）；带 hash 加载直接打开对应分组，无效 hash 回落到默认「对比」；手改地址栏 / 前进后退触发 `hashchange` 时跟着切。
- **兼容层**：旧入口 `[data-panel="p-play"]` 与 `[data-panel="p-comp"]` 仍存在（页面里一个 `hidden` 容器 `#ds-compat` 内的两个不可见、不可聚焦的按钮，不在侧栏里），点击 = `DS.sidebar.showAll()`：全部分组同时可见并按真实尺寸重算全部图表，不改 hash。外部脚本沿用旧选择器即可；新代码用 `[data-panel="g-compare"]` 之类（`g-base/g-compare/g-trend/g-compose/g-dist/g-progress`）切到单个分组。

### 图表宿主要求

`DS.charts.create(canvas, config)` 的工具条（缩放 `−/+/⟲/⛶`）用 `position: absolute` 定位（`DS.svg.gantt/heatmap` 没有工具条，宿主不必是 `.ds-chart-host`），必须相对最近的"已定位祖先元素"（`position` 不是 `static`）摆放。`src/components.css` 里 `.ds-chart-host { position: relative; height: 350px; }` 正是为此存在——`canvas`/`host` 必须是某个 `.ds-chart-host`（或其他自带 `position: relative` 的容器）的直接子元素，否则工具条会相对更外层的定位祖先（最坏情况是 `<body>`）定位，实测表现为整组按钮飞到页面右上角。

### 数字列排序支持的格式

`DS.tables.sortable` 判定"整列是否按数值排序"时，除了裸数字（含负数），还识别这几种保守剥离后的格式：千分位逗号（`1,234`）、百分号（`5%`）、`h`/`min`/`s` 结尾的时长（`3.5h`）、`hh:mm` 或 `m:ss` 式的时长（`02:14`，按总分钟数比较）。其余格式（如夹杂中文单位、复合单位）一律按字符串排序——这是有意保守：通用的单位剥离规则容易把本来就是文本的列（比如型号 `3.5mm`）误判成数字列。

### 数字列的表头对齐

`.ds-table td.num` 右对齐数字单元格，这是`.ds-table`一直就有的约定——数字列的 `<td>` 自己加 `class="num"`。但表头 `<th>` 默认固定左对齐（`.ds-table th { text-align: left }`），早先的版本里没有任何机制让数字列的 `<th>` 跟着右对齐：数字列的标题停在左边，数据却右对齐飘在右边，视觉上整列错位接近一个列宽——用户点错位的表头排序、盯着标题正下方看到的其实是旁边一列的数字，会被误判成"排序没生效"。

正确写法是数字列的 `<th>` 和 `<td>` **都**加 `class="num"`（见 demo 页「运行明细」表的 `样本数`/`时长(分)` 两列）：

```html
<th class="num">样本数</th>
...
<td class="num">64</td>
```

`DS.tables.sortable(sel)` 会在每次调用时自动补上这一步，使用者就算忘了给 `<th>` 加类也不会错位：它按列扫描 `<tbody>`，一列里所有非空 `<td>` 都带 `num` 类才判定为数字列，并给对应的 `<th>` 补上同一个类。判定依据是 `<td>` 实际有没有 `num` 类，而不是单元格内容像不像数字——两者是两回事：一列全是数字字符的编号（比如纯数字批次号），如果作者没有把它标成 `num`（即故意保留左对齐），自动判定不会去猜内容、强行给它的表头加上右对齐，不会凭空制造一个新的错位。

这个自动判定是幂等、可重入的：消费者按标准做法在表格重渲染后再调一次 `sortable(sel)`，如果某一列的数据从数字变成了文本（或反过来），表头对齐会跟着重新判定；它只会移除自己之前自动加上的类，使用者自己手写在 `<th>` 上的 `num` 类（无论该列数据是否整列右对齐）永远不会被这个自动判定摘掉或覆盖。

demo 页的 `<th>` 没有只依赖这个自动机制——`demo/demo.js` 里数字列的表头显式写了 `class="num"`，作为"正确写法"的示例，便于直接照抄。

## 滚轮缩放的四种方式

建项目时由 `DS.charts.init({wheel: ...})` 定死一种，**不暴露给终端用户**——该选择器只存在于 demo 页（顶栏「滚轮」分段按钮），供设计/开发现场比较差异用。

| 模式 | 滚轮行为 | 缩放途径 |
|---|---|---|
| `page` | 永远翻页 | 工具条 `−/+/⟲/⛶`（有数据表的图还有「表格」）+ 拖框选 |
| `zoom` | 直接缩放 | 滚轮本身；工具条仍在 |
| `ctrl-zoom`（默认） | 按 Ctrl 缩放，否则翻页 | Ctrl+滚轮 + 工具条 |
| `smart` | 未到极限先缩放，到底后翻页 | 滚轮本身 |

工具条与拖框选在四种模式下**始终可用**。缩放工具条只挂在笛卡尔坐标图上（折线/柱状/面积等），不挂 pie / doughnut / polarArea / radar——那几类图没有"轴范围"概念，缩放没有意义。

## 报表常用的四种图表（以及桑基图）

demo 页（「对比」「趋势」分组）里补了四种报表最常出现、但此前没演示过的图表形态（`demo/demo.js` 的 `c-combo` / `c-stacked` / `c-area` / `c-timeaxis`）。四种都是 Chart.js 原生支持的类型/配置组合，缺的只是演示、主题适配和断言——不是新的图表引擎。桑基图（`c-sankey`）不一样，它是本库唯一一个**不是 Chart.js 内置类型**的图表，走的是单独内联的第三方插件，见下方「桑基图」一节。

### 双轴组合图（量 + 率）

柱状（绝对量，左轴 `y`）+ 折线（比率，右轴 `y1`，`dataset.yAxisID: 'y1'`）叠在一张图里，是报表里"量纲不同的两个指标"最常见的呈现方式。`DS.charts.paint()` 会给调用方声明在 `options.scales` 里的坐标轴注入当前主题的网格/刻度/轴线颜色。额外坐标轴（除 `x`/`y` 以外的，典型是 `y1`）默认把 `grid.drawOnChartArea` 设为 `false`——两套网格线叠在一起对读者是纯噪音，只让主轴画网格是惯例做法。调用方自己显式配置过 `grid.drawOnChartArea` 的话不会被覆盖。

默认的 `y` 轴不是无条件创建的：如果你的全部数据集都把 `yAxisID` 指向 `y1`（压根不用默认的 `y`，双轴图里只要一根竖轴时的常见写法），本库不会凭空造一个没人用的幽灵 `y` 轴出来——Chart.js 一旦在 `options.scales` 里看到某个轴的 key，哪怕没有数据集引用它也会真的实例化并绘制，没有数据可读的话量程会退化成毫无意义的 `0..1`。如果你确实想保留一条不对应任何数据的装饰性 `y` 轴，自己在 `options.scales.y` 里显式声明（哪怕是空对象）即可，只要显式声明过就不会被这条规则删掉。

### 堆叠柱状图

`scales.x.stacked = true` + `scales.y.stacked = true`，多数据集配色走 `--chart-s1..s6`。**百分比堆叠**（各段和为 100%）Chart.js 没有原生支持（没有 `stacked: '100%'` 这类选项），demo 页用数据预处理实现等效效果：每个类目按当月总量把各数据集的值归一化成百分比、`scales.y` 设 `min:0, max:100`，再用 `tooltip.callbacks.label` 从 `dataset.__dsRaw`（切换前保留的原始绝对值）读回真实数值一并显示，避免换成百分比后看不到原始量。demo 页「堆叠柱状图」卡片里的复选框就是这个开关的现场演示，`src/charts.js` 本身不需要为此新增任何 API。

### 面积图（填充）

`dataset.fill` 设为 `true` / `'origin'` / 数字索引 / 非 `'false'` 的字符串 / `{target, above, below}` 对象写法（Chart.js 认可的全部 fill 取值），且该数据集的类型是 `line` 时，`paint()` 会把它的 `backgroundColor` 自动换成线条色的半透明版本（当前 alpha 固定 `0.34`）——否则多条面积图叠在一起会变成互相完全遮挡的实心色块。`borderColor`（线条本身、图例描边）仍然是不透明的系列色；没有设置 `fill` 的数据集（普通折线图、柱状图）`backgroundColor` 行为不受影响，仍然是不透明色。这个判断是 per-dataset 的，同一张图里"面积 + 不填充的目标线"这种常见混合完全支持（见 demo 页「面积图」卡片）。

alpha=0.34 是浅/深两套主题各自的最小 WCAG 对比度都有确定余量之后选的值（2026-10-22 按新色板重算：浅色最低 1.343（s5 黄），深色最低 1.630，均高于热力图最低档也用过的 1.2 可见性下限），但浅色主题下 s5 黄这类偏亮的分类色天花板本来就不高——详见「决策记录」#14，换掉色板之后这个数字需要重新核算。色板 token 如果换成非十六进制格式（`rgb()`/`hsl()`/颜色关键字），半透明转换会自动降级为原样使用调用方给的颜色（放弃半透明效果，不会产出非法颜色值）。

### 时间轴（无内置日期适配器，用数值轴模拟）

Chart.js 的 `'time'`/`'timeseries'` 轴类型本身依赖日期适配器（如 `chartjs-adapter-date-fns`）才能解析/格式化时间，**不自带**。排查过的两个来源都没有可抽取的适配器：
1. 内联在 `src/vendor/chart.umd.js` 里的 Chart.js 4.4.0 本身是裸版本，没有带适配器；
2. 参照项目（另一个内联了 Chart.js 4.4.0 的单文件报表）同样没有内联任何日期适配器或 `time` 轴用法可供复用。

本仓库的硬约束是零外链、产物是离线单文件，不允许联网下载第三方库来补这个适配器。因此采用退而求其次的方案：x 轴用 `type: 'linear'`，数据点用 `{x: 时间戳(毫秒), y: 值}` 的形式喂给 Chart.js（跟散点图是同一种"没有类目标签"的笛卡尔图，缩放也走同一条数据域缩放路径），再用 `DS.charts.dateTicks('md' | 'ymd')` 把刻度上的时间戳格式化成 `M/D` 或 `YYYY-MM-DD` 日期标签。

**这不是真正的 time scale，而且有两条具体的真实局限，不只是"疏密取舍"**（复审实测确认过，demo 页上线前已经踩过）：

1. **刻度可能落在数据范围之外。** 不显式钉 `min`/`max` 的话，Chart.js 对线性轴的默认"好看刻度"算法会自己找一圈整数，第一个刻度经常落在数据起点*之前*（实测 14 天数据从 `2024-01-01` 开始，轴上却先画出一个 `12/31`）——访客看到的是一个凭空多出来、不对应任何真实数据点的日期标签。
2. **数据点少时，相邻刻度会格式化成同一个日期、连续重复。** 刻度间距不保证踩在整天的边界上，数值上不同的两个刻度经过 `dateTicks()` 格式化后可能变成同一个 `M/D` 字符串（实测 3 天数据下 `"1/1"` 连续出现过 4 次）。

两条都是"数值轴硬模拟日期轴"这个方案本身的局限，不是实现 bug。**必须**显式设置三项才能避免：`scales.x.min`/`max` 钉死到数据域本身（而不是交给 Chart.js 自动算）、`ticks.stepSize` 固定成一个合理的整数步长（比如按天用 `86400000` 毫秒）、`ticks.maxTicksLimit` 控制最终密度（Chart.js 会在 `stepSize` 的基础上再按这个上限挑一个合适的倍数）。`demo/demo.js` 的 `c-timeaxis` 卡片就是这么配的，照抄即可。

**数据量变大后的两条补充**（demo 时间轴已扩到 92 天日数据）：(a) 跨度必须是 `stepSize` 的整数倍——`min`/`max` 都钉死时，若 `(max-min)/stepSize` 不是整数，Chart.js 会忽略 `stepSize`、把区间等分成 `ceil(跨度/stepSize)` 份（实测 91 天数据、周步长，得到每 6.92 天一个刻度、标签落在奇怪的日子）。想要"每周一个刻度、首尾刻度正好是第一天和最后一天"，数据天数取 7k+1（demo：92 天 = 14 个刻度 `1/1 … 4/1`）。(b) 缩放后点 ⟲ 复位，会把调用方钉死的 `min`/`max` 还原回去（`$ds.pinned`），而不是一律删掉——此前缩放→复位一次，钉死的刻度约定就永久丢失，刻度又会越界/重复。

如果你的项目需要完整的 time scale（比如非均匀间隔的时间点、自动按年/月/日/时切换刻度粒度，不想自己管 `stepSize`），请自行联网下载并内联 `chartjs-adapter-date-fns`（或等效适配器）到 `src/vendor/` 下，注册 `'time'`/`'timeseries'` 轴类型；本仓库不内置。

这个退化方案能生效，依赖另一处修复：`paint()` 此前会给"类目轴"（`zoomAxisFor()` 判定出的那一个，时间轴场景下通常是 `x`）无条件覆盖 `ticks.callback`，用于超长中文标签截断。调用方自己提供的 `ticks.callback`（比如 `DS.charts.dateTicks()`）在每次 `paint()`（首次 `create()`、每次主题切换触发的 `retheme()`）都会被原地冲掉——时间戳先被 `getLabelForValue()` 转成完整数字字符串（如 `"1,704,067,200,000"`），再被当成"超长标签"截断成一串看不出意义的 `"1,704,0…"`。现在改成只在调用方没有提供 `ticks.callback` 时才注入默认截断逻辑，不影响已有的长标签截断行为（没设自定义回调的图表不受影响）。

### 桑基图（流向/分配）

典型用于"流向/分配"场景——demo 页「构成」分组的 `c-sankey` 卡片演示的是各仪器做了哪些项目、工作量怎么分布（两层：仪器 → 项目，与参照实现形态一致；4 台仪器 × 25 个项目，每个项目对应 1–4 台仪器、份额不均、仪器之间忙闲不一，项目数 > 20，所以「项目筛选」默认只显示前 20、勾选榜外项为追加），很适合用桑基图直观呈现"谁流向了谁、流量各占多少"。库本身支持任意层数，三层及以上的行为由 demo 自测里独立构造的小数据覆盖，demo 主图不再演示。

```js
DS.charts.create(canvas, {
  type: 'sankey',
  data: {
    datasets: [{
      label: '仪器工作量',
      data: [
        { from: '一号仪器', to: '项目01', flow: 10 },
        { from: '二号仪器', to: '项目01', flow: 9 }
        // ...更多 {from, to, flow} 记录
      ]
    }]
  }
});
```

数据形状是 `{from, to, flow}` 记录的数组（字段名可通过 `dataset.parsing` 自定义，用法见 [chartjs-chart-sankey 文档](https://github.com/kurkle/chartjs-chart-sankey)），不是 Chart.js 其余图表那种 `labels` + 按索引对齐的 `data` 数组。节点键只要字符串相等就会被合并成同一个节点——多层串联（某个节点同时是上一段的 `to` 和下一段的 `from`）靠的是字面量完全相等，不是模糊匹配。

**配色是自动的：十色扩展序列色，按"层序 + 层内序"顺次取色。** 节点分层纯粹由 `from`/`to` 构成的有向图拓扑决定（`sankeyNodeLayers()`：没有入边的节点是第 0 层，其余节点的层号是"所有入边来源节点层号的最大值 + 1"），和业务含义无关。节点按（层号, 层内首次出现顺序）排成一条线，第 k 个节点取 `seriesExt[k % 10]`（即 `--chart-s1..s10`）——这是参照实现"源端取 `palette[i]`、目标端取 `palette[(i + 源端节点数) % N]`"向 N 层的推广：相邻两层的序号区间首尾相接，**只要相邻两层节点数之和 ≤ 10，同层与相邻层就必然不撞色，每条流向首尾必然不同色（渐变可见）**。相邻两层合计超过六色序列的能力时（例如三层 [3,4,3]，相邻两层合计 7），就需要 s7..s10，这是扩到十色的原因。超过 10 之后才开始取模复用（固有上限）：demo 的两层图是 4 台仪器 + 20 个项目共 24 个节点，必然循环复用，与参照实现一致（目标端取 `palette[(i + 4) % N]`），属于可接受的行为。`dataset.nodeOrder`（节点键数组）可以固定每个节点的序号：`DS.sankey.mount()` 传入的是全量数据的顺序，所以筛选前后同一个节点颜色不变。查不到节点（正常不会发生）时退回 `--chart-axis` 的中性灰。

**s7..s10 的取舍（为什么扩色板、为什么不给桑基单独放宽验证）。** 备选方案有两个：(a) 扩 `--chart-s7..s10`；(b) 桑基单独定义"同层 + 相邻层可辨即可"的验证规则、复用现有 6 色加半透明/明度变体。选了 (a)，并且**没有放宽**验证规则：十色全局两两（45 对）仍要求 ΔE(OKLab) ≥ 15、三种色觉障碍模拟各 ≥ 6（`tests/test_palette.py::test_chart_series_ext_distinguishable_*`，深浅主题各验一次），（2026-10-22 起规则已放宽为只验正常视觉 ΔE≥15、不再验 CVD 与对 surface 3:1，见决策 #30；此处为旧色板的历史数字。）理由：(b) 的"明度变体"在色觉障碍模拟下恰恰是最容易塌缩的维度；而全局两两达标在 10 色这个规模下是可行的（脚本搜索验证过），没必要为此引入第二套验证口径。**s7..s10 仅桑基使用**，其余图表仍然只用 s1..s6（`themeColors().series` 长度不变，`test_chart_series_core_six_unchanged` 锁定 s1..s6 的取值）。**深色主题单独给一组 s7..s10**（浅色组里的深蓝/深绿/深紫在深色底上几乎看不见）。**图形元素对表面色 ≥ 3:1 不开例外**：新增的 s7..s10 两套主题都 ≥ 3:1（深色 s7..s10 = 7.13 / 3.14 / 12.73 / 16.02，浅色 6.69 / 7.69 / 8.9 / 9.3），且深色 s1..s10 全部 ≥ 3:1，由 `tests/test_palette.py::test_chart_series_contrast_dark/light` 锁定。唯一的例外是浅色主题历史遗留的 s4（#eab308）/ s6（#56b4e9），见决策 #14，不在新增颜色上扩散。

流向本身用 Chart.js 自带的 `.alpha(0.5)` 半透明渲染（插件写死的行为，交叉处依然能分辨谁流向谁，不需要额外配置）。节点标签文字色取 `--color-text`，节点描边取 `--color-surface`（和弧形族扇区描边同一个理由：深浅主题下都能把相邻节点分隔开）。跟其余图表同一套"调用方给了就不碰"的约定：`dataset.colorFrom`/`colorTo`/`color`/`borderColor`/`priority` 只要显式提供了初始值，就不会被 `paint()`/`retheme()` 覆盖。

**排序优先级没传才补。** `dataset.priority`（第三方插件自己的选项，减少连线交叉）按"该节点作为 from 或 to 出现时流量之和"从大到小排名自动算一份（`sankeyPriority()`），调用方自己给了就不碰。

**tooltip 默认带占比。** 没传 `options.plugins.tooltip.callbacks.label` 的话，`paint()` 会补一个"`从 → 到: 流量 (占源节点总流出的百分比)`"的格式（比默认的"from -> to: flow"多算一个占比），分母是当前数据集里这个 `from` 的全部流出总和。

**点击高亮，不是悬停。** 点击某条流向，按点击的横坐标落在绘图区中线左/右侧，决定高亮 `from` 还是 `to` 端——**流向和节点的着色规则不同**：流向——整条流向要么全亮要么全灰，判据是"起点或终点属于高亮集合（`state.active`，不是扩展后的连通集）"，所以二跳流向整条变灰，不会出现"一头亮一头灰"的半截渐变；节点方块——按一跳连通集判断（高亮节点本身及与它直接相连的节点保持原色，其余淡出成 `--chart-grid` 的灰，由 `afterDraw` 插件按节点身份重绘，避免"控制器按最后一条触碰流向给节点上色"的顺序依赖）。悬停加深保留插件默认（`hoverColorFrom/To` 不覆盖，是用户能感知的交互反馈）；自动化测试读颜色前要先清掉悬停态（`chart.setActiveElements([])` + `chart.tooltip.setActiveElements([])` 后 `update('none')`）。再次点击同一个已经单独高亮的节点、或点击空白处，都会回落到"筛选基线"（`DS.charts.sankeySetBaseline()` 设置的节点键集合；没有筛选时基线是 `null`，表现为完全不高亮）。高亮状态挂在 `chart.$dsSankey`（`{active, baseline}`，两个都是 `Set|null`）上，一般不需要直接读写，程序化高亮用 `DS.charts.sankeySetBaseline(chart, keys)` / `DS.charts.sankeyClearHighlight(chart)`。

**筛选组件在库里：`DS.sankey.mount()`。** 不再需要抄 demo 代码：`var comp = DS.sankey.mount(hostEl, flows, {id: 'sankey', topN: 20})` 即得到两个下拉 + 全选 + 千分位计数 + 已选徽标 + 清除筛选 + 基线高亮联动 + 销毁重建（每次筛选变化都销毁旧实例、换一块新 `<canvas>`，避免任何残留状态）。N 层通用的筛选语义：「流出端」下拉只列首层节点（没有入流的）、「流入端」只列末层节点（没有出流的），中间层不进下拉、自动保留；源端勾了就只看勾选的，没勾是全部首层；**目标端与源端语义一致：勾了任何项就只显示勾选的那些（不论是否在前 N 内，榜外的也能勾进来）；一项都没勾才默认显示流量前 N（`topN`，默认 20）的末层节点**；两端同时勾时显示「所选源端」到「所选末层」之间可达路径上的流向（结果为空显示空态）；最终保留"从所选源端出发、能到达所选目标端的所有路径上的流向"（可达性），所以三层图勾选一个源节点后能看到它的完整去向。图表左上角有一行"显示 X / Y 条流向数据"的小字，让人知道当前筛出了多少。`DS.sankey.filterFlows()` 是同一套语义的纯函数，可单独使用。`DS.charts.sankeyGroupTotals()` / `sankeySetBaseline()` / `sankeyClearHighlight()` 仍可用，自己搭筛选 UI 时调用。

**全屏：有，缩放：没有。** `create()` 给桑基图挂的工具条只有 ⛶ 全屏按钮（没有 −/+/⟲ 和滚轮提示——缩放对桑基没意义）。进出全屏同步 `chart.resize()`；全屏用的是同一个实例套 CSS（`.ds-chart-fullscreen`），所以高亮状态与筛选勾选都原样保留；全屏中触发销毁重建，`destroy()` 会清掉全屏 class，不会留下盖住视口的空白面板。

**每一列都铺满绘图区的纵向高度（`dsSankeyFill` 插件，所有桑基图自动生效）。** chartjs-chart-sankey 给每列节点之间留同样的固定间距，y 轴比例按"节点总高 + 间距"最大的那一列定，节点少的列会提前结束、下方留一大片空白。库在控制器 `update()` 之前（`beforeDatasetUpdate`）按列重排节点的 y：首节点贴顶、末节点贴底，多出的空间均匀分进节点间距；**节点高度（代表流量）不变，只调间距**。流向两端的 y 是插件解析数据时一次性算好并缓存在 `_parsed` 里的，所以同步重写了 `_parsed[i].y` 与 `_custom.y`，流向端点跟着节点走。重排只看数据空间（0..最大列底）、每次从当前 y 重新分配，幂等，所以点击高亮、筛选重建、全屏进出（画布变高后坐标轴整体拉伸）后依然铺满；多层图每一列各自铺满。**只有 1 个节点的列无法"首贴顶、末贴底"，取垂直居中。** 不依赖 `requestAnimationFrame`。

**不要指望它能缩放，也不要给它挂缩放工具条。** chartjs-chart-sankey 的 x/y 是插件自己注册的内部数值轴（`bounds: 'data'`、`display: false`），纯粹用来算布局，不是开发者可配置/可缩放的笛卡尔轴——`DS.charts` 把 `'sankey'` 并入了 `NON_CARTESIAN_TYPES` 黑名单，`create()` 不会给它挂 `$ds` 缩放状态，`paint()` 也不会往它的轴上注入网格/刻度主题色，跟 pie/doughnut/radar/polarArea 是同一个处理方式；唯一挂的是仅含 ⛶ 的全屏工具条（上一轮曾把全屏判为"不适用"，那是错的）。点击高亮用的是单独一条 `click` 监听器（和缩放工具条完全独立）。

### 瀑布图（增减项累计）

```js
DS.charts.waterfall(canvas, [
  { label: '上月工作量', value: 1200, type: 'total' },   // 起始柱：基线 1200，画 0 → 1200
  { label: '新增项目', value: 320 },                      // 增加：1200 → 1520
  { label: '停用项目', value: -150 },                     // 减少：1520 → 1370
  { label: '小计', type: 'total' },                       // 中间小计：取当前累计 1370，画 0 → 1370
  { label: '设备停机', value: -90 },
  { label: '本月工作量', type: 'total' },                 // 期末合计
], { valueTitle: '工作量' });
```

- **实现**：Chart.js 原生悬浮柱（`bar` 的 `data` 写成 `[start, end]`），不引入任何插件；一个数据集，逐柱配色。**累计由库算**（`DS.charts.waterfallData`）。`value` 为 0 的增减项算“增加”；`value` 不是有限数的增减项被忽略。
- **配色**（全部走 token，每次 `paint()`/主题切换重读）：增加 `--color-success`、减少 `--color-danger`、合计 `--color-primary`，**直接用这三个基色实心填充**。理由：`tokens.css` 头部明确这三个基色的用途就是“填充/边框/图表”，`-tint` 是浅底、`-ink` 是文字色，拿来填柱子对比度不够；深色主题里这三个基色本身就换成了更亮的版本，实心柱仍然清楚。
- **连接线**：相邻两柱之间一条 1px 细线，颜色 `--chart-axis`，水平（横向图是垂直）从前一柱连到后一柱，位置 = 前一柱的累计值（后一柱是增减项时正好是它的起点，是合计柱时正好是它的顶）。`connector:false` 关闭。
- **悬浮框**：增减项 `本项 +320`/`本项 −150`（真减号 U+2212）+ `累计 1,520`；合计柱 `合计 1,280`。数字千分位（固定 `en-US`）；数值轴刻度同样千分位、负数用真减号。
- **方向**：默认纵向，`indexAxis:'y'` 横向；类目轴沿用库里的长标签截断；缩放按类目轴单向（与柱状图一致），工具条/全屏/主题切换/数量级切换都和其它图表一样。
- 内部实现：`config.$dsPainters`（函数数组 `(themeColors, config)`）是 `paint()` 的组件级配色钩子，数据集上标 `$dsOwned:true` 就不走通用着色；瀑布图/箱线图都靠它在每次主题切换时重算颜色。

### 箱线图（分布）

```js
DS.charts.boxplot(canvas, [
  { label: '一号仪器', values: [52.1, 55.3, 54.8, /* … 原始样本 … */] },
  { label: '二号仪器', values: [/* … */] },
], { valueTitle: '处理时长（分钟）' });
// 也可以直接给已算好的五数概括：{ label, stats: { min, q1, median, q3, max, n?, outliers? } }（min/max 即须线两端）
```

**统计规则**（`DS.charts.boxStats(values)`，纯函数，可单独用或单测）：

- **Q1 / 中位数 / Q3**：**线性插值分位数**。把 n 个数升序排好，`h = (n−1)·p`（p = 0.25 / 0.5 / 0.75），取 `x[⌊h⌋]` 与 `x[⌈h⌉]` 按小数部分线性插值。这就是 R 的 `quantile(type=7)`、NumPy 的默认 `linear`、Excel 的 `QUARTILE.INC` / `PERCENTILE.INC`（Python `statistics.quantiles(method='inclusive')`）。例：`[1..10, 30]`（n=11）的 Q1 = 3.5、中位数 = 6、Q3 = 8.5。n = 1 时三个都等于该值。
- **须线**：延伸到 `[Q1 − 1.5·IQR, Q3 + 1.5·IQR]`（IQR = Q3 − Q1）范围内的**最远的实际数据点**（不是围栏本身）；围栏**含边界**——恰好落在围栏上的点算须线内。
- **离群点**：围栏之外的点，画成小圆点；`IQR = 0` 时围栏塌成一点，所有不等于它的点都是离群点。
- 非有限数值（`NaN`/`null`/非数字字符串）被忽略；一组一个有效数值也没有就整组丢弃（不占类目位）；全部丢光返回 `null` 走空态。

**实现**（全在 Chart.js 里，没有手写 SVG、没有外部插件）：

- 箱体 = `bar` 数据集的悬浮柱 `[Q1, Q3]`；**离群点 = 一个真实的 `scatter` 数据集**（位置由 Chart.js 布局，命中/缩放裁剪/悬浮都是原生的，所以悬浮框能直接给出“该点的值”；类目轴上的点必须用**类目名**定位——category scale 把数字当“标签文字”解析，直接写下标会错位）；中位线、上下须线与端帽由库内插件在 `afterDatasetsDraw` 画（它们不是数据点，Chart.js 没有对应元素），位置全部由 scale 换算、每次绘制现读 token。
- 交互用本库注册的 Chart.js 交互模式 `dsBoxplot`（`Chart.Interaction.modes.dsBoxplot`）：指针压在离群点上（点半径 + 4px）→ 只命中该点；否则 → 命中指针所在类目的箱体（整列都响应，须线上也出悬浮框）。不用 `index` 模式是因为箱体与离群点两个数据集的下标含义不同，会串台。
- **配色**：按类目着色，取 `--chart-s1…s10` 循环；箱体填充是类目色的 0.35 透明（`rgba`），描边不透明；须线与端帽用类目色，**中位线用文本色 `--color-text`**（箱体填充与描边同色，同色的中位线会被吃掉；文本色在深浅主题都清楚）；离群点实心取类目色。无图例。
- **悬浮框**（箱体）：`最大值（须线上端）` / `Q3` / `中位数` / `Q1` / `最小值（须线下端）` / `样本数` / `离群点个数`；（离群点）`离群点 <值>`，标题是所属类目。数字千分位、最多 2 位小数、负数用真减号。
- **量程**：须线两端与离群点不是 `bar` 的数据，库用 `suggestedMin/Max` 把它们纳进数值轴；数值轴不强制从 0 起（`beginAtZero:false`，两侧留 6% grace）。
- 默认纵向，`indexAxis:'y'` 横向；缩放按类目轴单向；工具条/全屏/主题切换/数量级切换同其它图表。`DS.charts.boxplotData(groups)` 返回 `{labels, stats}`（`$dsOwned` 数据集 + `$dsPainters` 钩子的用法见上节瀑布图末条）。

### 甘特图（DS.svg.gantt，2026-10-23 重做）

```js
DS.svg.gantt(host, [
  { label: '产线A', bars: [
    { start: 370, end: 470, value: 100, label: '第 1 段', breakdown: { 'A类': 12, 'B类': 6 } },
    { start: 1300, end: 1500, value: 200, flags: { overflow: true } }      // 21:40 → 01:00⁺¹
  ] },
  { label: '工位-06', lanes: 6, bars: [{ start: 430, end: 500, lane: 0 }, { start: 455, end: 535, lane: 1 }] }
], {
  window: { start: 360, end: 1620 },               // 06:00 → 次日 03:00；缺省 = 数据范围向外取整点
  unit: '件',                                       // 数量单位（条内与悬浮框）
  colorScale: { field: 'value', thresholds: [60, 90, 120, 150, 180, 240], unit: '分' },
  markers: [{ time: 370, label: '首个开始', style: 'dashed', color: 'var(--color-primary-ink)' },
            { time: 1140, label: '截止', style: 'solid' }],
  details: { title: '明细' }                        // 可折叠明细表；省略 = 不要
});
```

- **数据**：时间单位分钟（当日 00:00 起，`>1440` 即次日）。数量 = `count`，缺省取 `breakdown` 合计；`breakdown` 可写 `{名称: 数量}` / `[{name, count}]` / `[[名称, 数量]]`，悬浮框里按数量降序列成 `A类×12, B类×6`。`label` 是这一段的名称（悬浮框标题、图例成员、明细表），缺省 = `行名 + 开始时刻`。
- **opts**：`window`、`unit`、`colorScale:{field, thresholds, colors?, labels?, unit?}`（`field` 取条上的字段名，`'duration'` = 结束−开始；`colors` 只接受 token 写法 `'var(--x)'`/`'--x'`，缺省用 `themeColors().seriesExt`）、`markers:[{time, label, style:'dashed'|'solid'|'dotted', color?, priority?}]`、`legend`（默认 `true`）、`tooltip(bar, row, ctx)`（返回字符串或行数组，覆盖默认三行）、`emptyText`、`details`（`true` / `{title}`）、`animate`（默认 `true`）、`labelTitle`（左上角行标签列的标题）、`flagLabels`/`flagNotes`（状态名称与图例说明）。着色优先级：数值分档 > `category`（按出现顺序取十色）> `series`（最简调用 `{label, bars:[{start, end, series}]}` 仍然可用，`label` 可以是 getter）。
- **布局**：行标签列 120px（右对齐、等宽 11px、按列宽截断 + `title` 全称，横向滚动时 **sticky**）；绘图区宽 = `max(700, 宿主宽 − 2 − 120)`，宿主更窄就横向滚动。行高 36，条 `top 7 / 高 24 / 圆角 4`，最小条宽 8px；末行无底边。轴高 = `30 + 标记线标签行数 × 22`；**整点刻度**（相邻刻度不足 44px 时步长放大到 2/3/4/6/12/24 小时），刻度数字 10px 等宽贴轴底、surface 底色，两端的数字往里收。超出时间窗的条夹到右缘、条内与悬浮框都加 `▶`。
- **多槽道**（`row.lanes`）：行高 = 槽数 × 槽高 + 6，槽高 ≤6 槽 7px / ≤12 槽 5px / ≤20 槽 4px / 更多 3px；条 `top = lane × 槽高 + 3`、高 = 槽高 − 1，不写字，悬停 `scale(1.05)`。
- **条内文字**：`[状态图标]{数量}{单位}<small>{时长}</small>`（600 10px 等宽，`small` .85em/500，时长写 `2h28m`）；窄于 28px 的条不写字。**字色按底色自动取黑/白**（`--gantt-ink-dark/-light`，取对比度更高的一个；纯黑/纯白保证至少 4.58:1）。状态图标是内联 SVG（溢出 = 月牙、额外 = 时钟），带 `--gantt-icon-halo` 投影。
- **标记线**：窗外的不出现；标签文字 `名称 HH:MM`。避让规则（`DS.svg.ganttLayoutMarkers`）：标签宽度 = 字符估算（汉字 7.2 / 其它 5.6，+26，夹在 [50,130]）与实测文字宽取大；只有一侧放得进绘图区就放那侧；两侧都行时看线左右 100px 内已放下的标签数，放到少的一侧，一样多就放空间大的一侧；同一行碰撞（间距 < 4px）先本行翻边，翻不了才下移一行；最多 5 行（0–4），之后强制叠在第 4 行。优先级 = 传入顺序（建议：结果类在前、约束其次、理论值最后），给了 `priority` 时按其升序。药丸 `top = 2 + 行 × 22`、高 20、1px `currentColor` 边、surface 底 + 2px surface 光环，层级高于所有线。**竖线只从自己的标签下方开始（`2 + 行 × 22 + 24`），一直贯穿到最后一个资源行的底部。** 刻度距任一标记线 < 10px 时只删数字、保留刻度线；最后一行标签底到刻度数字顶 ≥ 12px。
- **悬浮框**：一个共享的 `.ds-gantt-tip`，**挂 `document.body`**（`position:fixed`、`pointer-events:none`、`max-width:260px`、`z-index:9999`），位置 = 鼠标 `+14`，`left` 夹到 `innerWidth − 260`；三行：`名称 · 数量 · 时长` / `开始 → 结束 [状态] [· 槽道 N] [▶]` / 构成（没有构成时写行名）。`mouseleave` 隐藏；任意 `scroll`/`wheel`（capture 阶段，含内部滚动容器）**立即**隐藏。显隐直接改 `opacity`，不带过渡（隐藏要"立即"，显示后马上读 `opacity` 也是 1）。
- **图例**：每个颜色档一个 chip（11×11、圆角 3），悬浮列出该档成员（最多 30 个，超出写「…还有 N 个」，空档写「此区间内无项目」）；数据里出现过的状态各一个 chip；**每条标记线一个 chip**（线型 + 颜色 + 名称）。
- **明细表**：`<details data-gantt-details>`（默认收起，展开状态跨主题重画保留），内为 `.ds-table`，每段一行，挂 `DS.tables.sortable`。
- **入场动画**：只在第一次"真正可见"的绘制播放（隐藏面板里按 640 兜底宽度画的、主题切换/`redrawIn` 的重画都不播）：320ms、`opacity 0 → 1` + `clip-path` 从左展开；`prefers-reduced-motion` 下关闭。纯 CSS，无 `requestAnimationFrame`。
- **DOM 契约**（测试/二次开发按它定位，不绑定实现技术）：资源行 `[data-gantt-row="i"]`、行标签 `[data-gantt-label]`；任务条 `[data-gantt-bar]` 带 `data-start/data-end/data-row/data-lane?/data-band?/data-truncated?`，状态图标 `.ds-gantt-icon[data-flag]`；标记线 `[data-gantt-marker]` 带 `data-row/data-anchor/data-time`，标签 `[data-gantt-marker-label]`、竖线 `[data-gantt-marker-line]`；刻度 `[data-gantt-tick][data-time]`、数字 `[data-gantt-tick-text]`（被抑制时不存在）；图例 `[data-gantt-legend]` 内 `[data-gantt-legend-item][data-kind=band|flag|marker]`；空态 `.ds-gantt-empty`；根元素 `[data-gantt][data-gantt-width]`（绘制时取样的宿主宽度）。

### 气泡图（量 × 平均值）

```js
DS.charts.bubble(canvas, [{ name: '项目01', count: 2250, value: 96.6 }, /* ... */], {
  xTitle: '样本数', yTitle: '平均时长（分钟）',
  countUnit: '片', valueUnit: '分钟平均',      // 悬浮框：项目01: 2,250 片, 96.6 分钟平均
});
```

用途：一个条目一个气泡，x = 数量、y = 平均值，一眼看出"哪些条目量大且耗时长"（右上）。行为都在库里，调用方只给数据和文案：

- **数据**：过滤 `count < 5`（`minCount`）、按数量降序取前 50（`topN`）；**半径 `r = max(5, sqrt(count/最大count) × 35)`——面积与数量成正比，不是半径成正比**。
- **配色**：色相随数量排名渐进（`DS.charts.rampColors`：第 i 名色相 `i*360/n`，S/L 读 `--chart-ramp-s/-l`），相邻排名颜色相近、整体沿色轮连续；填充 0.7 透明、描边同色不透明 1.5px，与参照实现一致。
- **无图例**；**悬浮框** `名称: N 片, X.X 分钟平均`（数量千分位，平均值 1 位小数，单位可配）；悬浮要鼠标真压在圆上（`intersect:true`），圆之间的空白不弹框。
- **标签**：只有 `x > 最大 x 的 15%` 的大气泡标名字，超过 12 字符截断加 `..`（恰好 12 字不截）；居中、10px、500 字重，**不描边、不发光**（与参照一致）。标签画在气泡里，真正的背景是“气泡填充（0.7）与卡片底合成后的颜色”：在 `--chart-label-ink-dark` / `--chart-label-ink-light` 两个 token 里选对比度更高者（浅色主题实际总是深字 `#1e293b`，深色主题的深字取更深的 `#09090b`，50 个色相上对比度最差 4.60）。**标签避让（对参照实现的有意改进）**：参照实现只按 15% 阈值筛，头部密集处标签两两叠成一片；这里在阈值和截断之上再过滤——候选标签按数量降序依次尝试，包围盒（文字宽 + 字号高 + 2px 内边距）与已画出的任何标签相交就跳过，冲突时留下数量更大的；被跳过的气泡仍可悬停看名字。只在标签之间避让，不管压在别的气泡上（没有描边，重叠处更难读，所以避让更有必要）；视野外的气泡不参与；每次绘制重算，缩放/全屏/换主题后自动更新（放大后散开，原来被跳过的会出现）。用库内小插件（`afterDatasetsDraw`）画，不引入 `chartjs-plugin-datalabels`；实际画出的标签记在 `chart.$dsBubbleLabels`。
- **两轴**都有标题、都从 0 开始；**缩放**用 xy 矩形框选（下节）；工具条带「表格」按钮（再下节）。
- 也可以直接 `DS.charts.create(canvas, {type:'bubble', data:{datasets:[{data:[{x,y,r,name,count}]}]}, options:{dsBubble:{countUnit,valueUnit}}})`，颜色/标签/悬浮框/无图例/xy 缩放同样自动生效（半径由调用方自己给 `r`，`bubbleData` 可帮忙算）。

### xy 框选缩放（散点、气泡）

类目轴图（柱/折线/面积…）的拖框选仍是单方向（沿类目轴）。**无类目的笛卡尔图**（`scatter`、`bubble`，或给 `options.dsZoom:'xy'`）改为**矩形框选，横纵两个方向同时放大**：

- 拖一个矩形（任意方向起拖；拖出绘图区算到边缘）→ 两根轴同时收窄到该矩形；拖拽中有半透明 `--color-primary` 矩形反馈（填充 0.12、描边 0.6），松手/取消后擦掉。
- 误触过滤：任一方向小于 6px 或小于满量程 1%（含"只在一个方向够宽的细线"）整体忽略，不会只缩一个轴。
- 工具条 `+`/`−` 两个方向等比缩放，`⟲` 两轴都复位（调用方钉死的 `min`/`max` 会还回去，不是一律清掉）；四种滚轮模式照常作用于两个方向。
- **平移**：按住 Shift 拖动（或 `DS.charts.panBy`），只动已缩放的轴，窗口宽度不变、钳在数据域内。
- 内部状态：`chart.$ds.xy === true`；主轴状态在 `$ds.min/max`，第二根轴在 `$ds.sec`；两根轴共用同一套 `_bounds/_viewRange/_apply`。测试可以不经任何原生/rAF 事件直接驱动 `DS.charts._dragBegin/_dragMove/_dragEnd(chart, x, y)`（图表坐标，画布 CSS 像素）。

### 图表数据表弹窗（通用）

任何图表都能挂一个「表格」按钮，点开弹窗看底层数据：

```js
DS.charts.create(canvas, {
  type: 'bar', data: {/* ... */},
  dsTable: {
    title: '月度批次',
    columns: [{ key: 'month', label: '月份' },
              { key: 'n', label: '批次', num: true, format: function (v) { return v.toLocaleString('en-US'); } }],
    rows: function () { return currentRows; },   // 数组或函数，每次打开时取最新
    // search: { key: 'month', placeholder: '搜索…' }  默认按第一列；false = 不要搜索框
    // index: false                                   去掉最左的 # 列
  }
});   // 或事后 DS.charts.attachTable(chart, spec)
```

- 复用 `DS.modal`（遮罩/× /Esc 关闭）与 `DS.tables.sortable`；`num:true` 的列是 `th.num`/`td.num`（右对齐）且**首次点表头降序**（`data-sort-first="desc"`），文本列首次升序，再点切换方向。
- 搜索框按指定列做**不区分大小写的子串**过滤，与排序可叠加；`#` 列是当前可见行的序号（排序/过滤后重编）；无匹配显示「无匹配结果」。**每次打开都重建，搜索框与排序状态清空**（参照实现里"重开只清输入框、表格仍停在上次的过滤结果"是个小毛病，这里没有照搬）。
- **全屏下也能打开**：`.ds-modal-backdrop` 的 `z-index` 从 100 提到 160（全屏图表是 150，toast 是 200）。
- 单元格内容一律转义。按钮是内联 SVG（不用 unicode 符号，缺字形会变豆腐块）。

### `paint()` 接管 / 尊重的字段一览

`DS.charts.paint(config)` 在 `create()` 和每次主题切换触发的 `retheme()` 时都会重新跑一遍，把当前主题的颜色/布局惯例写进传入的 Chart.js config。哪些字段会被它接管、哪些会尊重调用方自己的配置，历史上多次因为没写清楚而被复审反复挖出同类问题（额外轴网格默认值、类目轴 `ticks.callback`），这里一次性列清楚：

**始终接管**（每次 `paint()`/`retheme()` 都会覆盖成当前主题值，调用方设了也没用）：

| 字段 | 覆盖成什么 |
|---|---|
| `options.animation` | 强制 `false`（见「技术陷阱」#11） |
| `options.maintainAspectRatio` | 强制 `false`——传 `aspectRatio` 之类期待它生效的配置是死配置，不会报错也不会提示 |
| `options.plugins.legend.labels.color` | 当前主题的文字色 |
| 每根坐标轴的 `grid.color`、`ticks.color`、`border.color`（笛卡尔图的 `x`/`y`/额外轴）或 `grid.color`/`angleLines.color`/`pointLabels.color`/`ticks.color`（radar/polarArea 的 `r` 轴） | 当前主题色 |
| `scales.r.ticks.backdropColor`（radar/polarArea） | 强制 `'transparent'`，关掉 Chart.js 默认的半透明白底 |
| `dataset.backgroundColor`/`borderColor`——仅当这一侧是库自动赋值的（内部用 `__dsAutoBg`/`__dsAutoBorder` 标记，调用方没有自己提供初始值） | 当前主题的序列色（面积图 fill 数据集的 `backgroundColor` 是半透明版本） |
| 气泡图（`type:'bubble'`）`dataset.backgroundColor`/`borderColor`/`borderWidth`——前两项仅当这一侧是库自动赋值的（`__dsAutoBg`/`__dsAutoBorder`），`borderWidth` 仅当调用方没给 | 每个气泡一个颜色：`DS.charts.rampColors(n)` 色相渐进；`backgroundColor` 是 0.7 透明版本（数组），`borderColor` 同色不透明（数组），`borderWidth` 1.5；另外：`options.plugins.legend.display`（未显式给时）= `false`，`tooltip.callbacks.label`（没写时，带 `__dsAuto` 标记）= `名称: N{countUnit}, X.X{valueUnit}` |
| 按类目着色（`dataset.dsColorBy:'category'`，或 `config.dsColorBy:'category'` 作为所有数据集的默认；数据集上的优先）的单个柱状数据集 `backgroundColor`/`borderColor`——两侧各自仅当是库自动赋值的（`__dsAutoBg`/`__dsAutoBorder`，调用方显式给了的一侧原样保留，字符串或数组都不动） | 每根柱子一个颜色：第 i 根取 `--chart-s{i%10+1}`（s1…s10 循环），描边同色，换主题跟着变；`legend.display` 没配时默认关（图例只会拿第一个颜色代表整个数据集，会误导）。**只对「整张图只有一个数据集」的柱状/条形图（含 `indexAxis:'y'`）生效**——多系列柱状图的颜色是系列身份、靠图例区分，标志被忽略；非 bar 类型也忽略。**什么时候开：柱子代表不同对象（不同项目/仪器/星期几）就开；柱子是同一指标随时间的值（按月、按周）就别开，用单色**（参照实现的规则）。默认关。 |
| 桑基图 `dataset.colorFrom`/`colorTo`/`color`/`borderColor`——仅当这一项是库自动赋值的（`__dsAutoColorFrom`/`__dsAutoColorTo`/`__dsAutoColor`/`__dsAutoBorder` 标记） | `colorFrom`/`colorTo` 按节点分配的十色扩展序列色（scriptable 函数；高亮时整条流向全亮/全灰）；`color`（标签文字）是当前主题的 `--color-text`；`borderColor`（节点描边）是当前主题的 `--color-surface` |

**只在调用方没配置时才补默认值**（"没传才补"，配置了就原样尊重）：

| 字段 | 默认值 |
|---|---|
| `options.interaction` | `{ mode: 'index', intersect: false }` |
| `options.plugins.tooltip.mode`/`intersect` | `'index'` / `false`（`bubble` 类型例外：`interaction` 与此处都是 `'nearest'` + `intersect:true`——只在鼠标真压住圆时弹框；`scatter` 类型例外：`interaction` 与此处都默认 `'nearest'`——多系列散点各系列的点没有"同一下标=同一位置"的对应，index 模式会把不同系列里下标相同的无关点凑进同一个悬浮框；nearest 只出最近的一个点，内容首行带系列名） |
| `options.plugins.tooltip.callbacks.title` | 仅当某根轴的 `ticks.callback` 来自 `DS.charts.dateTicks()` 时才注入：标题=该点日期（格式同刻度）+（周几）。调用方自己写了 title 回调就原样保留，包括 retheme 之后；只有带内部 `__dsAutoTitle` 标记的（上一轮 `paint()` 自己注入的）才会被重新注入。多系列折线用默认 `index` 模式时，悬浮框按**数组下标**对齐各系列——linear 轴上各系列必须是同一组日期、同样长度，否则同一个悬浮框里会混进不同天的值（demo 的三条线共用同一组 92 个时间戳）。 |
| 额外轴（非 `x`/`y`）的 `grid.drawOnChartArea` | `false` |
| 类目轴的 `ticks.callback` | 超长标签截断逻辑 |
| `dataset.backgroundColor`/`borderColor`——调用方显式提供了初始值的那一侧 | 保留调用方的值，不管之后 retheme 多少次 |

**不是字段级覆盖，而是 `paint()`/`create()` 的其他隐性行为**（决定的是"要不要做某件事"，不是"把某个字段覆盖成什么值"，但同样容易被忽略，一并摊开）：

| 行为 | 触发条件 |
|---|---|
| 要不要在 `options.scales` 里创建某个 scale key（典型是 `x`/`y` 这两根"主轴"） | 只有类目轴（`zoomAxisFor()` 判定出的那一个）和被某个 dataset 的 `xAxisID`/`yAxisID` 显式引用过的轴才会被创建；调用方自己在 `options.scales` 里声明过的轴，不管有没有 dataset 引用，也会保留。不满足这两个条件就不创建——否则会出现「幽灵轴」：Chart.js 一旦在 `options.scales` 里看到某个 key，哪怕没有数据集真正用它，也会把它当成一根真实坐标轴实例化并绘制，量程退化成默认的 `0..1`。见「技术陷阱」#20。 |
| 要不要给 `options.layout.padding.top` 注入 `30`（给悬浮工具条让出顶部空间） | **不在 `paint()`/`retheme()` 里做**，是 `create()`（`new Chart()` 和 `_mountToolbar()` 都跑完之后）做一次一次性后验校正（内部方法 `DS.charts._fitToolbarLegend()`）：容器高度低于 150px（compact 规格 90px 必在其中）直接豁免；图例不存在/被关闭/不在顶部也豁免；都不豁免的话，再用图例的逐项命中框（`legend.legendHitBoxes`）和工具条 DOM 的真实包围盒做矩形相交判断，真的会被压住才注入，不会被压住就不注入——单项图例、或图例虽多项但当前画布够宽、水平方向够不到工具条所在的角落，都不会被加这段留白。调用方自己配置过 `layout.padding.top` 的话优先尊重，永远不会被这段逻辑覆盖。`create()` 还把 `chart.resize` 包了一层，之后任何一次 `resize()`——本库全屏按钮触发的、调用方自己手动调的，还是 Chart.js 内置 `ResizeObserver` 在容器尺寸变化（包括从隐藏标签页变可见）时自动触发的——都会顺带重新判一次，大多数场景不需要调用方知道 `_fitToolbarLegend` 这个方法的存在。唯一仍需调用方手动补调 `chart.resize()` 的，是本仓库这种不支持 `ResizeObserver` 依赖的 `requestAnimationFrame` 的特殊测试环境（headless chromium 的 `--virtual-time-budget` 模式）——这是这类环境本身的已知限制，`demo.js` 的 selftest 套件已经对受影响的图表手动补了 `resize()`，可以直接参考。见「技术陷阱」#23 和 `src/charts.js` 里 `TOOLBAR_TOP_RESERVE` 定义处的完整说明。 |

**完全不碰**：各轴的 `min`/`max`/`stacked`/`position`/`title` 等除上表列出的子属性之外的任何配置、`options.plugins.tooltip.callbacks`（除上表的日期轴 `title` 默认值和桑基 `label` 默认值外）、`options.plugins.title` 等其余插件配置、`dataset.fill`/`tension`/`type`/`xAxisID`/`yAxisID`/`borderDash` 等除颜色外的任何数据集属性——调用方想怎么配就怎么配。

## 决策记录（勿重复提议）

以下结论都是开发过程中花代价换来的，重新提议前请先确认不会重蹈覆辙。

### 交互决策

1. **滚轮 `smart` 模式不做默认。** 同一次滚轮动作有时触发缩放、有时触发翻页，取决于当前是否已到缩放极限——用户感知上就是"页面抽风"，行为不可预期。保留为可选模式，不设为出厂默认。
2. **`ctrl-zoom`（默认模式）旁边那行 `Ctrl+滚轮缩放` 灰字提示不可移除。** 这个模式下，普通滚轮是翻页，只有按住 Ctrl 才会缩放——这个操作本身没有任何视觉线索，用户不会自己发现。这行提示是该模式唯一的可发现性补偿，删掉等于让缩放功能对用户隐形。
3. **主题记忆（深浅色选择存 `localStorage`）是固定行为，不做成配置项。** 不需要每个接入项目都决定一遍"要不要记住"。`localStorage` 不可用时（隐私模式、`file://`、企业策略禁用等）必须静默降级为"本次会话内有效但不持久化"，不得抛错导致白屏。
4. **缩放工具条只挂笛卡尔图**（折线/柱状/面积/散点等有 x/y 轴范围的图），不挂 pie / doughnut / polarArea / radar。这几类图没有可缩放的"轴范围"，挂上去的工具条点了也没有效果，纯粹是噪音。
4a. **桑基图的高亮用点击，不用悬停。** 曾经按"鼠标悬停高亮"的直觉实现过一版，但真实的参照实现（另一个内联了 chartjs-chart-sankey 的生产项目）用的其实是点击：点一下选中，再点一下同一个取消，点别处/点空白回落到筛选基线。悬停在触屏设备上没有对应交互、且“划过就消失”的高亮在多步骤排查（比如顺着一条流向的多跳关系看过去）场景下不如点击持久，点击还能跟"筛选基线"自然组合成"点亮一个节点 ↔ 回到当前筛选"这一组双态切换，悬停做不到这一点（鼠标移开那一刻状态就没了，没有"回落到基线"的意义）。
4b. **高亮/淡出的判断按"节点身份"，不按"这一条流向本身"。** 同一个节点通常被多条流向共享，如果淡出判断只看"点击的是不是这条流向"，同一个节点被两条流向触碰、一条该亮一条该暗时，最终画出来是哪个颜色会变成跟 Chart.js 内部重绘顺序绑定的未定义行为（`src/charts.js` 里 `SANKEY_HIGHLIGHT_PLUGIN` 定义处有这个顺序依赖问题的完整说明）。按"这个节点键在不在当前高亮关联集合里"判断，不管哪条流向问起，同一个节点给出的答案永远一致——副作用是同一条流向的两端可能一端亮一端暗（渐变色块），这是"节点身份一致性优先于单条流向视觉对称性"的直接结果，不是 bug。
4c. **淡出色复用 `--chart-grid`，不新增/不混色 token。** 桑基图需要一个"这不是重点"的中性灰，`--chart-grid`（网格线颜色）本来就是深浅两套主题下已经验过的装饰性中性灰，语义上正好对应这个用途，不需要为此新增 token、也不需要运行时做颜色混合运算——后者会引入"色板换成非十六进制格式后怎么降级"这类新坑（参见「技术陷阱」#22），能不碰就不碰。

### 架构决策

5. **不做「复制模板即用、无 build 步骤」。** 曾考虑过让 starter 是一份可以直接打开用的静态 HTML，免去 build 这一步。但复制一份独立 HTML 出去，就等于分叉出一份脱离源头维护的拷贝——本库存在的全部意义就是终结这种各项目各自为政的分叉，所以哪怕多一步 `python3 build.py`，也要强制走统一的内联流程。
6. **常规图表用 Chart.js，不全面改手写 SVG。** 滚轮缩放、crosshair 十字准线、tooltip 这些交互已经在 Chart.js 之上验证过且工作良好，推倒重写成本最高、收益最低。只有 Chart.js 画不出来的图形（甘特图、热力图这类没有对应 chart type 的）才走手写 SVG（`DS.svg.*`）。
7. **状态色是三层结构**：基色（用于填充/边框，对比度门槛 3:1）、`-tint`（徽标底色，浅色打底）、`-ink`（小字文本专用，对比度门槛 4.5:1）。最初想用一个 token 同时当填充色和文本色，但实测发现大色块的 3:1 门槛和小字的 4.5:1 门槛无法用同一个饱和度/亮度的颜色同时满足——调亮了填充色发灰，调暗了文本在深色底上糊成一团。三层拆分是跑过 `test_palette.py` 之后反推出来的结构，不是先验设计。
8. **不引入 Inter / JetBrains Mono 等网络字体。** 这类字体需要从 CDN 或 Google Fonts 加载，直接违反"零外链"的硬约束（产物必须是单文件离线 HTML）。统一使用系统字体栈（`-apple-system, "Segoe UI", ...` 及等宽对应项），牺牲一点字形一致性换取零依赖。

### 技术陷阱（下一个人大概率会重踩，务必读完）

9. **修改 `chart.options` 的正确姿势。** 可以直接对嵌套属性赋值（如 `chart.options.scales.x.min = 0`）。**禁止**把从 Chart.js 的 resolver proxy 读出来的子对象，原样写回它自己所在的 scope（典型错误写法 `o.x = o.x || {}`）——这会抛出 `RangeError`（代理对象的内部循环引用检测触发）。更麻烦的是：如果这段代码挂在 `ds:themechange` 这类自定义事件的监听器里，`dispatchEvent` 会把监听器内部抛出的异常**静默吞掉**，不会冒泡到控制台。表现就是"代码执行了，配置却像没写一样"，没有任何报错线索，排查成本极高。
10. **长标签截断和缩放逻辑都必须认类目轴，不能写死 `x`。** 要通过 `chart.options.indexAxis` 判断当前图的类目轴到底是 x 还是 y——横向条形图（`indexAxis: 'y'`）的类目标签是在 y 轴上的，数值轴才是 x。写死按 x 轴处理，横向条形图上的截断/缩放行为就会全错但不报错。
11. **Chart.js 动画必须双保险关闭：** 全局 `Chart.defaults.animation = false`，并且在绘制函数 `paint()` 内部再强制一次 `options.animation = false`。原因：headless 浏览器环境下 `requestAnimationFrame` 的回调可能永远不会被触发，如果动画没关，首次绘制就会卡在"动画进行中"状态，永远不会触发完成态，导致依赖"绘制完成"的后续逻辑（截图、断言、下一步渲染）全部挂死。
12. **开发与测试代码中不要使用 `requestAnimationFrame`。** 同样是 headless 环境下其回调可能永不触发的问题，需要延迟执行一律改用 `setTimeout`。
13. **额外坐标轴默认不画网格线。** 双轴组合图这类有两个及以上坐标轴的场景，`paint()` 只让 `x`/`y` 这两根主轴保留 Chart.js 自己的网格默认值，`y1` 之类的额外轴默认 `grid.drawOnChartArea = false`——两套网格线叠在一起是纯噪音，不是信息。调用方显式配置过的话尊重调用方的选择。
14. **面积图填充色不能是不透明的序列色。** `fill` 是 Chart.js 任一种"要填充"取值（`true`/`'origin'`/数字索引/非 `'false'` 的字符串/`{target,above,below}` 对象写法，**不要漏判对象写法**——复审实测过漏判会让这种写法下的 `backgroundColor` 还是不透明色，正是这条规则要消灭的问题本身）的 line 数据集，`backgroundColor` 必须是线条色的半透明版本（当前 alpha **0.34**，2026-10-22 按新色板重算后不变，浅色最低 1.343/深色 1.630）。`borderColor` 仍然不透明；没设 `fill` 的数据集（折线/柱状图）不受影响——这个判断按数据集逐个做，不是按图表类型整体做（同一张图里"面积 + 不填充的目标线"是常见组合）。alpha 的论证不要只验一侧主题：复审发现上一版（0.28）把浅/深两套主题的结论写反了——真正的短板始终在**浅色**主题（不是深色），偏亮的分类色（旧色板 `#eab308`，新色板 s5 黄）合成到接近纯白的背景上，对比度天花板本来就不高（哪怕整个色块完全不透明，对纯白的 WCAG 对比度也只有 1.918），alpha 调多高都填不平这个差距，这是色板本身的特性。验证这条规则的断言要遍历**全部**分类序列色取最小对比度，不能只采样其中一条——复审还发现上一版断言只测了 `datasets[0]`（恰好是对比度第二好的那条），对最差的那条颜色完全没有鉴别力。
15. **类目轴的 `ticks.callback` 只能在调用方没提供时才注入默认值。** `paint()` 曾经无条件覆盖类目轴（`zoomAxisFor()` 判定出的那一个）的 `ticks.callback` 来做超长标签截断，调用方自己想要的任何刻度格式化（比如时间轴退化方案 `DS.charts.dateTicks()`）会被每次 `paint()` 原地冲掉而不报错——时间戳会被按"超长字符串"错误截断成一串看不出意义的数字开头。现在改成"没传才补"，这个坑具体细节见「时间轴」一节。
16. **Chart.js 没有带日期适配器，不要尝试联网下载来补。** `'time'`/`'timeseries'` 轴类型需要 `chartjs-adapter-date-fns` 之类的适配器才能工作，裸 Chart.js 不带。本仓库零外链、产物是离线单文件，不允许在 build 时或运行时联网取任何第三方库——日期轴改用 `type: 'linear'` + `DS.charts.dateTicks()` 的数值轴模拟方案，细节和取舍见「时间轴」一节，**不要**为了"更正统"而给这条约束开口子。
17. **百分比堆叠柱状图没有原生 API，不要去 Chart.js 文档里找一个不存在的 `stacked: '100%'` 选项。** 做法是数据预处理：按类目把各数据集归一化成百分比、`y` 轴设 `min:0,max:100`，`tooltip.callbacks.label` 从保留的原始值字段读回真实数字。
18. **色板的任何改动都必须跑 `python3 -m pytest tests/test_palette.py`**，未达 WCAG AA（正文 4.5:1，大字/非文本 UI 3:1）不得入库。分类色（给不同数据系列区分用的颜色，不是状态色）的可辨识度要用 `delta_e`（色彩感知差异）加色觉障碍模拟去判定，**不能只看亮度对比度**（2026-10-22 起图表序列色的规则放宽，以决策 #30 为准）——亮度对比度相近的两个颜色（典型例子：某种蓝和某种紫）人眼依然能轻松区分，只用亮度公式会把明明可辨识的配色误判为不合格，或者反过来放过色觉障碍用户真正分不清的组合。
19. **数据集的 `backgroundColor`/`borderColor` 自动上色，两侧要用各自独立的"是否自动"标志，不能共用一个。** 调用方只给 `borderColor`（折线图最常见的自定义写法之一）、不给 `backgroundColor` 时，背景色分支按"没给"自动上色——如果这一步顺带把一个共享标志置真，边框分支的"是否要重新自动上色"判断只要也挂在这个共享标志上，就会连带命中，把调用方刚设好的 `borderColor` 当场覆盖掉。反过来"只给 `backgroundColor`、不给 `borderColor`"也有一个对称的潜伏 bug：自动上色的那一侧如果没有被单独标记，下次主题切换就不会被重新计算，颜色会冻结在创建时的值上。两侧各用一个独立标志（`__dsAutoBg`/`__dsAutoBorder`），弧形族（pie/doughnut/polarArea）和折线/柱状都要改，这是同一个模式在两处重复出现的 bug。验证这类"自动上色要不要跟着 retheme 更新"的断言时，不能直接拿 retheme 后的值跟当前主题色比较——六条分类序列色深浅主题同值，如果 retheme 根本没碰这个字段，它仍然停在创建时算出来的旧值，而旧值又恰好等于"当前主题"的序列色，直接比较看不出区别；要先把该字段污染成一个哨兵垃圾值，再验证 retheme 后它被正确覆盖回主题色。
20. **额外坐标轴不能无条件创建。** 笛卡尔图的 `x`/`y` 两根"主轴"只有在真的被某个 dataset 引用时才该出现在 `options.scales` 里——如果全部数据集都把 `yAxisID` 指到自定义轴（比如双轴图里只要一根竖轴、全部指向 `y1`），强行 `o.scales.y = o.scales.y || {}` 捏一个空对象出来，Chart.js 会把它当成一根真实坐标轴实例化并绘制：没有数据可读，量程退化成默认的 `0..1`，是一根跟真实数据毫无关系的幽灵轴，而且因为它被当成"主轴"处理，不受额外轴 `grid.drawOnChartArea` 默认规则约束，网格线照样画，比压根没有这根轴更容易误导人。判断"要不要创建"时，类目轴（`zoomAxisFor()` 判定出的那一个）永远例外——它是整张图"索引"维度的载体，不依赖某个 dataset 显式指定轴 ID；调用方自己在 `options.scales` 里显式声明过的轴，不管有没有 dataset 引用，也要保留，不能被这条规则反过来删掉。
21. **雷达图 / 极区图的 `r` 轴不能被当成"没有坐标轴"而整个跳过主题注入。** pie/doughnut 确实没有任何坐标轴，但 radar 和 polarArea 共用 `RadialLinearScale`（默认轴名 `r`），同样需要把网格、角线、刻度文字、刻度颜色都换成主题色——不注入的话深色主题下这些元素会停留在 Chart.js 的默认浅色值，刻度数字背后还会带一块默认的半透明白底，在深色背景上非常突兀，需要显式关掉。polarArea 比较容易被漏掉：它同时属于"弧形族"（数据集按扇区数组着色），实现时容易默认"弧形族都不需要坐标轴注入"，但它的坐标轴注入和数据集着色是两条独立要走的路径，不能因为走了其中一条就把另一条也跳过。
22. **色板里非十六进制格式的 CSS 变量必须有降级路径，不能静默产出非法颜色值。** 把十六进制颜色转成 `rgba(...)` 实现半透明填充这类场景，必须先校验解析出的数值分量不是 `NaN`——色板 token 一旦换成 `rgb()`/`hsl()`/颜色关键字这类非十六进制格式（README 本身就鼓励使用者替换整套色板），字符串解析会失败但不抛错，产出一条带 `NaN` 的非法 `rgba()` 字符串，浏览器判定整条 CSS 属性无效、对应的填充直接画不出来，且控制台没有任何报错或警告，复现和排查成本都很高。退化方案：解析失败就放弃转换、原样使用调用方给的颜色字符串（填充退化成不透明色块，牺牲的是次要的视觉效果，不是整块图形消失）。
23. **多数据集图表的图例可能被悬浮工具条压住，但留白必须按需注入，不能无条件给所有图表都加。** 图表的缩放工具条用 `position: absolute` 悬浮在宿主右上角，Chart.js 默认把图例画在画布最顶上——数据集一多、图例换行或变宽，最右边的条目可能被工具条压住看不全（复审实测：三项图例的堆叠柱状图，第三项"设备C"被压得只剩"设备"二字）。**这条规则第一版的实现本身就是一次"修 bug 引入新隐患"的教训**：当时图省事，让 `paint()` 对所有笛卡尔图无条件注入 `layout.padding.top = 30`——确实堵住了压字的问题，但代价是所有图表（包括图例只有 1 项、根本不可能伸到工具条角落的图表）都要白白损失这 30px 绘图区，`.ds-chart-host--compact`（components.css 里正式支持的 90px 矮宿主规格）配上真实数据时绘图区直接被压到 1.6px，图表事实上不可用——compact 的唯一既有用例（空数据态）走的是空数据早退分支，`paint()` 根本没跑到，这个破损一直没被测出来。
    正确的做法是按需留白：容器矮于一个阈值（150px，compact 规格 90px 必在其中）直接豁免；图例不在顶部/被关闭也豁免；都不豁免的话，用图例的逐项命中框（`chart.legend.legendHitBoxes`，Chart.js 4.4.0 下渲染后即可读，和 `chart.width`/`canvas.width` 同一坐标系）和工具条 DOM 的真实包围盒（`getBoundingClientRect()`，工具条宽度随滚轮模式提示文案变化，不能用固定估值）做矩形相交判断，真的会被压住才注入 `layout.padding.top`，不重叠就不注入。这段判断不能放在 `paint()`/`retheme()` 里做——图例和工具条都要等 `new Chart()` 和 `_mountToolbar()` 跑完之后才有真实几何可读，`paint()` 执行的时候两者都还不存在——改成 `create()` 里跑完这两步之后做一次一次性后验校正（`DS.charts._fitToolbarLegend()`）。
    容器后续被缩放/图例因为换行而变化怎么办？`create()` 额外把 `chart.resize` 实例级地包了一层，之后任何一次 `resize()`——全屏按钮触发的、调用方自己手动调的，还是 Chart.js 内置 `ResizeObserver` 在容器尺寸变化（包括从隐藏标签页变可见）时自动触发的——都会在 resize 完成后顺带重新判一次。已实测验证：用真实的 `--headless=new`（不是冻结渲染循环的 `--virtual-time-budget` 模式）加载 demo 页，只做标签页切换、不手动调任何 `resize()`，三项图例的堆叠柱状图依然正确避开了工具条，说明 `ResizeObserver` 确实会调用到这层包装，绝大多数真实使用场景不需要调用方知道 `_fitToolbarLegend` 这个方法的存在。唯一仍需调用方手动补调 `chart.resize()`（从而连带触发这次重判）的，是本仓库这种本身就不支持 `ResizeObserver` 依赖的 `requestAnimationFrame` 的特殊测试环境——这是这类环境本来就有的已知限制，不是这次改动新引入的，`demo.js` 的 selftest 套件已经对受影响的图表手动补了 `resize()`。只包 `resize` 不包 `update`：`_fitToolbarLegend()` 自己需要调整时只调用 `chart.update()`，不会递归触发这层包装。
    这里还有一个容易踩的反直觉细节：判断"是否重叠"时，图例命中框的纵坐标必须先减去"当前已经由我们自己注入的留白量"再比较，不能直接拿命中框的当前坐标判断——留白一旦生效，图例会被推到工具条纵向范围以下，这时候如果不做这个还原，会读到"现在不重叠了"，反而把刚加上的留白当成不需要而撤销掉，形成"加留白→查出不重叠→撤销→又重叠"的判定来回（这是在尝试过用 Chart.js 插件的 `afterLayout` 钩子全局接管"每次布局都重判"时实测发现的——`afterLayout` 每次布局都触发，频率比"只在 resize 时重判"高得多，更容易暴露这条反馈环；改成归一化判断之后，不管挂在哪个触发时机上都不会再来回震荡，最终选择只挂 `resize` 是因为这个场景下真正需要重判的时刻就是容器尺寸变化的时刻，没必要挂更高频的钩子）。
    另外，往 `chart.config.options`（`create()` 时存进 registry 的那份普通对象）上写，不能写 `chart.options`（Chart.js 的 resolver Proxy）——对后者做 `o.layout = o.layout || {}` 这种自赋值会在 Proxy 内部触发自引用，实测直接抛 `RangeError: Maximum call stack size exceeded`，和「技术陷阱」#9 踩的是同一个坑。
    验证"图例没被压住"要用两边的真实几何位置比较（工具条 DOM 元素的 `getBoundingClientRect()` 和图例的逐项命中框），不能只回显配置本身，也不能只比较"图例整体顶边 vs 工具条底边"这种粗判断——画布足够宽时两者水平方向根本碰不到，粗判断会把"根本不需要留白、也确实没被压住"的正常状态误判成需要留白。

### 测试纪律

24. **任何为测试而造的设施**（故障注入用的图表、尺寸探针之类）**必须只在 `?selftest=1` 这个 URL 参数下才创建**，不能在正常加载路径里存在。否则这些测试专用的东西会随交付页一起出厂，表现为控制台里莫名其妙的警告、画面上出现一张坏图、或图例里出现 `undefined` 这种字样——客户看到的产物里混进了开发期的脚手架。
25. **断言写完之后一定要做变异验证**：临时故意破坏对应的实现代码，确认断言会转红，再把实现代码改回来。本项目里"断言恒真"（看起来在测试，实际上永远通过，哪怕实现是错的）反复出现在这些地方：`css()` 读取返回值的方式导致 `!==` 比较恒为真；深色和浅色主题下某个 token 恰好同色，导致"颜色确实变了"这条断言测不出差异；手搓的回调函数自己构造参数再自己验证，等于自证；测试用的数据恰好落在观察不出差异的取值点上（比如两个本该不同的柱子高度因为取整而相等）。不做变异验证，这类断言会一直安静地通过，直到真正出 bug 时才发现它从来没起作用。
26. **桑基图数据集里，`colorFrom`/`colorTo` 和 `color`/`borderColor` 的"函数"语义不一样，不能用同一套写法。** `colorFrom`/`colorTo` 是 chartjs-chart-sankey 注册的 `flow` 元素的 scriptable 选项，Chart.js 按每条流向记录各解析一次、以 `ctx` 为参数调用，写成函数是正确用法。但节点标签文字色 `dataset.color` 和节点描边色 `dataset.borderColor`，插件内部的 `_drawLabels()`/`_drawNodes()` 是直接 `ctx.fillStyle = dataset.color || 'black'` 这样把它当一个普通字符串用，不会调用它——如果照着 `colorFrom`/`colorTo` 的写法也传一个函数进去，Canvas 的 `fillStyle` 赋值会静默忽略非法值（不抛错，保留上一次的颜色），表现为标签文字/节点描边颜色跟主题完全对不上，但控制台干干净净、没有任何报错线索。`src/charts.js` 的 `paint()` 对这两类字段分别用了不同的赋值方式（`colorFrom`/`colorTo` 赋函数、`color`/`borderColor` 赋字符串），复用这套逻辑时不要图省事统一成一种写法。
27. **`tests/test_browser.py` 里的两条护栏不要删：** `test_no_suite_threw`（整套浏览器断言如果中途抛异常崩溃，后面的断言会悄无声息地全部消失，不会报错，只是"没跑"）和 `test_assertion_count_floor`（断言总数设零余量下限，低于这个数字说明有断言被意外删掉或没跑到）。历史上真实发生过整套断言跑丢了 80%，而 `pytest` 依然全绿的情况——因为"没跑到的断言"和"跑了且通过的断言"从统计上看是一样的，必须靠独立的"崩溃检测"和"数量下限"两条护栏才能发现。
28. **桑基图第二轮修复的四条教训（2026-10-22）。** (a) 流向着色必须是"整条全亮/全灰"（判据 `hl.has(from) || hl.has(to)`，`hl` 是点击高亮集合本身而不是扩展后的连通集），而节点方块按一跳连通集——两套规则并存，所以节点要由 `afterDraw` 插件按节点身份重绘（既刷灰也要把连通集内的节点刷回基础色）。(b) 悬停加深（插件默认 `hoverColorFrom/To`）是真实交互反馈，要保留；已解析颜色会随"鼠标是否仍停在流向上"变化，测试侧读颜色前先清悬停态。另：新实例的 ResizeObserver 首次回调会带着创建时的旧尺寸，若在重建后立刻进全屏时才送达，会把刚放大的画布缩回去——`chart.resize` 包装一律忽略传入的 (w,h)、每次重新量容器（桑基与笛卡尔都是），工具条点击也改为按 `canvas._dsChart` 找当前实例，不攥创建时的闭包。(c) 层内每层重新从 s1 编号会让相邻层大量撞色、渐变看不出来；要按"层序 + 层内序"顺次取色，并且色板大小必须 ≥ 相邻两层节点数之和。(d) 筛选的"AND（只看勾选）"和"目标端默认 Top-N、勾选追加"是两种完全不同的语义；三层图下拉不能直接按 `from`/`to` 列节点（中间层会同时出现在两边），而要按首层/末层列、按可达性筛。
29. **桑基图目标端筛选：勾选 = 只看勾选，不是追加（2026-10-14 用户实测反馈后改）。** 最初照搬参照实现的"默认前 N + 勾选为追加（Top-N ∪ 勾选）"，但勾一个本来就在前 N 里的项目数据完全不变，用户的感受就是"项目筛选没反应"（实测：勾榜内项目 03 / 02 仍是 43 条 / 20 个项目，只有勾榜外的才变 44 / 21）。改成与源端一致的直观语义：勾了任何项只显示勾选的（榜外也能勾进来），一项都没勾才默认前 N；两端同时勾 = 所选源端到所选末层之间的可达路径，结果为空走空态。点击高亮的"基线"机制保持不变（筛选本身已经改变了显示内容，不需要筛选后立即高亮）。
30. **图表序列色「清爽优先」，放宽两条无障碍规则（2026-10-22 用户拍板）。** 用户反馈「颜色没有原来参照项目的清爽」，方向定为「沿用参照项目的色系、重挑色相」。原因：参照实现十色全部取自 Tailwind 500 档，明度/饱和度统一偏亮；我们旧色板混了三个家族（Okabe-Ito 三色偏沉、Tailwind 两色、凑数的四个深色含纯蓝 `#0000f0`），明度高低不一所以发浑。但参照实现原配色本身有近乎重复的几对（翠绿/青绿 ΔE 5.4、紫/靛青、蓝/靛青）。结论：十个色相在色轮上拉开，明度收进窄带（浅色 L 极差 0.159、深色 0.160，测试上限 0.17，参照实现自己是 0.21），正常视觉两两 ΔE≥15（浅色最小 16.2、深色最小 15.3）。纯 Tailwind 色卡做不到十色 ≥15（穷举最好 10.4），所以色值是「Tailwind 色系与明度档内重挑色相」的自定义色，不是原样色卡。深色主题同色相取 400 档明度、饱和度封顶 C≤0.18，不再有荧光色。**放宽了什么：** 图表序列色不再要求对 surface ≥3:1，也不再要求色觉障碍模拟 ≥6（CVD 改为报告型，各对数值在 `palette.md` 第 7 节，最难区分的是 s8-s9、s1-s4）。**靠什么补偿：** tooltip 与数据标签承担冗余信息，不能只靠颜色传达。**没有放宽的：** 文本色、状态色（`--color-*` 与 `-ink`/`-tint`）的 WCAG 规则一律不动。`tests/test_palette.py` 里对应断言改写为新规则（正常视觉 ΔE≥15 + 十色明度极差≤0.17 + 深浅两套逐位不同），没有删除。注意深浅主题序列色现在不同值，「颜色变了吗」类断言有了鉴别力，但先污染后验证的写法仍然保留。
31. **气泡图：面积∝数量、标签插件自己写、不照搬参照实现的小毛病（2026-10-22）。** (a) 半径 `max(5, sqrt(count/max)×35)`——视觉上人眼比的是面积，半径∝数量会让大数量被夸大成平方倍，断言验的是 `r²/count` 恒定而不是 `r` 本身。(b) **更正（同日）：上一版为“走色板 token 循环 + halo 描边”偏离了参照——颜色杂、标签发光。已恢复参照的色相渐进与无描边 10px/500 标签。** 深色主题下参照的固定深字看不清，所以字色按“气泡填充与卡片底合成色”在深/浅两个 token 墨色间选对比度高者；注意交叉区陷阱：合成色亮度落在约 0.2 附近时深字/浅字对比度都只有 ~3.8，深色主题 S/L 与深字墨色是扫 50 个色相调出来的（60/55 + `#09090b`，最差 4.60）。浅色主题 65/55 是参照值，全色相最差约 4.1（≈245° 蓝紫），演示数据实际画出的标签最低 5.1。(c) 不引入 `chartjs-plugin-datalabels`：一个 `afterDatasetsDraw` 小插件（约 40 行）够用，省一个 vendor 文件和注册顺序坑；绘制前按 `chartArea` 裁剪，缩放后视野外的标签不会画到绘图区外。(d) 参照实现的搜索过滤会丢排序、重开只清输入框不清过滤结果——这里过滤与排序可叠加，重开整体重建。(e) demo 数据里"数量 < 5 被过滤"与"只取前 50"在同一份数据上无法同时可见（被过滤的条目本来就排在最后，会被截断吃掉），所以过滤规则的边界（5 保留、4 剔除、非有限值剔除）由独立构造的小数据断言覆盖，demo 数据侧只验证"图上没有 x<5 的气泡"。
32. **xy 框选缩放：两根轴共用一套缩放代码，状态按轴分（2026-10-22）。** 不要为第二根轴复制一份 `zoom/_apply`：`$ds` 顶层是主轴状态、`$ds.sec` 是第二根轴状态，`stateOf(chart, axis)` 统一取，`_bounds/_viewRange/_apply/zoom/resetZoom/isZoomed` 都按 `zoomAxesOf(chart)` 遍历。几条踩过的坑：(a) 平移不能用 `getValueForPixel`——类目轴的它会四舍五入到整数索引，逐帧小位移全部被舍成 0；也不能用 `scale.width` 换算——刻度标签溢出时 Chart.js 在轴两端留内边距，`getPixelForValue` 的跨度比 `scale.width` 小，要用 `|getPixelForValue(max) − getPixelForValue(min)|`。(b) Chromium 里合成 `MouseEvent` 的 `clientX/Y` 被截成整数，原生事件断言要给 ~2px 的容差；不依赖像素精度的断言直接驱动 `_dragBegin/_dragMove/_dragEnd`。(c) 画布是透明的，选框像素断言要按 straight-alpha 的 source-over 算期望值（`before` 是 `0,0,0,0`），且 1px 描边必须落在整数坐标上，否则会被拆到相邻两行像素、alpha 对不上；描边那一行同时被填充覆盖，期望值要"先填充后描边"叠两层。(d) 散点原来的拖框选是单轴，改 xy 后"同一高度 mousedown/mouseup"成了一条细线按设计被忽略，旧断言要改成对角拖。(e) `ZOOM_BOX_PLUGIN` 的矩形用 `globalAlpha` 而不是 `hexToRgba`——token 被换成非十六进制时后者会退回不透明色，把整张图盖住。
33. **甘特图（2026-10-23 重做）的几个实现取舍。** (a) **HTML 元素而不是 SVG**：条内文字按条宽裁切、行标签横向滚动时 sticky、带边框与光环的标记线药丸，CSS 一行就能做到；API 仍在 `DS.svg` 下，共用同一个 registry（`DS.svg._util.mount`）。(b) **横向位置写成绘图区宽度的百分比**，像素宽度只用于绘制时的版面决策：画完之后宿主宽度变了（最常见的是页面随后冒出竖向滚动条、窄了 15px），条/刻度/标记线等比收放，不会多出一截横向滚动；大幅改宽后调 `DS.svg.redrawIn()`。(c) **重画时宿主先被清空**，页面可能一度短到没有竖向滚动条，此时量到的宽度偏宽 15px——`mount(host, draw, after)` 的 `after` 钩子在插回之后再量一次，不一致就**带着插回后的宽度**补画一次（不能再去量一个又被清空的宿主，否则原样再错一遍）。(d) **入场动画用 `clip-path` 不用 `scaleX`**：`transform` 会改变 `getBoundingClientRect`，动画期间量到的条宽偏小 5%；`fill-mode: backwards`，结束后不残留 `clip-path`（否则悬停阴影被裁）。(e) **悬浮框不带 opacity 过渡**：过渡期间 `getComputedStyle().opacity` 读到的是中间值，"显示后立刻是 1、滚动后立刻是 0"就不成立。(f) 条内 `small` 不加半透明：半透明把字色往底色上混，4.5:1 就不成立了。(g) 不用 `ResizeObserver`：headless 下不保证回调，异步重画还会让持有旧节点的调用方扑空。

## 测试

```bash
python3 -m pytest tests/ -v
```

无 node 环境，测试走两条路（渲染视口固定为 1440x900 桌面宽屏，见 `tests/conftest.py` 的 `VIEWPORT`，可用环境变量 `DS_TEST_VIEWPORT=宽x高` 覆盖——布局/全屏断言依赖宽屏）：pytest 直接测 `build.py` 的内联/守卫逻辑与色板 WCAG 合规；浏览器行为断言由 `demo/selftest.js` 在 `?selftest=1` 下于真实 DOM/Canvas 环境中运行，经 `chromium --headless --dump-dom` 把结果回传给 pytest 解析（见 `tests/test_browser.py`）。

## CI

`.github/workflows/ci.yml` 在 push 到 `main` 和 PR 时自动跑，一个 job 三步：

1. **安装 chromium**（`browser-actions/setup-chrome@v1`，固定装 `stable` 版，不依赖 runner 自带、版本会漂移的系统浏览器）并通过 `DS_TEST_CHROMIUM` 环境变量（见 `tests/conftest.py`）指给 pytest。
2. **校验 `index.html` 与源码同步**：重新跑一次 `python3 build.py demo`，逐字节比对产物和仓库里已提交的 `index.html`，不一致就让 CI 失败并打印 diff。这是为了防止"改了 `src/`/`demo/` 忘了本地 build 就 push"——那会让 GitHub Pages 线上页面悄悄落后于仓库代码。`tests/test_build.py::test_index_html_is_tracked_and_matches_demo_build` 其实也测了同一件事，这一步是独立的第二道闸门，报错更直白，也不依赖那条 pytest 用例将来不被误删。
3. **跑 `python3 -m pytest tests/ -v` 全量测试**：61 个用例，含 `?selftest=1` 下的全部 286 条浏览器断言（`tests/test_browser.py` 里依赖 `selftest` fixture 的 12 个用例都会真正拉起 headless chromium 渲染并解析结果，不是只跑不需要浏览器的那部分）。`build.py` 的 `guard()`（零外链 + 去标识化）在 `build()` 内部无条件执行，`test_build.py` 里已有专门用例核验其拦截逻辑，这一步顺带覆盖，不重复实现。

**已知取舍**：目前判断公开 GitHub-hosted runner 上的 headless chromium（`--headless --disable-gpu --no-sandbox --virtual-time-budget=8000`）跑这套自测足够稳定，所以 CI 没有单独拆分"只跑非浏览器部分"的降级模式。如果未来观察到浏览器断言在 CI 上偶发失败（headless 环境差异导致的渲染抖动，而不是真实回归），优先修 `conftest.py` 的渲染稳定性，而不是静默跳过浏览器测试；万一必须临时降级，请在 workflow 注释和这里同时写明降级范围和原因，不要悄悄跳过。

**不在 CI 里覆盖的东西**：色板之外的视觉回归（没有截图对比/像素级 diff）、真实 Windows/移动端浏览器（只测 headless chromium，不测 Safari/Firefox 的实际渲染差异）、Pages 发布后的线上可达性（CI 只校验仓库内容自洽，不探测 `https://chuckieding.github.io/report-design-ref/` 实际是否已更新）。

### 将来想升级成 "GitHub Actions 构建部署" 怎么办

现在 Pages 用的是 **"Deploy from a branch"**：`index.html` 必须提交到仓库根目录，CI 只负责校验它没有过期。好处是简单、不依赖 Actions 配额；代价是每次改源码都要记得本地 `python3 build.py demo` 再提交一份构建产物到版本库里。

如果以后想换成 **"GitHub Actions" 模式**（好处：`index.html`/`demo.html` 不必再入库，PR 里也不会再出现"一大坨构建产物 diff"），需要两步，这次都不做：

1. 仓库 Settings → Pages → Build and deployment → Source，手动切换成 **GitHub Actions**（这一步必须由有仓库管理权限的人在网页上做，CI 配置文件做不到）。
2. 新增一个单独的部署 workflow（不要塞进 `ci.yml`，避免每次 PR 都触发部署预检），大致形状如下，仅供将来参考，**没有被启用**：

```yaml
# .github/workflows/deploy.yml（参考草稿，未启用）
name: Deploy Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: python3 build.py demo   # 产出 demo.html；Pages 入口改从这里取
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .   # 或者专门整理出一个 dist/ 目录再指过去
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

切过去之后，`ci.yml` 里"校验 index.html 与源码同步"那一步连同仓库里的 `index.html` 本体都可以删掉——那时候线上内容由这条部署 workflow 现场 build 产出，不再需要一份跟 `demo.html` 保持字节级同步的提交副本。

## 许可

本项目采用 [MIT License](LICENSE)。

内联于 `src/vendor/chart.umd.js` 的 [Chart.js](https://www.chartjs.org) 4.4.0 同样是 MIT 许可，版权声明保留在该文件头部，未作改动。

内联于 `src/vendor/chartjs-chart-sankey.umd.js` 的 [chartjs-chart-sankey](https://github.com/kurkle/chartjs-chart-sankey) v0.12.1（(c) 2024 Jukka Kurkela）同样是 MIT 许可，版权声明保留在该文件头部，未作改动。它不引入除 `Chart` 以外的新全局变量——注册方式是 `Chart.register(...)`，挂在 `chart.umd.js` 已经创建的 `window.Chart` 上，不需要在「只暴露 `DS` 一个全局」这条约束上额外开口子。
