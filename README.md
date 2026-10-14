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

柱状（绝对量，左轴 `y`）+ 折线（比率，右轴 `y1`，`dataset.yAxisID: 'y1'`）叠在一张图里，是报表里"量纲不同的两个指标"最常见的呈现方式。`DS.charts.paint()` 会给调用方声明在 `options.scales` 里的**所有**坐标轴（不只是 `x`/`y`）注入当前主题的网格/刻度/轴线颜色。额外坐标轴（除 `x`/`y` 以外的，典型是 `y1`）默认把 `grid.drawOnChartArea` 设为 `false`——两套网格线叠在一起对读者是纯噪音，只让主轴画网格是惯例做法。调用方自己显式配置过 `grid.drawOnChartArea` 的话不会被覆盖。

### 堆叠柱状图

`scales.x.stacked = true` + `scales.y.stacked = true`，多数据集配色走 `--chart-s1..s6`。**百分比堆叠**（各段和为 100%）Chart.js 没有原生支持（没有 `stacked: '100%'` 这类选项），demo 页用数据预处理实现等效效果：每个类目按当月总量把各数据集的值归一化成百分比、`scales.y` 设 `min:0, max:100`，再用 `tooltip.callbacks.label` 从 `dataset.__dsRaw`（切换前保留的原始绝对值）读回真实数值一并显示，避免换成百分比后看不到原始量。demo 页「堆叠柱状图」卡片里的复选框就是这个开关的现场演示，`src/charts.js` 本身不需要为此新增任何 API。

### 面积图（填充）

`dataset.fill` 设为 `true` / `'origin'` / 数字索引 / 非 `'false'` 的字符串（Chart.js 认可的全部 fill 取值），且该数据集的类型是 `line` 时，`paint()` 会把它的 `backgroundColor` 自动换成线条色的半透明版本（当前 alpha 固定 `0.28`，WCAG 相对亮度公式验过六条分类序列色在浅/深两套 `--color-surface` 背景上都有足够对比度）——否则多条面积图叠在一起会变成互相完全遮挡的实心色块。`borderColor`（线条本身、图例描边）仍然是不透明的系列色；没有设置 `fill` 的数据集（普通折线图、柱状图）`backgroundColor` 行为不受影响，仍然是不透明色。这个判断是 per-dataset 的，同一张图里"面积 + 不填充的目标线"这种常见混合完全支持（见 demo 页「面积图」卡片）。

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
14. **面积图填充色不能是不透明的序列色。** `fill: true` 的 line 数据集，`backgroundColor` 必须是线条色的半透明版本（当前 alpha 0.28），否则多条面积图叠在一起会变成互相完全遮挡的实心色块。`borderColor` 仍然不透明；没设 `fill` 的数据集（折线/柱状图）不受影响——这个判断按数据集逐个做，不是按图表类型整体做（同一张图里"面积 + 不填充的目标线"是常见组合）。
15. **类目轴的 `ticks.callback` 只能在调用方没提供时才注入默认值。** `paint()` 曾经无条件覆盖类目轴（`zoomAxisFor()` 判定出的那一个）的 `ticks.callback` 来做超长标签截断，调用方自己想要的任何刻度格式化（比如时间轴退化方案 `DS.charts.dateTicks()`）会被每次 `paint()` 原地冲掉而不报错——时间戳会被按"超长字符串"错误截断成一串看不出意义的数字开头。现在改成"没传才补"，这个坑具体细节见「时间轴」一节。
16. **Chart.js 没有带日期适配器，不要尝试联网下载来补。** `'time'`/`'timeseries'` 轴类型需要 `chartjs-adapter-date-fns` 之类的适配器才能工作，裸 Chart.js 不带。本仓库零外链、产物是离线单文件，不允许在 build 时或运行时联网取任何第三方库——日期轴改用 `type: 'linear'` + `DS.charts.dateTicks()` 的数值轴模拟方案，细节和取舍见「时间轴」一节，**不要**为了"更正统"而给这条约束开口子。
17. **百分比堆叠柱状图没有原生 API，不要去 Chart.js 文档里找一个不存在的 `stacked: '100%'` 选项。** 做法是数据预处理：按类目把各数据集归一化成百分比、`y` 轴设 `min:0,max:100`，`tooltip.callbacks.label` 从保留的原始值字段读回真实数字。
18. **色板的任何改动都必须跑 `python3 -m pytest tests/test_palette.py`**，未达 WCAG AA（正文 4.5:1，大字/非文本 UI 3:1）不得入库。分类色（给不同数据系列区分用的颜色，不是状态色）的可辨识度要用 `delta_e`（色彩感知差异）加色觉障碍模拟去判定，**不能只看亮度对比度**——亮度对比度相近的两个颜色（典型例子：某种蓝和某种紫）人眼依然能轻松区分，只用亮度公式会把明明可辨识的配色误判为不合格，或者反过来放过色觉障碍用户真正分不清的组合。

### 测试纪律

19. **任何为测试而造的设施**（故障注入用的图表、尺寸探针之类）**必须只在 `?selftest=1` 这个 URL 参数下才创建**，不能在正常加载路径里存在。否则这些测试专用的东西会随交付页一起出厂，表现为控制台里莫名其妙的警告、画面上出现一张坏图、或图例里出现 `undefined` 这种字样——客户看到的产物里混进了开发期的脚手架。
20. **断言写完之后一定要做变异验证**：临时故意破坏对应的实现代码，确认断言会转红，再把实现代码改回来。本项目里"断言恒真"（看起来在测试，实际上永远通过，哪怕实现是错的）反复出现在这些地方：`css()` 读取返回值的方式导致 `!==` 比较恒为真；深色和浅色主题下某个 token 恰好同色，导致"颜色确实变了"这条断言测不出差异；手搓的回调函数自己构造参数再自己验证，等于自证；测试用的数据恰好落在观察不出差异的取值点上（比如两个本该不同的柱子高度因为取整而相等）。不做变异验证，这类断言会一直安静地通过，直到真正出 bug 时才发现它从来没起作用。
21. **`tests/test_browser.py` 里的两条护栏不要删：** `test_no_suite_threw`（整套浏览器断言如果中途抛异常崩溃，后面的断言会悄无声息地全部消失，不会报错，只是"没跑"）和 `test_assertion_count_floor`（断言总数设零余量下限，低于这个数字说明有断言被意外删掉或没跑到）。历史上真实发生过整套断言跑丢了 80%，而 `pytest` 依然全绿的情况——因为"没跑到的断言"和"跑了且通过的断言"从统计上看是一样的，必须靠独立的"崩溃检测"和"数量下限"两条护栏才能发现。

## 测试

```bash
python3 -m pytest tests/ -v
```

无 node 环境，测试走两条路：pytest 直接测 `build.py` 的内联/守卫逻辑与色板 WCAG 合规；浏览器行为断言由 `demo/selftest.js` 在 `?selftest=1` 下于真实 DOM/Canvas 环境中运行，经 `chromium --headless --dump-dom` 把结果回传给 pytest 解析（见 `tests/test_browser.py`）。

## 许可

本项目采用 [MIT License](LICENSE)。

内联于 `src/vendor/chart.umd.js` 的 [Chart.js](https://www.chartjs.org) 4.4.0 同样是 MIT 许可，版权声明保留在该文件头部，未作改动。
