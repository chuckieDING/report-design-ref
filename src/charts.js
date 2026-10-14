/* charts.js —— DS 图表层：token 注入、空态、主题联动、长标签截断。
   滚轮缩放与工具条在 Task 6 追加。

   关于动画：本机 headless chromium 的 requestAnimationFrame 回调永不触发，
   Chart.js 默认动画器依赖 rAF，一旦开启动画，首次绘制的完成回调永远不会发生。
   因此这里做双保险禁用：init() 里关一次全局默认值，paint() 里对每个传入的
   config 再关一次 —— paint() 必然在 create() 内被调用，即使调用方忘了先跑
   init() 也不会踩坑。此文件里也不使用 rAF。 */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  var registry = [];
  var options = { wheel: 'ctrl-zoom', maxLabel: 10 };

  // 弧形/极坐标族（pie/doughnut/polarArea）和雷达图（radialLinear 的 'r' 轴）
  // 都不吃 x/y scales 配置 —— 硬塞会在弧形图上画出幽灵坐标轴，把 chartArea
  // 挤歪。用黑名单而不是白名单：省略 config.type 的混合图、或日后自定义注册
  // 的图表类型，默认按笛卡尔处理——渲染上色块/轴线不对会立刻看得见，比"静默
  // 少一套主题色"更容易被发现。
  var NON_CARTESIAN_TYPES = ['pie', 'doughnut', 'polarArea', 'radar'];
  // 弧形族：每个数据点一个扇区，需要颜色数组而不是单一颜色。
  var ARC_TYPES = ['pie', 'doughnut', 'polarArea'];

  function isCartesian(type) { return NON_CARTESIAN_TYPES.indexOf(type) === -1; }
  function isArc(type) { return ARC_TYPES.indexOf(type) !== -1; }

  // 类目轴判定：indexAxis:'y' 的横向条形图里类目在 y 轴、数值在 x 轴；
  // 默认（含 indexAxis 留空）类目在 x 轴。paint() 的长标签截断和下面的
  // 缩放/拖框选必须认同一个轴——此前两处各写了一份判定，缩放那份永远
  // 认 x 轴，横向条形图上点一下工具条就会把数值轴钳成 0..1、柱子冲出
  // 绘图区，是一个会被用户一键触发的 bug（Review C1）。现在统一成这一
  // 个函数，两处都调它。
  function zoomAxisFor(indexAxisValue) {
    return indexAxisValue === 'y' ? 'y' : 'x';
  }

  var WHEEL_MODES = ['page', 'zoom', 'ctrl-zoom', 'smart'];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // 面积图（line + fill）的填充色需要是线条色的半透明版本，否则多条面积图
  // 叠在一起会互相完全遮挡（纯色块看不出谁在上谁在下）。tokens.css 里的
  // 颜色都是 6 位十六进制，这里只转换运行时从 CSS 变量读出来的值，不在源码
  // 里写任何颜色字面量。
  //
  // alpha 取值的论证（复核修正版——上一版把浅/深两套主题的结论写反了）：
  // 用 WCAG 相对亮度公式（跟 demo.js selftest、validate_palette.py 同一套）
  // 把六条分类序列色分别按给定 alpha 合成到浅色 surface（#ffffff）和深色
  // surface（#18181b）上，算合成色对各自背景的真实对比度，取两套主题下
  // 各自的最小值（离线脚本独立复算过，数字可复现）：
  //   alpha=0.22：浅色最低 1.158（s4 琥珀，已经跌破 1.2 这条此前热力图最低
  //               档也用过的可见性下限）；深色最低 1.226（没有跌破）。
  //   alpha=0.28：浅色最低 1.200（s4 琥珀，刚好卡在下限上，不是"明显高于"）；
  //               深色最低 1.307。
  //   alpha=0.34（现在用的值）：浅色最低 1.251；深色最低 1.416——两套主题
  //               都有确定的余量，不再贴着下限走。
  // 真正的短板始终在**浅色**主题（不是深色），短板颜色是 s4 琥珀（其次是
  // s6 天蓝）——这两个本来就是偏亮的颜色，合成到接近纯白的背景上对比度
  // 天花板不高：哪怕 alpha 推到 1.0（也就是完全不透明，不再是面积图的半
  // 透明填充，是任意位置都在用的那个不透明序列色本身），s4 对纯白的 WCAG
  // 对比度也只有 1.918。0.34 是"半透明叠加不互相遮挡"和"浅色主题下尽量
  // 不贴着可见性下限"之间的折中，不能指望靠调高 alpha 把浅色这条短板完全
  // 消除——这是色板本身的特性，不是这次改动引入的缺陷。换掉色板（README
  // 明确鼓励使用者这么做）之后，这里的数字需要重新核算。
  var AREA_FILL_ALPHA = 0.34;

  // Chart.js 支持的全部"要填充"取值：true / 'origin' / 数字索引（相对另一
  // 个 dataset 索引）/ 非 'false' 的字符串（'start'/'end'/'-1' 这类）/ 对象
  // 写法 {target, above, below}（分别给填充区域上下两侧配不同颜色）。此前
  // 漏判了对象写法——用这种写法的数据集 backgroundColor 仍然是不透明色，
  // 正是这批要消灭的"实心色块互相遮挡"问题本身（复审实测复现）。
  function isFillValue(fill) {
    if (fill === true || fill === 'origin') return true;
    if (typeof fill === 'number') return true;
    if (typeof fill === 'string') return fill !== 'false';
    if (fill && typeof fill === 'object') return true;
    return false;
  }

  function hexToRgba(hex, alpha) {
    var raw = String(hex).replace('#', '');
    if (raw.length === 3) {
      raw = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
    }
    var r = parseInt(raw.substr(0, 2), 16);
    var g = parseInt(raw.substr(2, 2), 16);
    var b = parseInt(raw.substr(4, 2), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      // tokens.css 的颜色约定是 6 位十六进制，但 README 明确鼓励使用者替换
      // 整套色板——如果换成了 rgb()/hsl()/颜色关键字这类非十六进制格式，
      // 这里解析不出分量。与其静默产出一个带 NaN 的非法 rgba() 字符串
      // （浏览器会判这条 CSS 属性整体无效，填充直接画不出来，且不抛错、
      // 不告警，排查成本极高——复审实测复现过），不如放弃半透明、原样退回
      // 调用方给的颜色字符串——面积图会退化成不透明色块（牺牲"多图叠加不
      // 互相遮挡"这个次要效果），但图形本身不会凭空消失。
      return String(hex);
    }
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // 工具条（放大/缩小/复位/全屏）用 position:absolute 悬浮在宿主右上角，
  // Chart.js 默认把图例画在画布最顶上，多数据集图表的图例一旦够宽，最右边
  // 的条目会被工具条整个盖住（复审实测：三项图例的堆叠柱状图，第三项
  // "设备C"被压得只剩"设备"二字，深浅主题都复现）。此前没暴露是因为这批
  // 之前所有笛卡尔图的图例都只有 1 项，不会伸到右上角。
  //
  // 这里曾经的修法是 paint() 无条件给所有笛卡尔图注入
  // `layout.padding.top = 30`——对"图例+绘图区"整体让出一段顶部留白，简单
  // 但代价是**所有**笛卡尔图都要付这 30px，不管这张图的图例有没有可能伸到
  // 工具条所在的角落。后果在小容器上暴露得最明显：`.ds-chart-host--compact`
  // （components.css 里正式支持的 90px 矮宿主规格）配上真实数据时，绘图区
  // 被压到只剩 1.6px（实测复现），图表事实上不可用——compact 规格本来就
  // 不可能撞上工具条（宿主矮到工具条按钮都放不下的程度），这 30px 纯粹是
  // 陪绑。
  //
  // 现在改成按需留白：不在 paint() 里无条件写，而是在 create() 里
  // `new Chart()`、`_mountToolbar()` 都跑完之后做一次性后验校正——这时候
  // 图例已经真实布局过（`chart.legend.legendHitBoxes` 可读，逐项命中框，
  // 和 `chart.width`/`canvas.width` 同一坐标系，已实测确认），工具条 DOM
  // 也已经挂上（`getBoundingClientRect()` 能量出它的真实占位，包括随滚轮
  // 模式变化的提示文案宽度——不用固定估值）。两边都是真实几何坐标，拿来
  // 判断是否真的重叠，重叠才补 `layout.padding.top`，不重叠（单项图例、
  // 或容器矮于 `LEGEND_TOOLBAR_MIN_HOST_HEIGHT` 这种工具条本来就不会贴上去
  // 的情形）就不补——见 `_fitToolbarLegend()`。
  //
  // 创建时是一次性判定，不会随后续容器缩放自动重新检测——但 create() 里
  // 把 chart.resize 包了一层（见那里的说明），之后任何一次 resize()，不管
  // 是本库全屏按钮触发的、调用方自己手动调的，还是 Chart.js 内置
  // ResizeObserver 在容器尺寸变化（包括从 display:none 变可见）时自动触发
  // 的，都会在 resize 完成后重新判一次。'把图表所在的隐藏标签页切到可见'
  // 这类场景因此大多不需要调用方知道 _fitToolbarLegend 这个内部方法的
  // 存在——已实测验证：用真实的 `--headless=new`（而不是冻结渲染循环的
  // `--virtual-time-budget` 模式）加载 demo 页、只点标签页切换、不手动调
  // 任何 resize()，三项图例的堆叠柱状图图例依然正确避开了工具条，说明
  // ResizeObserver 确实会调用到这层包装。真正还需要手动补调 resize() 的，
  // 只剩下本仓库这一种本身就不支持 ResizeObserver 依赖的
  // requestAnimationFrame 的特殊测试环境（headless chromium 的
  // `--virtual-time-budget` 模式）——这是这类环境本来就有的已知限制（和
  // 全屏按钮 Bug 2 修复时踩的是同一个坑），不是这次改动新引入的，`demo.js`
  // 的 selftest 套件已经对这几张图表手动补了 resize()，可以直接参考。
  //
  // 包装只拦 resize，不拦 update：_fitToolbarLegend() 自己需要调整时只调
  // chart.update()，不会递归触发这层包装，不用担心死循环。
  //
  // 这里还踩过一个坑：曾经试过不包一层 resize，而是用 Chart.js 插件的
  // `afterLayout` 钩子全局接管、每次布局都自动重判——实测发现这条路不稳：
  // `new Chart()` 构造过程内部会先触发至少一次 `afterLayout`（这时
  // `legendHitBoxes` 还没来得及在这一轮里稳定，量到的是过渡态），而且一旦
  // 留白生效，图例会被推到工具条纵向范围以下，下一次自动重判会看到"现在
  // 不重叠了"而把刚加上的留白原地撤销，形成"加上留白 → 查出来不重叠 →
  // 撤销留白 → 又重叠"的判定来回（实测这条链路在一次 create() 里就能来回
  // 两轮，没有扩散成死循环只是因为"期望值等于当前值就不动"的幂等保护在
  // 第二轮之后刚好停在了一个巧合的状态，不能指望这个巧合）。判断本身要做
  // 归一化处理（见 legendOverlapsToolbar 的 appliedPaddingTop 参数）才能
  // 根治这个问题，但触发时机仍然改成只挂 resize——每次布局都重判的频率
  // 对这个场景来说是过度的，resize 已经覆盖了所有真正会让图例/工具条相对
  // 位置变化的时刻。
  //
  // 调用方自己配置过 `layout.padding.top` 的话优先尊重，不被这套逻辑碰——
  // 用独立的 `__dsAutoPaddingTop` 标志区分"这是我们自动写的"还是"调用方自己
  // 写的"，和 `__dsAutoBg`/`__dsAutoBorder` 是同一个模式。
  var TOOLBAR_TOP_RESERVE = 30;

  // 低于这个宿主高度（单位 px）直接跳过留白判断——compact 规格（90px）就是
  // 要豁免的典型：这么矮的宿主里，图例和工具条本来就不可能同时有伸展空间
  // 让两者真的撞上，谈"按需留白"没有意义，徒增判断成本还可能在极端布局下
  // 把本就紧张的高度压得更紧。150 在 90（compact）和 260（常规）之间留了
  // 余量，不贴着 compact 的具体数值写。
  var LEGEND_TOOLBAR_MIN_HOST_HEIGHT = 150;

  // 判断图例是否真的被工具条遮住：取图例的逐项命中框（legendHitBoxes）和
  // 工具条 DOM 的真实包围盒，换算到同一个"相对 canvas 左上角"的坐标系里做
  // 矩形相交判断。不用固定估值（工具条宽度随滚轮模式提示文案变化，最长是
  // "滚轮缩放，到底翻页"），也不只比较"图例顶边 vs 工具条底边"这种整体粗
  // 判断——那样会漏掉"图例没换行、但前几项离左边很近，工具条只压住最后
  // 一项的一部分"这类局部重叠。
  //
  // appliedPaddingTop 是"这张图当前已经由我们自己注入的 layout.padding.top"
  // （没注入过就是 0）。判断前先把每个命中框的纵坐标减去这个值，换算回
  // "假设没加过这段留白"的基准线上再比——不能直接用命中框的当前坐标判断：
  // 留白一旦生效，图例会被整体推低到工具条纵向范围以下，这时候如果不做这
  // 个还原，会读到"现在不重叠了"，反而把刚加上的留白当成不需要而撤销掉，
  // 形成"加留白→查出不重叠→撤销→又重叠"的判定来回（实测复现过，见
  // TOOLBAR_TOP_RESERVE 定义处的说明）。
  function legendOverlapsToolbar(chart, host, appliedPaddingTop) {
    var legend = chart.legend;
    if (!legend || !legend.options || legend.options.display === false) return false;
    if ((legend.options.position || 'top') !== 'top') return false;
    var hitBoxes = legend.legendHitBoxes;
    if (!hitBoxes || !hitBoxes.length) return false;
    var toolbarEl = host.querySelector('.ds-chart-toolbar');
    if (!toolbarEl) return false;
    var canvasRect = chart.canvas.getBoundingClientRect();
    // 画布 0 尺寸（典型：宿主正处于 `hidden` 标签页里，display:none 的
    // 祖先把整条子树的布局盒都收缩成 0）时，getBoundingClientRect() 全是
    // 0，没有真实几何可比——判"不重叠"更安全，等调用方让宿主真正可见、
    // 触发一次 resize()/update() 并重新调用 _fitToolbarLegend() 之后会用
    // 真实尺寸重新判一次（见 TOOLBAR_TOP_RESERVE 定义处的说明）。
    if (canvasRect.width === 0 || canvasRect.height === 0) return false;
    var toolbarRect = toolbarEl.getBoundingClientRect();
    var tLeft = toolbarRect.left - canvasRect.left;
    var tRight = toolbarRect.right - canvasRect.left;
    var tTop = toolbarRect.top - canvasRect.top;
    var tBottom = toolbarRect.bottom - canvasRect.top;
    return hitBoxes.some(function (hb) {
      var hLeft = hb.left;
      var hRight = hb.left + hb.width;
      var hTop = hb.top - appliedPaddingTop;
      var hBottom = hTop + hb.height;
      return hLeft < tRight && hRight > tLeft && hTop < tBottom && hBottom > tTop;
    });
  }

  // entry.chart.canvas 在 chart.destroy() 后会被 Chart.js 置为 null，
  // 用它判断实例是否还活着；registry 里 destroy 之后的死实例要物理摘除，
  // 否则 entry 会一直强引用 Chart 实例 + 原始 config（连带整份 dataset）不释放。
  function isAlive(entry) { return !!(entry.chart && entry.chart.canvas); }

  function pruneDestroyed() {
    for (var i = registry.length - 1; i >= 0; i--) {
      if (!isAlive(registry[i])) registry.splice(i, 1);
    }
  }

  DS.charts = {
    init: function (opts) {
      opts = opts || {};
      if (opts.wheel) options.wheel = opts.wheel;
      if (opts.maxLabel) options.maxLabel = opts.maxLabel;
      if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = cssVar('--font-sans') || 'sans-serif';
        Chart.defaults.font.size = 12;
        Chart.defaults.animation = false;  // 报表场景优先确定性，也让自动化测试可判定
      }
      document.addEventListener('ds:themechange', DS.charts.retheme);
    },

    options: function () { return options; },

    themeColors: function () {
      return {
        grid: cssVar('--chart-grid'),
        axis: cssVar('--chart-axis'),
        text: cssVar('--color-text-secondary'),
        series: ['--chart-s1', '--chart-s2', '--chart-s3',
                 '--chart-s4', '--chart-s5', '--chart-s6'].map(cssVar)
      };
    },

    /* 时间轴退而求其次的方案：内联的 src/vendor/chart.umd.js 是裸 Chart.js
       4.4.0，没有带 chartjs-adapter-date-fns 之类的日期适配器（Chart.js 的
       'time'/'timeseries' 轴类型本身依赖它才能解析/格式化时间），本仓库零
       外链、不联网下载第三方库，所以不内联适配器。这里退回到 'linear' 数值
       轴 + 自定义 ticks.callback，把时间戳（毫秒）格式化成日期标签，达到
       视觉等效——不是真正的 time scale（没有"按天/按周自动选刻度密度"这类
       能力，刻度密度仍由 Chart.js 对线性轴的默认算法决定），细节见 README
       「时间轴」一节。
       全部用 UTC 方法（getUTCMonth/getUTCDate/...）而不是本地时区的
       getMonth/getDate：渲染断言要在任何时区的机器上都算出同一个字符串，
       调用方用 Date.UTC() 生成时间戳时两边口径一致。 */
    dateTicks: function (fmt) {
      fmt = fmt || 'md';
      function pad2(n) { return n < 10 ? '0' + n : String(n); }
      return function (value) {
        var d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        if (fmt === 'ymd') {
          return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
        }
        return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
      };
    },

    /* 数据为空时不画空白画布，渲染一条明确的空态。 */
    isEmpty: function (config) {
      var ds = (config.data && config.data.datasets) || [];
      if (!ds.length) return true;
      return ds.every(function (d) { return !d.data || d.data.length === 0; });
    },

    create: function (canvas, config) {
      // 同一块 canvas 二次 create()：真实报表随筛选条件重渲染是常态。
      // Chart.js 不允许一块 canvas 同时绑定两个实例（会抛
      // "Canvas is already in use" ），所以先销毁旧实例再建新的。
      var existing = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(canvas) : null;
      if (existing) {
        existing.destroy();
        pruneDestroyed();
      }

      var host = canvas.parentNode;
      var prior = host.querySelector('.ds-chart-empty');
      if (prior) prior.remove();

      // 上一轮实例（如果有）的工具条和缩放指针统一在这里摘掉——不管接下来
      // 这次 create() 是不是笛卡尔图、是不是空数据。旧工具条的按钮闭包着
      // 已经 destroy() 掉的 chart，继续挂在 DOM 上点一下就是
      // "Cannot read properties of null"（Review I1：筛选条件一变数据变
      // 空，create() 返回 null 画"暂无数据"，空态上方却悬着上一轮的工具
      // 条，是真实会被用户点到的路径）。
      var staleBar = host.querySelector('.ds-chart-toolbar');
      if (staleBar) staleBar.remove();
      canvas._dsChart = null;

      if (DS.charts.isEmpty(config)) {
        canvas.style.display = 'none';
        var tip = document.createElement('div');
        tip.className = 'ds-chart-empty';
        tip.textContent = '暂无数据';
        host.appendChild(tip);
        return null;
      }
      canvas.style.display = '';

      DS.charts.paint(config);
      var chart = new Chart(canvas, config);

      // 缩放工具条只挂笛卡尔图——饼图/雷达图没有 x/y 轴，缩放对它们没有意义，
      // 挂上去就是一组无效按钮。非笛卡尔实例不设 chart.$ds，zoom/resetZoom/
      // zoomRange/isZoomed 对它们调用会直接短路返回，不抛错。
      if (isCartesian(config.type)) {
        var zAxis = zoomAxisFor(chart.options.indexAxis);
        var hasLabels = !!(config.data.labels && config.data.labels.length);
        // 每个实例独立的一份状态，绝不写成模块级共享游标——否则操作 A 图会
        // 串台影响 B 图（Review Focus #4）。min/max 初始为 null 表示"没有
        // 显式缩放约束，交给 Chart.js 自动量程"，而不是我们自己算一份
        // "满量程"写死进去——resetZoom() 复位时也是回到 null，而不是重新
        // 算一遍（算法一旦跟实际量程对不上就会永久回不去，见下面 _apply）。
        // natural 只给"没有类目标签"的笛卡尔图（scatter / x:linear 这类）
        // 用：缩放时按数据域等比例收放，而不是硬套索引域（Review C1，此前
        // 这类图表一点 ⟲ 就会把量程压成 0..0）。
        chart.$ds = {
          min: null,
          max: null,
          mode: options.wheel,
          natural: hasLabels ? null : { min: chart.scales[zAxis].min, max: chart.scales[zAxis].max }
        };

        // canvas 可能被二次 create() 复用（M4）：wheel/drag 监听器只在这块
        // canvas 第一次挂缩放时绑定一次，往后都通过 canvas._dsChart 这个可变
        // 指针找到"当前"实例——否则每次 create() 都会在同一块 canvas 上叠一层
        // 新监听器，旧的仍然存活并闭包着已销毁的旧 Chart 实例，事件一触发就
        // 可能对着死实例调用 chart.update() 出错（Review I2 的变异测试证实
        // 过这个分支必须真的只绑一次，demo.js 里有带名字的回归断言盯着）。
        canvas._dsChart = chart;
        if (!canvas._dsWheelBound) {
          canvas._dsWheelBound = true;
          // { passive:false } 是必须的——_onWheel() 在 zoom/ctrl-zoom/smart
          // 模式下要能 preventDefault() 吞掉滚轮事件。'page' 模式下其实用不
          // 着这个（它从不 preventDefault），但监听器是按 canvas 绑一次、
          // 不随 setWheelMode() 动态增减的；为 'page' 模式单独摘换成
          // passive 监听器换取理论上的滚动快路径，复杂度大于收益，裁定为
          // deferred minor（Review M7，不用改）。
          canvas.addEventListener('wheel', function (ev) {
            DS.charts._onWheel(canvas._dsChart, ev);
          }, { passive: false });
          DS.charts._mountDrag(canvas);
        }

        DS.charts._mountToolbar(chart);

        // 把 chart.resize 包一层：不管是谁触发的 resize()——本库自己全屏
        // 按钮里那次、调用方自己手动调的那次，还是 Chart.js 内置
        // ResizeObserver 在容器尺寸变化（包括从 display:none 变可见）时
        // 自动调用的那次——resize 完成后都顺便重新判一次要不要给工具条
        // 让出顶部空间。这样"把图表所在的隐藏标签页切到可见"这类场景，
        // 只要 Chart.js 自己的响应式机制正常工作（它靠 ResizeObserver，
        // 这个仓库唯一不支持这条路径的环境是本机 headless chromium 的
        // `--virtual-time-budget` 模式——它连 ResizeObserver 依赖的
        // requestAnimationFrame 都不触发，所以这类环境下仍然需要调用方
        // 手动调一次 chart.resize()，demo.js 的 selftest 套件已经这样
        // 做），都不需要调用方知道 _fitToolbarLegend 这个内部方法的存在。
        // 只包 resize，不包 update：_fitToolbarLegend 自己需要时只调
        // chart.update()，不会递归触发这层包装，不会死循环。
        var origResize = chart.resize.bind(chart);
        chart.resize = function () {
          origResize.apply(chart, arguments);
          DS.charts._fitToolbarLegend(chart);
        };

        // 工具条 DOM 刚挂上，图例也已经被 new Chart() 真实布局过——两边的
        // 几何坐标现在都是真的，判断"要不要给工具条让出顶部空间"就放在
        // 这里，补上"从创建到第一次 resize() 之间"这段空档。必须排在
        // _mountToolbar() 之后：量重叠靠的就是刚挂上的工具条元素的
        // getBoundingClientRect()，顺序反了的话工具条还不存在，查不到任何
        // 重叠（Review 裁决 (c)）。
        DS.charts._fitToolbarLegend(chart);
      }

      // 记录的是传进来的原始 config 对象，而不是 chart.options。两者都可读可
      // 写（chart.options 的嵌套属性可以直接赋值，会真的落回底层并能读回新
      // 值），但 retheme() 用的是 `x = x || {}` 这种自赋值惯用法：如果对象是
      // 从 chart.options 这个跨 scope 合成的 resolver Proxy 上读出来的子对象
      // 再写回它自己的 scope，会在 Proxy 内部的缓存/路径解析逻辑里形成自引用，
      // 实测两种炸法都见过（嵌套较深的 tooltip.callbacks 触发 RangeError 调用
      // 栈溢出；scales.y.grid 触发 TypeError，因为 Proxy 把期望的 scope-key
      // 字符串换成了子 Proxy 对象）。保存并复用这份从未被 Chart.js 包装过的
      // 原始 config 对象，`x = x || {}` 操作的就是普通对象，不会触发这个坑。
      registry.push({ chart: chart, config: config });
      return chart;
    },

    /* 把当前主题的颜色写进 config —— Chart.js 在创建时固化颜色，
       不会跟随 CSS 变量变化，所以每次主题切换都要重写一遍再 update()。 */
    paint: function (config) {
      var c = DS.charts.themeColors();
      config.options = config.options || {};
      var o = config.options;

      // 双保险之二：无论调用方是否先跑过 init()，这里强制关闭动画。
      // paint() 必定在 create() 中被调用，覆盖面比 init() 里的全局默认值更可靠。
      o.animation = false;

      o.maintainAspectRatio = false;
      o.plugins = o.plugins || {};
      o.plugins.legend = o.plugins.legend || {};
      o.plugins.legend.labels = o.plugins.legend.labels || {};
      o.plugins.legend.labels.color = c.text;

      // 不再自定义 tooltip 的 title 回调：Chart.js 对 category 轴的默认 title
      // 走 context[0].label（来自 scale.getLabelForValue()），本就不经过下面
      // 这个 ticks.callback，天生是未截断的全称。之前那份自定义回调纯属冗余，
      // 而且会无条件吃掉调用方自己想设的 title 回调——删掉更安全。

      // pie/doughnut/polarArea/radar 没有 x/y 轴，硬塞 scales.x/scales.y 会在
      // 弧形图上画出幽灵坐标轴、把 chartArea 挤歪。只有真正的笛卡尔系图表才注入。
      if (isCartesian(config.type)) {
        // 工具条顶部留白不在这里（paint()）处理：是否需要给图例让出空间，
        // 要等 new Chart() 真正布局过、工具条 DOM 也挂上之后才量得出来，
        // paint() 这时候两者都还不存在。见 create() 里的
        // DS.charts._fitToolbarLegend() 调用和 TOOLBAR_TOP_RESERVE 定义处
        // 的详细说明。

        // crosshair：Chart.js 内置的 index 模式足够——鼠标不必精确落在数据点
        // 上（intersect:false）就能联动高亮同一索引下的所有系列，不需要额外
        // 插件。只在调用方没有自己配置时才注入默认值（Review M2）：
        //   1）这段曾经写在 isCartesian 判断之外，连饼图/雷达图也被强行塞了
        //      index 模式，鼠标放在弧形图区域任意位置都会弹 tooltip；
        //   2）曾经是无条件覆盖赋值，调用方自己想要的 nearest+xy 这类组合
        //      会被每次 paint()（包括每次主题切换触发的 retheme）重新冲掉，
        //      永远拿不回控制权。现在改成"没传才补"，且只对笛卡尔图生效。
        if (o.interaction == null) {
          o.interaction = { mode: 'index', intersect: false };
        }
        o.plugins.tooltip = o.plugins.tooltip || {};
        if (o.plugins.tooltip.mode == null) o.plugins.tooltip.mode = 'index';
        if (o.plugins.tooltip.intersect == null) o.plugins.tooltip.intersect = false;

        // 类目标签截断要挂在"类目轴"上，不是无脑挂 x 轴：indexAxis:'y' 的横向
        // 条形图里，类目在 y 轴、数值在 x 轴，机台名称这类长标签正是挂在这里。
        // 默认 indexAxis 是 'x'。下面的缩放/拖框选复用同一个 zoomAxisFor()
        // 判定，不能各写各的（Review C1）。
        var categoryAxis = zoomAxisFor(o.indexAxis);
        o.scales = o.scales || {};
        // Bug 3：双轴（量 + 率）组合图常见的第二数值轴通常叫 y1（跟
        // dataset.yAxisID 对应），此前这里写死 ['x', 'y']，y1 的网格/刻度/
        // 轴线颜色从来没被注入过，切深色主题时会留在浅色。调用方自己额外
        // 声明的轴（y1、以至于任何将来出现的命名）从 o.scales 的实际 key
        // 里读出来，并入同一套注入循环；不区分类目轴以外的"类型"，因为这里
        // 能出现的只有类目轴（下面 categoryAxis 判定出的那一个，必然是
        // 'x' 或 'y'）和数值轴两种，数值轴统一走 else 分支（只上色，不截断
        // 标签），额外轴天然落在这一类。
        //
        // 幽灵轴（复审发现）：不能像上一版那样无条件把 'x'/'y' 都塞进
        // axisNames——如果调用方的全部数据集都把 yAxisID 指到 'y1'（双轴图
        // 常见写法：只用 y1 一根竖轴，压根不要默认的 'y'），这里仍然会强行
        // `o.scales.y = o.scales.y || {}` 捏出一个空对象。Chart.js 一旦在
        // options.scales 里看到 'y' 这个 key，哪怕没有任何 dataset 引用它，
        // 也会真的实例化并绘制这根轴——没有数据可读，量程退化成默认的
        // 0..1，一根跟真实数据毫无关系的幽灵轴就这样被画了出来（复审实测
        // 复现；且因为它被当成"主轴"处理，不吃额外轴的 drawOnChartArea
        // 默认规则，网格线照样画，比没有这根轴更容易误导人）。
        //
        // 修法：'x'/'y' 只有在真的被某个 dataset 引用时才强制创建；category
        // 轴（上面 zoomAxisFor 判定出的那一个）例外——它是整张图"索引"维度
        // 的载体，不依赖某个 dataset 显式指定 xAxisID/yAxisID，天然总是在用。
        // 调用方自己在 o.scales 里显式声明过的轴（不管是不是 'x'/'y'）同样
        // 保留，不因为"没有 dataset 引用"就被这条规则反过来删掉。
        var datasetsForAxisCheck = config.data.datasets || [];
        var usedAxisIds = {};
        datasetsForAxisCheck.forEach(function (d) {
          usedAxisIds[d.xAxisID || 'x'] = true;
          usedAxisIds[d.yAxisID || 'y'] = true;
        });
        var otherDefaultAxis = categoryAxis === 'x' ? 'y' : 'x';
        var axisNames = [categoryAxis];
        if (usedAxisIds[otherDefaultAxis] || o.scales[otherDefaultAxis]) {
          axisNames.push(otherDefaultAxis);
        }
        Object.keys(o.scales).forEach(function (name) {
          if (axisNames.indexOf(name) === -1) axisNames.push(name);
        });
        axisNames.forEach(function (axis) {
          o.scales[axis] = o.scales[axis] || {};
          var s = o.scales[axis];
          s.grid = s.grid || {};
          s.grid.color = c.grid;
          // 额外坐标轴（axisNames 里 'x'/'y' 以外的，典型是双轴组合图的
          // y1）默认不画网格线：两套网格线叠在一起对报表读者是纯噪音，
          // 惯例上只让主轴画网格、副轴只留刻度和轴线。只在调用方没有显式
          // 配置过 grid.drawOnChartArea 时才补这个默认值——调用方自己
          // 写了 true/false 就不覆盖（跟下面 interaction/tooltip.mode 的
          // "没传才补"是同一个原则）。'x'/'y' 这两根主轴永远保留 Chart.js
          // 自己的默认值（true），不在这条默认规则里。
          if (axis !== 'x' && axis !== 'y' && s.grid.drawOnChartArea == null) {
            s.grid.drawOnChartArea = false;
          }
          s.border = s.border || {};
          s.border.color = c.axis;
          s.ticks = s.ticks || {};
          s.ticks.color = c.text;
          // 只在调用方没有自己提供 ticks.callback 时才补默认的"超长中文标签
          // 截断"——此前这里无条件覆盖赋值，调用方想要的任何自定义刻度格式
          // 化（典型例子：时间轴退化方案用 DS.charts.dateTicks() 把时间戳
          // 格式化成日期标签）都会在每次 paint()（包括首次 create() 和每次
          // 主题切换触发的 retheme）被这段默认截断逻辑原地冲掉——类目轴上的
          // 数值会先被 Chart.js 的 getLabelForValue() 转成完整数字字符串
          // （比如时间戳 "1,704,067,200,000"），再被当成"超长标签"截断成一串
          // 看不出意义的 "1,704,0…"，整个时间轴格式化形同虚设。全称交给
          // Chart.js 默认 tooltip。
          if (axis === categoryAxis && s.ticks.callback == null) {
            s.ticks.callback = function (value, index) {
              var raw = this.getLabelForValue ? this.getLabelForValue(value) : value;
              raw = String(raw);
              return raw.length > options.maxLabel
                ? raw.slice(0, options.maxLabel) + '…'
                : raw;
            };
          }
        });
      } else if (config.type === 'radar' || config.type === 'polarArea') {
        // 雷达图和极区图共用 RadialLinearScale（默认轴名 'r'），既不是
        // isCartesian()（没有 x/y 轴），也不该完全不注入——此前整个 else
        // 分支是空的，'r' 轴的网格/角线/刻度/刻度背景色全部停留在 Chart.js
        // 默认值：深色主题下，默认网格色 rgba(0,0,0,.1)、刻度文字默认 #666、
        // 刻度数字背后还有一块默认 rgba(255,255,255,.75) 的白色背景块，叠在
        // #18181b 的 surface 上几乎看不清（复审实测复现）。pie/doughnut 没有
        // 任何坐标轴，继续不注入——isArc() 已经把它们的数据集着色单独处理。
        o.scales = o.scales || {};
        o.scales.r = o.scales.r || {};
        var rs = o.scales.r;
        rs.grid = rs.grid || {};
        rs.grid.color = c.grid;
        rs.angleLines = rs.angleLines || {};
        rs.angleLines.color = c.grid;
        rs.pointLabels = rs.pointLabels || {};
        rs.pointLabels.color = c.text;
        rs.ticks = rs.ticks || {};
        rs.ticks.color = c.text;
        // 'transparent' 不是色板里的一个颜色选择，是显式关掉 Chart.js 默认
        // 给刻度数字垫的半透明白底——那块白底在深色主题下自己就是一块突兀
        // 的亮斑，跟"源码无颜色字面量"这条约束管的东西（调用方用具体颜色
        // 值表达设计意图）不是一回事：这里是关闭一个不受主题变量控制、且
        // 和深色背景冲突的内置装饰。
        rs.ticks.backdropColor = 'transparent';
      }

      var arc = isArc(config.type);
      (config.data.datasets || []).forEach(function (d, i) {
        if (arc) {
          // 弧形族：每个扇区一个颜色，数组长度按数据点数来，颜色不够就循环取模。
          // 描边统一用 --color-surface：深浅主题下都能把相邻扇区正确分隔开，
          // 而不是像之前那样描边色和填充色完全一样、扇区之间看不出缝。
          var n = (d.data || []).length;
          var palette = [];
          for (var k = 0; k < n; k++) palette.push(c.series[k % c.series.length]);
          // __dsAutoBg/__dsAutoBorder 分开标，不共用一个 __dsAuto（复审
          // 发现的核心 bug）：此前两行共用同一个标志，背景色分支把它置
          // true 之后，边框分支的 `|| d.__dsAuto` 条件也会连带命中——调用方
          // 只给了 borderColor、没给 backgroundColor 的话，背景色分支按
          // "没给"走自动上色并把共享标志置真，边框分支因为这个被别的分支
          // 置真的标志，把调用方刚设好的颜色当场覆盖掉（变异验证：改回
          // 这个 bug，185 条既有断言 0 条转红，说明这条路径完全没被测到）。
          // 反过来，"只给 backgroundColor、不给 borderColor"也有一个对称的
          // 潜伏 bug：背景色分支因为是调用方自己给的，不会置标志，边框分支
          // 自动上色后同样没有标志能证明"这是自动色"，下次 retheme 时边框
          // 会原地冻结在第一次算出来的颜色上、不跟主题切换。拆成两个独立
          // 标志后两种情形都对了：谁被自动上色、谁的标志就置真，retheme
          // 只重算标志为真的那一侧，调用方显式给的颜色（不管给的是背景色、
          // 边框色，还是两个都给）永远不会被覆盖或漏更新。
          if (d.backgroundColor == null || d.__dsAutoBg) {
            d.backgroundColor = palette;
            d.__dsAutoBg = true;
          }
          if (d.borderColor == null || d.__dsAutoBorder) {
            d.borderColor = cssVar('--color-surface');
            d.__dsAutoBorder = true;
          }
        } else {
          var color = c.series[i % c.series.length];
          // 面积图（line + fill）：fill 是 Chart.js 自己认可的"要填充"取值
          // （见 isFillValue()）的数据集，backgroundColor 要是线条色的半
          // 透明版本，不能跟普通折线/柱状图一样给不透明色——不透明的话多条
          // 面积图叠在一起会变成互相完全遮挡的实心色块，看不出谁在上谁在下。
          // borderColor（线条本身、图例描边）仍然是不透明的系列色，没有
          // fill 的数据集（普通折线、柱状图）backgroundColor 也仍然是不
          // 透明色——这两类此前的行为原样保留，只有"这个数据集类型是 line
          // 且确实要填充"这一种情形走半透明分支，per-dataset 判断
          // （dataset.type 可以覆盖所属图表的 config.type，混合图里同一个
          // chart 常见"面积 + 普通折线"共存）。
          var dsType = d.type || config.type;
          var isFilledLine = dsType === 'line' && isFillValue(d.fill);
          // __dsAutoBg/__dsAutoBorder 的拆分理由同上面弧形族分支。
          if (d.backgroundColor == null || d.__dsAutoBg) {
            d.backgroundColor = isFilledLine ? hexToRgba(color, AREA_FILL_ALPHA) : color;
            d.__dsAutoBg = true;
          }
          if (d.borderColor == null || d.__dsAutoBorder) {
            d.borderColor = color;
            d.__dsAutoBorder = true;
          }
        }
      });
      return config;
    },

    retheme: function () {
      pruneDestroyed();
      registry.forEach(function (entry) {
        // 逐图隔离：一张图的 paint/update 炸了不能把后面的图都拖下水。
        // ds:themechange 是 CustomEvent，dispatchEvent() 不会把监听器里的异常
        // 传给调用方（DS.theme.set() 照常返回），如果这里不接住，问题会在
        // 控制台和应用层都悄无声息——多图页面上表现为"一半主题切了一半没切"。
        try {
          DS.charts.paint(entry.config);
          entry.chart.update('none');
        } catch (e) {
          var id = entry.chart && entry.chart.canvas && entry.chart.canvas.id;
          console.warn('DS.charts.retheme: 重绘失败，canvas=' + (id || '?'), e);
        }
      });
    },

    /* 已注册的活动实例；destroy() 过的不在其中。 */
    all: function () {
      pruneDestroyed();
      return registry.map(function (entry) { return entry.chart; });
    },

    /* 显式销毁并从 registry 摘除，供调用方主动释放，也是 Task 6 工具条
       清理图表时该用的入口。Review I1：摘除前必须先把工具条 DOM 和
       canvas._dsChart 指针一并清掉——chart.destroy() 之后 chart.canvas 会
       被置 null，工具条按钮的 click 闭包却还攥着这个 chart 对象，不清理的
       话点一下就是 "Cannot read properties of null"。canvas 引用必须在
       destroy() 调用之前取，destroy() 之后 chart.canvas 已经是 null 了。 */
    destroy: function (chart) {
      if (!chart) return;
      var canvas = chart.canvas;
      if (canvas) {
        var host = canvas.parentNode;
        if (host) {
          var bar = host.querySelector('.ds-chart-toolbar');
          if (bar) bar.remove();
          // Review C2：全屏模式下销毁必须把 host 的 ds-chart-fullscreen 一并
          // 摘掉。这个 class 是工具条 ⛶ 按钮加在 host 上的（charts.js
          // _mountToolbar），样式是 position:fixed; inset:24px; z-index:150——
          // 上面一行已经把唯一的退出入口（工具条本身）摘掉了，不清这个
          // class 的话，页面上会留下一块盖住整个视口、没有任何关闭途径的
          // 空白面板，只能刷新页面才能恢复（实测路径：放大看图 → 改筛选
          // 条件 → 消费者调用 destroy() 重建）。
          host.classList.remove('ds-chart-fullscreen');
        }
        if (canvas._dsChart === chart) canvas._dsChart = null;
      }
      try { chart.destroy(); } catch (e) { /* 已经销毁过，忽略 */ }
      pruneDestroyed();
    },

    /* ---------- 缩放：状态按实例隔离，绝不共享模块级游标 ----------
       统一缩放"类目轴"：indexAxis:'y' 的横向条形图里类目在 y 轴，
       zoomAxisFor() 和 paint() 里长标签截断用的是同一个判定（Review C1）。
       没有类目标签的笛卡尔图（scatter / x:linear 这类）没有"索引"概念，
       改按数据域等比例缩放，基准是 create() 时 Chart.js 自动算出的那份
       原始量程（挂在 chart.$ds.natural 上）。 */
    _bounds: function (chart) {
      var axis = zoomAxisFor(chart.options.indexAxis);
      var labels = chart.data.labels;
      if (labels && labels.length) {
        return { axis: axis, lo: 0, hi: Math.max(0, labels.length - 1), indexed: true };
      }
      // 自愈：create() 时如果画布还是 0 尺寸（比如挂在当时隐藏的标签页里），
      // Chart.js 对无类目的线性轴会退回一个占位量程（实测是 0..100），不是
      // 真实数据域，且这份快照此后再也不会自动刷新。只要当前没有处于缩放
      // 状态（视图本就该等于满量程本身），用"活的" scale 量程校正一次——
      // 画布一旦变得可见并真正 resize() 过，chart.scales 就是准的，借这个
      // 机会把 natural 快照修正回真实值，而不是让一次性的创建时快照永远
      // 带着错的占位量程。
      if (chart.$ds && chart.$ds.min == null && chart.$ds.max == null) {
        var live = chart.scales[axis];
        if (live && isFinite(live.min) && isFinite(live.max) && live.max > live.min) {
          chart.$ds.natural = { min: live.min, max: live.max };
        }
      }
      var nat = chart.$ds && chart.$ds.natural;
      if (nat && isFinite(nat.min) && isFinite(nat.max) && nat.max > nat.min) {
        return { axis: axis, lo: nat.min, hi: nat.max, indexed: false };
      }
      // 兜底：退回读当前 scale 的量程，好过硬编码的 0..0。
      var sc = chart.scales[axis];
      return { axis: axis, lo: sc.min, hi: sc.max, indexed: false };
    },

    // 缩放/框选允许收到的最窄视图宽度：索引域固定半个索引单位（原语义，
    // 保证至少看得到一个类目）；数据域按满量程的 1% 取相对值，不能再用
    // 固定的 0.5——scatter 的数据域可能是 0..1 也可能是 0..100000。
    _minHalf: function (b) {
      return b.indexed ? 0.5 : Math.max((b.hi - b.lo) * 0.01, 1e-9);
    },

    // 当前"视图"范围：$ds.min/max 为 null 表示还没有显式缩放约束，视图
    // 等于满量程 b.lo/b.hi。
    _viewRange: function (chart, b) {
      var s = chart.$ds;
      return {
        min: s.min != null ? s.min : b.lo,
        max: s.max != null ? s.max : b.hi
      };
    },

    // chart.options 是 Chart.js 的 resolver，但直接写它的叶子属性（如这里的
    // scales[axis].min/max）会真实落回底层、回读也能拿到新值——这一点已经
    // 实测验证过。真正会炸的是把从它身上读出来的子对象再原样赋回同一路径
    // （`o.x = o.x || {}` 这种自赋值），那会在 resolver 内部形成自引用。这里
    // 只做叶子赋值，没有这个问题，不需要绕道 registry 里的 config 引用。
    //
    // $ds.min/max 都是 null 时（resetZoom 之后）直接删掉 scale 上的 min/max
    // 覆盖、交还 Chart.js 自动量程，而不是我们自己写一份算出来的"满量程"——
    // 这样无论之前缩放成什么样，复位永远能恢复到数据的真实全貌（Review
    // C1：旧实现把 labels.length-1 当成横向条形图数值轴的满量程写回去，
    // 复位反而把图冲得更坏，必须刷新页面才能恢复）。
    _apply: function (chart) {
      var s = chart.$ds;
      var axis = zoomAxisFor(chart.options.indexAxis);
      var scale = chart.options.scales[axis];
      if (s.min == null && s.max == null) {
        delete scale.min;
        delete scale.max;
      } else {
        scale.min = s.min;
        scale.max = s.max;
      }
      chart.update('none');
    },

    zoom: function (chart, factor) {
      if (!chart || !chart.canvas || !chart.$ds) return;
      var b = DS.charts._bounds(chart);
      var v = DS.charts._viewRange(chart, b);
      var mid = (v.min + v.max) / 2;
      var half = Math.max(DS.charts._minHalf(b), (v.max - v.min) / 2 / factor);
      var min = Math.max(b.lo, mid - half);
      var max = Math.min(b.hi, mid + half);
      // 向外缩到覆盖满量程时，把 $ds.min/max 收回 null（视为"未缩放"），
      // 不能让它们停在等于 b.lo/b.hi 的具体数值上——isZoomed() 判定的是
      // "min/max 是否非 null"，钳成具体数值会让它恒为 true。smart 滚轮
      // 模式判断"是否已到缩放下限、该放行翻页"就是靠 isZoomed()，一旦
      // 卡在恒真，用户在这张图上向外滚多少次都无法把滚轮还给页面滚动
      // （Review C1：实测向内滚 2 次、向外滚 25 次，$ds 已是满量程
      // {min:0,max:5} 但 isZoomed() 依然为 true）。resetZoom() 复位同样
      // 置 null，这里让"滚到底"和"点复位"落到同一个状态，而不是两套
      // 表面等价、实际不等价的"满量程"表示。
      if (min <= b.lo && max >= b.hi) {
        chart.$ds.min = null;
        chart.$ds.max = null;
      } else {
        chart.$ds.min = min;
        chart.$ds.max = max;
      }
      DS.charts._apply(chart);
    },

    zoomRange: function (chart, i0, i1) {
      if (!chart || !chart.canvas || !chart.$ds) return;
      var b = DS.charts._bounds(chart);
      var lo = Math.max(b.lo, Math.min(i0, i1));
      var hi = Math.min(b.hi, Math.max(i0, i1));
      // 框选过窄视为误触，忽略——"过窄"按满量程的比例判定，而且是在钳位
      // 到数据边界*之后*判定：从画布外往里拖、或者只有钳位后的那一小段
      // 落在数据范围内，也要能被这条逻辑挡住，不是只挡"两点本来就离得近"
      // 这一种情形。
      if (hi - lo < DS.charts._minHalf(b)) return;
      chart.$ds.min = lo;
      chart.$ds.max = hi;
      DS.charts._apply(chart);
    },

    resetZoom: function (chart) {
      if (!chart || !chart.canvas || !chart.$ds) return;
      chart.$ds.min = null;
      chart.$ds.max = null;
      DS.charts._apply(chart);
    },

    isZoomed: function (chart) {
      if (!chart || !chart.canvas || !chart.$ds) return false;
      return chart.$ds.min != null || chart.$ds.max != null;
    },

    /* 对所有已存在的笛卡尔实例立即生效，无需重建；非笛卡尔实例没有 $ds，
       原样跳过。demo 页的滚轮模式选择器就靠这个方法。未知模式一律拒绝、
       保留原模式——调用方是外部 API 消费者，传错字符串不该静默落到某个
       分支的兜底行为上（Review M6：此前无效字符串会落到和 'zoom' 一样
       的行为，且提示文案变成空字符串，用户毫无察觉）。 */
    setWheelMode: function (mode) {
      if (WHEEL_MODES.indexOf(mode) === -1) {
        console.warn('DS.charts.setWheelMode: 未知模式 "' + mode + '"，已忽略，仍保持 "' + options.wheel + '"');
        return;
      }
      options.wheel = mode;
      pruneDestroyed();
      registry.forEach(function (entry) {
        if (entry.chart.$ds) {
          entry.chart.$ds.mode = mode;
          DS.charts._syncHint(entry.chart);
        }
      });
    },

    /* 滚轮分派：四种模式的唯一分支点。
       page      —— 永不缩放，交给页面滚动
       zoom      —— 直接缩放
       ctrl-zoom —— 按住 Ctrl 才缩放（出厂默认）
       smart     —— 未到极限先缩放，到底后放行翻页 */
    _onWheel: function (chart, ev) {
      if (!chart || !chart.canvas || !chart.$ds) return;
      var mode = chart.$ds.mode || options.wheel;
      if (mode === 'page') return;

      var zoomIn = ev.deltaY < 0;
      if (mode === 'ctrl-zoom' && !ev.ctrlKey) return;
      if (mode === 'smart') {
        var b = DS.charts._bounds(chart);
        var v = DS.charts._viewRange(chart, b);
        var atLimit = zoomIn
          ? (v.max - v.min) / 2 <= DS.charts._minHalf(b)
          : !DS.charts.isZoomed(chart);
        if (atLimit) return;               // 到底了，放行让页面滚动
      }
      ev.preventDefault();
      DS.charts.zoom(chart, zoomIn ? 1.25 : 0.8);
    },

    /* 按需给工具条留出顶部空间：见 TOOLBAR_TOP_RESERVE 定义处的完整说明。
       调用时机——create() 里 _mountToolbar() 之后手动调一次（见 create()），
       以及全屏按钮的 chart.resize() 之后再调一次（见下面 _mountToolbar()
       的 'full' 分支）。调用方自己在这两处之外对图表做了 resize()/update()
       的话，也应该照这个样子自己补调一次——这是本方案明确记录在案的限制，
       详见 TOOLBAR_TOP_RESERVE 定义处的说明。 */
    _fitToolbarLegend: function (chart) {
      if (!chart || !chart.canvas || !isCartesian(chart.config.type)) return;
      var host = chart.canvas.parentNode;
      if (!host) return;

      // 必须用 chart.config.options（调用方传入、create() 时原样存进
      // registry 的那份普通对象，retheme()/paint() 一直在读写的也是它），
      // 不能用 chart.options——后者是 Chart.js 的 resolver Proxy，对它做
      // `o.layout = o.layout || {}` 这种自赋值会在 Proxy 内部触发自引用
      // （实测：直接抛 RangeError: Maximum call stack size exceeded），
      // 和文件顶部"修改 chart.options 的正确姿势"那条踩的是同一个坑。
      var o = chart.config.options;
      var layout = o.layout;
      var autoSet = !!(layout && layout.__dsAutoPaddingTop);
      // 调用方自己配置过 layout.padding.top（不是我们自己写的那次）：永远
      // 尊重，不管后续任何 resize/update 都不碰。
      if (layout && layout.padding && layout.padding.top != null && !autoSet) return;

      // 到这里为止，当前的 layout.padding.top（没有就是 0）只可能是我们
      // 自己上一次写的，不会是调用方的——上面那行已经把调用方自己配置的
      // 情形短路掉了。
      var currentTop = (layout && layout.padding && layout.padding.top) || 0;

      var needed = false;
      // compact 这类矮宿主直接豁免，连重叠判断都不做——见
      // LEGEND_TOOLBAR_MIN_HOST_HEIGHT 定义处的说明。
      if (host.clientHeight >= LEGEND_TOOLBAR_MIN_HOST_HEIGHT) {
        needed = legendOverlapsToolbar(chart, host, currentTop);
      }

      var desired = needed ? TOOLBAR_TOP_RESERVE : 0;
      if (currentTop === desired) return;  // 没变化：不触碰配置，也不触发 update()

      o.layout = o.layout || {};
      o.layout.padding = o.layout.padding || {};
      o.layout.padding.top = desired;
      o.layout.__dsAutoPaddingTop = true;
      chart.update('none');
    },

    _mountToolbar: function (chart) {
      var host = chart.canvas.parentNode;
      var bar = document.createElement('div');
      bar.className = 'ds-chart-toolbar';
      // type="button" 防止图表落在 <form> 里时点击触发表单提交
      // （Review M5）；aria-label 补充给屏幕阅读器，title 继续保留给鼠标
      // 悬浮提示。"全屏"用内联 SVG 而不是 U+26F6 字符——审查截图确认过，
      // 本机装了 Noto CJK 字体，这个字形依然渲染成豆腐块，产物又是离线单
      // 文件不内嵌字体，换一台机器更不可控（Review M4）。SVG 用
      // currentColor 继承按钮的文字色，不新增颜色字面量。
      bar.innerHTML =
        '<button type="button" class="ds-chart-btn" data-act="out" title="缩小" aria-label="缩小">−</button>' +
        '<button type="button" class="ds-chart-btn" data-act="in" title="放大" aria-label="放大">+</button>' +
        '<button type="button" class="ds-chart-btn" data-act="reset" title="复位" aria-label="复位">⟲</button>' +
        '<button type="button" class="ds-chart-btn" data-act="full" title="全屏" aria-label="全屏">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>' +
        '</button>' +
        '<span class="ds-chart-hint"></span>';
      host.appendChild(bar);
      bar.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('[data-act]') : ev.target;
        var act = btn && btn.getAttribute('data-act');
        if (act === 'in') DS.charts.zoom(chart, 1.25);
        else if (act === 'out') DS.charts.zoom(chart, 0.8);
        else if (act === 'reset') DS.charts.resetZoom(chart);
        else if (act === 'full') {
          host.classList.toggle('ds-chart-fullscreen');
          // Bug 2（用户报的）：全屏进出后图表尺寸不对。Chart.js 的自适应靠
          // ResizeObserver，其回调链依赖 requestAnimationFrame——这个仓库
          // 本来就不允许用 rAF（本机 headless chromium 的 rAF 回调也永不
          // 触发），所以切完 class 后不能坐等 ResizeObserver 自己醒过来，
          // 必须主动 resize()。
          //
          // 调用时机：这里是同步调用，不经 setTimeout。实测验证过（见
          // _render/ 下的探针）——classList.toggle() 一旦执行，
          // getBoundingClientRect() 读到的就已经是新布局后的尺寸，不需要
          // 等下一轮事件循环；Chart.resize() 内部正是通过读取 canvas 父元素
          // 的包围盒来决定新尺寸，所以紧跟着同步调用已经足够，进/出全屏都
          // 能在同一次点击里正确定格，不会有"新布局还没生效就测量"的问题。
          // 如果未来改动（比如给 .ds-chart-fullscreen 加 CSS transition）
          // 导致同步测量不再可靠，这里要改的是等一拍再 resize()——用
          // setTimeout，不要用 rAF（仓库硬约束，见文件顶部注释）。
          // chart.resize 在 create() 里已经被包了一层（见上面的说明），
          // 这次调用完成后会自动重新判一次要不要给工具条让出顶部空间——
          // 全屏放大之后宿主变得又高又宽，原本不需要留白的图表可能现在
          // 需要，退出全屏也可能从"需要"变回"不需要"，不需要在这里单独
          // 再调一次（Review 裁决 (b)）。
          chart.resize();
        }
      });
      DS.charts._syncHint(chart);
    },

    /* ctrl-zoom 的可发现性补偿：没有提示用户不会知道要按 Ctrl。非笛卡尔
       图没有 $ds，这里只是安全网——目前唯一调用点（_mountToolbar）只会
       传笛卡尔实例进来，之所以仍然判一下，是因为"安全只是因为当前调用点
       凑巧都满足前提"本身就是一种侥幸，不是真正的保证（Review M8）。 */
    _syncHint: function (chart) {
      if (!chart.$ds) return;
      var hint = chart.canvas.parentNode.querySelector('.ds-chart-hint');
      if (!hint) return;
      var mode = chart.$ds.mode || options.wheel;
      hint.textContent = mode === 'ctrl-zoom' ? 'Ctrl+滚轮缩放'
                       : mode === 'zoom' ? '滚轮缩放'
                       : mode === 'smart' ? '滚轮缩放，到底翻页' : '';
    },

    /* 绑定在 canvas 上、只绑一次（见 create()）；每次都通过 canvas._dsChart
       这个可变指针取"当前"实例，canvas 被二次 create() 复用时天然跟新实例
       走，destroy() 之后这个指针会被清空，idxAt()/mouseup 都要能应付"当前
       没有活实例"这件事而不抛错。拖拽的坐标轴跟 _bounds() 认的是同一个
       zoomAxisFor() 结果：横向条形图（indexAxis:'y'）类目在 y 轴，用户是
       上下拖来框选那几行机台，不是左右拖（Review C1）。"过窄视为误触"统一
       交给 zoomRange() 自己的阈值判断，这里不再重复一份不感知数据域大小
       的固定像素/索引阈值。 */
    _mountDrag: function (canvas) {
      var start = null;
      function idxAt(ev) {
        var chart = canvas._dsChart;
        if (!chart || !chart.canvas) return null;
        var axis = zoomAxisFor(chart.options.indexAxis);
        var rect = canvas.getBoundingClientRect();
        var coord = axis === 'y' ? (ev.clientY - rect.top) : (ev.clientX - rect.left);
        return chart.scales[axis].getValueForPixel(coord);
      }
      canvas.addEventListener('mousedown', function (ev) { start = idxAt(ev); });
      canvas.addEventListener('mouseup', function (ev) {
        if (start == null) return;
        var chart = canvas._dsChart;
        var end = idxAt(ev);
        if (chart && chart.canvas && end != null) DS.charts.zoomRange(chart, start, end);
        start = null;
      });
      canvas.addEventListener('mouseleave', function () { start = null; });
    }
  };
})(window.DS);
