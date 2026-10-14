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
  // 里写任何颜色字面量。alpha 固定给 0.28——离线算过 WCAG 相对亮度对比度
  // （跟 demo.js selftest 用的是同一套公式）：六条分类序列色分别叠在浅色
  // surface（#ffffff）和深色 surface（#18181b）上，0.22 在深色主题下部分
  // 颜色的合成对比度会跌到 1.2 这条此前热力图最低档也用过的可见性下限
  // 边缘；0.28 能让全部六条序列色在两套主题下都明显高于这条线，同时仍然
  // 足够透明——两条面积图叠在一起不会完全互相遮挡。
  var AREA_FILL_ALPHA = 0.28;
  function hexToRgba(hex, alpha) {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var r = parseInt(hex.substr(0, 2), 16);
    var g = parseInt(hex.substr(2, 2), 16);
    var b = parseInt(hex.substr(4, 2), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
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
        // 轴线颜色从来没被注入过，切深色主题时会留在浅色。'x'/'y' 是任何
        // 笛卡尔图默认都有的两根轴，哪怕调用方的 config.options.scales 里
        // 完全没提（Chart.js 会隐式补全），所以继续无条件处理这两个——
        // 这保住了此前的全部行为。调用方自己额外声明的轴（y1、以至于
        // 任何将来出现的命名）从 o.scales 的实际 key 里读出来，并入同一套
        // 注入循环；不区分类目轴以外的"类型"，因为这里能出现的只有类目轴
        // （上面 categoryAxis 判定出的那一个，必然是 'x' 或 'y'）和数值轴
        // 两种，数值轴统一走 else 分支（只上色，不截断标签），额外轴天然
        // 落在这一类。
        var axisNames = ['x', 'y'];
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
          if (d.backgroundColor == null || d.__dsAuto) { d.backgroundColor = palette; d.__dsAuto = true; }
          if (d.borderColor == null || d.__dsAuto) { d.borderColor = cssVar('--color-surface'); }
        } else {
          var color = c.series[i % c.series.length];
          // 面积图（line + fill）：fill 为真值（true / 'origin' / 数字索引 /
          // 非 'false' 的字符串，即 Chart.js 自己认可的全部 fill 取值）的
          // 数据集，backgroundColor 要是线条色的半透明版本，不能跟普通折线/
          // 柱状图一样给不透明色——不透明的话多条面积图叠在一起会变成互相
          // 完全遮挡的实心色块，看不出谁在上谁在下。borderColor（线条本身、
          // 图例描边）仍然是不透明的系列色，没有 fill 的数据集（普通折线、
          // 柱状图）backgroundColor 也仍然是不透明色——这两类此前的行为
          // 原样保留，只有"这个数据集类型是 line 且确实要填充"这一种情形走
          // 半透明分支，per-dataset 判断（dataset.type 可以覆盖所属图表的
          // config.type，混合图里同一个 chart 常见"面积 + 普通折线"共存）。
          var dsType = d.type || config.type;
          var isFilledLine = dsType === 'line' &&
            (d.fill === true || d.fill === 'origin' ||
             typeof d.fill === 'number' ||
             (typeof d.fill === 'string' && d.fill !== 'false'));
          if (d.backgroundColor == null || d.__dsAuto) {
            d.backgroundColor = isFilledLine ? hexToRgba(color, AREA_FILL_ALPHA) : color;
            d.__dsAuto = true;
          }
          if (d.borderColor == null || d.__dsAuto) { d.borderColor = color; }
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
