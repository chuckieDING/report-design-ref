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

`src/vendor/` 下现在是两个文件内联进同一个 `<script>` 标签：`chart.umd.js`（Chart.js 4.4.0 本体）在前，`chartjs-chart-sankey.umd.js`（桑基图插件）在后——顺序不能换，插件的 UMD 工厂函数在非 AMD/CommonJS 环境下读的是全局 `Chart`，Chart.js 必须先执行完才有这个全局可读。两个 vendor 文件都内联之后，产物体积比只有 Chart.js 时大了约 26 KB（`demo.html`/`index.html` 从约 437 KB 增至约 462 KB；`starter.html` 从约 306 KB 增至约 316 KB）——桑基插件本身压缩后约 10.6 KB，其余差值是新增的「组件全览」演示卡片内容和 `?selftest=1` 下的断言代码（只在带这个参数访问时才会被执行，但源码仍会内联进产物）。



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
| `DS.tables.sortable(sel)` | 表头点击排序，数字列按数值（含千分位逗号、`%`、`h`/`min`/`s` 时长单位、`hh:mm` 式时长，见下方「数字列排序支持的格式」）；同时会把数字列的表头对齐成右对齐，见下方「数字列的表头对齐」 |
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

### 数字列的表头对齐

`.ds-table td.num` 右对齐数字单元格，这是`.ds-table`一直就有的约定——数字列的 `<td>` 自己加 `class="num"`。但表头 `<th>` 默认固定左对齐（`.ds-table th { text-align: left }`），早先的版本里没有任何机制让数字列的 `<th>` 跟着右对齐：数字列的标题停在左边，数据却右对齐飘在右边，视觉上整列错位接近一个列宽——用户点错位的表头排序、盯着标题正下方看到的其实是旁边一列的数字，会被误判成"排序没生效"。

正确写法是数字列的 `<th>` 和 `<td>` **都**加 `class="num"`（见 demo 页「运行明细」表的 `切片数`/`时长(分)` 两列）：

```html
<th class="num">切片数</th>
...
<td class="num">64</td>
```

`DS.tables.sortable(sel)` 会在每次调用时自动补上这一步，使用者就算忘了给 `<th>` 加类也不会错位：它按列扫描 `<tbody>`，一列里所有非空 `<td>` 都带 `num` 类才判定为数字列，并给对应的 `<th>` 补上同一个类。判定依据是 `<td>` 实际有没有 `num` 类，而不是单元格内容像不像数字——两者是两回事：一列全是数字字符的编号（比如纯数字批次号），如果作者没有把它标成 `num`（即故意保留左对齐），自动判定不会去猜内容、强行给它的表头加上右对齐，不会凭空制造一个新的错位。

这个自动判定是幂等、可重入的：消费者按标准做法在表格重渲染后再调一次 `sortable(sel)`，如果某一列的数据从数字变成了文本（或反过来），表头对齐会跟着重新判定；它只会移除自己之前自动加上的类，使用者自己手写在 `<th>` 上的 `num` 类（无论该列数据是否整列右对齐）永远不会被这个自动判定摘掉或覆盖。

demo 页的 `<th>` 没有只依赖这个自动机制——`demo/demo.js` 里数字列的表头显式写了 `class="num"`，作为"正确写法"的示例，便于直接照抄。

## 滚轮缩放的四种方式

建项目时由 `DS.charts.init({wheel: ...})` 定死一种，**不暴露给终端用户**——该选择器只存在于 demo 页，供设计/开发现场比较差异用。

| 模式 | 滚轮行为 | 缩放途径 |
|---|---|---|
| `page` | 永远翻页 | 工具条 `−/+/⟲/⛶` + 拖框选 |
| `zoom` | 直接缩放 | 滚轮本身；工具条仍在 |
| `ctrl-zoom`（默认） | 按 Ctrl 缩放，否则翻页 | Ctrl+滚轮 + 工具条 |
| `smart` | 未到极限先缩放，到底后翻页 | 滚轮本身 |

工具条与拖框选在四种模式下**始终可用**。缩放工具条只挂在笛卡尔坐标图上（折线/柱状/面积等），不挂 pie / doughnut / polarArea / radar——那几类图没有"轴范围"概念，缩放没有意义。

## 报表常用的四种图表（以及桑基图）

demo 页「组件全览」里补了四种报表最常出现、但此前没演示过的图表形态（`demo/demo.js` 的 `c-combo` / `c-stacked` / `c-area` / `c-timeaxis`）。四种都是 Chart.js 原生支持的类型/配置组合，缺的只是演示、主题适配和断言——不是新的图表引擎。桑基图（`c-sankey`）不一样，它是本库唯一一个**不是 Chart.js 内置类型**的图表，走的是单独内联的第三方插件，见下方「桑基图」一节。

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

### 桑基图（流向/分配）

典型用于"流向/分配"场景——demo 页「组件全览」的 `c-sankey` 卡片演示的是样本从各接收点流向各仪器、再流向各结果状态，三段节点依次收窄/发散，很适合用桑基图直观呈现"谁流向了谁、流量各占多少"。

```js
DS.charts.create(canvas, {
  type: 'sankey',
  data: {
    datasets: [{
      label: '样本流向',
      data: [
        { from: '接收点A', to: '一号仪器', flow: 10 },
        { from: '一号仪器', to: '结果：正常', flow: 9 }
        // ...更多 {from, to, flow} 记录
      ]
    }]
  }
});
```

数据形状是 `{from, to, flow}` 记录的数组（字段名可通过 `dataset.parsing` 自定义，用法见 [chartjs-chart-sankey 文档](https://github.com/kurkle/chartjs-chart-sankey)），不是 Chart.js 其余图表那种 `labels` + 按索引对齐的 `data` 数组。节点键只要字符串相等就会被合并成同一个节点——跨阶段串联（比如上例里"一号仪器"同时是第一段的 `to` 和第二段的 `from`）靠的是字面量完全相等，不是模糊匹配。

**配色是自动的，不需要调用方关心**：`paint()` 按节点第一次出现的顺序给每个节点分配 `--chart-s1..s6`（不管这个节点在某条流向记录里是 `from` 还是 `to`，颜色都一致），流向本身用 Chart.js 自带的 `.alpha(0.5)` 半透明渲染（插件写死的行为，交叉处依然能分辨谁流向谁，不需要额外配置）。节点标签文字色取 `--color-text`，节点描边取 `--color-surface`（和弧形族扇区描边同一个理由：深浅主题下都能把相邻节点分隔开）。跟其余图表同一套"调用方给了就不碰"的约定：`dataset.colorFrom`/`colorTo`/`color`/`borderColor` 只要显式提供了初始值，就不会被 `paint()`/`retheme()` 覆盖。

**不要指望它能缩放，也不要给它挂缩放工具条。** chartjs-chart-sankey 的 x/y 是插件自己注册的内部数值轴（`bounds: 'data'`、`display: false`），纯粹用来算布局，不是开发者可配置/可缩放的笛卡尔轴——`DS.charts` 把 `'sankey'` 并入了 `NON_CARTESIAN_TYPES` 黑名单，`create()` 不会给它挂 `$ds` 缩放状态或悬浮工具条，`paint()` 也不会往它的轴上注入网格/刻度主题色，跟 pie/doughnut/radar/polarArea 是同一个处理方式。

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
| 桑基图 `dataset.colorFrom`/`colorTo`/`color`/`borderColor`——仅当这一项是库自动赋值的（`__dsAutoColorFrom`/`__dsAutoColorTo`/`__dsAutoColor`/`__dsAutoBorder` 标记） | `colorFrom`/`colorTo` 按节点分配的分类序列色（scriptable 函数）；`color`（标签文字）是当前主题的 `--color-text`；`borderColor`（节点描边）是当前主题的 `--color-surface` |

**只在调用方没配置时才补默认值**（"没传才补"，配置了就原样尊重）：

| 字段 | 默认值 |
|---|---|
| `options.interaction` | `{ mode: 'index', intersect: false }` |
| `options.plugins.tooltip.mode`/`intersect` | `'index'` / `false` |
| 额外轴（非 `x`/`y`）的 `grid.drawOnChartArea` | `false` |
| 类目轴的 `ticks.callback` | 超长标签截断逻辑 |
| `dataset.backgroundColor`/`borderColor`——调用方显式提供了初始值的那一侧 | 保留调用方的值，不管之后 retheme 多少次 |

**不是字段级覆盖，而是 `paint()`/`create()` 的其他隐性行为**（决定的是"要不要做某件事"，不是"把某个字段覆盖成什么值"，但同样容易被忽略，一并摊开）：

| 行为 | 触发条件 |
|---|---|
| 要不要在 `options.scales` 里创建某个 scale key（典型是 `x`/`y` 这两根"主轴"） | 只有类目轴（`zoomAxisFor()` 判定出的那一个）和被某个 dataset 的 `xAxisID`/`yAxisID` 显式引用过的轴才会被创建；调用方自己在 `options.scales` 里声明过的轴，不管有没有 dataset 引用，也会保留。不满足这两个条件就不创建——否则会出现「幽灵轴」：Chart.js 一旦在 `options.scales` 里看到某个 key，哪怕没有数据集真正用它，也会把它当成一根真实坐标轴实例化并绘制，量程退化成默认的 `0..1`。见「技术陷阱」#20。 |
| 要不要给 `options.layout.padding.top` 注入 `30`（给悬浮工具条让出顶部空间） | **不在 `paint()`/`retheme()` 里做**，是 `create()`（`new Chart()` 和 `_mountToolbar()` 都跑完之后）做一次一次性后验校正（内部方法 `DS.charts._fitToolbarLegend()`）：容器高度低于 150px（compact 规格 90px 必在其中）直接豁免；图例不存在/被关闭/不在顶部也豁免；都不豁免的话，再用图例的逐项命中框（`legend.legendHitBoxes`）和工具条 DOM 的真实包围盒做矩形相交判断，真的会被压住才注入，不会被压住就不注入——单项图例、或图例虽多项但当前画布够宽、水平方向够不到工具条所在的角落，都不会被加这段留白。调用方自己配置过 `layout.padding.top` 的话优先尊重，永远不会被这段逻辑覆盖。`create()` 还把 `chart.resize` 包了一层，之后任何一次 `resize()`——本库全屏按钮触发的、调用方自己手动调的，还是 Chart.js 内置 `ResizeObserver` 在容器尺寸变化（包括从隐藏标签页变可见）时自动触发的——都会顺带重新判一次，大多数场景不需要调用方知道 `_fitToolbarLegend` 这个方法的存在。唯一仍需调用方手动补调 `chart.resize()` 的，是本仓库这种不支持 `ResizeObserver` 依赖的 `requestAnimationFrame` 的特殊测试环境（headless chromium 的 `--virtual-time-budget` 模式）——这是这类环境本身的已知限制，`demo.js` 的 selftest 套件已经对受影响的图表手动补了 `resize()`，可以直接参考。见「技术陷阱」#23 和 `src/charts.js` 里 `TOOLBAR_TOP_RESERVE` 定义处的完整说明。 |

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

## 测试

```bash
python3 -m pytest tests/ -v
```

无 node 环境，测试走两条路：pytest 直接测 `build.py` 的内联/守卫逻辑与色板 WCAG 合规；浏览器行为断言由 `demo/selftest.js` 在 `?selftest=1` 下于真实 DOM/Canvas 环境中运行，经 `chromium --headless --dump-dom` 把结果回传给 pytest 解析（见 `tests/test_browser.py`）。

## CI

`.github/workflows/ci.yml` 在 push 到 `main` 和 PR 时自动跑，一个 job 三步：

1. **安装 chromium**（`browser-actions/setup-chrome@v1`，固定装 `stable` 版，不依赖 runner 自带、版本会漂移的系统浏览器）并通过 `DS_TEST_CHROMIUM` 环境变量（见 `tests/conftest.py`）指给 pytest。
2. **校验 `index.html` 与源码同步**：重新跑一次 `python3 build.py demo`，逐字节比对产物和仓库里已提交的 `index.html`，不一致就让 CI 失败并打印 diff。这是为了防止"改了 `src/`/`demo/` 忘了本地 build 就 push"——那会让 GitHub Pages 线上页面悄悄落后于仓库代码。`tests/test_build.py::test_index_html_is_tracked_and_matches_demo_build` 其实也测了同一件事，这一步是独立的第二道闸门，报错更直白，也不依赖那条 pytest 用例将来不被误删。
3. **跑 `python3 -m pytest tests/ -v` 全量测试**：61 个用例，含 `?selftest=1` 下的全部 233 条浏览器断言（`tests/test_browser.py` 里依赖 `selftest` fixture 的 12 个用例都会真正拉起 headless chromium 渲染并解析结果，不是只跑不需要浏览器的那部分）。`build.py` 的 `guard()`（零外链 + 去标识化）在 `build()` 内部无条件执行，`test_build.py` 里已有专门用例核验其拦截逻辑，这一步顺带覆盖，不重复实现。

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
