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

`build.py` 把 `src/` 的分片（tokens / components / vendor / interactions / charts / charts-svg）与页面自己的脚本内联进模板，并强制两条守卫：**零外链**（`guard()`，`<a>` 除外）、**无客户标识**。违反即构建失败并抛异常，不会静默产出坏文件。

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
| `DS.tables.sortable(sel)` | 表头点击排序，数字列按数值（含千分位逗号、`%`、`h`/`min`/`s` 时长单位、`hh:mm` 式时长，见下方「数字列排序支持的格式」） |
| `DS.charts.init({wheel, maxLabel})` | 图表全局配置。`wheel` 默认 `'ctrl-zoom'`（见下方滚轮缩放表）；`maxLabel` 是类目标签截断阈值（字符数），默认 `10`，Chart.js 刻度截断与 `DS.svg.gantt` 的行标签截断共用这一个配置 |
| `DS.charts.create(canvas, config)` | 建图；数据为空时渲染空态并返回 `null`。`canvas` 必须包在 `.ds-chart-host` 容器里，见下方「图表宿主要求」 |
| `DS.charts.destroy(chart)` | 销毁图表实例、摘除工具条 DOM 与全屏状态、从内部 registry 注销；翻页/按筛选重建图表时的标准清理方式 |
| `DS.charts.all()` | 返回当前仍存活（未 `destroy()`）的 Chart.js 实例数组 |
| `DS.charts.isEmpty(config)` | 判断某个 Chart.js config 的全部 datasets 是否为空；`create()` 内部用它决定要不要走空态分支 |
| `DS.charts.themeColors()` | 返回当前主题下的图表配色 token：`{grid, axis, text, series: [s1..s6]}`；`DS.svg.*` 自己画 SVG 图时就是从这里取色，自定义图表/图例也应该用它而不是硬编码颜色 |
| `DS.charts.dateTicks(fmt)` | 返回一个 `ticks.callback` 函数，把时间戳（毫秒）格式化成日期标签；`fmt` 为 `'md'`（默认，`M/D`）或 `'ymd'`（`YYYY-MM-DD`）。时间轴没有内置日期适配器时的退化方案，见下方「时间轴」一节 |
| `DS.charts.zoom(chart, factor)` | 以当前视图中心为基准按 `factor` 缩放（`>1` 放大、`<1` 缩小），工具条 `−`/`+` 按钮内部调的就是它 |
| `DS.charts.zoomRange(chart, i0, i1)` | 缩放到显式的类目索引（或无类目图表的数据域）区间 `[i0, i1]`；会按数据边界钳位，钳位后过窄视为误触并忽略，拖框选内部调的就是它 |
| `DS.charts.resetZoom(chart)` | 清除缩放约束，交还 Chart.js 自动量程 |
| `DS.charts.isZoomed(chart)` | 当前是否处于缩放状态；非笛卡尔图（pie/doughnut/polarArea/radar）恒为 `false` |
| `DS.charts.setWheelMode(mode)` | 对所有已存在的笛卡尔实例立即切换滚轮模式（`'page'`\|`'zoom'`\|`'ctrl-zoom'`\|`'smart'`），无需重建图表；传入未知字符串会被拒绝并 `console.warn`，保留原模式 |
| `DS.charts.paint(config)` | 内部方法：把当前主题色/字体/tooltip/scale 配置写进传入的 config。由 `create()` 和 `retheme()` 自动调用，一般不需要主动调用 |
| `DS.charts.retheme()` | 内部方法：主题切换时自动触发（监听 `ds:themechange`），对 registry 里所有存活的笛卡尔图重新 `paint()` + `update()`。一般不需要主动调用 |
| `DS.charts.options()` | 内部方法：返回当前全局配置对象 `{wheel, maxLabel}` 的引用，主要供 `DS.svg.*` 读取 `maxLabel` 共享截断阈值 |
| `DS.svg.gantt(host, rows)` | 甘特图（Chart.js 画不了，手写 SVG）；`host` 同样建议包在 `.ds-chart-host` 里 |
| `DS.svg.heatmap(host, matrix)` | 热力图（同上） |
| `DS.modal.open(html)` | 打开模态框，`html` 作为内容区 innerHTML；点击遮罩或按 Esc 会自动调用 `DS.modal.close()` |
| `DS.modal.close()` | 关闭当前模态框（隐藏遮罩），无参数 |
| `DS.toast.show(msg, ms)` | 提示条；`ms` 是自动消失时间（毫秒），省略时默认 `3000` |

`src/` 对外只暴露 `DS` 这一个全局变量。

### 图表宿主要求

`DS.charts.create(canvas, config)` 和 `DS.svg.gantt/heatmap(host, ...)` 的工具条（缩放 `−/+/⟲/⛶`）用 `position: absolute` 定位，必须相对最近的"已定位祖先元素"（`position` 不是 `static`）摆放。`src/components.css` 里 `.ds-chart-host { position: relative; height: 260px; }` 正是为此存在——`canvas`/`host` 必须是某个 `.ds-chart-host`（或其他自带 `position: relative` 的容器）的直接子元素，否则工具条会相对更外层的定位祖先（最坏情况是 `<body>`）定位，实测表现为整组按钮飞到页面右上角。

### 数字列排序支持的格式

`DS.tables.sortable` 判定"整列是否按数值排序"时，除了裸数字（含负数），还识别这几种保守剥离后的格式：千分位逗号（`1,234`）、百分号（`5%`）、`h`/`min`/`s` 结尾的时长（`3.5h`）、`hh:mm` 或 `m:ss` 式的时长（`02:14`，按总分钟数比较）。其余格式（如夹杂中文单位、复合单位）一律按字符串排序——这是有意保守：通用的单位剥离规则容易把本来就是文本的列（比如型号 `3.5mm`）误判成数字列。

## 滚轮缩放的四种方式

建项目时由 `DS.charts.init({wheel: ...})` 定死一种，**不暴露给终端用户**——该选择器只存在于 demo 页，供设计/开发现场比较差异用。

| 模式 | 滚轮行为 | 缩放途径 |
|---|---|---|
| `page` | 永远翻页 | 工具条 `−/+/⟲/⛶` + 拖框选 |
| `zoom` | 直接缩放 | 滚轮本身；工具条仍在 |
| `ctrl-zoom`（默认） | 按 Ctrl 缩放，否则翻页 | Ctrl+滚轮 + 工具条 |
| `smart` | 未到极限先缩放，到底后翻页 | 滚轮本身 |

工具条与拖框选在四种模式下**始终可用**。缩放工具条只挂在笛卡尔坐标图上（折线/柱状/面积等），不挂 pie / doughnut / polarArea / radar——那几类图没有"轴范围"概念，缩放没有意义。

## 报表常用的四种图表

demo 页「组件全览」里补了四种报表最常出现、但此前没演示过的图表形态（`demo/demo.js` 的 `c-combo` / `c-stacked` / `c-area` / `c-timeaxis`）。四种都是 Chart.js 原生支持的类型/配置组合，缺的只是演示、主题适配和断言——不是新的图表引擎。

### 双轴组合图（量 + 率）

柱状（绝对量，左轴 `y`）+ 折线（比率，右轴 `y1`，`dataset.yAxisID: 'y1'`）叠在一张图里，是报表里"量纲不同的两个指标"最常见的呈现方式。`DS.charts.paint()` 会给调用方声明在 `options.scales` 里的坐标轴注入当前主题的网格/刻度/轴线颜色。额外坐标轴（除 `x`/`y` 以外的，典型是 `y1`）默认把 `grid.drawOnChartArea` 设为 `false`——两套网格线叠在一起对读者是纯噪音，只让主轴画网格是惯例做法。调用方自己显式配置过 `grid.drawOnChartArea` 的话不会被覆盖。

默认的 `y` 轴不是无条件创建的：如果你的全部数据集都把 `yAxisID` 指向 `y1`（压根不用默认的 `y`，双轴图里只要一根竖轴时的常见写法），本库不会凭空造一个没人用的幽灵 `y` 轴出来——Chart.js 一旦在 `options.scales` 里看到某个轴的 key，哪怕没有数据集引用它也会真的实例化并绘制，没有数据可读的话量程会退化成毫无意义的 `0..1`。如果你确实想保留一条不对应任何数据的装饰性 `y` 轴，自己在 `options.scales.y` 里显式声明（哪怕是空对象）即可，只要显式声明过就不会被这条规则删掉。

### 堆叠柱状图

`scales.x.stacked = true` + `scales.y.stacked = true`，多数据集配色走 `--chart-s1..s6`。**百分比堆叠**（各段和为 100%）Chart.js 没有原生支持（没有 `stacked: '100%'` 这类选项），demo 页用数据预处理实现等效效果：每个类目按当月总量把各数据集的值归一化成百分比、`scales.y` 设 `min:0, max:100`，再用 `tooltip.callbacks.label` 从 `dataset.__dsRaw`（切换前保留的原始绝对值）读回真实数值一并显示，避免换成百分比后看不到原始量。demo 页「堆叠柱状图」卡片里的复选框就是这个开关的现场演示，`src/charts.js` 本身不需要为此新增任何 API。

### 面积图（填充）

`dataset.fill` 设为 `true` / `'origin'` / 数字索引 / 非 `'false'` 的字符串 / `{target, above, below}` 对象写法（Chart.js 认可的全部 fill 取值），且该数据集的类型是 `line` 时，`paint()` 会把它的 `backgroundColor` 自动换成线条色的半透明版本（当前 alpha 固定 `0.34`）——否则多条面积图叠在一起会变成互相完全遮挡的实心色块。`borderColor`（线条本身、图例描边）仍然是不透明的系列色；没有设置 `fill` 的数据集（普通折线图、柱状图）`backgroundColor` 行为不受影响，仍然是不透明色。这个判断是 per-dataset 的，同一张图里"面积 + 不填充的目标线"这种常见混合完全支持（见 demo 页「面积图」卡片）。

alpha=0.34 是浅/深两套主题各自的最小 WCAG 对比度都有确定余量之后选的值（浅色最低 1.251，深色最低 1.416，均高于热力图最低档也用过的 1.2 可见性下限），但浅色主题下 `#eab308` 这类偏亮的分类色天花板本来就不高——详见「决策记录」#14，换掉色板之后这个数字需要重新核算。色板 token 如果换成非十六进制格式（`rgb()`/`hsl()`/颜色关键字），半透明转换会自动降级为原样使用调用方给的颜色（放弃半透明效果，不会产出非法颜色值）。

### 时间轴（无内置日期适配器，用数值轴模拟）

Chart.js 的 `'time'`/`'timeseries'` 轴类型本身依赖日期适配器（如 `chartjs-adapter-date-fns`）才能解析/格式化时间，**不自带**。排查过的两个来源都没有可抽取的适配器：
1. 内联在 `src/vendor/chart.umd.js` 里的 Chart.js 4.4.0 本身是裸版本，没有带适配器；
2. `IHC_Consolidated_Run_Report_Analyzer_no_data.html`（另一个内联了 Chart.js 4.4.0 的项目）同样没有内联任何日期适配器或 `time` 轴用法可供复用。

本仓库的硬约束是零外链、产物是离线单文件，不允许联网下载第三方库来补这个适配器。因此采用退而求其次的方案：x 轴用 `type: 'linear'`，数据点用 `{x: 时间戳(毫秒), y: 值}` 的形式喂给 Chart.js（跟散点图是同一种"没有类目标签"的笛卡尔图，缩放也走同一条数据域缩放路径），再用 `DS.charts.dateTicks('md' | 'ymd')` 把刻度上的时间戳格式化成 `M/D` 或 `YYYY-MM-DD` 日期标签。

**这不是真正的 time scale，而且有两条具体的真实局限，不只是"疏密取舍"**（复审实测确认过，demo 页上线前已经踩过）：

1. **刻度可能落在数据范围之外。** 不显式钉 `min`/`max` 的话，Chart.js 对线性轴的默认"好看刻度"算法会自己找一圈整数，第一个刻度经常落在数据起点*之前*（实测 14 天数据从 `2024-01-01` 开始，轴上却先画出一个 `12/31`）——访客看到的是一个凭空多出来、不对应任何真实数据点的日期标签。
2. **数据点少时，相邻刻度会格式化成同一个日期、连续重复。** 刻度间距不保证踩在整天的边界上，数值上不同的两个刻度经过 `dateTicks()` 格式化后可能变成同一个 `M/D` 字符串（实测 3 天数据下 `"1/1"` 连续出现过 4 次）。

两条都是"数值轴硬模拟日期轴"这个方案本身的局限，不是实现 bug。**必须**显式设置三项才能避免：`scales.x.min`/`max` 钉死到数据域本身（而不是交给 Chart.js 自动算）、`ticks.stepSize` 固定成一个合理的整数步长（比如按天用 `86400000` 毫秒）、`ticks.maxTicksLimit` 控制最终密度（Chart.js 会在 `stepSize` 的基础上再按这个上限挑一个合适的倍数）。`demo/demo.js` 的 `c-timeaxis` 卡片就是这么配的，照抄即可。

如果你的项目需要完整的 time scale（比如非均匀间隔的时间点、自动按年/月/日/时切换刻度粒度，不想自己管 `stepSize`），请自行联网下载并内联 `chartjs-adapter-date-fns`（或等效适配器）到 `src/vendor/` 下，注册 `'time'`/`'timeseries'` 轴类型；本仓库不内置。

这个退化方案能生效，依赖另一处修复：`paint()` 此前会给"类目轴"（`zoomAxisFor()` 判定出的那一个，时间轴场景下通常是 `x`）无条件覆盖 `ticks.callback`，用于超长中文标签截断。调用方自己提供的 `ticks.callback`（比如 `DS.charts.dateTicks()`）在每次 `paint()`（首次 `create()`、每次主题切换触发的 `retheme()`）都会被原地冲掉——时间戳先被 `getLabelForValue()` 转成完整数字字符串（如 `"1,704,067,200,000"`），再被当成"超长标签"截断成一串看不出意义的 `"1,704,0…"`。现在改成只在调用方没有提供 `ticks.callback` 时才注入默认截断逻辑，不影响已有的长标签截断行为（没设自定义回调的图表不受影响）。

### `paint()` 接管 / 尊重的字段一览

`DS.charts.paint(config)` 在 `create()` 和每次主题切换触发的 `retheme()` 时都会重新跑一遍，把当前主题的颜色/布局惯例写进传入的 Chart.js config。哪些字段会被它接管、哪些会尊重调用方自己的配置，历史上多次因为没写清楚而被复审反复挖出同类问题（额外轴网格默认值、类目轴 `ticks.callback`、现在这张表里的 `layout.padding.top`），这里一次性列清楚：

**始终接管**（每次 `paint()`/`retheme()` 都会覆盖成当前主题值，调用方设了也没用）：

| 字段 | 覆盖成什么 |
|---|---|
| `options.animation` | 强制 `false`（见「技术陷阱」#11） |
| `options.maintainAspectRatio` | 强制 `false`——传 `aspectRatio` 之类期待它生效的配置是死配置，不会报错也不会提示 |
| `options.plugins.legend.labels.color` | 当前主题的文字色 |
| 每根坐标轴的 `grid.color`、`ticks.color`、`border.color`（笛卡尔图的 `x`/`y`/额外轴）或 `grid.color`/`angleLines.color`/`pointLabels.color`/`ticks.color`（radar/polarArea 的 `r` 轴） | 当前主题色 |
| `scales.r.ticks.backdropColor`（radar/polarArea） | 强制 `'transparent'`，关掉 Chart.js 默认的半透明白底 |
| `dataset.backgroundColor`/`borderColor`——仅当这一侧是库自动赋值的（内部用 `__dsAutoBg`/`__dsAutoBorder` 标记，调用方没有自己提供初始值） | 当前主题的序列色（面积图 fill 数据集的 `backgroundColor` 是半透明版本） |

**只在调用方没配置时才补默认值**（"没传才补"，配置了就原样尊重）：

| 字段 | 默认值 |
|---|---|
| `options.layout.padding.top` | `30`（给图表工具条让出顶部空间，见下方决策记录） |
| `options.interaction` | `{ mode: 'index', intersect: false }` |
| `options.plugins.tooltip.mode`/`intersect` | `'index'` / `false` |
| 额外轴（非 `x`/`y`）的 `grid.drawOnChartArea` | `false` |
| 类目轴的 `ticks.callback` | 超长标签截断逻辑 |
| `dataset.backgroundColor`/`borderColor`——调用方显式提供了初始值的那一侧 | 保留调用方的值，不管之后 retheme 多少次 |

**完全不碰**：各轴的 `min`/`max`/`stacked`/`position`/`title` 等除上表列出的子属性之外的任何配置、`options.plugins.tooltip.callbacks`、`options.plugins.title` 等其余插件配置、`dataset.fill`/`tension`/`type`/`xAxisID`/`yAxisID`/`borderDash` 等除颜色外的任何数据集属性——调用方想怎么配就怎么配。

## 决策记录（勿重复提议）

以下结论都是开发过程中花代价换来的，重新提议前请先确认不会重蹈覆辙。

### 交互决策

1. **滚轮 `smart` 模式不做默认。** 同一次滚轮动作有时触发缩放、有时触发翻页，取决于当前是否已到缩放极限——用户感知上就是"页面抽风"，行为不可预期。保留为可选模式，不设为出厂默认。
2. **`ctrl-zoom`（默认模式）旁边那行 `Ctrl+滚轮缩放` 灰字提示不可移除。** 这个模式下，普通滚轮是翻页，只有按住 Ctrl 才会缩放——这个操作本身没有任何视觉线索，用户不会自己发现。这行提示是该模式唯一的可发现性补偿，删掉等于让缩放功能对用户隐形。
3. **主题记忆（深浅色选择存 `localStorage`）是固定行为，不做成配置项。** 不需要每个接入项目都决定一遍"要不要记住"。`localStorage` 不可用时（隐私模式、`file://`、企业策略禁用等）必须静默降级为"本次会话内有效但不持久化"，不得抛错导致白屏。
4. **缩放工具条只挂笛卡尔图**（折线/柱状/面积/散点等有 x/y 轴范围的图），不挂 pie / doughnut / polarArea / radar。这几类图没有可缩放的"轴范围"，挂上去的工具条点了也没有效果，纯粹是噪音。

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
14. **面积图填充色不能是不透明的序列色。** `fill` 是 Chart.js 任一种"要填充"取值（`true`/`'origin'`/数字索引/非 `'false'` 的字符串/`{target,above,below}` 对象写法，**不要漏判对象写法**——复审实测过漏判会让这种写法下的 `backgroundColor` 还是不透明色，正是这条规则要消灭的问题本身）的 line 数据集，`backgroundColor` 必须是线条色的半透明版本（当前 alpha **0.34**）。`borderColor` 仍然不透明；没设 `fill` 的数据集（折线/柱状图）不受影响——这个判断按数据集逐个做，不是按图表类型整体做（同一张图里"面积 + 不填充的目标线"是常见组合）。alpha 的论证不要只验一侧主题：复审发现上一版（0.28）把浅/深两套主题的结论写反了——真正的短板始终在**浅色**主题（不是深色），`#eab308` 这类偏亮的分类色合成到接近纯白的背景上，对比度天花板本来就不高（哪怕整个色块完全不透明，对纯白的 WCAG 对比度也只有 1.918），alpha 调多高都填不平这个差距，这是色板本身的特性。验证这条规则的断言要遍历**全部**分类序列色取最小对比度，不能只采样其中一条——复审还发现上一版断言只测了 `datasets[0]`（恰好是对比度第二好的那条），对最差的那条颜色完全没有鉴别力。
15. **类目轴的 `ticks.callback` 只能在调用方没提供时才注入默认值。** `paint()` 曾经无条件覆盖类目轴（`zoomAxisFor()` 判定出的那一个）的 `ticks.callback` 来做超长标签截断，调用方自己想要的任何刻度格式化（比如时间轴退化方案 `DS.charts.dateTicks()`）会被每次 `paint()` 原地冲掉而不报错——时间戳会被按"超长字符串"错误截断成一串看不出意义的数字开头。现在改成"没传才补"，这个坑具体细节见「时间轴」一节。
16. **Chart.js 没有带日期适配器，不要尝试联网下载来补。** `'time'`/`'timeseries'` 轴类型需要 `chartjs-adapter-date-fns` 之类的适配器才能工作，裸 Chart.js 不带。本仓库零外链、产物是离线单文件，不允许在 build 时或运行时联网取任何第三方库——日期轴改用 `type: 'linear'` + `DS.charts.dateTicks()` 的数值轴模拟方案，细节和取舍见「时间轴」一节，**不要**为了"更正统"而给这条约束开口子。
17. **百分比堆叠柱状图没有原生 API，不要去 Chart.js 文档里找一个不存在的 `stacked: '100%'` 选项。** 做法是数据预处理：按类目把各数据集归一化成百分比、`y` 轴设 `min:0,max:100`，`tooltip.callbacks.label` 从保留的原始值字段读回真实数字。
18. **色板的任何改动都必须跑 `python3 -m pytest tests/test_palette.py`**，未达 WCAG AA（正文 4.5:1，大字/非文本 UI 3:1）不得入库。分类色（给不同数据系列区分用的颜色，不是状态色）的可辨识度要用 `delta_e`（色彩感知差异）加色觉障碍模拟去判定，**不能只看亮度对比度**——亮度对比度相近的两个颜色（典型例子：某种蓝和某种紫）人眼依然能轻松区分，只用亮度公式会把明明可辨识的配色误判为不合格，或者反过来放过色觉障碍用户真正分不清的组合。
19. **数据集的 `backgroundColor`/`borderColor` 自动上色，两侧要用各自独立的"是否自动"标志，不能共用一个。** 调用方只给 `borderColor`（折线图最常见的自定义写法之一）、不给 `backgroundColor` 时，背景色分支按"没给"自动上色——如果这一步顺带把一个共享标志置真，边框分支的"是否要重新自动上色"判断只要也挂在这个共享标志上，就会连带命中，把调用方刚设好的 `borderColor` 当场覆盖掉。反过来"只给 `backgroundColor`、不给 `borderColor`"也有一个对称的潜伏 bug：自动上色的那一侧如果没有被单独标记，下次主题切换就不会被重新计算，颜色会冻结在创建时的值上。两侧各用一个独立标志（`__dsAutoBg`/`__dsAutoBorder`），弧形族（pie/doughnut/polarArea）和折线/柱状都要改，这是同一个模式在两处重复出现的 bug。验证这类"自动上色要不要跟着 retheme 更新"的断言时，不能直接拿 retheme 后的值跟当前主题色比较——六条分类序列色深浅主题同值，如果 retheme 根本没碰这个字段，它仍然停在创建时算出来的旧值，而旧值又恰好等于"当前主题"的序列色，直接比较看不出区别；要先把该字段污染成一个哨兵垃圾值，再验证 retheme 后它被正确覆盖回主题色。
20. **额外坐标轴不能无条件创建。** 笛卡尔图的 `x`/`y` 两根"主轴"只有在真的被某个 dataset 引用时才该出现在 `options.scales` 里——如果全部数据集都把 `yAxisID` 指到自定义轴（比如双轴图里只要一根竖轴、全部指向 `y1`），强行 `o.scales.y = o.scales.y || {}` 捏一个空对象出来，Chart.js 会把它当成一根真实坐标轴实例化并绘制：没有数据可读，量程退化成默认的 `0..1`，是一根跟真实数据毫无关系的幽灵轴，而且因为它被当成"主轴"处理，不受额外轴 `grid.drawOnChartArea` 默认规则约束，网格线照样画，比压根没有这根轴更容易误导人。判断"要不要创建"时，类目轴（`zoomAxisFor()` 判定出的那一个）永远例外——它是整张图"索引"维度的载体，不依赖某个 dataset 显式指定轴 ID；调用方自己在 `options.scales` 里显式声明过的轴，不管有没有 dataset 引用，也要保留，不能被这条规则反过来删掉。
21. **雷达图 / 极区图的 `r` 轴不能被当成"没有坐标轴"而整个跳过主题注入。** pie/doughnut 确实没有任何坐标轴，但 radar 和 polarArea 共用 `RadialLinearScale`（默认轴名 `r`），同样需要把网格、角线、刻度文字、刻度颜色都换成主题色——不注入的话深色主题下这些元素会停留在 Chart.js 的默认浅色值，刻度数字背后还会带一块默认的半透明白底，在深色背景上非常突兀，需要显式关掉。polarArea 比较容易被漏掉：它同时属于"弧形族"（数据集按扇区数组着色），实现时容易默认"弧形族都不需要坐标轴注入"，但它的坐标轴注入和数据集着色是两条独立要走的路径，不能因为走了其中一条就把另一条也跳过。
22. **色板里非十六进制格式的 CSS 变量必须有降级路径，不能静默产出非法颜色值。** 把十六进制颜色转成 `rgba(...)` 实现半透明填充这类场景，必须先校验解析出的数值分量不是 `NaN`——色板 token 一旦换成 `rgb()`/`hsl()`/颜色关键字这类非十六进制格式（README 本身就鼓励使用者替换整套色板），字符串解析会失败但不抛错，产出一条带 `NaN` 的非法 `rgba()` 字符串，浏览器判定整条 CSS 属性无效、对应的填充直接画不出来，且控制台没有任何报错或警告，复现和排查成本都很高。退化方案：解析失败就放弃转换、原样使用调用方给的颜色字符串（填充退化成不透明色块，牺牲的是次要的视觉效果，不是整块图形消失）。
23. **多数据集图表的图例不能默认贴着画布顶部画，要给悬浮工具条留出空间。** 图表的缩放工具条用 `position: absolute` 悬浮在宿主右上角，Chart.js 默认把图例画在画布最顶上——数据集一多、图例换行或变宽，最右边的条目可能被工具条压住看不全。只有 1 项图例的图表不会暴露这个问题（图例本来就短，伸不到工具条所在的角落），但这是所有挂了工具条的图表共有的风险，不是某一张图单独的毛病，必须在通用的绘制逻辑里用一段固定的顶部留白（`layout.padding.top`）统一解决，不能等某张具体的图表"恰好暴露了"才针对性地改那一张。验证"图例没被压住"要用两边的真实几何位置比较（工具条 DOM 元素的 `getBoundingClientRect()` 和 Chart.js 布局引擎算出来的图例框坐标），不能只回显配置本身。

### 测试纪律

24. **任何为测试而造的设施**（故障注入用的图表、尺寸探针之类）**必须只在 `?selftest=1` 这个 URL 参数下才创建**，不能在正常加载路径里存在。否则这些测试专用的东西会随交付页一起出厂，表现为控制台里莫名其妙的警告、画面上出现一张坏图、或图例里出现 `undefined` 这种字样——客户看到的产物里混进了开发期的脚手架。
25. **断言写完之后一定要做变异验证**：临时故意破坏对应的实现代码，确认断言会转红，再把实现代码改回来。本项目里"断言恒真"（看起来在测试，实际上永远通过，哪怕实现是错的）反复出现在这些地方：`css()` 读取返回值的方式导致 `!==` 比较恒为真；深色和浅色主题下某个 token 恰好同色，导致"颜色确实变了"这条断言测不出差异；手搓的回调函数自己构造参数再自己验证，等于自证；测试用的数据恰好落在观察不出差异的取值点上（比如两个本该不同的柱子高度因为取整而相等）。不做变异验证，这类断言会一直安静地通过，直到真正出 bug 时才发现它从来没起作用。
26. **`tests/test_browser.py` 里的两条护栏不要删：** `test_no_suite_threw`（整套浏览器断言如果中途抛异常崩溃，后面的断言会悄无声息地全部消失，不会报错，只是"没跑"）和 `test_assertion_count_floor`（断言总数设零余量下限，低于这个数字说明有断言被意外删掉或没跑到）。历史上真实发生过整套断言跑丢了 80%，而 `pytest` 依然全绿的情况——因为"没跑到的断言"和"跑了且通过的断言"从统计上看是一样的，必须靠独立的"崩溃检测"和"数量下限"两条护栏才能发现。

## 测试

```bash
python3 -m pytest tests/ -v
```

无 node 环境，测试走两条路：pytest 直接测 `build.py` 的内联/守卫逻辑与色板 WCAG 合规；浏览器行为断言由 `demo/selftest.js` 在 `?selftest=1` 下于真实 DOM/Canvas 环境中运行，经 `chromium --headless --dump-dom` 把结果回传给 pytest 解析（见 `tests/test_browser.py`）。

## 许可

本项目采用 [MIT License](LICENSE)。

内联于 `src/vendor/chart.umd.js` 的 [Chart.js](https://www.chartjs.org) 4.4.0 同样是 MIT 许可，版权声明保留在该文件头部，未作改动。
