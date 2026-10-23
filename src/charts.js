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
  //
  // 'sankey'（src/vendor/chartjs-chart-sankey.umd.js 注册）同样要排除：它
  // 自己的 x/y 是内部数值轴（type:'linear', bounds:'data', display:false，
  // 纯粹用来算布局，不给开发者配置/缩放），不是 radar/polarArea 那种共享
  // 'r' 轴的场景，也不是真正意义上的笛卡尔图——塞进去会重演当年饼图的
  // 幽灵坐标轴问题（见下面 paint() 里的说明），还会被 create() 误挂上对
  // 它毫无意义的缩放工具条。
  var NON_CARTESIAN_TYPES = ['pie', 'doughnut', 'polarArea', 'radar', 'sankey'];
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

  // 缩放状态按"轴"取：$ds 顶层 min/max/natural/pinned 是主轴（$ds.axis）的状态；
  // xy 模式下第二根轴的同一组状态在 $ds.sec。两根轴共用同一套 _bounds /
  // _viewRange / _apply，只是状态对象不同——不要为第二根轴复制一份缩放算法。
  function stateOf(chart, axis) {
    var s = chart.$ds;
    return (s.xy && axis === s.secAxis) ? s.sec : s;
  }
  function zoomAxesOf(chart) {
    var s = chart.$ds;
    return s.xy ? [s.axis, s.secAxis] : [s.axis];
  }


  // 类目轴（索引域）视野摆放：窗口 = N 个整数类目 [R0, R0+N-1]，让数据值 pin.a 落在
  // 像素 pin.p。Chart.js 对类目轴把 min/max 取整并把 N 个类目摊满绘图区，N 固定时
  // pixel(v) = edge + (v - R0 + off) * s 严格线性（s = 每类目像素带方向，off = offset?0.5:0）。
  function placeIndexed(chart, pin, N) {
    var sc = chart.scales[pin.axis], ca = chart.chartArea;
    var st = stateOf(chart, pin.axis);
    var b = DS.charts._bounds(chart, pin.axis);
    var horiz = sc.isHorizontal();
    var sign = (sc.getPixelForValue(1) - sc.getPixelForValue(0)) >= 0 ? 1 : -1;
    var W = horiz ? ca.right - ca.left : ca.bottom - ca.top;
    var off = (sc.options && sc.options.offset) ? 0.5 : 0;
    var s = sign * W / Math.max(N - (off ? 0 : 1), 1);
    var edge = horiz ? (sign > 0 ? ca.left : ca.right) : (sign > 0 ? ca.top : ca.bottom);
    var R0 = Math.round(pin.a + off - (pin.p - edge) / s);
    R0 = Math.max(b.lo, Math.min(R0, b.hi - N + 1));
    var changed = st.min !== R0 || st.max !== R0 + N - 1;
    st.min = R0;
    st.max = R0 + N - 1;
    return changed;
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
  // alpha 取值的论证（2026-10-22 按新色板重算；旧色板的数字已作废）：
  // 用 WCAG 相对亮度公式（跟 demo.js selftest、validate_palette.py 同一套）
  // 把分类序列色分别按给定 alpha 合成到浅色 surface（#ffffff）和深色
  // surface（#18181b）上，算合成色对各自背景的真实对比度，取最小值
  // （离线脚本独立复算过，数字可复现）。面积图只用 s1..s6，括号内为十色全集：
  //   alpha=0.22：浅色最低 1.211（s5 黄）[十色 1.158，s9 嫩绿]；深色最低 1.328。
  //   alpha=0.28：浅色最低 1.277 [1.210]；深色最低 1.465。
  //   alpha=0.34（现在用的值，沿用不变）：浅色最低 1.343（s5 黄）[1.264]；
  //               深色最低 1.630（s6 品红粉）——两套主题都明显高于 1.2 这条
  //               热力图最低档也用过的可见性下限，十色全集也不跌破。
  // 短板仍然是浅色主题里偏亮的颜色（现在是 s5 黄；高档色在白底上本来天花板
  // 就低，alpha 调多高都填不平，这是色板特性）。0.34 是"半透明叠加不互相
  // 遮挡"和"浅色主题下不贴着可见性下限"之间的折中。换掉色板（README 明确
  // 鼓励使用者这么做）之后，这里的数字需要重新核算。
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

  // ---------- 气泡图 / 框选缩放 / 数据表：通用小工具 ----------

  // 气泡填充透明度（描边不透明）。0.7 沿用参照实现；换色板后需要重新目测
  // 重叠气泡仍能分辨（半透明本来就是为了让重叠处看得出两个圆）。
  var BUBBLE_FILL_ALPHA = 0.7;
  var BUBBLE_BORDER_WIDTH = 1.5;

  // ---------- 渐进色板（按排名连续着色） ----------
  // 第 i 名（共 n 个）色相 = i*360/n（沿色轮连续渐进，相邻排名颜色相近），
  // 饱和度/亮度读 token（--chart-ramp-s / --chart-ramp-l，深浅主题各一组）。
  // JS 里不出现任何颜色字面量，只拼 hsla()。
  function rampColors(n, opts) {
    var alpha = opts && opts.alpha != null ? opts.alpha : 1;
    var sat = cssVar('--chart-ramp-s'), lig = cssVar('--chart-ramp-l');
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push('hsla(' + ((i * 360 / n) % 360) + ', ' + sat + ', ' + lig + ', ' + alpha + ')');
    }
    return out;
  }

  // WCAG 相对亮度 / 对比度（0-255 通道）；解析 #rgb/#rrggbb、rgb(a)()、hsl(a)()。
  function relLum(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrastOf(a, b) {
    var x = relLum(a), y = relLum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function parseCssColor(str) {
    str = String(str).trim();
    var m, raw;
    if (str.charAt(0) === '#') {
      raw = str.slice(1);
      if (raw.length === 3) raw = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
      var r = parseInt(raw.substr(0, 2), 16), g = parseInt(raw.substr(2, 2), 16), b = parseInt(raw.substr(4, 2), 16);
      return isNaN(r + g + b) ? null : { r: r, g: g, b: b, a: 1 };
    }
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(str);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
    m = /^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(str);
    if (m) {
      var h = (+m[1] % 360) / 60, sl = +m[2] / 100, l = +m[3] / 100;
      var C = (1 - Math.abs(2 * l - 1)) * sl, X = C * (1 - Math.abs(h % 2 - 1)), mm = l - C / 2;
      var rgb = h < 1 ? [C, X, 0] : h < 2 ? [X, C, 0] : h < 3 ? [0, C, X] : h < 4 ? [0, X, C] : h < 5 ? [X, 0, C] : [C, 0, X];
      return { r: (rgb[0] + mm) * 255, g: (rgb[1] + mm) * 255, b: (rgb[2] + mm) * 255, a: m[4] != null ? +m[4] : 1 };
    }
    return null;
  }
  function compositeOver(fg, bg) {
    return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a),
             b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
  }

  function escHtml(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 千分位：固定 'en-US'，不跟随运行环境的区域设置——渲染结果要在任何机器上
  // 一致，断言才可判定。
  function fmtInt(n) { return Number(n).toLocaleString('en-US'); }

  // 气泡标签截断：超过 max 个字符取前 max 个再加 '..'（恰好 max 个不截断）。
  function truncateName(name, max) {
    name = String(name);
    return name.length > max ? name.substring(0, max) + '..' : name;
  }

  // 框选反馈矩形：用 --color-primary 以半透明画在图表之上（填充 0.12、描边
  // 0.6）。不走 hexToRgba——token 若被换成非十六进制格式，hexToRgba 会退回不
  // 透明色，不透明的填充会把整张图盖住；globalAlpha 对任何颜色格式都成立。
  // 1 维（类目轴）框选画成贯穿绘图区的竖带/横带，xy 画真实矩形。
  var ZOOM_BOX_PLUGIN = {
    id: 'dsZoomBox',
    afterDraw: function (chart) {
      var s = chart.$ds, d = s && s.drag;
      if (!d || d.mode !== 'zoom' || !chart.chartArea) return;
      var a = chart.chartArea;
      var x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1);
      var y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      if (!s.xy) {
        if (s.axis === 'x') { y0 = a.top; y1 = a.bottom; }
        else { x0 = a.left; x1 = a.right; }
      }
      var ctx = chart.ctx, col = cssVar('--color-primary');
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = col;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(0, x1 - x0 - 1), Math.max(0, y1 - y0 - 1));
      ctx.restore();
    }
  };

  // 气泡标签：只给"大气泡"（x > 视野内最大 x 的 labelRatio，默认 15%）标名字，名字
  // 超过 labelMax（默认 12）个字符截断加 '..'。样式沿用参照实现：10px / 500、
  // 居中、不描边不发光（不用 strokeText / shadowBlur）。字色：标签画在气泡内部，
  // 真正的背景是"气泡填充色（alpha）与卡片底 --color-surface 合成后的颜色"，
  // 在 --chart-label-ink-dark / --chart-label-ink-light 两个 token 里选对比度更
  // 高者（任何背景下较高者必 ≥ 4.7）；浅色主题合成底偏亮，实际总是深字
  // 。每次绘制把"实际画出的标签"记在 chart.$dsBubbleLabels。
  // 绘制前按 chartArea 裁剪，缩放后视野外的气泡标签不能画到绘图区之外。
  var BUBBLE_LABELS_PLUGIN = {
    id: 'dsBubbleLabels',
    afterDatasetsDraw: function (chart) {
      if (!chart.config || chart.config.type !== 'bubble' || !chart.chartArea) return;
      var cfg = (chart.config.options && chart.config.options.dsBubble) || {};
      var ratio = cfg.labelRatio != null ? cfg.labelRatio : 0.15;
      var maxLen = cfg.labelMax || 12;
      var ctx = chart.ctx, a = chart.chartArea;
      var fam = (typeof Chart !== 'undefined' && Chart.defaults.font.family) || 'sans-serif';
      var inkDark = cssVar('--chart-label-ink-dark'), inkLight = cssVar('--chart-label-ink-light');
      var inkDarkC = parseCssColor(inkDark), inkLightC = parseCssColor(inkLight);
      var surfC = parseCssColor(cssVar('--color-surface'));
      var drawn = [];
      ctx.save();
      ctx.beginPath();
      ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top);
      ctx.clip();
      ctx.font = '500 10px ' + fam;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 避让：候选标签按数量降序依次尝试，包围盒（文字宽度 + 字号高度 + 内边距）与
      // 已画出的任何标签相交就跳过——冲突时留下的永远是数量更大的那个。被跳过的
      // 气泡仍可悬停看名字（悬浮框本来就有）。只在标签之间避让，不管压在别的
      // 气泡上（没有描边，重叠处更难读，所以避让更有必要）。视野外（缩放后）的气泡不参与：它不可见，也不
      // 该挡住视野内的标签。每次绘制都重算，所以缩放/全屏/换主题后自动更新。
      var cands = [];
      chart.data.datasets.forEach(function (d, di) {
        if (!chart.isDatasetVisible(di)) return;
        var meta = chart.getDatasetMeta(di);
        var data = d.data || [];
        // "大气泡"的基准取当前视野内的最大 x：放大到小气泡区域后，它们相对视野内
        // 最大者重新判定，否则按全量最大值永远不够格、放大了也不出标签。
        var maxX = 0;
        meta.data.forEach(function (el, i) {
          var p = data[i];
          if (!p || !isFinite(el.x) || !isFinite(el.y)) return;
          if (el.x < a.left || el.x > a.right || el.y < a.top || el.y > a.bottom) return;
          if (p.x > maxX) maxX = p.x;
        });
        meta.data.forEach(function (el, i) {
          var p = data[i];
          if (!p || p.name == null || !(p.x > maxX * ratio)) return;
          if (!isFinite(el.x) || !isFinite(el.y)) return;
          if (el.x < a.left || el.x > a.right || el.y < a.top || el.y > a.bottom) return;
          cands.push({ dataset: di, index: i, x: el.x, y: el.y, size: p.x, name: p.name });
        });
      });
      cands.sort(function (u, v) { return (v.size - u.size) || (u.dataset - v.dataset) || (u.index - v.index); });
      var boxes = [];
      cands.forEach(function (c) {
        var text = truncateName(c.name, maxLen);
        var w = ctx.measureText(text).width + 4, h = 10 + 4;
        var box = { l: c.x - w / 2, r: c.x + w / 2, t: c.y - h / 2, b: c.y + h / 2 };
        for (var k = 0; k < boxes.length; k++) {
          var o = boxes[k];
          if (box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t) return;
        }
        boxes.push(box);
        var textColor = inkDark, bgC = null;
        var fc = parseCssColor(chart.getDatasetMeta(c.dataset).data[c.index].options.backgroundColor);
        if (fc && surfC && inkDarkC && inkLightC) {
          bgC = compositeOver(fc, surfC);
          textColor = contrastOf(inkDarkC, bgC) >= contrastOf(inkLightC, bgC) ? inkDark : inkLight;
        }
        ctx.fillStyle = textColor;
        ctx.fillText(text, c.x, c.y);
        drawn.push({ dataset: c.dataset, index: c.index, text: text, x: c.x, y: c.y, color: textColor,
          bg: bgC, box: box });
      });
      ctx.restore();
      chart.$dsBubbleLabels = drawn;
    }
  };

  // ---------- 桑基图：通用图论工具函数（不感知任何业务维度） ----------
  //
  // 节点分层：只看 from/to 构成的有向图本身，和"接收点/仪器/结果"这类
  // 业务名词完全无关——没有任何入边的节点是第 0 层，其余节点的层号是
  // "所有入边来源节点层号的最大值 + 1"（经典的最长路径分层，桑基图的
  // 专业第三方实现内部做节点排布时也是同一类算法，这里只借用它的层号
  // 结果来分配颜色，不触碰布局）。实现用"反复松弛直到不再变化"的迭代法
  // 而不是递归拓扑排序：桑基图数据理论上应该是有向无环图，但调用方传入
  // 错误数据（比如笔误造成的环）时不该让这段颜色分配代码死循环或栈溢出——
  // guard 给了一个基于节点数的上限，循环中无法被任何入边更新到的节点
  // （包括真的处于环里的节点）最后统一兜底分到第 0 层，不影响颜色分配
  // 继续往下跑完。
  function sankeyNodeLayers(flows) {
    var hasIncoming = {};
    var keys = {};
    (flows || []).forEach(function (f) {
      if (!f) return;
      keys[f.from] = true;
      keys[f.to] = true;
      hasIncoming[f.to] = true;
    });
    var layer = {};
    var keyList = Object.keys(keys);
    keyList.forEach(function (k) { layer[k] = hasIncoming[k] ? null : 0; });
    var changed = true, guard = 0;
    while (changed && guard <= keyList.length + 1) {
      changed = false;
      guard++;
      (flows || []).forEach(function (f) {
        if (!f) return;
        var fromLayer = layer[f.from];
        if (fromLayer == null) return;
        var candidate = fromLayer + 1;
        if (layer[f.to] == null || candidate > layer[f.to]) {
          layer[f.to] = candidate;
          changed = true;
        }
      });
    }
    keyList.forEach(function (k) { if (layer[k] == null) layer[k] = 0; });
    return layer;
  }

  // 节点配色顺序：先按层号（sankeyNodeLayers）、同层内按"第一次出现的
  // 顺序"排成一条线，颜色 = 扩展序列色[序号 % 10]。这是参照实现"源端取
  // palette[i]、目标端取 palette[(i + 源端节点数) % N]"向 N 层的推广：
  // 相邻两层的序号区间首尾相接，只要相邻两层节点数之和 <= 色数（10），
  // 同层与相邻层就必然不撞色；超出时才开始取模复用（固有上限）。
  function sankeyNodeOrder(flows) {
    var layers = sankeyNodeLayers(flows);
    var seen = {}, keys = [];
    (flows || []).forEach(function (f) {
      [f && f.from, f && f.to].forEach(function (k) {
        if (k != null && !Object.prototype.hasOwnProperty.call(seen, k)) {
          seen[k] = true;
          keys.push(k);
        }
      });
    });
    var first = {};
    keys.forEach(function (k, i) { first[k] = i; });
    keys.sort(function (a, b) { return (layers[a] - layers[b]) || (first[a] - first[b]); });
    return keys;
  }

  // 按"流量"给节点和流向算一个排序优先级：专业第三方桑基插件支持传入
  // dataset.priority（数值越小越靠前）来减少连线交叉，这里按"该节点作为
  // from 或 to 出现时流量之和"从大到小排名，同样不关心业务维度，纯粹是
  // 数据里本来就有的 from/to/flow 三个字段的通用聚合。
  function sankeyPriority(flows) {
    var totals = {};
    (flows || []).forEach(function (f) {
      if (!f) return;
      totals[f.from] = (totals[f.from] || 0) + (f.flow || 0);
      totals[f.to] = (totals[f.to] || 0) + (f.flow || 0);
    });
    var ranked = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; });
    var priority = {};
    ranked.forEach(function (k, i) { priority[k] = i; });
    return priority;
  }

  // 按角色（'from' 或 'to'）聚合流量总和——节点筛选下拉的计数、以及任何
  // 需要"这个节点一共流过多少"的场景都复用这个纯函数，不内置任何业务名词。
  function sankeyGroupTotals(flows, field) {
    var totals = {};
    (flows || []).forEach(function (f) {
      if (!f) return;
      var key = f[field];
      if (key == null) return;
      totals[key] = (totals[key] || 0) + (f.flow || 0);
    });
    return totals;
  }

  // 高亮关联集合：给定当前完整流向数组和一组"种子"节点键（Set，null/空
  // 表示没有高亮），找出所有与种子直接相连的流向，把这些流向两端的节点键
  // 都并入返回集合——种子节点自己也会在返回结果里（种子必然是它自己所在
  // 那条流向的一端）。返回 null 表示"当前没有高亮，全部按原色画"，和返回
  // 一个空对象是两种不同的语义，调用方用 `connected == null` 判断前者。
  function sankeyConnectedKeys(flows, seeds) {
    if (!seeds || !seeds.size) return null;
    var connected = {};
    (flows || []).forEach(function (f) {
      if (!f) return;
      if (seeds.has(f.from) || seeds.has(f.to)) {
        connected[f.from] = true;
        connected[f.to] = true;
      }
    });
    return connected;
  }

  // 悬浮/点击高亮时，非关联流向与节点要"淡出"但不能是硬编码颜色字面量。
  // 选用 --chart-grid：它本来就是"装饰性、不是信息本身"的网格线颜色，深浅
  // 两套主题下都已经是经过设计的中性灰，语义上正好对应"这部分现在不是
  // 重点"，不需要再新增 token 或做颜色混合运算。
  function sankeyDimColor() { return cssVar('--chart-grid'); }

  // 节点配色查不到时的兜底色（正常不会走到——nodeIndexByKey 在 paint() 里
  // 对当前数据集的每个节点都会赋值——但防御性地给一个中性灰而不是任由
  // Canvas 把非法值静默吞掉，道理和「技术陷阱」#26 一样：节点描边/标签色
  // 被 chartjs-chart-sankey 当普通字符串用，传入 undefined 不会报错，只会
  // 悄悄复用上一帧颜色。）
  function sankeyFallbackColor() { return cssVar('--chart-axis'); }

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

  // 节点矩形的颜色实际由 chartjs-chart-sankey 控制器在每次 draw() 时，按
  // "最后一条触碰到这个节点的流向记录"的 colorFrom/colorTo 结果重新赋值
  // （源码 draw() 里对 meta.data 逐条流向做 `node.color = flow.options.
  // colorFrom` 这类赋值，顺序取决于数据数组顺序，不保证同一个节点被哪条
  // 流向"写最后一笔"）。如果节点的高亮/淡出判断也放在 colorFrom/colorTo
  // 里按"这一条流向是否关联"来决定，同一个节点被两条流向触碰、一条关联
  // 一条不关联时，最终画出来是哪个颜色就变成了跟数据顺序绑定的未定义行为。
  // 用一个独立的 afterDraw 插件按"节点键本身在不在关联集合里"重新整个
  // 刷一遍节点矩形，颜色判断只依赖节点身份、不依赖是哪条流向触发的重绘，
  // 彻底绕开这个顺序依赖——在节点没有被排除出 chartjs-chart-sankey 自己的
  // 任何渲染路径的前提下，这是补丁式的二次覆盖，不是替代绘制。
  var SANKEY_HIGHLIGHT_PLUGIN = {
    id: 'dsSankeyHighlight',
    afterDraw: function (chart) {
      if (!chart || !chart.config || chart.config.type !== 'sankey') return;
      var state = chart.$dsSankey;
      var active = state && state.active;
      if (!active || !active.size) return;
      var meta = chart.getDatasetMeta(0);
      var ctrl = meta && meta.controller;
      if (!ctrl || !ctrl._nodes) return;
      var ds0 = chart.data.datasets[0];
      var flows = (ds0 && ds0.data) || [];
      var connected = sankeyConnectedKeys(flows, active);
      if (!connected) return;
      var xScale = chart.scales.x, yScale = chart.scales.y;
      if (!xScale || !yScale) return;
      var nodeWidth = (ds0 && ds0.nodeWidth) || 10;
      var sizeMode = (ds0 && ds0.size) || 'max';
      var sizeFn = sizeMode === 'min' ? Math.min : Math.max;
      var dim = sankeyDimColor();
      var ctx = chart.ctx;
      ctx.save();
      var colorOf = state.colorOf;
      ctrl._nodes.forEach(function (node, key) {
        // 一跳连通集内的节点用自己的基础色重刷（D1 之后整条流向全亮/全灰，
        // 同一个节点被亮流向和灰流向同时触碰时，控制器"最后一笔"可能是灰
        // 的，必须在这里按节点身份纠正）；连通集外的节点刷成淡出色。
        var fill = connected[key] ? (colorOf && colorOf(key)) : dim;
        if (!fill) return;
        var x = xScale.getPixelForValue(node.x);
        var y = yScale.getPixelForValue(node.y);
        var flow = sizeFn(node.in || node.out, node.out || node.in);
        var h = Math.abs(yScale.getPixelForValue(node.y + flow) - y);
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, nodeWidth, h);
      });
      ctx.restore();
    }
  };

  // 每一列节点铺满绘图区纵向高度。chartjs-chart-sankey 给每列节点之间留同
  // 样的固定间距（nodePadding），y 轴比例按"节点总高 + 间距"最大的那一列定，
  // 节点少的列于是提前结束、下方留白。这里在控制器 update() 之前（此时解析
  // 结果 _parsed 与节点 y 都已就绪，但流向元素还没按 _parsed 取像素）按列
  // 重排节点的 y：首节点贴顶（y=0）、末节点贴底（y=最大列底=轴最大值），多
  // 出的空间均匀分到节点间距里；节点高度（流量）一个字不动。流向两端的 y 是
  // 解析时写进 _parsed 的（节点 y + 该流向在节点内的偏移 addY），所以必须
  // 同步重写 _parsed[i].y 与 _custom.y，否则流向会留在旧位置、与节点错位。
  // 每次都从当前 y 排序后重新分配，天然幂等（重复 update、全屏变高都安全；
  // 数据空间里的分布与像素高度无关，全屏后轴自动拉伸，仍然铺满）。
  // 只有 1 个节点的列无法"首贴顶末贴底"，取居中。不用 requestAnimationFrame。
  function sankeyFillColumns(chart, args) {
    var meta = args && args.meta;
    var ctrl = meta && meta.controller;
    if (!ctrl || !ctrl._nodes || !ctrl._nodes.size) return;
    var ds = chart.data.datasets[args.index] || {};
    var sizeFn = ds.size === 'min' ? Math.min : Math.max;
    var cols = {}, maxBottom = 0;
    ctrl._nodes.forEach(function (n) {
      n._h = sizeFn(n.in || n.out, n.out || n.in);
      (cols[n.x] = cols[n.x] || []).push(n);
      if (n.y + n._h > maxBottom) maxBottom = n.y + n._h;
    });
    Object.keys(cols).forEach(function (k) {
      var col = cols[k].sort(function (a, b) { return a.y - b.y; });
      var total = 0;
      col.forEach(function (n) { total += n._h; });
      var y;
      if (col.length === 1) {
        col[0].y = (maxBottom - total) / 2;
        return;
      }
      var gap = (maxBottom - total) / (col.length - 1);
      y = 0;
      col.forEach(function (n) { n.y = y; y += n._h + gap; });
    });
    function addY(list, key, index) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].key === key && list[i].index === index) return list[i].addY;
      }
      return 0;
    }
    var raw = (ds.data || []);
    var parsed = meta._parsed || [];
    for (var i = 0; i < parsed.length && i < raw.length; i++) {
      var f = ctrl._nodes.get(raw[i].from), t = ctrl._nodes.get(raw[i].to);
      if (!f || !t || !parsed[i] || !parsed[i]._custom) continue;
      parsed[i].y = f.y + addY(f.to, raw[i].to, i);
      parsed[i]._custom.y = t.y + addY(t.from, raw[i].from, i);
    }
  }
  var SANKEY_FILL_PLUGIN = {
    id: 'dsSankeyFill',
    beforeDatasetUpdate: function (chart, args) {
      if (!chart || !chart.config || chart.config.type !== 'sankey') return;
      sankeyFillColumns(chart, args);
    }
  };

  // 点击落在哪条流向上时，决定高亮 from 还是 to：按点击的横坐标落在图表
  // 绘图区中线的左边还是右边——约定上左半边离"流出端"更近、右半边离
  // "流入端"更近，不需要知道这条流向具体画在哪个像素位置。
  function sankeyClickedEndpoint(chart, flow, nativeEvent) {
    var rect = chart.canvas.getBoundingClientRect();
    var clickX = nativeEvent.clientX - rect.left;
    var mid = (chart.chartArea.left + chart.chartArea.right) / 2;
    return clickX < mid ? flow.from : flow.to;
  }

  // 重新量容器后 resize：先把画布的 inline 宽度收起来再量。Chart.js 响应式
  // 靠"量容器"，但画布自己带着上一次定型的 inline width（全屏时是 1358px）；
  // 如果容器是 Grid/Flex 子项，子项的 min-width:auto 会被这个 1358px 画布撑开，
  // 退出全屏时量出来的容器宽仍是 1358，画布就按 1358 定型，宿主还把同一行的
  // 其他卡片挤变形（用户报过的"全屏放大再缩小后大小变了"）。收起 inline 宽度
  // 后容器宽只由布局决定；Chart 的 _resize 随后会用 forceStyle 重写 inline 尺寸。
  // 忽略传入的 (w,h)：新实例的 ResizeObserver 首次回调带的是创建时的旧尺寸，
  // 迟到会把刚放大的画布缩回去。
  function remeasureResize(chart, origResize) {
    var cv = chart.canvas;
    var prevW = cv && cv.style ? cv.style.width : '';
    if (cv && cv.style) cv.style.width = '0px';
    try { origResize(); }
    finally { if (cv && cv.style && cv.style.width === '0px') cv.style.width = prevW; }
  }

  /* ---------- 全屏：遮罩 + 居中面板 + 标题栏 ----------
     面板就是图表宿主本身（加 ds-chart-fullscreen 类，CSS 见 components.css），画布不搬家；
     进入时在宿主里临时插一条标题栏（标题取所在卡片的 .ds-card-title，没有卡片退回
     图表自己的 title 配置）、在 body 末尾临时挂一块遮罩，退出时两者都摘掉，宿主 DOM
     恢复原样。同一时刻只有一个全屏（遮罩盖住了其他图表的入口）。
     Esc 用 capture 阶段的 keydown：此时若有模态弹窗（全屏里打开的数据表）开着，
     让 Esc 先关弹窗、不退全屏。 */
  var fsState = null;

  function fsTitleOf(host, chart) {
    var card = host.closest ? host.closest('.ds-card') : null;
    var t = card && card.querySelector('.ds-card-title');
    var text = t && t.textContent.trim();
    if (text) return text;
    var cfgTitle = chart && chart.config && chart.config.options && chart.config.options.plugins &&
      chart.config.options.plugins.title && chart.config.options.plugins.title.text;
    return cfgTitle ? String(cfgTitle) : '图表';
  }

  // 摘掉全屏的临时 DOM 与监听（不 resize）；destroy() 也走这里。
  function fsTeardown(host) {
    host.classList.remove('ds-chart-fullscreen');
    var head = host.querySelector(':scope > .ds-fs-head');
    if (head) head.remove();
    if (fsState && fsState.host === host) {
      if (fsState.backdrop.parentNode) fsState.backdrop.parentNode.removeChild(fsState.backdrop);
      document.removeEventListener('keydown', fsState.onKey, true);
      fsState = null;
    }
  }

  // 全屏中滚轮一律按 zoom 处理（全屏视图里没有页面滚动冲突），不论图表自己的模式。
  function wheelModeOf(chart) {
    var host = chart.canvas && chart.canvas.parentNode;
    if (host && host.classList.contains('ds-chart-fullscreen')) return 'zoom';
    return chart.$ds.mode || options.wheel;
  }

  // 单个柱状数据集 + dsColorBy:'category'（数据集上的优先于 config 顶层的）
  function categoryColorWanted(config, d) {
    var flag = d.dsColorBy != null ? d.dsColorBy : config.dsColorBy;
    if (flag !== 'category') return false;
    return (config.data.datasets || []).length === 1;
  }

  DS.charts = {
    /* 给同目录的组件模块（waterfall.js / boxplot.js）共用的小工具；不是公开 API。 */
    _util: {
      cssVar: cssVar, hexToRgba: hexToRgba, fmtInt: fmtInt, zoomAxisFor: zoomAxisFor,
      AREA_FILL_ALPHA: AREA_FILL_ALPHA
    },

    /* 进/出全屏。on 省略 = 切换。⛶ 按钮、标题栏 ×、Esc、点遮罩都走这里。
       Bug 2（用户报过两次）的约束全部保留：先改 DOM/类、再同步 chart.resize()
       （resize 包装会忽略传入尺寸、测量前收起 inline 宽度），不经 setTimeout/rAF。 */
    fullscreen: function (chart, on) {
      if (!chart || !chart.canvas) return;
      var host = chart.canvas.parentNode;
      var is = host.classList.contains('ds-chart-fullscreen');
      if (on === undefined) on = !is;
      if (!!on === is) return;
      if (on) {
        if (fsState) {
          var other = fsState.host.querySelector('canvas');
          if (other && other._dsChart) DS.charts.fullscreen(other._dsChart, false); else fsTeardown(fsState.host);
        }
        var head = document.createElement('div');
        head.className = 'ds-fs-head';
        head.innerHTML = '<span class="ds-fs-title"></span>' +
          '<button type="button" class="ds-chart-btn" data-act="fs-close" title="关闭全屏（Esc）" aria-label="关闭全屏">×</button>';
        head.querySelector('.ds-fs-title').textContent = fsTitleOf(host, chart);
        head.querySelector('[data-act="fs-close"]').addEventListener('click', function () {
          DS.charts.fullscreen(chart, false);
        });
        host.insertBefore(head, host.firstChild);
        var backdrop = document.createElement('div');
        backdrop.className = 'ds-fs-backdrop';
        backdrop.addEventListener('click', function () { DS.charts.fullscreen(chart, false); });
        // 遮罩上的滚轮不能滚动背后的页面
        backdrop.addEventListener('wheel', function (ev) { ev.preventDefault(); }, { passive: false });
        document.body.appendChild(backdrop);
        var onKey = function (ev) {
          if (ev.key !== 'Escape') return;
          if (document.querySelector('.ds-modal-backdrop:not([hidden])')) return;
          DS.charts.fullscreen(chart, false);
        };
        document.addEventListener('keydown', onKey, true);
        fsState = { host: host, backdrop: backdrop, onKey: onKey };
        host.classList.add('ds-chart-fullscreen');
      } else {
        fsTeardown(host);
      }
      if (chart.$ds) DS.charts._syncHint(chart);
      chart.resize();
    },

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

    /* 渐进色板：第 i 个（共 n 个）色相 = i*360/n，S/L 读 --chart-ramp-s/-l；
       返回 n 个 hsla() 字符串，opts.alpha 默认 1。 */
    rampColors: rampColors,

    themeColors: function () {
      return {
        grid: cssVar('--chart-grid'),
        axis: cssVar('--chart-axis'),
        text: cssVar('--color-text-secondary'),
        series: ['--chart-s1', '--chart-s2', '--chart-s3',
                 '--chart-s4', '--chart-s5', '--chart-s6'].map(cssVar),
        // 扩展到 10 色（s1..s10）：桑基图的节点按"层序 + 层内序"顺次取色，
        // 三层 [3,4,3] 的图相邻两层合计 7 个节点，6 色序列在数学上不够。
        // 其余图表仍然只用上面的 6 色 series，行为不变。
        seriesExt: ['--chart-s1', '--chart-s2', '--chart-s3', '--chart-s4', '--chart-s5',
                    '--chart-s6', '--chart-s7', '--chart-s8', '--chart-s9', '--chart-s10'].map(cssVar)
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
      var wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      var fn = function (value) {
        var d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        if (fmt === 'ymd') {
          return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
        }
        return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
      };
      // 标记：paint() 看到某根轴的 ticks.callback 带这个标记，就知道这根轴
      // 是"用数值轴模拟的日期轴"，悬浮框标题要同步按日期显示（格式与刻度
      // 一致，后面加星期几）。fn.title(value) 单独暴露，方便调用方复用。
      fn.__dsDateTicks = true;
      fn.title = function (value) {
        var d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        return fn(value) + '（' + wk[d.getUTCDay()] + '）';
      };
      return fn;
    },

    /* 数据为空时不画空白画布，渲染一条明确的空态。 */
    isEmpty: function (config) {
      var ds = (config.data && config.data.datasets) || [];
      if (!ds.length) return true;
      return ds.every(function (d) { return !d.data || d.data.length === 0; });
    },

    /* ---------- 气泡图 ----------
       items: [{ name, count, value }] —— 一个条目一个气泡，x = count（数量），
       y = value（平均值）。bubbleData 做 B1/B2（纯函数，可单独用）：
         - 过滤 count < minCount（默认 5）或 value 非有限数的条目，
           按 count 降序取前 topN（默认 50）；
         - 半径 r = max(minRadius, sqrt(count / maxCount) * maxRadius)，默认 5 / 35
           —— 面积与数量成正比（不是半径成正比），最大的条目半径为 maxRadius。
       返回 { points: [{ x, y, r, name, count }], maxCount }。 */
    bubbleData: function (items, opts) {
      opts = opts || {};
      var minCount = opts.minCount != null ? opts.minCount : 5;
      var topN = opts.topN != null ? opts.topN : 50;
      var minR = opts.minRadius != null ? opts.minRadius : 5;
      var maxR = opts.maxRadius != null ? opts.maxRadius : 35;
      var kept = (items || []).filter(function (it) {
        return it && it.count >= minCount && isFinite(it.value);
      }).sort(function (a, b) { return b.count - a.count; }).slice(0, topN);
      var maxCount = kept.length ? kept[0].count : 1;
      return {
        maxCount: maxCount,
        points: kept.map(function (it) {
          return { x: it.count, y: it.value, r: Math.max(minR, Math.sqrt(it.count / maxCount) * maxR),
                   name: it.name, count: it.count };
        })
      };
    },

    /* 一步建气泡图：bubbleData + type:'bubble' 配置（颜色/标签/悬浮框/无图例/双向
       框选缩放都由 paint()/create() 对 bubble 类型自动处理）+ 默认挂数据表。
       opts: minCount/topN/minRadius/maxRadius（见 bubbleData）、
             xTitle/yTitle（轴标题，两轴都从 0 开始）、
             countUnit/valueUnit（悬浮框单位，如 '片' / '分钟平均'）、
             labelRatio（默认 0.15）/labelMax（默认 12）、
             table:false 关闭数据表；tableTitle/nameLabel/countLabel/valueLabel 表格文案。 */
    bubble: function (canvas, items, opts) {
      opts = opts || {};
      var prep = DS.charts.bubbleData(items, opts);
      var config = {
        type: 'bubble',
        data: { datasets: [{ label: opts.label || '', data: prep.points }] },
        options: {
          dsZoom: 'xy',
          dsBubble: {
            countUnit: opts.countUnit || '', valueUnit: opts.valueUnit || '',
            labelRatio: opts.labelRatio, labelMax: opts.labelMax
          },
          scales: {
            x: { title: { display: true, text: opts.xTitle || '' }, beginAtZero: true },
            y: { title: { display: true, text: opts.yTitle || '' }, beginAtZero: true }
          }
        }
      };
      if (opts.table !== false) {
        config.dsTable = {
          title: opts.tableTitle || '数据',
          columns: [
            { key: 'name', label: opts.nameLabel || '名称' },
            { key: 'count', label: opts.countLabel || '数量', num: true, format: fmtInt },
            { key: 'y', label: opts.valueLabel || '平均值', num: true,
              format: function (v) { return Number(v).toFixed(1); } }
          ],
          rows: prep.points,
          search: { key: 'name' }
        };
      }
      return DS.charts.create(canvas, config);
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
        function pinnedOf(ax) {
          var so = chart.options.scales && chart.options.scales[ax];
          return { min: so ? so.min : undefined, max: so ? so.max : undefined };
        }
        chart.$ds = {
          min: null,
          max: null,
          axis: zAxis,
          mode: options.wheel,
          natural: hasLabels ? null : { min: chart.scales[zAxis].min, max: chart.scales[zAxis].max },
          // 调用方在缩放轴上显式钉死的 min/max（时间轴模拟必须钉）：复位时要还回
          // 去，而不是一律 delete——否则缩放→复位一次，钉死的刻度约定就永久丢了。
          pinned: pinnedOf(zAxis),
          drag: null
        };
        // xy 模式（散点/气泡默认，也可用 options.dsZoom:'xy' 给别的无类目笛卡尔图
        // 打开；有类目标签的图不支持——类目轴的"索引域"没有对应的第二根数值域
        // 概念）：横纵两根数值轴同时缩放。$ds 顶层的 min/max/natural/pinned 仍然是
        // "主轴"（zAxis）的状态，第二根轴（secAxis）的同一组状态放在 $ds.sec 里，
        // 两根轴用同一套 _bounds/_viewRange/_apply 逻辑，只是状态对象不同。
        var wantXY = config.options && config.options.dsZoom != null
          ? config.options.dsZoom === 'xy'
          : (config.type === 'scatter' || config.type === 'bubble');
        if (wantXY && !hasLabels) {
          var secAxis = zAxis === 'x' ? 'y' : 'x';
          chart.$ds.xy = true;
          chart.$ds.secAxis = secAxis;
          chart.$ds.sec = {
            min: null, max: null,
            natural: { min: chart.scales[secAxis].min, max: chart.scales[secAxis].max },
            pinned: pinnedOf(secAxis)
          };
        }

        // canvas 可能被二次 create() 复用（M4）：wheel/drag 监听器只在这块
        // canvas 第一次挂缩放时绑定一次，往后都通过 canvas._dsChart 这个可变
        // 指针找到"当前"实例——否则每次 create() 都会在同一块 canvas 上叠一层
        // 新监听器，旧的仍然存活并闭包着已销毁的旧 Chart 实例，事件一触发就
        // 可能对着死实例调用 chart.update() 出错（Review I2 的变异测试证实
        // 过这个分支必须真的只绑一次，demo.js 里有带名字的回归断言盯着）。
        // canvas._dsChart 本身的赋值统一挪到下面（不分笛卡尔/桑基都要赋）。
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
        // 数据表按钮要在 _fitToolbarLegend 之前挂上：它改变工具条宽度，图例是否
        // 被遮住的判断必须基于最终的工具条。
        if (config.dsTable) DS.charts.attachTable(chart, config.dsTable);

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
          // 忽略调用方/Chart.js 内置 ResizeObserver 传进来的 (width,height)，
          // 每次都重新量容器：新建实例的 ResizeObserver 首次回调携带的是
          // "创建时"的旧尺寸，若恰好在全屏切换之后才送达，就会把刚放大的
          // 画布缩回原尺寸（实测时有时无）。
          remeasureResize(chart, origResize);
          DS.charts._fitToolbarLegend(chart);
        };

        // 工具条 DOM 刚挂上，图例也已经被 new Chart() 真实布局过——两边的
        // 几何坐标现在都是真的，判断"要不要给工具条让出顶部空间"就放在
        // 这里，补上"从创建到第一次 resize() 之间"这段空档。必须排在
        // _mountToolbar() 之后：量重叠靠的就是刚挂上的工具条元素的
        // getBoundingClientRect()，顺序反了的话工具条还不存在，查不到任何
        // 重叠（Review 裁决 (c)）。
        DS.charts._fitToolbarLegend(chart);
      } else if (config.type === 'sankey') {
        // 高亮状态对象由 paint() 挂在 config 上（paint() 在 new Chart() 之前
        // 跑，这时候 chart 还不存在，没法挂在 chart 上）；这里只是取同一个
        // 对象的引用别名，方便点击处理器和外部 API 通过 chart 实例访问，
        // 两边改的是同一份状态，不是各自一份快照。
        chart.$dsSankey = config.$dsSankeyState;

        // canvas 可能被筛选触发的"销毁重建"复用过（这里不会真的复用，筛选
        // 规则要求连 canvas 一起换新，见下面点击处理器一样按 canvas._dsChart
        // 指针找"当前"实例的理由）：监听器只在这块 canvas 第一次挂桑基交互
        // 时绑一次，和 cartesian 分支的 _dsWheelBound 是同一个模式。
        // 桑基图只挂全屏按钮（D5）：缩放对它没有意义，所以不带 −/+/⟲ 与滚轮
        // 提示；全屏进出走同一个 'full' 分支（同步 chart.resize()）。
        DS.charts._mountToolbar(chart, { zoom: false });
        if (config.dsTable) DS.charts.attachTable(chart, config.dsTable);
        // 同上：桑基图也要忽略 ResizeObserver 送来的陈旧尺寸，始终重新量容器
        // （重建筛选后立刻点全屏会被旧尺寸缩回去，见 _mountToolbar 'full' 分支）。
        var sankeyOrigResize = chart.resize.bind(chart);
        chart.resize = function () { remeasureResize(chart, sankeyOrigResize); };

        if (!canvas._dsSankeyBound) {
          canvas._dsSankeyBound = true;
          canvas.addEventListener('click', function (ev) {
            DS.charts._onSankeyClick(canvas._dsChart, ev);
          });
        }
      }

      // 饼图/雷达图等没有缩放工具条的类型：声明了数据表才挂一条只有 表格/全屏
      // 两个按钮的工具条（attachTable 内部负责）。
      if (!isCartesian(config.type) && config.type !== 'sankey' && config.dsTable) {
        DS.charts.attachTable(chart, config.dsTable);
      }

      // 不管是不是笛卡尔图，都要让 canvas._dsChart 指向"当前"实例——
      // wheel/drag（笛卡尔）和点击高亮（桑基）两类监听器都只绑一次，之后
      // 全靠这个可变指针找到最新的活实例，canvas 被 destroy() 后置 null。
      canvas._dsChart = chart;

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
        // 散点图例外：多系列散点的点在各系列里没有"同一索引 = 同一位置"的
        // 对应关系，index 模式会把不同系列里下标相同的无关点凑成一个悬浮框；
        // 默认改用 nearest（只出离鼠标最近的那一个点，标题/内容里带系列名）。
        // 气泡图同理用 nearest，且必须 intersect:true：悬浮的是"鼠标正压着的那个
        // 圆"，鼠标在两个圆之间的空白处不该弹出离得最近的圆的悬浮框（圆的大小
        // 差异很大，"最近"的圆可能远在几十像素之外）。重叠处 Chart.js 的
        // nearest 会优先给面积更小的圆，小圆不会被大圆吞掉。
        var isBubble = config.type === 'bubble';
        var dMode = (config.type === 'scatter' || isBubble) ? 'nearest' : 'index';
        var dIntersect = isBubble;
        if (o.interaction == null) {
          o.interaction = { mode: dMode, intersect: dIntersect };
        }
        o.plugins.tooltip = o.plugins.tooltip || {};
        if (o.plugins.tooltip.mode == null) o.plugins.tooltip.mode = dMode;
        if (o.plugins.tooltip.intersect == null) o.plugins.tooltip.intersect = dIntersect;

        // 框选反馈矩形的绘制插件：每张笛卡尔图装一次（retheme 反复调 paint()
        // 不能反复追加，用 config 上的标志防重复，同桑基插件的做法）。
        if (!config.$dsZoomBoxInstalled) {
          config.plugins = config.plugins || [];
          config.plugins.push(ZOOM_BOX_PLUGIN);
          config.$dsZoomBoxInstalled = true;
        }

        if (isBubble) {
          // B4 不显示图例（每个气泡一个颜色、没有"系列"可图例）。调用方显式写了
          // legend.display 就尊重。
          if (o.plugins.legend.display == null) o.plugins.legend.display = false;
          // B5 气泡标签插件
          if (!config.$dsBubbleLabelsInstalled) {
            config.plugins.push(BUBBLE_LABELS_PLUGIN);
            config.$dsBubbleLabelsInstalled = true;
          }
          // B6 悬浮框：`名称: N 片, X.X 分钟平均`，单位来自 options.dsBubble
          // （countUnit / valueUnit，默认都为空）。调用方自己写了 label 回调
          // 就不碰；我们注入的带 __dsAuto 标记，retheme 重跑 paint() 时可以
          // 安全地重新注入。
          o.plugins.tooltip.callbacks = o.plugins.tooltip.callbacks || {};
          var curLabel = o.plugins.tooltip.callbacks.label;
          if (curLabel == null || curLabel.__dsAuto) {
            var bcfg = o.dsBubble || {};
            var autoLabel = function (ctx) {
              var p = ctx.raw;
              if (!p) return '';
              var cu = bcfg.countUnit ? ' ' + bcfg.countUnit : '';
              var vu = bcfg.valueUnit ? ' ' + bcfg.valueUnit : '';
              return p.name + ': ' + fmtInt(p.count != null ? p.count : p.x) + cu +
                ', ' + Number(p.y).toFixed(1) + vu;
            };
            autoLabel.__dsAuto = true;
            o.plugins.tooltip.callbacks.label = autoLabel;
          }
        }

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
        // 日期轴的悬浮框标题：只在"调用方没自己写 title 回调"时注入。
        // 上一轮 paint() 注入的回调带 __dsAutoTitle 标记，retheme 时可以
        // 安全地重新注入；没有标记的一律视为调用方的，绝不覆盖。
        var dateAxis = null;
        axisNames.forEach(function (axis) {
          var cb = o.scales[axis] && o.scales[axis].ticks && o.scales[axis].ticks.callback;
          if (!dateAxis && cb && cb.__dsDateTicks) dateAxis = { name: axis, cb: cb };
        });
        if (dateAxis) {
          o.plugins.tooltip.callbacks = o.plugins.tooltip.callbacks || {};
          var curTitle = o.plugins.tooltip.callbacks.title;
          if (curTitle == null || curTitle.__dsAutoTitle) {
            var dax = dateAxis.name, dcb = dateAxis.cb;
            var autoTitle = function (items) {
              if (!items || !items.length) return '';
              var p = items[0].parsed;
              var v = p && p[dax] != null ? p[dax] : items[0].label;
              return dcb.title(v);
            };
            autoTitle.__dsAutoTitle = true;
            o.plugins.tooltip.callbacks.title = autoTitle;
          }
        }
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
      // 'sankey' 是第四类：既不是笛卡尔图，也不共用 radar/polarArea 的 'r' 轴
      // ——它没有任何开发者可见的坐标轴需要注入颜色（上面 NON_CARTESIAN_TYPES
      // 的说明）。它仍然需要一份"没传才补"的 tooltip 文案（从→到 + 流量 +
      // 占源节点总流出的百分比）：chartjs-chart-sankey 自带的默认 tooltip
      // 只有"from -> to: flow"，没有占比，且用的是西文箭头和纯 ASCII 连接符；
      // 调用方自己配置过 label 回调的话完全尊重，不覆盖。
      else if (config.type === 'sankey') {
        o.plugins = o.plugins || {};
        o.plugins.tooltip = o.plugins.tooltip || {};
        o.plugins.tooltip.callbacks = o.plugins.tooltip.callbacks || {};
        if (o.plugins.tooltip.callbacks.label == null) {
          o.plugins.tooltip.callbacks.label = function (ctx) {
            var flows = (ctx.dataset && ctx.dataset.data) || [];
            var f = flows[ctx.dataIndex];
            if (!f) return '';
            var total = 0;
            for (var fi = 0; fi < flows.length; fi++) {
              if (flows[fi] && flows[fi].from === f.from) total += (flows[fi].flow || 0);
            }
            var pct = total > 0 ? (f.flow / total * 100) : 0;
            return f.from + ' → ' + f.to + ': ' + f.flow + ' (' + pct.toFixed(1) + '%)';
          };
        }
      }

      var arc = isArc(config.type);
      // chartjs-chart-sankey 的数据集不是"每个数据点一个颜色"的弧形族，也不是
      // 普通折线/柱状图那套 backgroundColor/borderColor 语义——它的节点
      // （colorFrom/colorTo，按 Chart.js scriptable element 选项解析，运行时
      // 以 ctx 为参数调用）和标签文字色（color，控制器直接当字符串字面量用，
      // 不是 scriptable）要分开处理，必须在下面 forEach 顶部单独短路，不能
      // 落进 arc/else 的通用着色分支——那条分支会把 backgroundColor/
      // borderColor 当成笛卡尔语义覆盖掉，而 borderColor 在这里其实是节点
      // 描边色，语义完全不同。
      var isSankey = config.type === 'sankey';
      if (isSankey) {
        // 高亮状态挂在 config 上而不是 chart 上：paint() 在 new Chart() 之前
        // 就要跑（见 create()），这时候 chart 实例还不存在。用 `x = x || {}`
        // 只在第一次创建时初始化，retheme()（主题切换）复用同一个 config
        // 对象再次调用 paint() 时不会把用户当前点出来的高亮状态清空。
        config.$dsSankeyState = config.$dsSankeyState || { active: null, baseline: null };
        // 高亮重绘插件只装一次：每次 retheme() 都会重新跑 paint()，如果不
        // 加这个标记，config.plugins 会在每次主题切换时都被追加一份同样的
        // 插件，重复次数越堆越多。
        if (!config.$dsSankeyPluginInstalled) {
          config.plugins = config.plugins || [];
          config.plugins.push(SANKEY_HIGHLIGHT_PLUGIN);
          config.plugins.push(SANKEY_FILL_PLUGIN);
          config.$dsSankeyPluginInstalled = true;
        }
      }
      (config.data.datasets || []).forEach(function (d, i) {
        // 自带配色的数据集（瀑布图/箱线图）：颜色由下面的 config.$dsPainters 逐次写入，
        // 不走通用的"系列色/按类目着色"分支，免得这里先写一遍又被覆盖。
        if (d.$dsOwned) return;
        if (isSankey) {
          // 节点配色（D2）：节点按"层号 -> 层内首现顺序"排成一条线顺次取
          // 扩展序列色（10 色），相邻层之间、同层之间都不撞色（见
          // sankeyNodeOrder() 的说明）。调用方可以传 dataset.nodeOrder（节点键
          // 数组，例如筛选组件传入"全量数据"的顺序）来固定每个节点的颜色，
          // 这样筛选前后同一个节点颜色不变；没传就按当前数据自己算。不在
          // nodeOrder 里的节点排在最后。必须每次 paint() 重新算（retheme 靠
          // 它换新的 c.seriesExt 取值）。
          var orderKeys = Array.isArray(d.nodeOrder) ? d.nodeOrder.slice() : [];
          var inOrder = {};
          orderKeys.forEach(function (k) { inOrder[k] = true; });
          sankeyNodeOrder(d.data || []).forEach(function (k) {
            if (!inOrder[k]) { inOrder[k] = true; orderKeys.push(k); }
          });
          var nodeColorIndex = {};
          orderKeys.forEach(function (k, i) { nodeColorIndex[k] = i; });
          var seriesColorFor = function (key) {
            if (!Object.prototype.hasOwnProperty.call(nodeColorIndex, key)) return sankeyFallbackColor();
            return c.seriesExt[nodeColorIndex[key] % c.seriesExt.length];
          };
          // 节点高亮重绘插件按节点身份取基础色用（见 SANKEY_HIGHLIGHT_PLUGIN）
          config.$dsSankeyState.colorOf = seriesColorFor;
          // 排序优先级：没传才补，和颜色/tooltip 同一个"调用方给了就不碰"
          // 的约定。减少连线交叉是第三方桑基插件自己按 priority 数值做的，
          // 这里只按流量算出一份通用排名喂给它。
          if (d.priority == null || d.__dsAutoPriority) {
            d.priority = sankeyPriority(d.data || []);
            d.__dsAutoPriority = true;
          }
          // colorFrom/colorTo 是 chartjs-chart-sankey 注册的 'flow' 元素的
          // scriptable 选项，Chart.js 按每条流向记录各调用一次，ctx.dataset/
          // ctx.dataIndex 组合出当前这条记录（和官方文档示例的读取方式一致）。
          // __dsAutoColorFrom/__dsAutoColorTo 各自独立标记，调用方只定义了
          // 其中一个的话，另一个仍然跟主题走——和弧形族 __dsAutoBg/
          // __dsAutoBorder 拆分开的理由完全一样（见那里的说明）。
          //
          // 流向着色规则（D1，与参照实现一致）：整条流向要么全亮要么全灰，
          // 判据是"起点或终点属于高亮集合 hl（state.active 本身，不是扩展后
          // 的连通集）"。没有高亮（active 为空）时全部按原色。节点方块不走
          // 这里——节点由 SANKEY_HIGHLIGHT_PLUGIN 按一跳连通集单独重绘。
          function flowColor(ctx, endKey) {
            var raw = ctx && ctx.dataset && ctx.dataset.data && ctx.dataset.data[ctx.dataIndex];
            var base = seriesColorFor(raw && raw[endKey]);
            var hl = config.$dsSankeyState && config.$dsSankeyState.active;
            if (hl && hl.size && raw && !(hl.has(raw.from) || hl.has(raw.to))) return sankeyDimColor();
            return base;
          }
          if (d.colorFrom == null || d.__dsAutoColorFrom) {
            d.colorFrom = function (ctx) { return flowColor(ctx, 'from'); };
            d.__dsAutoColorFrom = true;
          }
          if (d.colorTo == null || d.__dsAutoColorTo) {
            d.colorTo = function (ctx) { return flowColor(ctx, 'to'); };
            d.__dsAutoColorTo = true;
          }
          // 节点标签文字色：chartjs-chart-sankey 的 _drawLabels() 把
          // dataset.color 当成普通字符串直接赋给 ctx.fillStyle（不是
          // scriptable，传函数进去画布会静默忽略、文字保持上一次的颜色），
          // 所以这里只能写一个固定值，不能跟 colorFrom/colorTo 一样写成
          // "按节点取色"的函数。
          if (d.color == null || d.__dsAutoColor) {
            d.color = c.text;
            d.__dsAutoColor = true;
          }
          // 节点描边：和弧形族的扇区描边同一个理由——用 --color-surface
          // 把相邻节点的矩形分隔开，深浅主题下都有干净的轮廓。同样是
          // dataset.borderColor 被 _drawNodes() 当成普通字符串用，不是
          // scriptable。
          if (d.borderColor == null || d.__dsAutoBorder) {
            d.borderColor = cssVar('--color-surface');
            d.__dsAutoBorder = true;
          }
          return;
        }
        if (arc) {
          // 弧形族：每个扇区一个颜色，数组长度按数据点数来，颜色不够就循环取模（十色 s1…s10；
          // 此前只用前六色，扇区多于 6 个时颜色重复得太早）。
          // 描边统一用 --color-surface：深浅主题下都能把相邻扇区正确分隔开，
          // 而不是像之前那样描边色和填充色完全一样、扇区之间看不出缝。
          var n = (d.data || []).length;
          var palette = [];
          for (var k = 0; k < n; k++) palette.push(c.seriesExt[k % c.seriesExt.length]);
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
          // 按类目着色（dsColorBy:'category'）：柱子代表不同对象（不同项目/仪器/星期几）
          // 时每根柱子一个颜色，取 --chart-s1…s10 按类目索引循环，描边同色；柱子是同一
          // 指标随时间的值时不要开，用单色。只对"单个柱状数据集"生效（多系列柱状图的
          // 颜色是系列身份，图例靠它区分，不能再按类目改色）。开关写在数据集上，
          // 也可写在 config 顶层作为所有数据集的默认（同 dsTable）。显式给了颜色的
          // 一侧不覆盖，跟 __dsAutoBg/__dsAutoBorder 的约定一致。
          if (dsType === 'bar' && categoryColorWanted(config, d)) {
            var catN = (d.data || []).length;
            var catColors = [];
            for (var ci = 0; ci < catN; ci++) catColors.push(c.seriesExt[ci % c.seriesExt.length]);
            if (d.backgroundColor == null || d.__dsAutoBg) {
              d.backgroundColor = catColors;
              d.__dsAutoBg = true;
            }
            if (d.borderColor == null || d.__dsAutoBorder) {
              d.borderColor = catColors.slice();
              d.__dsAutoBorder = true;
            }
            // 图例只会拿第一个颜色代表整个数据集，会误导——默认不显示（显式写了就尊重）
            if (o.plugins.legend.display == null) o.plugins.legend.display = false;
            return;
          }
          // B3 气泡：按排名（数据顺序，bubble() 已按数量降序）沿色轮渐进着色
          // （rampColors），填充 0.7、描边 1、线宽 1.5，与参照实现一致。
          if (dsType === 'bubble') {
            var bn = (d.data || []).length;
            if (d.backgroundColor == null || d.__dsAutoBg) {
              d.backgroundColor = rampColors(bn, { alpha: BUBBLE_FILL_ALPHA });
              d.__dsAutoBg = true;
            }
            if (d.borderColor == null || d.__dsAutoBorder) {
              d.borderColor = rampColors(bn, { alpha: 1 });
              d.__dsAutoBorder = true;
            }
            if (d.borderWidth == null) d.borderWidth = BUBBLE_BORDER_WIDTH;
            return;
          }
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
      // 组件级配色钩子：瀑布图/箱线图在 create 前把自己的 painter 挂在 config.$dsPainters
      // 上（函数签名 (themeColors, config)），每次 paint()（首建 + 每次主题切换）都重跑，
      // 颜色全部从 token 现读，所以主题切换后自动跟随。
      (config.$dsPainters || []).forEach(function (fn) { fn(c, config); });
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

    /* 对 root 内（元素或选择器；省略 = 整个文档）所有"此刻可见"的存活实例调一次
       resize()。宿主处于 display:none（隐藏面板 / 折叠区）时图表是 0x0，面板变
       可见后用它按真实尺寸重算；只做 resize，不新建实例、不挂监听器，可重复调用。
       侧边栏（DS.sidebar）切换面板时自动调用。返回被重算的实例数。 */
    resizeIn: function (root) {
      if (typeof root === 'string') root = document.querySelector(root);
      root = root || document;
      var n = 0;
      DS.charts.all().forEach(function (chart) {
        var cv = chart.canvas;
        if (!cv || !root.contains(cv)) return;
        var host = cv.parentNode;
        if (!host || host.clientWidth === 0) return;
        chart.resize();
        n++;
      });
      return n;
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
          fsTeardown(host);
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
    // axis 省略 = 主轴（类目轴/zAxis）；xy 模式下传第二根轴名取它的边界。
    _bounds: function (chart, axis) {
      var ds = chart.$ds;
      axis = axis || (ds && ds.axis) || zoomAxisFor(chart.options.indexAxis);
      var st = ds ? stateOf(chart, axis) : null;
      var labels = chart.data.labels;
      if (!(ds && axis !== ds.axis) && labels && labels.length) {
        return { axis: axis, lo: 0, hi: Math.max(0, labels.length - 1), indexed: true };
      }
      // 自愈：create() 时如果画布还是 0 尺寸（比如挂在当时隐藏的标签页里），
      // Chart.js 对无类目的线性轴会退回一个占位量程（实测是 0..100），不是
      // 真实数据域，且这份快照此后再也不会自动刷新。只要当前没有处于缩放
      // 状态（视图本就该等于满量程本身），用"活的" scale 量程校正一次——
      // 画布一旦变得可见并真正 resize() 过，chart.scales 就是准的，借这个
      // 机会把 natural 快照修正回真实值，而不是让一次性的创建时快照永远
      // 带着错的占位量程。
      if (st && st.min == null && st.max == null) {
        var live = chart.scales[axis];
        if (live && isFinite(live.min) && isFinite(live.max) && live.max > live.min) {
          st.natural = { min: live.min, max: live.max };
        }
      }
      var nat = st && st.natural;
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

    // 当前"视图"范围：状态 min/max 为 null 表示还没有显式缩放约束，视图
    // 等于满量程 b.lo/b.hi。按 b.axis 取对应那根轴的状态。
    _viewRange: function (chart, b) {
      var s = stateOf(chart, b.axis);
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
    // 某根轴的状态 min/max 都是 null 时（resetZoom 之后）直接删掉 scale 上的
    // min/max 覆盖、交还 Chart.js 自动量程，而不是我们自己写一份算出来的
    // "满量程"——这样无论之前缩放成什么样，复位永远能恢复到数据的真实全貌
    // （Review C1：旧实现把 labels.length-1 当成横向条形图数值轴的满量程写回
    // 去，复位反而把图冲得更坏，必须刷新页面才能恢复）。xy 模式下两根轴各
    // 自按自己的状态处理。
    _apply: function (chart) {
      var s = chart.$ds;
      zoomAxesOf(chart).forEach(function (axis) {
        var st = stateOf(chart, axis);
        var scale = chart.options.scales[axis];
        if (st.min == null && st.max == null) {
          // 复位：还原调用方钉死的 min/max；没钉过的才交还 Chart.js 自动量程
          if (st.pinned && st.pinned.min != null) scale.min = st.pinned.min; else delete scale.min;
          if (st.pinned && st.pinned.max != null) scale.max = st.pinned.max; else delete scale.max;
        } else {
          scale.min = st.min;
          scale.max = st.max;
        }
      });
      chart.update('none');
    },

    // 工具条 −/+ 用：没有鼠标位置，以当前视野中心为基准。
    zoom: function (chart, factor) {
      if (!chart || !chart.canvas || !chart.$ds) return;
      zoomAxesOf(chart).forEach(function (axis) {
        DS.charts._zoomAxis(chart, axis, factor, null);
      });
      DS.charts._apply(chart);
    },

    // 滚轮用：以画布像素 (px, py) 为锚点缩放，鼠标下的数据值缩放前后停在同一像素。
    // 每根参与缩放的轴各自取锚点（xy 图两轴都动，只缩类目轴的图只动那一轴）。
    // 鼠标落在绘图区之外（轴标签、边距）时按最近的绘图区边界点锚定：那里本来就
    // 是"最靠近鼠标的数据"，比忽略这次滚动更符合手感，也不会让滚轮在边距上失灵。
    zoomAt: function (chart, factor, px, py) {
      if (!chart || !chart.canvas || !chart.$ds) return;
      var ca = chart.chartArea;
      // 连续滚轮：类目轴每一格都要取整到整数个类目，如果每格都按"取整后鼠标下的值"
      // 重新取锚点，取整误差会逐格累积（实测三格后偏出约两个类目）。同一鼠标位置在
      // 短时间内连续滚动时，沿用第一格的真实锚点值，误差就只剩最后一格的取整。
      var wa = chart.$ds._wheelAnchor;
      var now = Date.now();
      var reuse = wa && now - wa.t < 800 && Math.abs(wa.px - px) < 1.5 && Math.abs(wa.py - py) < 1.5;
      var kept = reuse ? wa.a : {};
      var pins = [];          // 每根轴：{axis, a: 锚点数据值, p: 锚点应停的像素}
      zoomAxesOf(chart).forEach(function (axis) {
        var sc = chart.scales[axis];
        var anchor = null;
        if (sc && ca && isFinite(px) && isFinite(py)) {
          var horiz = sc.isHorizontal();
          var p = horiz ? Math.min(Math.max(px, ca.left), ca.right)
                        : Math.min(Math.max(py, ca.top), ca.bottom);
          var b = DS.charts._bounds(chart, axis);
          var v = DS.charts._viewRange(chart, b);
          // 不用 getValueForPixel：类目轴的它会四舍五入到整数索引。按当前视野
          // 两端的真实像素做线性插值，横/纵轴、方向反转都统一成同一个公式。
          // 类目轴小数视野下 Chart.js 按整数个类目摊满绘图区，两端像素之间并不对应
          // [min,max]，改用 0、1 两个索引的像素（类目轴上严格线性）做标尺。
          var vA = b.indexed ? 0 : v.min, vB = b.indexed ? 1 : v.max;
          var pmin = sc.getPixelForValue(vA);
          var pmax = sc.getPixelForValue(vB);
          if (isFinite(pmin) && isFinite(pmax) && pmax !== pmin) {
            anchor = vA + (p - pmin) / (pmax - pmin) * (vB - vA);
            // 锚点值与它应停的像素一起沿用（鼠标停在边距里时 p 是夹到绘图区边界的，
            // 边界会随刻度宽度漂移，不能每格重夹）
            if (kept[axis] != null) { anchor = kept[axis].a; p = kept[axis].p; } else kept[axis] = { a: anchor, p: p };
            pins.push({ axis: axis, a: anchor, p: p, indexed: b.indexed });
          }
        }
        var stBefore = stateOf(chart, axis);
        var nBefore = stBefore.min == null ? null : Math.round(stBefore.max) - Math.round(stBefore.min) + 1;
        DS.charts._zoomAxis(chart, axis, factor, anchor);
        var pin = pins.length && pins[pins.length - 1].axis === axis ? pins[pins.length - 1] : null;
        if (pin && pin.indexed) {
          var st1 = stateOf(chart, axis), bb = DS.charts._bounds(chart, axis);
          if (st1.min != null) {
            // 类目轴的视野只能是整数个类目（Chart.js 把 min/max 取整），连续的 min/max
            // 画出来会和我们算的锚点对不上。这里把窗口宽度定成整数个类目 N，保证至少
            // 比上一格多/少一个（否则 1.25 倍在小窗口上取整后原地不动，滚轮就卡死），
            // 再按精确的线性模型摆放起点。
            var full = bb.hi - bb.lo + 1;
            var N0 = nBefore == null ? full : nBefore;
            var N1 = Math.round(st1.max - st1.min) + 1;
            if (factor > 1 && N1 >= N0) N1 = N0 - 1;
            if (factor < 1 && N1 <= N0) N1 = N0 + 1;
            N1 = Math.max(2, Math.min(full, N1));
            if (N1 >= full) { st1.min = null; st1.max = null; }
            else placeIndexed(chart, pin, N1);
          }
        }
      });
      chart.$ds._wheelAnchor = { t: now, px: px, py: py, a: kept };
      DS.charts._apply(chart);
      // 缩放后刻度变了，刻度标签宽度（如 y 轴数字位数、类目标签截断）会让绘图区
      // 左右/上下边距跟着变，同一个数据值的像素位置于是整体漂移。按实测漂移量
      // 把视野平移回去再更新，最多八轮（实测一两轮收敛）；平移钳在数据边界内，
      // 钳不动的残差属于"贴着边缘缩放"的正常代价。
      for (var pass = 0; pass < 8; pass++) {
        var moved = false;
        pins.forEach(function (pin) {
          var sc = chart.scales[pin.axis];
          var st = stateOf(chart, pin.axis);
          if (!sc || (st.min == null && st.max == null)) return;
          var b = DS.charts._bounds(chart, pin.axis);
          var v = DS.charts._viewRange(chart, b);
          var w = v.max - v.min;
          var shift;
          if (b.indexed) {
            if (placeIndexed(chart, pin, Math.round(st.max) - Math.round(st.min) + 1)) moved = true;
            return;
          } else {
            var p0 = sc.getPixelForValue(v.min), p1 = sc.getPixelForValue(v.max);
            if (!isFinite(p0) || !isFinite(p1) || p1 === p0) return;
            var cur = p0 + (pin.a - v.min) / w * (p1 - p0);
            if (Math.abs(cur - pin.p) < 0.25) return;
            shift = (cur - pin.p) / (p1 - p0) * w;      // 视野需要平移的数据量
          }
          var min = Math.min(Math.max(v.min + shift, b.lo), b.hi - w);
          if (Math.abs(min - v.min) > w * 1e-12) {
            st.min = min;
            st.max = min + w;
            moved = true;
          }
        });
        if (!moved) break;
        DS.charts._apply(chart);
      }
    },

    // 单轴缩放核心：anchor 为 null 时取视野中心。新视野 = 以 anchor 为不动点按
    // factor 缩放；越过数据边界时整体平移（保持缩放后的宽度），不压扁；
    // 宽度覆盖满量程时状态收回 null。
    _zoomAxis: function (chart, axis, factor, anchor) {
      var b = DS.charts._bounds(chart, axis);
      var st = stateOf(chart, axis);
      var v = DS.charts._viewRange(chart, b);
      var w = v.max - v.min;
      var full = b.hi - b.lo;
      // 锚点不夹到视野内：鼠标停在轴端与绘图区边界之间的几像素缝里时（气泡图的
      // 半径留白）锚点略超出视野，夹回去会让"鼠标下的数据"与锚点像素对不上。
      var a = anchor == null ? (v.min + v.max) / 2 : anchor;
      var w2 = Math.min(full, Math.max(2 * DS.charts._minHalf(b), w / factor));
      var min = a - (a - v.min) * (w2 / w);
      if (min < b.lo) min = b.lo;
      if (min + w2 > b.hi) min = b.hi - w2;
      var max = min + w2;
      // 向外缩到覆盖满量程时，把状态 min/max 收回 null（视为"未缩放"），
      // 不能让它们停在等于 b.lo/b.hi 的具体数值上——isZoomed() 判定的是
      // "min/max 是否非 null"，钳成具体数值会让它恒为 true。smart 滚轮
      // 模式判断"是否已到缩放下限、该放行翻页"就是靠 isZoomed()，一旦
      // 卡在恒真，用户在这张图上向外滚多少次都无法把滚轮还给页面滚动
      // （Review C1：实测向内滚 2 次、向外滚 25 次，$ds 已是满量程
      // {min:0,max:5} 但 isZoomed() 依然为 true）。resetZoom() 复位同样
      // 置 null，这里让"滚到底"和"点复位"落到同一个状态，而不是两套
      // 表面等价、实际不等价的"满量程"表示。
      if (w2 >= full - full * 1e-9) {
        st.min = null;
        st.max = null;
      } else {
        st.min = min;
        st.max = max;
      }
    },

    // 主轴（类目轴/zAxis）的区间缩放；xy 图的矩形框选走 zoomBox。
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

    // xy 矩形框选：ranges = { x:[a,b], y:[c,d] }（数据值，顺序无所谓）。两个
    // 方向都要达到最窄宽度才生效，只要有一个方向过窄（误触，或者拖成一条细
    // 线）就整体忽略——矩形框选的语义是"圈出一块区域"。返回是否生效。
    zoomBox: function (chart, ranges) {
      if (!chart || !chart.canvas || !chart.$ds || !chart.$ds.xy) return false;
      var axes = zoomAxesOf(chart), plan = [];
      for (var i = 0; i < axes.length; i++) {
        var r = ranges && ranges[axes[i]];
        if (!r) return false;
        var b = DS.charts._bounds(chart, axes[i]);
        var lo = Math.max(b.lo, Math.min(r[0], r[1]));
        var hi = Math.min(b.hi, Math.max(r[0], r[1]));
        if (!(hi - lo >= DS.charts._minHalf(b))) return false;
        plan.push({ axis: axes[i], lo: lo, hi: hi });
      }
      plan.forEach(function (p) {
        var st = stateOf(chart, p.axis);
        st.min = p.lo;
        st.max = p.hi;
      });
      DS.charts._apply(chart);
      return true;
    },

    // 平移：dx/dy 是画布像素位移（手拖的方向：内容跟着手走），只作用于已经处于
    // 缩放状态的轴，窗口宽度不变、钳在数据边界内。返回是否有轴真的动了。
    panBy: function (chart, dx, dy) {
      if (!chart || !chart.canvas || !chart.$ds) return false;
      var moved = false;
      zoomAxesOf(chart).forEach(function (axis) {
        var st = stateOf(chart, axis);
        var d = axis === 'x' ? dx : dy;
        if (!d || (st.min == null && st.max == null)) return;
        var sc = chart.scales[axis];
        // 不用 getValueForPixel：类目轴的它会四舍五入到整数索引，逐帧的小位移
        // 会全部被舍成 0，永远拖不动。直接按"每像素多少数据单位"换算：用轴
        // 当前 min/max 两端的真实像素距离（不能用 scale.width——刻度标签溢出
        // 时 Chart.js 会在轴两端留内边距，getPixelForValue 映射的跨度比
        // scale.width 小；类目轴的两端像素差也恰好是 (max-min) 个类目步长）。
        // y 轴像素向下、数值向上，符号相反。
        var horiz = sc.isHorizontal();
        var span = Math.abs(sc.getPixelForValue(sc.max) - sc.getPixelForValue(sc.min));
        if (!span) return;
        var shift = (horiz ? d : -d) * (sc.max - sc.min) / span;
        var b = DS.charts._bounds(chart, axis);
        var v = DS.charts._viewRange(chart, b);
        var w = v.max - v.min;
        var min = Math.min(Math.max(v.min - shift, b.lo), b.hi - w);
        if (min !== v.min) {
          st.min = min;
          st.max = min + w;
          moved = true;
        }
      });
      if (moved) DS.charts._apply(chart);
      return moved;
    },

    resetZoom: function (chart) {
      if (!chart || !chart.canvas || !chart.$ds) return;
      chart.$ds._wheelAnchor = null;
      zoomAxesOf(chart).forEach(function (axis) {
        var st = stateOf(chart, axis);
        st.min = null;
        st.max = null;
      });
      DS.charts._apply(chart);
    },

    isZoomed: function (chart) {
      if (!chart || !chart.canvas || !chart.$ds) return false;
      return zoomAxesOf(chart).some(function (axis) {
        var st = stateOf(chart, axis);
        return st.min != null || st.max != null;
      });
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
      var mode = wheelModeOf(chart);
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
      var rect = chart.canvas.getBoundingClientRect();
      // chart.width 是 Chart.js 内部（CSS）像素；仍按比例换算以防画布被 CSS 拉伸
      var sx = rect.width ? chart.width / rect.width : 1;
      var sy = rect.height ? chart.height / rect.height : 1;
      DS.charts.zoomAt(chart, zoomIn ? 1.25 : 0.8, (ev.clientX - rect.left) * sx, (ev.clientY - rect.top) * sy);
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

    _mountToolbar: function (chart, opts) {
      var withZoom = !(opts && opts.zoom === false);
      var chartAtMount = chart;
      var host = chart.canvas.parentNode;
      var bar = document.createElement('div');
      bar.className = 'ds-chart-toolbar';
      // type="button" 防止图表落在 <form> 里时点击触发表单提交
      // （Review M5）；aria-label 补充给屏幕阅读器，title 继续保留给鼠标
      // 悬浮提示。"全屏"用内联 SVG 而不是 U+26F6 字符——审查截图确认过，
      // 本机装了 Noto CJK 字体，这个字形依然渲染成豆腐块，产物又是离线单
      // 文件不内嵌字体，换一台机器更不可控（Review M4）。SVG 用
      // currentColor 继承按钮的文字色，不新增颜色字面量。
      bar.innerHTML = (withZoom ?
        '<button type="button" class="ds-chart-btn" data-act="out" title="缩小" aria-label="缩小">−</button>' +
        '<button type="button" class="ds-chart-btn" data-act="in" title="放大" aria-label="放大">+</button>' +
        '<button type="button" class="ds-chart-btn" data-act="reset" title="复位" aria-label="复位">⟲</button>' : '') +
        '<button type="button" class="ds-chart-btn" data-act="full" title="全屏" aria-label="全屏">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>' +
        '</button>' +
        (withZoom ? '<span class="ds-chart-hint"></span>' : '');
      host.appendChild(bar);
      bar.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('[data-act]') : ev.target;
        var act = btn && btn.getAttribute('data-act');
        // 点击时再去宿主里找"当前"实例（canvas._dsChart 指针的惯例），不攥着
        // 创建工具条时的闭包实例——重建/换实例之后旧实例已经销毁。
        var cvEl = host.querySelector('canvas');
        var chart = (cvEl && cvEl._dsChart && cvEl._dsChart.canvas) ? cvEl._dsChart : chartAtMount;
        if (act === 'in') DS.charts.zoom(chart, 1.25);
        else if (act === 'out') DS.charts.zoom(chart, 0.8);
        else if (act === 'reset') DS.charts.resetZoom(chart);
        else if (act === 'table') DS.charts.openTable(chart);
        else if (act === 'full') DS.charts.fullscreen(chart);
      });
      DS.charts._syncHint(chart);
    },

    /* ---------- 图表 + 数据表弹窗（通用，任何图表都能挂） ----------
       spec = {
         title:   弹窗标题,
         columns: [{ key, label, num?, format?(value,row) }]   // num:true = 数值列：
                  // 右对齐（th.num/td.num），首次点表头降序；其余列首次升序
         rows:    数组 | function(chart) -> 数组   // 每次打开时取最新
         search:  { key, placeholder? } | false    // 按哪一列做不区分大小写的子串过滤；
                  // 省略 = 第一列；false = 不要搜索框
         index:   false 可去掉最左的 # 列（# = 当前可见行的序号，排序/过滤后重编）
       }
       attachTable 在工具条上加一个"表格"按钮（内联 SVG）；也可以在 create 的
       config 里直接写 dsTable: spec。openTable 打开弹窗（DS.modal），每次都重建
       内容，因此搜索框、排序状态每次打开都是干净的。表格排序复用
       DS.tables.sortable。 */
    attachTable: function (chart, spec) {
      if (!chart || !chart.canvas || !spec) return;
      chart.$dsTable = spec;
      var host = chart.canvas.parentNode;
      var bar = host.querySelector('.ds-chart-toolbar');
      if (!bar) {
        DS.charts._mountToolbar(chart, { zoom: false });
        bar = host.querySelector('.ds-chart-toolbar');
      }
      if (bar.querySelector('[data-act="table"]')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ds-chart-btn';
      btn.setAttribute('data-act', 'table');
      btn.title = '表格';
      btn.setAttribute('aria-label', '表格');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>';
      var full = bar.querySelector('[data-act="full"]');
      bar.insertBefore(btn, full);
    },

    openTable: function (chart) {
      var spec = chart && chart.$dsTable;
      if (!spec) return;
      var cols = spec.columns || [];
      var rows = (typeof spec.rows === 'function' ? spec.rows(chart) : spec.rows) || [];
      var withIndex = spec.index !== false;
      var search = spec.search === false ? null :
        { key: (spec.search && spec.search.key) || (cols[0] && cols[0].key),
          placeholder: (spec.search && spec.search.placeholder) || '搜索…' };
      var head = (withIndex ? '<th>#</th>' : '') + cols.map(function (c) {
        return '<th' + (c.num ? ' class="num" data-sort-first="desc"' : '') + '>' + escHtml(c.label) + '</th>';
      }).join('');
      var body = rows.map(function (r, i) {
        return '<tr data-i="' + i + '">' + (withIndex ? '<td>' + (i + 1) + '</td>' : '') +
          cols.map(function (c) {
            var v = r[c.key];
            var t = c.format ? c.format(v, r) : (v == null ? '' : v);
            return '<td' + (c.num ? ' class="num"' : '') + '>' + escHtml(t) + '</td>';
          }).join('') + '</tr>';
      }).join('');
      DS.modal.open(
        '<div class="ds-table-modal">' +
          '<div class="ds-table-modal-head"><h3>' + escHtml(spec.title || '') + '</h3>' +
          (search ? '<input type="search" class="ds-table-modal-search" placeholder="' +
            escHtml(search.placeholder) + '" aria-label="' + escHtml(search.placeholder) + '" value="">' : '') +
          '<button type="button" class="ds-table-modal-close" aria-label="关闭" data-close>×</button></div>' +
          '<div class="ds-table-modal-body"><table class="ds-table" id="ds-chart-table"><thead><tr>' + head +
          '</tr></thead><tbody>' + body + '</tbody></table>' +
          '<div class="ds-table-modal-empty" hidden>无匹配结果</div></div>' +
        '</div>');
      var root = document.querySelector('.ds-modal-backdrop .ds-table-modal');
      var table = root.querySelector('#ds-chart-table');
      var tbody = table.tBodies[0];
      var empty = root.querySelector('.ds-table-modal-empty');
      function renumber() {
        var n = 0;
        Array.prototype.forEach.call(tbody.rows, function (tr) {
          if (tr.hidden) return;
          n++;
          if (withIndex) tr.cells[0].textContent = n;
        });
        empty.hidden = n !== 0;
      }
      DS.tables.sortable('#ds-chart-table');
      // 排序监听器由 sortable() 先挂（同一个 table 上先挂的先执行），这里后挂的
      // 在它排完之后重编 # 序号。
      table.addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('th')) renumber();
      });
      root.querySelector('[data-close]').addEventListener('click', function () { DS.modal.close(); });
      var input = root.querySelector('.ds-table-modal-search');
      if (input) {
        input.value = '';
        input.addEventListener('input', function () {
          var q = input.value.toLowerCase();
          Array.prototype.forEach.call(tbody.rows, function (tr) {
            var r = rows[+tr.getAttribute('data-i')];
            var name = r && r[search.key] != null ? String(r[search.key]).toLowerCase() : '';
            tr.hidden = name.indexOf(q) === -1;
          });
          renumber();
        });
      }
    },

    /* ctrl-zoom 的可发现性补偿：没有提示用户不会知道要按 Ctrl。非笛卡尔
       图没有 $ds，这里只是安全网——目前唯一调用点（_mountToolbar）只会
       传笛卡尔实例进来，之所以仍然判一下，是因为"安全只是因为当前调用点
       凑巧都满足前提"本身就是一种侥幸，不是真正的保证（Review M8）。 */
    _syncHint: function (chart) {
      if (!chart.$ds) return;
      var hint = chart.canvas.parentNode.querySelector('.ds-chart-hint');
      if (!hint) return;
      var mode = wheelModeOf(chart);
      hint.textContent = mode === 'ctrl-zoom' ? 'Ctrl+滚轮缩放'
                       : mode === 'zoom' ? '滚轮缩放'
                       : mode === 'smart' ? '滚轮缩放，到底翻页' : '';
    },

    /* 绑定在 canvas 上、只绑一次（见 create()）；每次都通过 canvas._dsChart
       这个可变指针取"当前"实例，canvas 被二次 create() 复用时天然跟新实例
       走，destroy() 之后这个指针会被清空，各处理器都要能应付"当前没有活
       实例"这件事而不抛错。原生事件只做一件事：把鼠标位置换算成"图表坐标"
       （画布 CSS 像素，已钳进绘图区），再交给 _dragBegin/_dragMove/_dragEnd——
       真正的框选逻辑都在这三个方法里，测试可以不经过任何原生/rAF 节流事件
       直接驱动它们（本机 headless chromium 里 Chart.js 自己的鼠标监听走 rAF，
       真实 mousemove 到不了；我们这几个监听是直接挂在 canvas 上的，不受影响）。
       拖拽的坐标轴跟 _bounds() 认的是同一个主轴：横向条形图（indexAxis:'y'）
       类目在 y 轴，用户是上下拖来框选那几行机台（Review C1）；xy 图（散点/
       气泡）拖的是矩形，两个方向同时缩放。按住 Shift 拖动 = 平移（仅已缩放的
       轴会动）。"过窄视为误触"交给 zoomRange()/zoomBox() 的阈值判断。 */
    _mountDrag: function (canvas) {
      function pt(ev) {
        var chart = canvas._dsChart;
        if (!chart || !chart.canvas) return null;
        var rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        return {
          chart: chart,
          x: (ev.clientX - rect.left) * (chart.width / rect.width),
          y: (ev.clientY - rect.top) * (chart.height / rect.height)
        };
      }
      canvas.addEventListener('mousedown', function (ev) {
        if (ev.button !== 0) return;
        var p = pt(ev);
        if (p) DS.charts._dragBegin(p.chart, p.x, p.y, { pan: !!ev.shiftKey });
      });
      canvas.addEventListener('mousemove', function (ev) {
        var p = pt(ev);
        if (p && p.chart.$ds && p.chart.$ds.drag) DS.charts._dragMove(p.chart, p.x, p.y);
      });
      canvas.addEventListener('mouseup', function (ev) {
        var p = pt(ev);
        if (p && p.chart.$ds && p.chart.$ds.drag) DS.charts._dragEnd(p.chart, p.x, p.y);
      });
      canvas.addEventListener('mouseleave', function () {
        var chart = canvas._dsChart;
        if (chart && chart.canvas && chart.$ds) DS.charts._dragCancel(chart);
      });
    },

    // 坐标钳进绘图区：拖出绘图区（比如拖到坐标轴上）等价于拖到绘图区边缘。
    _clampToArea: function (chart, x, y) {
      var a = chart.chartArea;
      return {
        x: Math.min(Math.max(x, a.left), a.right),
        y: Math.min(Math.max(y, a.top), a.bottom)
      };
    },

    // 起点：(x, y) 为图表坐标（画布 CSS 像素）。opts.pan 为真是平移，否则是框选。
    _dragBegin: function (chart, x, y, opts) {
      if (!chart || !chart.canvas || !chart.$ds || !chart.chartArea) return;
      var q = DS.charts._clampToArea(chart, x, y);
      chart.$ds.drag = {
        mode: opts && opts.pan ? 'pan' : 'zoom',
        x0: q.x, y0: q.y, x1: q.x, y1: q.y
      };
    },

    _dragMove: function (chart, x, y) {
      var d = chart && chart.canvas && chart.$ds && chart.$ds.drag;
      if (!d) return;
      var q = DS.charts._clampToArea(chart, x, y);
      if (d.mode === 'pan') {
        DS.charts.panBy(chart, q.x - d.x1, q.y - d.y1);
      }
      d.x1 = q.x;
      d.y1 = q.y;
      // 框选矩形要实时可见；chart.draw() 是同步重绘，不经 rAF。
      if (d.mode === 'zoom') chart.draw();
    },

    _dragEnd: function (chart, x, y) {
      var d = chart && chart.canvas && chart.$ds && chart.$ds.drag;
      if (!d) return;
      DS.charts._dragMove(chart, x, y);
      chart.$ds.drag = null;
      if (d.mode === 'pan') return;
      var s = chart.$ds;
      if (s.xy) {
        // 6px：与参照实现的 drag.threshold 一致，挡掉点击时手抖的微小位移
        if (Math.abs(d.x1 - d.x0) < 6 || Math.abs(d.y1 - d.y0) < 6) { chart.draw(); return; }
        var r = {};
        r[s.axis] = [chart.scales[s.axis].getValueForPixel(s.axis === 'x' ? d.x0 : d.y0),
                     chart.scales[s.axis].getValueForPixel(s.axis === 'x' ? d.x1 : d.y1)];
        r[s.secAxis] = [chart.scales[s.secAxis].getValueForPixel(s.secAxis === 'x' ? d.x0 : d.y0),
                        chart.scales[s.secAxis].getValueForPixel(s.secAxis === 'x' ? d.x1 : d.y1)];
        if (!DS.charts.zoomBox(chart, r)) chart.draw();  // 没生效时也要把矩形擦掉
      } else {
        var sc = chart.scales[s.axis];
        var v0 = sc.getValueForPixel(s.axis === 'x' ? d.x0 : d.y0);
        var v1 = sc.getValueForPixel(s.axis === 'x' ? d.x1 : d.y1);
        var before = s.min + '/' + s.max;
        DS.charts.zoomRange(chart, v0, v1);
        if (before === s.min + '/' + s.max) chart.draw();
      }
    },

    _dragCancel: function (chart) {
      if (!chart || !chart.canvas || !chart.$ds || !chart.$ds.drag) return;
      var wasZoom = chart.$ds.drag.mode === 'zoom';
      chart.$ds.drag = null;
      if (wasZoom) chart.draw();
    },

    /* ---------- 桑基图：点击高亮 + 通用节点筛选支持 ----------
       这几个方法不感知任何业务维度（没有"仪器"/"方案"这类词），纯粹操作
       flow 记录里本来就有的 from/to/flow 三个字段和调用方自己选的节点键
       集合。筛选 UI（下拉、全选、计数、徽标）不属于图表库本身的职责，
       留给消费者自己搭（demo/demo.js 的"桑基图"卡片演示了一种具体形态），
       这里只提供"给一组种子节点键，算出/应用高亮状态"这一层机制。 */

    // 按 from/to 聚合流量总和，调用方可以用它给筛选下拉的每一项配一个计数
    // （和 chartjs-chart-sankey 的 dataset.priority 排序依据同一套聚合，
    // 没有强耦合，各自独立调用）。
    sankeyGroupTotals: function (flows, field) { return sankeyGroupTotals(flows, field); },

    // 暴露给测试/调用方的纯函数：给定种子节点键集合，算出当前应该保持
    // "原色"的节点键集合（null 表示没有高亮，全部保持原色）。和
    // SANKEY_HIGHLIGHT_PLUGIN、colorFrom/colorTo 内部用的是同一份实现，
    // 不是另外复刻的一份等效逻辑——避免两处判断不一致。
    _sankeyConnectedKeys: function (flows, seeds) { return sankeyConnectedKeys(flows, seeds); },

    // 暴露节点分层结果，主要供测试核对"同层不撞色"这条规则本身算对了，
    // 而不是通过颜色反推分层对不对（颜色还要经过取模，层号算错也可能
    // 巧合撞出看似正确的颜色）。
    _sankeyNodeLayers: function (flows) { return sankeyNodeLayers(flows); },
    _sankeyNodeOrder: function (flows) { return sankeyNodeOrder(flows); },
    _sankeyDimColor: function () { return sankeyDimColor(); },

    // 设置筛选基线：筛选条件变化、图表被整个销毁重建之后，调用方用新的
    // 种子节点键集合（Array 或 Set；空/null 表示没有筛选）调用一次。
    // 和 参照实现的行为一致：设置基线的同时清空"点击产生的覆盖态"
    // （active 归零），筛选刚生效的瞬间不自带高亮，只有用户接下来点击或
    // 点击空白回退时才会用到这份基线。
    sankeySetBaseline: function (chart, keys) {
      if (!chart || !chart.$dsSankey) return;
      var set = null;
      if (keys) {
        set = (typeof Set !== 'undefined' && keys instanceof Set) ? keys : new Set(keys);
        if (!set.size) set = null;
      }
      chart.$dsSankey.baseline = set;
      chart.$dsSankey.active = null;
      chart.update('none');
    },

    // "清除筛选"按钮之类的场景：不改变筛选本身，只是把当前高亮强制回落到
    // 基线（通常基线此时就是 null，表现为完全不高亮）。
    sankeyClearHighlight: function (chart) {
      if (!chart || !chart.$dsSankey) return;
      chart.$dsSankey.active = chart.$dsSankey.baseline;
      chart.update('none');
    },

    // 点击处理器本体：按点击命中的流向、以及点击位置落在绘图区中线的
    // 左/右侧，决定把 from 还是 to 作为这次点击要高亮的单一节点键；再按
    // "当前已经是这个单节点高亮" vs "不是" 决定要不要切回基线。点击空白
    // （没有命中任何流向）直接回落基线。单独抽成方法而不是内联在
    // create() 的事件监听器闭包里，是为了可以在不真的派发鼠标事件的情况下
    // 用构造好的 fake event 直接调用，写确定性断言（真实 DOM 事件坐标依赖
    // 实际布局像素，测试里更脆）。
    _onSankeyClick: function (chart, ev) {
      if (!chart || !chart.$dsSankey || !chart.canvas || chart.config.type !== 'sankey') return;
      var state = chart.$dsSankey;
      var ds0 = chart.data.datasets[0];
      var flows = (ds0 && ds0.data) || [];
      var points = chart.getElementsAtEventForMode(ev, 'nearest', { intersect: true }, false);
      if (points.length) {
        var f = flows[points[0].index];
        if (!f) return;
        var clickedKey = sankeyClickedEndpoint(chart, f, ev);
        var active = state.active;
        if (active && active.size === 1 && active.has(clickedKey)) {
          state.active = state.baseline;
        } else {
          state.active = new Set([clickedKey]);
        }
      } else {
        state.active = state.baseline;
      }
      chart.update('none');
    }
  };
})(window.DS);
