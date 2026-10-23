/* demo/demo.js —— report-design-ref 对外演示页：左侧分类菜单（DS.sidebar）+ 六个分组面板；
   全页级的「滚轮缩放方式」放在顶栏（「深 / 浅」按钮旁），不占侧栏菜单项。
   （原来的「交互演练场 / 组件全览」两个标签页已合并；旧的 [data-panel="p-play"/"p-comp"] 选择器由隐藏的兼容按钮保留。）

   历史说明：Task 3-7 在这个文件里堆了六套回归断言（components / interactions
   / charts / wheel / isolation / svgCharts），当时宿主元素是零散凑出来的测试
   样例。Task 8 把页面重写成真正可对外展示的两个标签页，但六套断言本身
   一字不动地保留——它们是前五个任务全部回归保护的所在，宿主元素改成指向
   这版真实页面里的对应真实元素，而不是另起一套。

   测试脚手架（c-reuse/c-poison/c-guard/s-iso-guard/s-iso-poison/
   t-table-mixed/t-table-str/t-table-idem 等）只在 ?selftest=1 时创建，
   追加到 <body> 末尾、不进入两个标签页的真实布局——正常访客完全看不到它们，
   也不会因为它们产生控制台输出或残留 UI。 */
(function () {
  'use strict';

  var selftestMode = new URLSearchParams(location.search).get('selftest') === '1';

  var WHEEL_MODES = [
    ['ctrl-zoom', '按住 Ctrl 滚轮缩放，否则翻页。出厂默认，页面滚动不被打断。'],
    ['page', '滚轮永远翻页，缩放只走工具条和拖框选。行为最可预测。'],
    ['zoom', '滚轮直接缩放图表。适合图表是页面主体、几乎不需要滚动的场景。'],
    ['smart', '未到缩放极限先缩放，到底后翻页。代价：同一动作有时翻页有时不翻，容易让人困惑。']
  ];

  var detailRows = DS_MOCK.tableRows(8);
  var badgeOf = { '正常': 'green', '待机': 'blue', '报警': 'red' };
  // 达标率（百分数）：固定的合成值，刻意混有一位数（9）、两位数、三位数（100），
  // 字符串排序与数值排序会给出不同顺序（用来演示"百分比按数值排"）。
  var RATES = [96, 100, 9, 71, 48, 83, 100, 27];
  function rateOf(r) { return RATES[detailRows.indexOf(r) % RATES.length]; }

  // 超长中文标签：复用同一组变量名贯穿 charts / svgCharts 两套断言，
  // 分别验证 Chart.js 刻度截断和 SVG 甘特行标签截断走的是同一条规则。
  var longLabel = '全自动处理仪零三号机台';
  var ganttLongLabel = '东区综合装配一号产线扩建段';

  /* ---------- 测试专用的对比度计算（Review D4）：只在 selftest 断言里用，
     跟 validate_palette.py 的 contrast() 用同一套 WCAG 相对亮度公式，判定
     "合成色跟背景是否真的可辨识"，而不是只判 fill-opacity > 0——后者对
     "是否可见"没有任何鉴别力（8% 不透明度在数学上也 > 0，但肉眼看不出）。 */
  function srgbToLinear(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function relLuminance(hex) {
    hex = hex.replace('#', '');
    return 0.2126 * srgbToLinear(parseInt(hex.substr(0, 2), 16)) +
      0.7152 * srgbToLinear(parseInt(hex.substr(2, 2), 16)) +
      0.0722 * srgbToLinear(parseInt(hex.substr(4, 2), 16));
  }
  function hexContrast(a, b) {
    var la = relLuminance(a), lb = relLuminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  function compositeOverBg(fgHex, bgHex, alpha) {
    fgHex = fgHex.replace('#', ''); bgHex = bgHex.replace('#', '');
    function ch(hex, i) { return parseInt(hex.substr(i, 2), 16); }
    function toHex(n) { var s = Math.round(n).toString(16); return s.length < 2 ? '0' + s : s; }
    var r = alpha * ch(fgHex, 0) + (1 - alpha) * ch(bgHex, 0);
    var g = alpha * ch(fgHex, 2) + (1 - alpha) * ch(bgHex, 2);
    var b = alpha * ch(fgHex, 4) + (1 - alpha) * ch(bgHex, 4);
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  // rgba(r,g,b,a) 字符串解析成分量数组：用于校验面积图的半透明填充是否真的
  // 取自线条色（而不是巧合凑出同一个数）、以及 alpha 是否 < 1。
  function parseRgba(str) {
    var m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(String(str));
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
  }
  function hexToRgbComponents(hex) {
    hex = String(hex).replace('#', '');
    return { r: parseInt(hex.substr(0, 2), 16), g: parseInt(hex.substr(2, 2), 16), b: parseInt(hex.substr(4, 2), 16) };
  }
  // token 的 #rrggbb → getComputedStyle 返回的 'rgb(r, g, b)' 写法，用于比对内联底色
  function cssRgb(hex) {
    var c = hexToRgbComponents(hex);
    return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')';
  }

  // 双轴组合图 y1 的 grid/ticks/border 是否真的被 paint() 注入了当前主题色——
  // 'charts' 和 'reportCharts' 两套断言套件都要用，提到外层共享，不各写一份。
  function scaleColors(chart, axis) {
    var s = (chart.options.scales && chart.options.scales[axis]) || {};
    return {
      grid: s.grid && s.grid.color,
      ticks: s.ticks && s.ticks.color,
      border: s.border && s.border.color
    };
  }

  /* ---------- 页面骨架：顶栏 + 左侧分类菜单 + 右侧面板（沿用参照实现的侧边栏形态） ----------
     六个菜单项 = 六个分组（原「交互设置」分组只有一张滚轮设置卡片，已挪进顶栏，#interact 视为未知 hash）；每个分组一个 .ds-side-panel，里面是固定两列的卡片网格。
     data-panel 的值就是面板 id；URL hash 用 HASH_OF 里的短名（#trend）。
     图标全部是通用 18px 线条图标（stroke=currentColor，颜色走 token）。 */
  var ICON_ATTR = 'class="ds-side-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var GROUPS = [
    // [面板 id, hash 短名, 菜单文字, 图标内部路径]
    ['g-base', 'base', '基础组件', '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>'],
    ['g-compare', 'compare', '对比', '<line x1="6" y1="20" x2="6" y2="11"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="18" y1="20" x2="18" y2="14"></line>'],
    ['g-trend', 'trend', '趋势', '<polyline points="3 17 9 11 13 15 21 6"></polyline><polyline points="15 6 21 6 21 12"></polyline>'],
    ['g-compose', 'compose', '构成', '<path d="M21 12a9 9 0 1 1-9-9"></path><path d="M12 3v9h9"></path>'],
    ['g-dist', 'dist', '分布', '<circle cx="7" cy="16" r="1.6"></circle><circle cx="11" cy="9" r="1.6"></circle><circle cx="15" cy="14" r="1.6"></circle><circle cx="19" cy="6" r="1.6"></circle><circle cx="5" cy="7" r="1.6"></circle>'],
    ['g-progress', 'progress', '进度', '<line x1="4" y1="6" x2="13" y2="6"></line><line x1="8" y1="12" x2="19" y2="12"></line><line x1="6" y1="18" x2="15" y2="18"></line>']
  ];
  var DEFAULT_GROUP = 'g-compare';

  document.getElementById('app').innerHTML = [
    '<div class="ds-nav">',
    '  <span class="ds-nav-title">report-design-ref</span>',
    '  <span style="flex:1"></span>',
    // 全页图表共用的滚轮缩放方式：紧凑的分段按钮，每个按钮的 title 是该模式的说明
    '  <div class="ds-nav-ctl" id="wheel-ctl"><span class="ds-nav-ctl-label" id="wheel-ctl-label">滚轮</span><div id="wheel-seg"></div></div>',
    '  <button type="button" class="ds-btn secondary" id="btn-theme">深 / 浅</button>',
    '</div>',

    '<div class="ds-wrap">',
    '  <div class="ds-banner info" id="t-banner-info" style="margin-bottom:24px">',
    '    以下全部为合成数据，仅用于演示交互，不对应任何真实运行记录。左侧菜单按图表类型分组，链接里的 # 记住当前分组。',
    '  </div>',
    '  <div class="ds-layout">',
    '    <nav class="ds-sidebar" id="side" aria-label="组件分类">',
    GROUPS.map(function (g) {
      return '      <button type="button" class="ds-side-item" data-panel="' + g[0] + '"><svg ' + ICON_ATTR + '>' + g[3] +
        '</svg><span class="ds-side-label">' + g[2] + '</span></button>';
    }).join('\n'),
    '    </nav>',
    '    <div class="ds-side-main">',

    /* ---------------- 基础组件 ---------------- */
    '<section class="ds-side-panel" id="g-base" hidden>',
    '  <div class="ds-grid ds-grid-4">',
    '    <div class="ds-stat" id="t-stat"><div class="ds-stat-label">运行批次</div>',
    '      <div class="ds-stat-value">248</div>',
    '      <div class="ds-stat-delta up" id="t-delta-up">较上月 +12%</div></div>',
    '    <div class="ds-stat"><div class="ds-stat-label">平均时长</div>',
    '      <div class="ds-stat-value">02:14</div>',
    '      <div class="ds-stat-delta down" id="t-delta-down">较上月 −6%</div></div>',
    '    <div class="ds-stat"><div class="ds-stat-label">样本总数</div>',
    '      <div class="ds-stat-value">5,120</div>',
    '      <div class="ds-stat-delta">持平</div></div>',
    '    <div class="ds-stat"><div class="ds-stat-label">报警次数</div>',
    '      <div class="ds-stat-value">3</div>',
    '      <div class="ds-stat-delta up">较上月 +1</div></div>',
    '  </div>',

    '  <div class="ds-grid ds-charts-grid">',
    '  <div class="ds-card"><div class="ds-card-title">按钮</div>',
    '    <button type="button" class="ds-btn primary" id="t-btn">主按钮</button> ',
    '    <button type="button" class="ds-btn secondary">次按钮</button></div>',

    '  <div class="ds-card"><div class="ds-card-title">徽标</div>',
    '    <span class="ds-badge blue" id="t-badge">蓝</span> ',
    '    <span class="ds-badge green">绿</span> ',
    '    <span class="ds-badge amber">琥珀</span> ',
    '    <span class="ds-badge red">红</span></div>',
    '  <div class="ds-card"><div class="ds-card-title">上传区</div>',
    '    <div class="ds-dropzone">把文件拖到这里</div></div>',
    '  <div class="ds-card" id="t-card"><div class="ds-card-title">卡片与模态</div>',
    '    <button type="button" class="ds-btn secondary" id="btn-modal">打开模态</button> ',
    '    <button type="button" class="ds-btn secondary" id="btn-toast">弹出 toast</button></div>',
    '  <div class="ds-card ds-card-wide"><div class="ds-card-title">提示条</div>',
    '    <div class="ds-card-desc">四档状态：ok 退为安静的确认条，info 补充说明，warn 需要注意，bad 出问题了。</div>',
    '    <div class="ds-grid" style="gap:10px;margin-bottom:0">',
    '      <div class="ds-banner ok" id="t-banner-ok">ok —— 一切正常，退为安静的确认条</div>',
    '      <div class="ds-banner info">info —— 补充说明</div>',
    '      <div class="ds-banner warn" id="t-banner">warn —— 需要注意</div>',
    '      <div class="ds-banner bad">bad —— 出问题了</div>',
    '    </div></div>',
    '  <div class="ds-card ds-card-wide"><div class="ds-card-title">表格</div>',
    '    <div class="ds-card-desc">点击表头排序；数字、百分比、中文数字前缀都按数值而不是字符串排序；数字列表头与数据同为右对齐，状态列用徽标。</div>',
    '    <table class="ds-table" id="t-detail"><thead><tr>',
    // 样本数/时长(分)/达标率 三列的 <td> 是数字（下面 class="num" 右对齐），表头
    // 显式配一个 num 类——不单靠 DS.tables.sortable() 的自动判定，让这里
    // 本身就是"th/td 的 num 类该怎么配对"的正确写法示例（见 README）。
    '      <th>批次</th><th>仪器</th><th class="num">样本数</th><th class="num">时长(分)</th><th>状态</th><th class="num">达标率</th>',
    '    </tr></thead><tbody>',
    detailRows.map(function (r) {
      return '<tr><td>' + r.batch + '</td><td>' + r.instrument +
             '</td><td class="num">' + r.slides +
             '</td><td class="num">' + r.minutes +
             '</td><td><span class="ds-badge ' + badgeOf[r.state] + '">' + r.state + '</span>' +
             '</td><td class="num">' + rateOf(r) + '%</td></tr>';
    }).join(''),
    '  </tbody></table></div>',
    '  </div>',
    '</section>',

    /* ---------------- 对比 ---------------- */
    '<section class="ds-side-panel" id="g-compare" hidden>',
    '  <div class="ds-grid ds-charts-grid">',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">柱状图</div><div id="seg-c-bar"></div></div>',
    '      <div class="ds-card-desc">按月批次：柱子是同一指标随时间的值，所以整组用单色。类目名过长时自动截断（勾选下方开关加入一个超长类目名），悬停显示全称。</div>',
    '      <label style="display:block;font-size:12px;cursor:pointer;margin-bottom:8px">',
    '        <input type="checkbox" id="chk-bar-long"> 加入一个超长类目名',
    '      </label>',
    '      <div class="ds-chart-host"><canvas id="c-bar"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">条形图</div><div id="seg-c-hbar"></div></div>',
    '      <div class="ds-card-desc">类目在纵轴；长类目名自动截断，悬停显示全称。条代表不同对象（不同仪器），所以每条一个颜色。</div>',
    '      <div class="ds-chart-host"><canvas id="c-hbar"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">堆叠柱状图</div><div id="seg-c-stacked"></div></div>',
    '      <div class="ds-card-desc">',
    '        多台设备各自贡献的批次数按月堆叠，配色走六条分类序列色。</div>',
    '      <label style="display:block;font-size:12px;cursor:pointer;margin-bottom:8px">',
    '        <input type="checkbox" id="chk-stacked-percent"> 显示为百分比堆叠',
    '        <span style="color:var(--color-text-secondary)">（Chart.js 无原生支持，内部做了一次数据归一化，悬浮仍可看到原始值）</span>',
    '      </label>',
    '      <div class="ds-chart-host"><canvas id="c-stacked"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-title">双轴组合图</div>',
    '      <div class="ds-card-desc">',
    '        柱子是绝对量（批次数，左轴），折线是比率（达标率，右轴）——量纲不同的两个',
    '        指标共享一张图是报表最常见的形态。副轴（右轴）默认不画网格线，避免两套',
    '        网格叠在一起成为视觉噪音。</div>',
    '      <div class="ds-chart-host"><canvas id="c-combo"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">瀑布图</div><div id="seg-c-waterfall"></div></div>',
    '      <div class="ds-card-desc">',
    '        上月工作量经若干增减项变成本月工作量：绿柱是增加、红柱是减少、蓝柱是合计（含中间小计，从 0 画起），',
    '        相邻柱之间的细线把前一柱的累计值连到后一柱；悬浮显示「本项 ±N」与「累计 M」。按钮切换增减项个数。</div>',
    '      <div class="ds-chart-host"><canvas id="c-waterfall"></canvas></div></div>',
    '  </div>',
    '</section>',

    /* ---------------- 趋势 ---------------- */
    '<section class="ds-side-panel" id="g-trend" hidden>',
    '  <div class="ds-grid ds-charts-grid">',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">折线图</div><div id="seg-c-line"></div></div>',
    '      <div class="ds-card-desc">40 周的平均时长与最长时长两条线，类目轴过密时自动旋转并抽稀刻度。数据为空时（勾选下方开关）显示一行占位提示，不画空坐标轴。</div>',
    '      <label style="display:block;font-size:12px;cursor:pointer;margin-bottom:8px">',
    '        <input type="checkbox" id="chk-line-empty"> 显示为空数据',
    '      </label>',
    '      <div class="ds-chart-host"><canvas id="c-line"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">折线图（按日期）</div><div id="seg-c-timeaxis"></div></div>',
    '      <div class="ds-card-desc">',
    '        横轴是日期（逐日），三台仪器各一条线。Chart.js 的 time/timeseries 轴需要额外的日期适配器，本库零外链、不联网',
    '        下载第三方库，所以这里用数值轴(linear) + 自定义刻度格式化模拟日期轴的',
    '        视觉效果，细节见 README「时间轴」一节。</div>',
    '      <div class="ds-chart-host"><canvas id="c-timeaxis"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">面积图</div><div id="seg-c-area"></div></div>',
    '      <div class="ds-card-desc">',
    '        fill 数据集的填充色自动取线条色的半透明版本，两条面积图叠在一起也不会',
    '        互相完全遮挡；不填充的目标线仍是不透明色，画法不受影响。</div>',
    '      <div class="ds-chart-host"><canvas id="c-area"></canvas></div></div>',
    '  </div>',
    '</section>',

    /* ---------------- 构成 ---------------- */
    '<section class="ds-side-panel" id="g-compose" hidden>',
    '  <div class="ds-grid ds-charts-grid">',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">环形图</div><div id="seg-c-pie"></div></div>',
    '      <div class="ds-card-desc">每个扇区取一条分类序列色，图例在底部，悬浮显示数值与占比。</div>',
    '      <div class="ds-chart-host"><canvas id="c-pie"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">桑基图</div><div id="seg-c-sankey"></div></div>',
    '      <div class="ds-card-desc">',
    '        典型用于"流向/分配"场景——这里是各仪器做了哪些项目、工作量怎么分布：',
    '        左列 4 台仪器、右列项目，流向越粗工作量越大。节点颜色按序取十色序列色',
    '        （左列按序、右列从左列数量处续编号，项目多于色数时循环复用），流向',
    '        按设计默认半透明。点击某条流向可高亮它关联的节点与流向（整条流向',
    '        要么全亮要么全灰），再点一次取消；项目筛选默认只显示工作量前 20',
    '        （勾选后只看勾选的项目，含榜外项目），右上角 ⛶ 可全屏。</div>',
    '      <div id="sankey-mount"></div></div>',
    '  </div>',
    '</section>',

    /* ---------------- 分布 ---------------- */
    '<section class="ds-side-panel" id="g-dist" hidden>',
    '  <div class="ds-grid ds-charts-grid">',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">散点图</div><div id="seg-c-scatter"></div></div>',
    '      <div class="ds-card-desc">单批处理片数 × 耗时，三台仪器三个系列；拖一个矩形可同时放大横纵两个方向。</div>',
    '      <div class="ds-chart-host"><canvas id="c-scatter"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">气泡图</div><div id="seg-c-bubble"></div></div>',
    '      <div class="ds-card-desc">',
    '        用来看"哪些项目量大、而且单个耗时长"：横轴是数量（样本数），纵轴是平均时长（分钟），',
    '        一个气泡一个项目，气泡面积与数量成正比。越靠右上越值得盯——量大且慢；右下是量大但快的',
    '        标杆。数量少于 5 的项目不画，只取数量前 50；只有大气泡标名字。拖一个矩形可同时放大',
    '        横纵两个方向（按住 Shift 拖动平移），工具条的表格按钮打开可排序、可搜索的数据表。</div>',
    '      <div class="ds-chart-host" id="bubble-host"><canvas id="c-bubble"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-head"><div class="ds-card-title">箱线图</div><div id="seg-c-boxplot"></div></div>',
    '      <div class="ds-card-desc">',
    '        各仪器单批处理时长（分钟）的分布：箱体是 Q1–Q3 四分位，粗线是中位数，须线延伸到 1.5 倍四分位距内最远的',
    '        实际数据点，之外的小圆点是离群点。悬浮显示最小值/Q1/中位数/Q3/最大值/样本数/离群点个数，',
    '        悬在离群点上显示该点的值。按钮切换仪器数量。</div>',
    '      <div class="ds-chart-host"><canvas id="c-boxplot"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-title">热力图</div>',
    '      <div class="ds-card-desc">手写 SVG；格子自适应宿主宽度，数值为 0 的最低档也可见。</div>',
    '      <div id="s-heat"></div></div>',
    '  </div>',
    '</section>',

    /* ---------------- 进度 ---------------- */
    '<section class="ds-side-panel" id="g-progress" hidden>',
    '  <div class="ds-grid ds-charts-grid">',
    '    <div class="ds-card ds-card-wide"><div class="ds-card-title">甘特图</div>',
    '      <div class="ds-card-desc">整点时间轴（06:00 → 次日 03:00⁺¹，跨夜时刻带 ⁺¹）；任务条按时长分 7 档着色，条内写数量与时长，',
    '        字色按底色自动取黑/白；超出时间窗的条截断到右缘并标 ▶。标记线标签自动避让（翻边、堆叠），线从标签下方贯穿全部行；',
    '        悬停任务条或图例色块看详情，「工位-06」是多槽道行。行标签过长时截断、悬停显示全称，窄屏横向滚动时行标签固定。</div>',
    '      <div id="s-gantt"></div></div>',
    '  </div>',
    '</section>',

    '    </div>',   // .ds-side-main
    '  </div>',     // .ds-layout
    '</div>',       // .ds-wrap

    /* 兼容层：旧的两个标签页入口 [data-panel="p-play"] / [data-panel="p-comp"] 仍可点——
       点击 = 让全部分组同时可见并重算尺寸（DS.sidebar.showAll）。隐藏按钮，访客看不到；
       外部脚本/测试沿用旧选择器即可。 */
    '<div id="ds-compat" hidden>',
    '  <button type="button" data-panel="p-play" tabindex="-1">交互演练场（兼容：显示全部分组）</button>',
    '  <button type="button" data-panel="p-comp" tabindex="-1">组件全览（兼容：显示全部分组）</button>',
    '</div>'
  ].join('');

  /* ---------- 测试脚手架：只在 ?selftest=1 下创建，挂在 <body> 末尾 ---------- */
  if (selftestMode) {
    var scaffold = document.createElement('div');
    scaffold.id = 'selftest-scaffold';
    scaffold.hidden = true;
    scaffold.innerHTML = [
      '<table class="ds-table" id="t-table-mixed"><thead><tr><th>列</th></tr></thead>',
      '  <tbody><tr><td>5</td></tr><tr><td></td></tr><tr><td>10</td></tr><tr><td>2</td></tr></tbody></table>',
      '<table class="ds-table" id="t-table-str"><thead><tr><th>列</th></tr></thead>',
      '  <tbody><tr><td>banana</td></tr><tr><td>apple</td></tr><tr><td>cherry</td></tr></tbody></table>',
      '<table class="ds-table" id="t-table-idem"><thead><tr><th>列</th></tr></thead>',
      '  <tbody><tr><td>10</td></tr><tr><td>2</td></tr></tbody></table>',
      '<table class="ds-table" id="t-table-rerender"><thead><tr><th>列</th></tr></thead>',
      '  <tbody><tr><td>10</td></tr><tr><td>2</td></tr></tbody></table>',
      '<table class="ds-table" id="t-table-thousands"><thead><tr><th>列</th></tr></thead>',
      '  <tbody><tr><td>1,234</td></tr><tr><td>999</td></tr><tr><td>12,000</td></tr></tbody></table>',
      '<table class="ds-table" id="t-table-percent"><thead><tr><th>列</th></tr></thead>',
      '  <tbody><tr><td>5%</td></tr><tr><td>12%</td></tr><tr><td>100%</td></tr></tbody></table>',
      '<table class="ds-table" id="t-table-duration"><thead><tr><th>列</th></tr></thead>',
      '  <tbody><tr><td>3.5h</td></tr><tr><td>12h</td></tr><tr><td>1h</td></tr></tbody></table>',
      '<table class="ds-table" id="t-table-colontime"><thead><tr><th>列</th></tr></thead>',
      '  <tbody><tr><td>02:14</td></tr><tr><td>10:05</td></tr><tr><td>1:30</td></tr></tbody></table>',
      // Bug 1（用户报的）：中文数字按拼音排序。下面四张表分别覆盖——
      // 主场景（数字前缀 + 不带数字的纯文本混排）、十一~九十九组合、
      // 独立成词（含 〇/零）、以及"不该被当数字"的三个反例不得误伤。
      '<table class="ds-table" id="t-table-cn-numeral"><thead><tr><th>仪器</th></tr></thead>',
      '  <tbody><tr><td>一号仪器</td></tr><tr><td>二号仪器</td></tr>',
      '    <tr><td>三号仪器</td></tr><tr><td>备用仪器</td></tr></tbody></table>',
      '<table class="ds-table" id="t-table-cn-numeral-tens"><thead><tr><th>产线</th></tr></thead>',
      '  <tbody><tr><td>三十五号线</td></tr><tr><td>九号线</td></tr>',
      '    <tr><td>二十号线</td></tr><tr><td>十一号线</td></tr><tr><td>十号线</td></tr></tbody></table>',
      '<table class="ds-table" id="t-table-cn-numeral-standalone"><thead><tr><th>编号</th></tr></thead>',
      '  <tbody><tr><td>十</td></tr><tr><td>二</td></tr><tr><td>一</td></tr><tr><td>零</td></tr></tbody></table>',
      '<table class="ds-table" id="t-table-cn-numeral-safe"><thead><tr><th>名称</th></tr></thead>',
      '  <tbody><tr><td>十字路口</td></tr><tr><td>一次性耗材</td></tr>',
      '    <tr><td>百分之一</td></tr><tr><td>阿拉伯数字耗材</td></tr></tbody></table>',
      // 用户报的表头/数据对齐错位 bug：下面四张表单独验证
      // syncNumericHeaderAlignment（表头/数据对齐，跟上面一堆验证排序
      // 逻辑本身的表不是一回事）。表头在标记里都不带 num 类，交给
      // sortable() 自动判定。
      '<table class="ds-table" id="t-align-numeric"><thead><tr><th>数字列</th></tr></thead>',
      '  <tbody><tr><td class="num">10</td></tr><tr><td class="num">2</td></tr>',
      '    <tr><td class="num">33</td></tr></tbody></table>',
      '<table class="ds-table" id="t-align-text"><thead><tr><th>文本列</th></tr></thead>',
      '  <tbody><tr><td>北京</td></tr><tr><td>上海</td></tr><tr><td>广州</td></tr></tbody></table>',
      '<table class="ds-table" id="t-align-rerender"><thead><tr><th>列</th></tr></thead>',
      '  <tbody><tr><td class="num">10</td></tr><tr><td class="num">2</td></tr></tbody></table>',
      // 用户显式在 th 上写了 num 类，但这一列的 td 从来没加过 num（页面
      // 作者自己的选择，比如纯展示用的右对齐表头、数据本身左对齐）——
      // 自动判定必须原样保留，不能因为 td 不是整列 num 就把它摘掉。
      '<table class="ds-table" id="t-align-override"><thead><tr><th class="num">列</th></tr></thead>',
      '  <tbody><tr><td>甲</td></tr><tr><td>乙</td></tr></tbody></table>',
      '<div id="g1-tabs" class="ds-tabs">',
      '  <button type="button" class="ds-tab" aria-selected="true" data-panel="g1-a">A</button>',
      '  <button type="button" class="ds-tab" aria-selected="false" data-panel="g1-b">B</button>',
      '</div>',
      '<div class="ds-panel" id="g1-a">g1a</div>',
      '<div class="ds-panel" id="g1-b" hidden>g1b</div>',
      '<div id="g2-tabs" class="ds-tabs">',
      '  <button type="button" class="ds-tab" aria-selected="true" data-panel="g2-a">A</button>',
      '  <button type="button" class="ds-tab" aria-selected="false" data-panel="g2-b">B</button>',
      '</div>',
      '<div class="ds-panel" id="g2-a">g2a</div>',
      '<div class="ds-panel" id="g2-b" hidden>g2b</div>',
      '<div class="ds-chart-host"><canvas id="c-reuse"></canvas></div>',
      '<div class="ds-chart-host"><canvas id="c-poison"></canvas></div>',
      '<div class="ds-chart-host"><canvas id="c-guard"></canvas></div>',
      '<div class="ds-chart-host"><canvas id="c-dualaxis"></canvas></div>',
      '<div id="s-iso-guard"></div>',
      '<div id="s-iso-poison"></div>',
      '<div id="s-iso-guard2"></div>'
    ].join('');
    document.body.appendChild(scaffold);

    // 热力图 cell 自适应公式本身的覆盖：上面 scaffold 用 hidden 属性
    // （display:none），子元素 clientWidth 全部塌缩成 0、只会命中
    // host.clientWidth || 640 的兜底值，测不出"cell 真的随宿主宽度变化"
    // 这件事——这也是复审发现"把整条自适应公式换成常量 72 依然 131 条
    // 全绿"的根因。这里单独开一个不用 display:none 的探针容器（挪到可视
    // 区外，但保留布局和 clientWidth），放两个显式宽度不同的宿主。
    var widthProbe = document.createElement('div');
    widthProbe.id = 'selftest-width-probe';
    widthProbe.style.cssText = 'position:absolute; left:-9999px; top:0;';
    widthProbe.innerHTML = [
      '<div id="s-heat-w1" style="width:100px"></div>',
      '<div id="s-heat-w2" style="width:200px"></div>'
    ].join('');
    document.body.appendChild(widthProbe);
  }

  /* ---------- 初始化顺序：主题先于图表，否则首帧读到旧 token ---------- */
  DS.theme.init();
  // ?theme=dark|light 仅供 demo 页截图/视觉验收用，优先于存储值；
  // 真实项目不暴露这个入口（滚轮模式选择器同理，只在 demo 页存在）。
  // 不能调 DS.theme.set()——它会把选择落盘到 localStorage，公开页上只要
  // 有人分享一个带 ?theme=dark 的链接，访客打开过一次之后，往后不带参数
  // 访问也会被锁死在深色，这是真实的访客侧副作用，不是演示专属的无害行为。
  // 直接设 data-theme 属性 + 派发 DS.theme 自己用的同一个事件名，图表/SVG
  // 的主题联动监听的就是这个事件，不关心是谁派发的，行为和 set() 等价，
  // 只是跳过落盘这一步。
  var themeOverride = new URLSearchParams(location.search).get('theme');
  if (themeOverride === 'dark' || themeOverride === 'light') {
    document.documentElement.setAttribute('data-theme', themeOverride);
    document.dispatchEvent(new CustomEvent('ds:themechange', { detail: { mode: themeOverride } }));
  }
  // Review A2 回归守护：上面这段如果退回成 DS.theme.set(themeOverride)，
  // localStorage 会在覆盖代码跑完的同一时刻就被写入。必须在任何后续代码
  // （包括下面的 charts/tabs/table 初始化，以及异步跑的 selftest 套件——
  // 它们自己也会调用 DS.theme.set() 做测试）有机会写 localStorage 之前，
  // 把这一刻的快照存下来，下面 demoPage 套件里的断言才有鉴别力。
  var themeOverrideStorageSnapshot = (function () {
    try { return window.localStorage.getItem('ds-theme'); } catch (e) { return undefined; }
  })();

  DS.charts.init({ wheel: 'ctrl-zoom' });   // 出厂默认 ctrl-zoom
  /* 侧边栏要先于图表创建：默认分组的面板此刻已可见，其中的图表创建时就能量到真实尺寸；
     其余分组的图表创建时宿主是 display:none（0x0），切到它们时由 DS.sidebar 按真实尺寸重算。 */
  var HASH_OF = {}, PANEL_OF_HASH = {};
  GROUPS.forEach(function (g) { HASH_OF[g[0]] = g[1]; PANEL_OF_HASH[g[1]] = g[0]; });
  function panelFromHash() {
    var h = String(location.hash || '').replace(/^#/, '');
    return Object.prototype.hasOwnProperty.call(PANEL_OF_HASH, h) ? PANEL_OF_HASH[h] : null;
  }
  var pageSide = DS.sidebar.init('#side', {
    value: panelFromHash() || DEFAULT_GROUP,
    onChange: function (id, panel, info) {
      // 只在用户切换时写 hash（replaceState：不往历史栈里塞一串记录）；初始化与「显示全部」不写
      if (!id || (info && info.initial)) return;
      try { history.replaceState(null, '', '#' + HASH_OF[id]); } catch (e) { location.hash = HASH_OF[id]; }
    }
  });
  // 手改地址栏 hash / 前进后退 / 同页点带 hash 的链接：跟着切（replaceState 不触发它，不会回环）
  window.addEventListener('hashchange', function () {
    var id = panelFromHash();
    if (id && pageSide.current() !== id) pageSide.select(id);
  });
  // 兼容层：旧选择器 [data-panel="p-play"] / [data-panel="p-comp"]（隐藏按钮）= 显示全部分组
  Array.prototype.forEach.call(document.querySelectorAll('#ds-compat [data-panel]'), function (b) {
    b.addEventListener('click', function () { pageSide.showAll(); });
  });
  // 测试钩子（只在 ?selftest=1 下存在）：记录页面刚加载完时的侧栏状态（hash 解析出的分组、折叠状态），
  // 供 pg- 套件断言"带 hash 加载直接打开对应分组 / 折叠状态刷新后保持"；?sbcollapse=1 让这次加载先折叠一次
  // （写入 localStorage），配合下一次不带该参数的加载验证真实刷新后的持久化。
  if (selftestMode) {
    if (new URLSearchParams(location.search).get('sbcollapse') === '1') pageSide.collapse(true);
    window.DS_SELFTEST_STATE = {
      initialGroup: pageSide.current(),
      initialHash: location.hash,
      collapsedAtLoad: pageSide.isCollapsed()
    };
  }
  DS.tables.sortable('#t-detail');
  if (selftestMode) {
    DS.tables.sortable('#t-table-mixed');
    DS.tables.sortable('#t-table-str');
    // 故意调用两次：验证幂等保护能防止监听器叠加（见下方 ix-table-sortable-idempotent）
    DS.tables.sortable('#t-table-idem');
    DS.tables.sortable('#t-table-idem');
    DS.tables.sortable('#t-table-rerender');
    DS.tables.sortable('#t-table-thousands');
    DS.tables.sortable('#t-table-percent');
    DS.tables.sortable('#t-table-duration');
    DS.tables.sortable('#t-table-colontime');
    DS.tables.sortable('#t-table-cn-numeral');
    DS.tables.sortable('#t-table-cn-numeral-tens');
    DS.tables.sortable('#t-table-cn-numeral-standalone');
    DS.tables.sortable('#t-table-cn-numeral-safe');
    DS.tables.sortable('#t-align-numeric');
    DS.tables.sortable('#t-align-text');
    DS.tables.sortable('#t-align-rerender');
    DS.tables.sortable('#t-align-override');
    DS.tabs.init('#g1-tabs');
    DS.tabs.init('#g2-tabs');
  }

  document.getElementById('btn-theme').addEventListener('click', DS.theme.toggle);
  document.getElementById('btn-modal').addEventListener('click', function () {
    DS.modal.open('<h3 style="margin-top:0">模态框</h3><p id="m-body">点击遮罩或按 Esc 关闭。</p>');
  });
  document.getElementById('btn-toast').addEventListener('click', function () {
    DS.toast.show('这是一条 toast');
  });

  /* ---------- 滚轮模式选择器（顶栏，DS.seg 分段按钮）：切换后立即生效，无需刷新 ----------
     与原来侧栏里的单选组行为一致：出厂默认 ctrl-zoom、不落盘（刷新回到默认）、切换后弹一条 toast。
     按钮文字就是模式名，模式说明放进 title（悬停可见）。 */
  var wheelSeg = DS.seg.mount(document.getElementById('wheel-seg'), {
    options: WHEEL_MODES.map(function (m) { return { value: m[0], label: m[0], title: m[1] }; }),
    value: 'ctrl-zoom',
    ariaLabel: '滚轮缩放方式',
    onChange: function (mode) {
      DS.charts.setWheelMode(mode);
      DS.toast.show('滚轮模式：' + mode);
    }
  });

  /* ---------- 图表：registry 计数与 Task 3-7 保留断言共用同一个助手 ---------- */
  var expectedRegistered = 0;
  function makeChart(canvas, config) {
    var chart = DS.charts.create(canvas, config);
    if (chart) expectedRegistered++;
    return chart;
  }

  /* ---------- 数量级切换（demo 层交互）：卡片标题栏的分段按钮（库里的 DS.seg）----------
     点按钮 = 用对应规模的合成数据（DS_MOCK，固定 seed）重建这张图：先 DS.charts.destroy
     旧实例、再 create 新的（同一块 canvas），不留孤儿实例/监听器；缩放/高亮状态随重建重置。
     默认选中的是页面初始的数据规模，所以初始观感不变；默认规模若不在 3/10/20 里
     （柱状图 6、折线图 2、气泡图 60、桑基图 25），就把它作为额外的一档保留在按钮组里，
     以便随时切回原始数据。 */
  var scaleCtl = {};
  function mountScale(canvasId, levels, def, noun, rebuild, titleOf) {
    var slot = document.getElementById('seg-' + canvasId);
    scaleCtl[canvasId] = DS.seg.mount(slot, {
      options: levels.map(function (n) {
        return { value: n, label: String(n), title: titleOf ? titleOf(n) : (n + ' 个' + noun) };
      }),
      value: def,
      ariaLabel: noun + '数量',
      onChange: rebuild
    });
  }
  // 在同一块 canvas 上重建：先销毁旧实例（摘工具条、清全屏/指针），再按新配置建图
  function rebuildOn(canvasId, config) {
    var cv = document.getElementById(canvasId);
    if (cv._dsChart) DS.charts.destroy(cv._dsChart);
    return DS.charts.create(cv, config);
  }

  var months12 = DS_MOCK.months();
  var barLong = false;   // 「加入一个超长类目名」开关：把第一个类目名换成超长名（演示刻度截断 + 悬停全称）
  function barConfig(n) {
    var labels = DS_MOCK.monthLabels(n);
    if (barLong) labels[0] = longLabel;
    return { type: 'bar', data: { labels: labels, datasets: [{ label: '批次', data: DS_MOCK.series(n, 1) }] } };
  }
  var months6 = DS_MOCK.monthLabels(6);
  var barChart = makeChart(document.getElementById('c-bar'), barConfig(6));
  mountScale('c-bar', [3, 6, 10, 20], 6, '类目', function (n) { barChart = rebuildOn('c-bar', barConfig(n)); });
  document.getElementById('chk-bar-long').addEventListener('change', function (ev) {
    barLong = ev.target.checked;
    barChart = rebuildOn('c-bar', barConfig(scaleCtl['c-bar'].get()));
  });
  // 折线图：前两条是固定形态的"平均时长/最长时长"，更多条按 DS_MOCK.extraTrend 追加
  var lineEmpty = false;   // 「显示为空数据」开关：数据集为空 → 库渲染一行占位提示、不画空坐标轴
  function lineConfig(n) {
    if (lineEmpty) return { type: 'line', data: { labels: [], datasets: [{ label: '空', data: [] }] } };
    var datasets = [
      { label: '平均时长', data: DS_MOCK.trend(40, 2, { base: 55, slope: 0.5, amp: 8, period: 13, noise: 4 }), tension: 0.3, pointRadius: 2 },
      { label: '最长时长', data: DS_MOCK.trend(40, 3, { base: 95, slope: 0.7, amp: 12, period: 13, phase: 1, noise: 8 }), tension: 0.3, pointRadius: 2 }
    ].slice(0, n);
    for (var k = datasets.length; k < n; k++) {
      datasets.push({ label: '系列' + (k + 1 < 10 ? '0' : '') + (k + 1), data: DS_MOCK.extraTrend(40, k), tension: 0.3, pointRadius: 2 });
    }
    return { type: 'line', data: { labels: DS_MOCK.weeks(40), datasets: datasets } };
  }
  var lineChart = makeChart(document.getElementById('c-line'), lineConfig(2));
  mountScale('c-line', [2, 3, 10, 20], 2, '系列', function (n) { lineChart = rebuildOn('c-line', lineConfig(n)); });
  document.getElementById('chk-line-empty').addEventListener('change', function (ev) {
    lineEmpty = ev.target.checked;
    lineChart = rebuildOn('c-line', lineConfig(scaleCtl['c-line'].get()));
  });
  // 横向条形图（indexAxis:'y'）：类目在 y 轴、数值在 x 轴，长标签挂在这里。
  // 三个类目（而不是两个）是必须的：索引域缩放的下限 _minHalf() 固定是
  // 半个索引单位，两个类目的满量程半宽本身就等于这个下限——"放大"一次会
  // 立刻撞回满量程，Review C1 修复后这种情况会被正确识别成"未缩放"
  // （isZoomed()===false），测不出"缩放确实作用在 y 轴而不是 x 轴"这件事
  // 本身。三个类目能让"放大一次"产生真正小于满量程的视图。
  function hbarConfig(n) {
    return {
      type: 'bar',
      options: { indexAxis: 'y' },
      // 条代表不同对象（不同仪器）：每条一个颜色（dsColorBy:'category'）。前三条是固定的
      // （含超长名），更多条按 仪器NN 追加。
      data: {
        labels: DS_MOCK.objectNames(n, [longLabel, '短', '中'], '仪器'),
        datasets: [{ label: '时长', data: DS_MOCK.leadValues(n, [5, 9, 7], 5, 3, 12), dsColorBy: 'category' }]
      }
    };
  }
  var hbarChart = makeChart(document.getElementById('c-hbar'), hbarConfig(3));
  mountScale('c-hbar', [3, 10, 20], 3, '类目', function (n) { hbarChart = rebuildOn('c-hbar', hbarConfig(n)); });
  function pieConfig(n) {
    return {
      type: 'doughnut',
      data: { labels: DS_MOCK.sectorLabels(n), datasets: [{ data: DS_MOCK.leadValues(n, [30, 50, 20], 31, 5, 60) }] }
    };
  }
  var pieChart = makeChart(document.getElementById('c-pie'), pieConfig(3));
  mountScale('c-pie', [3, 10, 20], 3, '扇区', function (n) { pieChart = rebuildOn('c-pie', pieConfig(n)); });
  // 没有类目标签的笛卡尔图（scatter，x/y 都是 linear 量表）：缩放走数据域。
  function scatterConfig(n) {
    return {
      type: 'scatter',
      data: { datasets: DS_MOCK.scatterSeries(n).map(function (sr) { return { label: sr.label, data: sr.data }; }) }
    };
  }
  var scatterChart = makeChart(document.getElementById('c-scatter'), scatterConfig(3));
  mountScale('c-scatter', [3, 10, 20], 3, '系列', function (n) { scatterChart = rebuildOn('c-scatter', scatterConfig(n)); });

  // 气泡图：DS.charts.bubble 一步建图（过滤 <5 / 取前 50 / 面积∝数量 / 颜色 /
  // 标签 / 悬浮框 / 无图例 / xy 框选 / 数据表按钮都在库里）。
  var bubbleOpts = {
    xTitle: '样本数', yTitle: '平均时长（分钟）',
    countUnit: '片', valueUnit: '分钟平均',
    tableTitle: '项目数据', nameLabel: '项目名称', countLabel: '样本数', valueLabel: '平均时长(分钟)'
  };
  var bubbleChart = DS.charts.bubble(document.getElementById('c-bubble'), DS_MOCK.bubbleItems(), bubbleOpts);
  if (bubbleChart) expectedRegistered++;
  // 3/10/20 = 恰好这么多个气泡；60 = 原始数据（60 个项目，其中 5 个量太小被过滤、够量的取前 50）
  mountScale('c-bubble', [3, 10, 20, 60], 60, '气泡', function (n) {
    var cv = document.getElementById('c-bubble');
    if (cv._dsChart) DS.charts.destroy(cv._dsChart);
    bubbleChart = DS.charts.bubble(cv, DS_MOCK.bubbleItems(n), bubbleOpts);
  }, function (n) { return n === 60 ? '60 个项目的原始数据（量太小的被过滤，其余只画数量前 50）' : n + ' 个气泡'; });

  /* ---------- 瀑布图 / 箱线图：库里一步建图（DS.charts.waterfall / boxplot），
     数量级切换 = 增减项个数 / 仪器个数。 ---------- */
  function waterfallOn(n) {
    var cv = document.getElementById('c-waterfall');
    if (cv._dsChart) DS.charts.destroy(cv._dsChart);
    return DS.charts.waterfall(cv, DS_MOCK.waterfallItems(n), { label: '工作量', valueTitle: '工作量' });
  }
  var waterfallChart = waterfallOn(6);
  if (waterfallChart) expectedRegistered++;
  mountScale('c-waterfall', [3, 6, 10, 20], 6, '增减项', function (n) { waterfallChart = waterfallOn(n); });
  function boxplotOn(n) {
    var cv = document.getElementById('c-boxplot');
    if (cv._dsChart) DS.charts.destroy(cv._dsChart);
    return DS.charts.boxplot(cv, DS_MOCK.boxGroups(n), { label: '处理时长', valueTitle: '处理时长（分钟）' });
  }
  var boxplotChart = boxplotOn(4);
  if (boxplotChart) expectedRegistered++;
  mountScale('c-boxplot', [3, 4, 10, 20], 4, '仪器', function (n) { boxplotChart = boxplotOn(n); },
    function (n) { return n + ' 台仪器'; });

  /* ---------- 双轴组合图：柱子是量（批次数，y 轴），折线是率（达标率，
     y1 轴）。y1 只给 position，grid/ticks/border 故意留白——必须全部由
     paint() 自己注入，不能是调用方凑巧写对了颜色。y1 的 min/max/百分比
     ticks 由调用方自己定，paint() 不碰这些。 ---------- */
  var comboChart = makeChart(document.getElementById('c-combo'), {
    type: 'bar',
    data: {
      labels: months12,
      datasets: [
        { label: '批次数', data: DS_MOCK.trend(12, 11, { base: 55, slope: 3, amp: 10, period: 12, noise: 6 }), yAxisID: 'y' },
        { label: '达标率', type: 'line', data: DS_MOCK.rates(12, 12), yAxisID: 'y1', tension: 0.3 }
      ]
    },
    options: {
      scales: {
        y: { position: 'left' },
        y1: {
          position: 'right', min: 0, max: 1,
          ticks: { callback: function (v) { return Math.round(v * 100) + '%'; } }
        }
      }
    }
  });

  /* ---------- 堆叠柱状图：三台设备各自的批次数按月堆叠。配色走六条分类
     序列色。stackedRaw 保留未归一化的原始数据——百分比堆叠开关用它重新
     算百分比，关闭开关时用它一字不差地还原。 ---------- */
  var stackedLabels = months12;
  var stackedRaw = [
    { label: '设备A', data: DS_MOCK.series(12, 21) },
    { label: '设备B', data: DS_MOCK.series(12, 22) },
    { label: '设备C', data: DS_MOCK.series(12, 23) }
  ];
  function shallowCopy(o) {
    var out = {};
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k]; }
    return out;
  }
  // percent=true 时：Chart.js 不原生支持"100% 堆叠"，这里用数据预处理
  // （每一类按当月总量归一化成百分比）模拟出等效效果；tooltip 回调从
  // dataset.__dsRaw 读回原始绝对值一并展示，不会因为改成百分比就丢信息。
  // 当前层数（数量级切换）：层数 3 时与上面的 stackedRaw 完全一致
  var stackedLayers = 3;
  function stackedConfig(percent) {
    var rawNow = DS_MOCK.stackLayers(stackedLayers, 12);
    var totals = stackedLabels.map(function (_, i) {
      return rawNow.reduce(function (sum, d) { return sum + d.data[i]; }, 0);
    });
    var datasets = rawNow.map(function (d) {
      var copy = shallowCopy(d);
      if (percent) {
        copy.__dsRaw = d.data.slice();
        copy.data = d.data.map(function (v, i) { return totals[i] ? +(v / totals[i] * 100).toFixed(1) : 0; });
      } else {
        copy.data = d.data.slice();
      }
      return copy;
    });
    return {
      type: 'bar',
      data: { labels: stackedLabels, datasets: datasets },
      options: {
        scales: {
          x: { stacked: true },
          y: percent
            ? { stacked: true, min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; } } }
            : { stacked: true }
        },
        plugins: percent ? {
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var raw = ctx.dataset.__dsRaw ? ctx.dataset.__dsRaw[ctx.dataIndex] : ctx.raw;
                return ctx.dataset.label + '：' + ctx.formattedValue + '%（原始值 ' + raw + '）';
              }
            }
          }
        } : {}
      }
    };
  }
  var stackedChart = makeChart(document.getElementById('c-stacked'), stackedConfig(false));
  document.getElementById('chk-stacked-percent').addEventListener('change', function (ev) {
    var chart = DS.charts.create(document.getElementById('c-stacked'), stackedConfig(ev.target.checked));
    if (chart) stackedChart = chart;
  });
  mountScale('c-stacked', [3, 10, 20], 3, '层', function (n) {
    stackedLayers = n;   // 「百分比堆叠」开关的当前状态保持
    stackedChart = rebuildOn('c-stacked', stackedConfig(document.getElementById('chk-stacked-percent').checked));
  });

  /* ---------- 面积图：两条面积（本期/上期处理量，45 天日数据）叠加 + 一条不填充的目标线。
     fill:true 的两个数据集要靠 paint() 把 backgroundColor 换成半透明版本，
     叠在一起才不会互相完全遮挡；目标线没有 fill 字段，backgroundColor 该
     保持不透明（跟普通折线图行为一致）。 ---------- */
  var areaDates = DS_MOCK.dates(45), areaMd = DS.charts.dateTicks('md');
  var areaLabels = areaDates.map(function (t) { return areaMd(t); });
  // 面积图：前三条固定（本期/上期面积 + 虚线目标线），更多条按 DS_MOCK.extraTrend 追加成面积
  function areaConfig(n) {
    var datasets = [
      { label: '本期处理量', data: DS_MOCK.trend(45, 41, { base: 70, slope: 0.4, amp: 15, period: 7, noise: 6 }), fill: true, tension: 0.3, pointRadius: 0 },
      { label: '上期处理量', data: DS_MOCK.trend(45, 42, { base: 60, slope: 0.3, amp: 13, period: 7, phase: 0.5, noise: 6 }), fill: true, tension: 0.3, pointRadius: 0 },
      { label: '目标线', data: DS_MOCK.trend(45, 43, { base: 85, slope: 0.2 }), tension: 0, borderDash: [4, 4], pointRadius: 0 }
    ].slice(0, n);
    for (var k = datasets.length; k < n; k++) {
      datasets.push({ label: '系列' + (k + 1 < 10 ? '0' : '') + (k + 1), data: DS_MOCK.extraTrend(45, k), fill: true, tension: 0.3, pointRadius: 0 });
    }
    return { type: 'line', data: { labels: areaLabels, datasets: datasets } };
  }
  var areaChart = makeChart(document.getElementById('c-area'), areaConfig(3));
  mountScale('c-area', [3, 10, 20], 3, '系列', function (n) { areaChart = rebuildOn('c-area', areaConfig(n)); });

  /* ---------- 时间轴（模拟）：没有内置日期适配器（见 README「时间轴」），
     x 轴用 'linear' + DS.charts.dateTicks('md') 把时间戳格式化成 M/D 标签。
     没有 labels 数组（点数据 {x,y}），跟散点图走同一条"按数据域缩放"路径。 ---------- */
  // 92 天（数据域跨度恰为 91 天 = 13 个整周）：Chart.js 在 min/max 都钉死时，
  // 若跨度不是 stepSize 的整数倍，会忽略 stepSize 把区间等分成 ceil(跨度/stepSize)
  // 份（实测 91 天数据会得到每 6.92 天一个刻度、标签落在奇怪的日子上）。
  // 所以"每周一个刻度"要求 数据天数 = 7k+1。
  var timeaxisDates = DS_MOCK.dates(92);
  function timeaxisConfig(nLines) {
    return {
    type: 'line',
    data: {
      // 三台仪器的日期完全对齐（同一组 92 个时间戳、同样长度）：x 是 linear
      // 轴，index 模式的悬浮框按数组下标对齐各系列，日期不齐就会对错位。
      datasets: DS_MOCK.dailyBatches(92, nLines).map(function (sr) {
        return { label: sr.label, data: sr.data, tension: 0.3, pointRadius: 0, pointHoverRadius: 4 };
      })
    },
    options: {
      scales: {
        // Bug（复审线上实测）：不钉 min/max 的话，Chart.js 对线性轴的默认
        // "好看刻度"算法会自己找一圈整数，第一个刻度常常落在数据起点
        // *之前*（实测 14 天数据从 2024-01-01 开始，轴上却先画一个
        // "12/31"），刻度间距也不保证踩在整天上，天数少的时候甚至会连续
        // 出现好几个同一天的重复标签（3 天数据实测过"1/1"连续出现 4 次）。
        // min/max 钉死到数据域本身、ticks.stepSize 固定成一天的毫秒数、
        // maxTicksLimit 控制密度，三者一起用才能保证刻度不越界、不重复——
        // 这是本仓库数值轴模拟时间轴这套方案真正的局限（不是简单的"疏密
        // 取舍"），README「时间轴」一节已经补充说明，任何用这个方案的调用
        // 方都要记得自己设这三项，不设的话会复现这个 bug。
        x: {
          type: 'linear',
          min: timeaxisDates[0],
          max: timeaxisDates[timeaxisDates.length - 1],
          ticks: { stepSize: 7 * 86400000, maxTicksLimit: 16, callback: DS.charts.dateTicks('md') }
        }
      }
    }
  };
  }
  var timeaxisChart = makeChart(document.getElementById('c-timeaxis'), timeaxisConfig(3));
  mountScale('c-timeaxis', [3, 10, 20], 3, '系列', function (n) { timeaxisChart = rebuildOn('c-timeaxis', timeaxisConfig(n)); });

  /* ---------- 桑基图：各仪器做了哪些项目（两层：仪器 → 项目）。
     筛选下拉（仪器筛选 + 项目筛选：默认 Top-N、勾选后只看勾选项）、
     全选/计数/徽标/清除、基线高亮联动、销毁重建、全屏，全部由库里的
     DS.sankey.mount() 提供；demo 只传入流向数据和元素 id 前缀。
     colorFrom/colorTo/color/borderColor 留空交给 paint() 自动取色。 ---------- */
  var sankeyUniverse = DS_MOCK.sankeyFlows();
  var sankeyComp = DS.sankey.mount(document.getElementById('sankey-mount'), sankeyUniverse, {
    id: 'sankey',
    datasetLabel: '仪器工作量',
    fromLabel: '仪器筛选',
    toLabel: '项目筛选',
    onChart: function () { expectedRegistered++; }
  });
  // 项目数 3/10/20/25：前 n 个项目的流向（25 = 全部，默认只显示前 20 个流入端）；
  // setFlows 内部先销毁旧图再重建，已勾选的筛选项保留
  mountScale('c-sankey', [3, 10, 20, 25], 25, '项目', function (n) { sankeyComp.setFlows(DS_MOCK.sankeyFlows(n)); },
    function (n) { return n === 25 ? '25 个项目（流入端默认只显示流量前 20）' : n + ' 个项目'; });
  var sankeyFromList = document.getElementById('sankey-from-list');
  var sankeyToList = document.getElementById('sankey-to-list');
  var sankeyFromBadge = document.getElementById('sankey-from-badge');
  var sankeyToBadge = document.getElementById('sankey-to-badge');
  var sankeyClearBtn = document.getElementById('sankey-clear-btn');

  /* ---------- SVG 甘特 / 热力：Chart.js 画不了，复用同一套 token ---------- */
  // 甘特图：数据见 DS_MOCK.ganttDemo()（手写，覆盖跨夜/截断/两种状态/多槽道/短条/7 个分档）
  var ganttData = DS_MOCK.ganttDemo(ganttLongLabel);
  var ganttOpts = {
    window: ganttData.window,
    unit: '件',
    labelTitle: '资源',
    colorScale: { field: 'value', thresholds: ganttData.thresholds, unit: '分' },
    markers: ganttData.markers,
    details: { title: '明细（每段一行）' }
  };
  DS.svg.gantt(document.getElementById('s-gantt'), ganttData.rows, ganttOpts);
  // 断言用的独立复算：value 落进 thresholds 的第几档（v ≤ t[i] 即第 i 档）
  function ganttBandOf(v) {
    var t = ganttData.thresholds, i = 0;
    while (i < t.length && v > t[i]) i++;
    return i;
  }
  // opts.rows/opts.cols：热力图的行列标签，同时验证数据格按 labelW/labelH 偏移。
  // 矩阵里特意放一个 0（第二行第二列），验证色阶最低档也可见。
  DS.svg.heatmap(document.getElementById('s-heat'), [[1, 5, 3], [8, 0, 6]], {
    rows: DS_MOCK.instruments().slice(0, 2),
    cols: ['上午', '下午', '夜间']
  });

  /* ---------- 测试脚手架的图表/SVG 实例：只在 ?selftest=1 下创建 ----------
     I4（逐图隔离）和 M4（canvas 复用）的验证需要真实的 Chart 实例，但不该
     随公开 demo 页出厂。SVG 侧同理补一组 guard/poison，验证 DS.svg 的
     retheme 逐图隔离（见下方 svgCharts 套件追加的断言）。 */
  var poisonChart = null;
  var guardChart = null;
  var dualAxisChart = null;
  if (selftestMode) {
    // I4：人为制造一张「retheme 时必炸」的图，验证它不会拖垮 registry 里
    // 排在它后面的图。poisonConfig.scales 换成一个 getter 返回 falsy、setter
    // 必抛错的访问器属性：paint() 里 `o.scales = o.scales || {}` 这句自赋值
    // 一跑到这张图就会抛，退出前已创建成功，所以不影响 isEmpty 判定。
    var poisonConfig = {
      type: 'bar',
      data: { labels: ['故障'], datasets: [{ label: '故障图', data: [1] }] }
    };
    poisonChart = makeChart(document.getElementById('c-poison'), poisonConfig);
    Object.defineProperty(poisonConfig.options, 'scales', {
      configurable: true,
      get: function () { return undefined; },
      set: function () { throw new Error('ds-test: 故意制造的 Chart.js 重绘故障，用于验证隔离'); }
    });
    guardChart = makeChart(document.getElementById('c-guard'), {
      type: 'bar', data: { labels: ['卫'], datasets: [{ label: '哨兵图', data: [3] }] }
    });

    // Bug 3：报表里"量 + 率"双轴组合图常见的第二数值轴，键名通常是 y1
    // （跟 dataset.yAxisID 对应）。故意不预先给 y1 塞 grid/ticks/border——
    // 这些必须是 paint() 自己注入的，留白才能验出"根本没注入"和"注入了但
    // 颜色不对"两种情况，而不是巧合地碰上调用方自己写的颜色。
    dualAxisChart = makeChart(document.getElementById('c-dualaxis'), {
      type: 'bar',
      data: {
        labels: ['一月', '二月', '三月'],
        datasets: [
          { label: '量', data: [10, 20, 30], yAxisID: 'y' },
          { label: '率', type: 'line', data: [0.1, 0.2, 0.3], yAxisID: 'y1' }
        ]
      },
      options: { scales: { y1: { position: 'right' } } }
    });

    // DS.svg 的 registry 按 host 插入顺序 push、retheme 时当前实现是逆序
    // 遍历（见 charts-svg.js），但这条鉴别力不该完全押在"遍历方向永远不变"
    // 这一个假设上——哪天有人把遍历改成正序，原来只在 poison *之前*挂载的
    // 单个 guard 就会从"会被拖累"变成"不会被拖累"，断言表面上还是会通过，
    // 但其实已经测不出"是否真的隔离了"。这里在 poison 前后各放一个 guard，
    // 下面的断言两个都查：不管遍历方向是正序还是逆序，poison 两侧总有一个
    // guard 排在它"之后"处理，只要隔离失效就必然有一个会露馅。
    DS.svg.gantt(document.getElementById('s-iso-guard'),
      [{ label: '哨兵甲', bars: [{ start: 0, end: 1, series: 0 }] }]);
    // 用一个显式的"武装"开关而不是计数器：draw() 内部每行会读两次 label
    // （行标签文字一次、每个 bar 的 <title> 提示各一次），计数器式的
    // "第 N 次调用才抛错"很容易被内部实现细节（到底读几次）带偏。这里改成
    // 首次挂载完全跑完之后才武装故障，语义上精确对应"重绘阶段才崩溃"。
    var svgPoisonArmed = false;
    var svgPoisonRows = [{
      get label() {
        if (svgPoisonArmed) throw new Error('ds-test: 故意制造的 SVG 重绘故障，用于验证隔离');
        return '故障行';
      },
      bars: [{ start: 0, end: 1, series: 0 }]
    }];
    DS.svg.gantt(document.getElementById('s-iso-poison'), svgPoisonRows);
    svgPoisonArmed = true;
    DS.svg.gantt(document.getElementById('s-iso-guard2'),
      [{ label: '哨兵乙', bars: [{ start: 0, end: 1, series: 0 }] }]);
  }

  window.DS_SELFTEST_SUITES = window.DS_SELFTEST_SUITES || [];
  window.DS_SELFTEST_SUITES.push(function components(A) {
    // 组件必须真正吃到 token，而不是落回浏览器默认样式
    A.check('comp-card-has-border',
      A.css('#t-card', 'border-top-width') === '1px',
      'got ' + A.css('#t-card', 'border-top-width'));
    A.check('comp-card-radius',
      A.css('#t-card', 'border-top-left-radius') === '16px',
      'got ' + A.css('#t-card', 'border-top-left-radius'));
    A.check('comp-stat-value-size',
      A.css('#t-stat .ds-stat-value', 'font-size') === '26px',
      'got ' + A.css('#t-stat .ds-stat-value', 'font-size'));
    A.check('comp-table-header-sticky',
      A.css('#t-detail th', 'position') === 'sticky',
      'got ' + A.css('#t-detail th', 'position'));
    A.check('comp-badge-pill',
      parseFloat(A.css('#t-badge', 'border-top-left-radius')) > 100,
      'got ' + A.css('#t-badge', 'border-top-left-radius'));
    // 徽标背景/文字必须解析成 -tint / -ink 的实际值，而不是落回浏览器默认
    A.check('comp-badge-bg-is-tint',
      A.css('#t-badge', 'background-color') === 'rgb(229, 236, 253)',
      'got ' + A.css('#t-badge', 'background-color'));
    A.check('comp-badge-color-is-ink',
      A.css('#t-badge', 'color') === 'rgb(29, 78, 216)',
      'got ' + A.css('#t-badge', 'color'));
    // .ds-stat-delta 必须用 -ink（在 surface 上验过 >=4.5），不能用基色
    A.check('comp-stat-delta-up-is-ink',
      A.css('#t-delta-up', 'color') === 'rgb(4, 120, 87)',
      'got ' + A.css('#t-delta-up', 'color'));
    A.check('comp-stat-delta-down-is-ink',
      A.css('#t-delta-down', 'color') === 'rgb(185, 28, 28)',
      'got ' + A.css('#t-delta-down', 'color'));
    A.check('comp-btn-primary-bg',
      A.css('#t-btn', 'background-color') === 'rgb(37, 99, 235)',
      'got ' + A.css('#t-btn', 'background-color'));
    // 提示条：背景走 -tint，边框走基色（3:1 即可，非文本 UI）
    A.check('comp-banner-warn-border',
      A.css('#t-banner', 'border-top-style') === 'solid',
      'got ' + A.css('#t-banner', 'border-top-style'));
    A.check('comp-banner-warn-bg-is-tint',
      A.css('#t-banner', 'background-color') === 'rgb(250, 239, 225)',
      'got ' + A.css('#t-banner', 'background-color'));
    A.check('comp-banner-warn-border-is-base',
      A.css('#t-banner', 'border-top-color') === 'rgb(217, 119, 6)',
      'got ' + A.css('#t-banner', 'border-top-color'));
    // .ds-banner.ok 是「安静确认条」：虚线边框 + 透明背景
    A.check('comp-banner-ok-dashed',
      A.css('#t-banner-ok', 'border-top-style') === 'dashed',
      'got ' + A.css('#t-banner-ok', 'border-top-style'));
    A.check('comp-banner-ok-bg-transparent',
      A.css('#t-banner-ok', 'background-color') === 'rgba(0, 0, 0, 0)',
      'got ' + A.css('#t-banner-ok', 'background-color'));
    // 无 sim-v4 残留
    A.check('comp-no-dead-simv4',
      document.querySelector('[class*="sim-v4"]') === null, '');
  });

  window.DS_SELFTEST_SUITES.push(function interactions(A) {
    // 主题：切换、读回、事件
    var fired = null;
    document.addEventListener('ds:themechange', function (e) { fired = e.detail.mode; });
    var before = DS.theme.get();
    DS.theme.toggle();
    A.check('ix-theme-toggles', DS.theme.get() !== before, before + '->' + DS.theme.get());
    A.check('ix-theme-attr-applied',
      document.documentElement.getAttribute('data-theme') === DS.theme.get(), '');
    A.check('ix-theme-event-fired', fired === DS.theme.get(), 'fired=' + fired);
    // 记录切换前后 #t-card 的背景色，既要求元素确实存在（两个值都不是哨兵），
    // 又要求主题确实生效（两个值互不相同）——用哨兵而不是否定式断言，防止
    // 选择器写错时静默通过。
    var bgBeforeToggle = A.css('#t-card', 'background-color');
    DS.theme.toggle();
    var bgAfterToggle = A.css('#t-card', 'background-color');
    DS.theme.toggle();
    A.check('ix-theme-dark-bg-differs',
      bgBeforeToggle !== A.CSS_MISSING && bgAfterToggle !== A.CSS_MISSING &&
        bgBeforeToggle !== bgAfterToggle,
      bgBeforeToggle + ' vs ' + bgAfterToggle);
    DS.theme.set(before);

    // 分组切换：点侧栏菜单项只显示对应分组；兼容层（旧选择器）= 显示全部
    var sideTrend = document.querySelector('#side [data-panel="g-trend"]');
    sideTrend.click();
    var onlyTrend = Array.prototype.every.call(document.querySelectorAll('.ds-side-panel'), function (p) { return p.hidden === (p.id !== 'g-trend'); });
    document.querySelector('[data-panel="p-comp"]').click();
    var allShown = Array.prototype.every.call(document.querySelectorAll('.ds-side-panel'), function (p) { return !p.hidden; });
    A.check('ix-tab-switches', onlyTrend && allShown, '');

    // 表格排序：数字列按数值而非字典序（2/10/33 字典序会排错，用于区分两种排序）
    // 表格已合并为一张（#t-detail）：拿「样本数」列（第 3 列，数值 10–100 含两位数与三位数，
    // 字符串序与数值序不同）验证按数值排序
    function numericColumn() {
      return Array.prototype.map.call(
        document.querySelectorAll('#t-detail tbody td:nth-child(3)'),
        function (td) { return parseFloat(td.textContent.trim()); });
    }
    var th = document.querySelector('#t-detail th:nth-child(3)');
    var rawNums = numericColumn();
    var lexSorted = rawNums.map(String).sort();
    A.check('ix-table-sort-fixture-distinguishes-numeric-from-lexical',
      lexSorted.join() !== rawNums.slice().sort(function (a, b) { return a - b; }).map(String).join(), rawNums.join());
    th.click();
    var asc = numericColumn();
    var ascMonotonic = asc.every(function (v, i) { return i === 0 || asc[i - 1] <= v; });
    A.check('ix-table-sorts-numeric', ascMonotonic, 'got ' + asc.join(','));
    th.click();
    var desc = numericColumn();
    var descMonotonic = desc.every(function (v, i) { return i === 0 || desc[i - 1] >= v; });
    A.check('ix-table-sorts-desc', descMonotonic, 'got ' + desc.join(','));

    // 达标率列（百分比，合并进表格的原独有能力）：按数值而不是字符串排序（"100%" 字符串序在 "40%" 之前）
    function rateColumn() {
      return Array.prototype.map.call(
        document.querySelectorAll('#t-detail tbody td:nth-child(6)'),
        function (td) { return parseFloat(td.textContent.trim()); });
    }
    var rateTh = document.querySelector('#t-detail th:nth-child(6)');
    var rateRaw = rateColumn();
    A.check('ix-table-percent-fixture-distinguishes-numeric-from-lexical',
      rateRaw.map(function (v) { return v + '%'; }).sort().join() !==
        rateRaw.slice().sort(function (a, b) { return a - b; }).map(function (v) { return v + '%'; }).join(), rateRaw.join());
    rateTh.click();
    var rateAsc = rateColumn();
    A.check('ix-table-sorts-percent-numerically', rateAsc.length === 8 && rateAsc.every(function (v, i) { return i === 0 || rateAsc[i - 1] <= v; }) &&
      rateAsc.some(function (v) { return v >= 100; }) && rateAsc.some(function (v) { return v < 100; }), rateAsc.join());
    // 中文数字前缀（仪器列）：一号 < 二号 < 三号 < 备用，而不是拼音序
    var instTh = document.querySelector('#t-detail th:nth-child(2)');
    instTh.click();
    var instAsc = Array.prototype.map.call(document.querySelectorAll('#t-detail tbody td:nth-child(2)'), function (td) { return td.textContent.trim(); });
    var instRank = { '一号仪器': 1, '二号仪器': 2, '三号仪器': 3, '备用仪器': 4 };
    A.check('ix-table-sorts-chinese-numeral-prefix-by-value', instAsc.every(function (v, i) { return i === 0 || instRank[instAsc[i - 1]] <= instRank[v]; }) && instAsc[0] === '一号仪器', instAsc.join());

    // 混排列（5 / 空 / 10 / 2）：全列统一判定走数值排序，空单元格无条件排到末尾
    document.querySelector('#t-table-mixed th').click();
    var mixedCells = Array.prototype.map.call(
      document.querySelectorAll('#t-table-mixed tbody td'),
      function (td) { return td.textContent.trim(); });
    var mixedLast = mixedCells[mixedCells.length - 1];
    var mixedNonEmpty = mixedCells.filter(function (v) { return v !== ''; }).map(Number);
    var mixedMonotonic = mixedNonEmpty.every(function (v, i) {
      return i === 0 || mixedNonEmpty[i - 1] <= v;
    });
    A.check('ix-table-mixed-numeric-blank-last',
      mixedMonotonic && mixedLast === '' && mixedCells.length === 4,
      'got ' + mixedCells.join(','));

    // 纯文本列（banana/apple/cherry）：不可解析为数字，走字符串排序路径
    document.querySelector('#t-table-str th').click();
    var strCells = Array.prototype.map.call(
      document.querySelectorAll('#t-table-str tbody td'),
      function (td) { return td.textContent.trim(); });
    var strMonotonic = strCells.every(function (v, i) {
      return i === 0 || strCells[i - 1].localeCompare(v, 'zh-Hans-CN') <= 0;
    });
    A.check('ix-table-sorts-text-column', strMonotonic, 'got ' + strCells.join(','));

    // Review D3：报表里常见的"数值但带格式"的列，必须按数值排序而不是退化
    // 成字典序（README 明确承诺"数字列按数值"）。四种格式各起一张表，
    // 点击表头升序排序后核验真实的数值顺序。
    function columnCellsAfterSort(sel) {
      document.querySelector(sel + ' th').click();
      return Array.prototype.map.call(
        document.querySelectorAll(sel + ' tbody td'),
        function (td) { return td.textContent.trim(); });
    }
    var thousandsCells = columnCellsAfterSort('#t-table-thousands');
    A.check('ix-table-sorts-thousands-separator',
      thousandsCells.join('|') === '999|1,234|12,000', 'got ' + thousandsCells.join('|'));
    var percentCells = columnCellsAfterSort('#t-table-percent');
    A.check('ix-table-sorts-percent',
      percentCells.join('|') === '5%|12%|100%', 'got ' + percentCells.join('|'));
    var durationCells = columnCellsAfterSort('#t-table-duration');
    A.check('ix-table-sorts-duration-hours',
      durationCells.join('|') === '1h|3.5h|12h', 'got ' + durationCells.join('|'));
    var colonTimeCells = columnCellsAfterSort('#t-table-colontime');
    A.check('ix-table-sorts-colon-time',
      colonTimeCells.join('|') === '1:30|02:14|10:05', 'got ' + colonTimeCells.join('|'));

    // Bug 1（用户报的）：中文数字前缀列（"一号仪器"/"三号线"）按数值排序，
    // 不再退化成 localeCompare(zh-Hans-CN) 的拼音序（之前"一"会排到"二"
    // "三"后面）。"备用仪器"没有中文数字前缀，无条件排在末尾，升/降序
    // 都一样，跟阿拉伯数字列里空单元格的既有约定一致。
    var cnNumeralAsc = columnCellsAfterSort('#t-table-cn-numeral');
    A.check('ix-table-sorts-chinese-numeral',
      cnNumeralAsc.join('|') === '一号仪器|二号仪器|三号仪器|备用仪器',
      'got ' + cnNumeralAsc.join('|'));
    document.querySelector('#t-table-cn-numeral th').click();  // 第二次点击：降序
    var cnNumeralDesc = Array.prototype.map.call(
      document.querySelectorAll('#t-table-cn-numeral tbody td'),
      function (td) { return td.textContent.trim(); });
    A.check('ix-table-sorts-chinese-numeral-desc',
      cnNumeralDesc.join('|') === '三号仪器|二号仪器|一号仪器|备用仪器',
      'got ' + cnNumeralDesc.join('|'));

    // 十一~九十九的组合（十位+个位），覆盖"X十""十X""X十Y"三种形态。
    var cnTensCells = columnCellsAfterSort('#t-table-cn-numeral-tens');
    A.check('ix-table-sorts-chinese-numeral-tens',
      cnTensCells.join('|') === '九号线|十号线|十一号线|二十号线|三十五号线',
      'got ' + cnTensCells.join('|'));

    // 独立成词（单元格整体就是一个中文数字，不是前缀），含 〇/零。
    var cnStandaloneCells = columnCellsAfterSort('#t-table-cn-numeral-standalone');
    A.check('ix-table-sorts-chinese-numeral-standalone',
      cnStandaloneCells.join('|') === '零|一|二|十',
      'got ' + cnStandaloneCells.join('|'));

    // 不误伤："一次性耗材""十字路口""百分之一"都以中文数字字符开头，但
    // 整体是固定词/习语，不是"编号+名词"标签，一个都不该被提取出数值——
    // 整列退回 localeCompare，结果须跟独立调用 localeCompare 排序完全一致
    // （而不是巧合地凑出同一个顺序）。
    var cnSafeWords = ['十字路口', '一次性耗材', '百分之一', '阿拉伯数字耗材'];
    var cnSafeExpected = cnSafeWords.slice().sort(function (a, b) {
      return a.localeCompare(b, 'zh-Hans-CN');
    });
    var cnSafeCells = columnCellsAfterSort('#t-table-cn-numeral-safe');
    A.check('ix-table-sorts-chinese-numeral-no-false-positive',
      cnSafeCells.join('|') === cnSafeExpected.join('|'),
      'got ' + cnSafeCells.join('|') + ' want ' + cnSafeExpected.join('|'));

    // 幂等保护：init 阶段故意对 #t-table-idem 调了两次 sortable，
    // 若监听器叠加，一次点击会被连续触发两次，"升序"反而落到降序结果 10,2
    document.querySelector('#t-table-idem th').click();
    var idemCells = Array.prototype.map.call(
      document.querySelectorAll('#t-table-idem tbody td'),
      function (td) { return td.textContent.trim(); });
    A.check('ix-table-sortable-idempotent',
      idemCells.join(',') === '2,10', 'got ' + idemCells.join(','));

    // Review B1：表格重渲染（thead+tbody 整体换新）之后，消费者按标准做法
    // 重新调一次 sortable()（被幂等保护拒绝也无所谓，关键是点击新表头要有
    // 反应）。旧实现把监听器逐个挂在 <th> 上，innerHTML 替换会把它们连同
    // 监听器一起扔掉，新表头点击毫无反应、无报错——这正是报表"换筛选条件
    // 重渲染表格"的标准路径。
    var rerenderTable = document.getElementById('t-table-rerender');
    rerenderTable.innerHTML =
      '<thead><tr><th>列</th></tr></thead>' +
      '<tbody><tr><td>30</td></tr><tr><td>5</td></tr><tr><td>15</td></tr></tbody>';
    DS.tables.sortable('#t-table-rerender');  // 消费者的标准重绑调用
    document.querySelector('#t-table-rerender th').click();
    var rerenderCells = Array.prototype.map.call(
      document.querySelectorAll('#t-table-rerender tbody td'),
      function (td) { return parseFloat(td.textContent.trim()); });
    A.check('ix-table-sortable-works-after-rerender',
      rerenderCells.join(',') === '5,15,30', 'got ' + rerenderCells.join(','));

    // 用户报的 bug：数字列的表头没跟着 td.num 右对齐，视觉上整列错位
    // 将近一个列宽——点表头排序其实生效了，但盯着的那一列标题底下显示的
    // 是相邻列的数字，看着像排序没反应。断言验的是"真正的问题"（表头跟
    // 它自己那一列数据的 computed text-align 是否一致），不是"th 有没有
    // num 这个类名"这种实现细节——否则换一种配对机制（比如用别的类名）
    // 照样能瞒过断言。
    // `.ds-table th` 显式写了 `text-align: left`，而完全没设对齐规则的
    // `td` 的 computed text-align 是 CSS 初始值 `start`——在本页这种纯
    // LTR 文档里两者视觉上是同一回事，但作为字符串并不相等。按字面值比较
    // 会把这个无害的、一直存在的差异误判成"不一致"，跟真正的错位 bug
    // 混为一谈，所以统一把 `start` 归一成 `left` 再比较（本库不支持
    // RTL，没有 `dir="rtl"` 用法，归一不会掩盖任何真实问题）。
    function normalizeAlign(v) { return v === 'start' ? 'left' : v; }
    function thTdAlign(tableSel) {
      var th = document.querySelector(tableSel + ' thead th');
      var td = document.querySelector(tableSel + ' tbody tr td');
      return [normalizeAlign(getComputedStyle(th).textAlign), normalizeAlign(getComputedStyle(td).textAlign)];
    }

    // 真实回归现场：#t-detail 的"样本数"/"时长(分)"两列，th 跟它对应的
    // td.num 必须都是 right；"批次"/"仪器"/"状态"三个文本列 th/td 必须都
    // 是 left——同一条断言里两种列都验，防止"为了修数字列把文本列搞反"
    // 这种对称性错误蒙混过关。
    var detailThs = document.querySelectorAll('#t-detail thead th');
    var detailFirstRow = document.querySelector('#t-detail tbody tr').children;
    var detailPairs = [0, 1, 2, 3, 4].map(function (i) {
      return [normalizeAlign(getComputedStyle(detailThs[i]).textAlign),
        normalizeAlign(getComputedStyle(detailFirstRow[i]).textAlign)];
    });
    A.check('ix-align-detail-numeric-columns-match',
      detailPairs[2].join('/') === 'right/right' && detailPairs[3].join('/') === 'right/right',
      'slides=' + detailPairs[2].join('/') + ' minutes=' + detailPairs[3].join('/'));
    // 文本列（批次/仪器/状态）没有显式对齐规则，th/td 的 computed
    // text-align 实际值是 CSS 初始值 'start'（不是字面的 'left'——两者
    // 对 LTR 文档视觉等价，但不是同一个字符串），所以这里不能断言字面值
    // 'left'，而是："th 跟它自己的 td 一致" 且 "不是 right"——后一条防的
    // 是"两边都被误改成 right"这种两边同时错、看着依然相等的情况蒙混过关。
    A.check('ix-align-detail-text-columns-match',
      [0, 1, 4].every(function (i) {
        return detailPairs[i][0] === detailPairs[i][1] && detailPairs[i][0] !== 'right';
      }),
      detailPairs.map(function (p) { return p.join('/'); }).join(', '));

    // 独立的最小探针：表头在标记里原本不带 num 类，完全交给 sortable()
    // 自动判定——数字列（td 全带 num）自动右对齐，文本列（td 都不带 num）
    // 保持左对齐，两条分别验证，防止"数字列对了、文本列被搞反"和反过来
    // 两种对称性错误。
    var numericPair = thTdAlign('#t-align-numeric');
    A.check('ix-align-auto-numeric-column',
      numericPair[0] === 'right' && numericPair[1] === 'right', 'got ' + numericPair.join('/'));
    var textPair = thTdAlign('#t-align-text');
    // 同样不能断言字面 'left'：默认未设置时 computed text-align 是初始值
    // 'start'。一致且不是 'right' 才是真正要验的东西。
    A.check('ix-align-auto-text-column',
      textPair[0] === textPair[1] && textPair[0] !== 'right', 'got ' + textPair.join('/'));

    // 幂等/可重渲染：重渲染后把数字列换成纯文本列，重新调用 sortable()，
    // 自动对齐必须跟着重新判定（撤回之前自动加的 num），而不是沿用第一次
    // 调用时判定的结果。
    var alignRerenderTable = document.getElementById('t-align-rerender');
    var beforeRerenderPair = thTdAlign('#t-align-rerender');
    alignRerenderTable.innerHTML =
      '<thead><tr><th>列</th></tr></thead><tbody><tr><td>北京</td></tr><tr><td>上海</td></tr></tbody>';
    DS.tables.sortable('#t-align-rerender');
    var afterRerenderPair = thTdAlign('#t-align-rerender');
    A.check('ix-align-rerender-follows-new-column-type',
      beforeRerenderPair.join('/') === 'right/right' &&
        afterRerenderPair[0] === afterRerenderPair[1] && afterRerenderPair[0] !== 'right',
      'before=' + beforeRerenderPair.join('/') + ' after=' + afterRerenderPair.join('/'));

    // 显式优先：页面作者在 th 上手写了 num 类，但这一列的 td 从来没有
    // num（他自己的选择）——sortable() 的自动判定不得把这个手写的类摘掉，
    // 即便按"整列是否都带 num"的标准来看这一列并不是数字列。
    var overrideTh = document.querySelector('#t-align-override thead th');
    A.check('ix-align-explicit-th-class-not-overridden',
      overrideTh.classList.contains('num'), 'class=' + overrideTh.className);

    // Review B2：两组独立 tabs 互不干扰——点 g2 的 tab 不该把 g1 当前显示
    // 的面板也隐藏掉（旧实现用 document.querySelectorAll('.ds-panel') 全文档
    // 扫描，没有按"这组 tabs 自己的面板"收敛范围）。
    document.querySelector('#g2-tabs [data-panel="g2-b"]').click();
    A.check('iso-tabs-g2-switches',
      document.getElementById('g2-a').hidden === true &&
        document.getElementById('g2-b').hidden === false, '');
    A.check('iso-tabs-g1-untouched-by-g2-click',
      document.getElementById('g1-a').hidden === false &&
        document.getElementById('g1-b').hidden === true, '');
    document.querySelector('#g2-tabs [data-panel="g2-a"]').click();  // 还原

    // Review B1（tabs 同形）：g1 的标签组整体重渲染（含新的 data-panel 值）
    // 之后，重新调一次 init()，点新标签页仍要能正确切换面板。
    document.getElementById('g1-tabs').innerHTML =
      '<button type="button" class="ds-tab" aria-selected="true" data-panel="g1-a">A2</button>' +
      '<button type="button" class="ds-tab" aria-selected="false" data-panel="g1-b">B2</button>';
    DS.tabs.init('#g1-tabs');  // 消费者的标准重绑调用
    document.querySelector('#g1-tabs [data-panel="g1-b"]').click();
    A.check('ix-tabs-work-after-rerender',
      document.getElementById('g1-a').hidden === true &&
        document.getElementById('g1-b').hidden === false, '');
    document.querySelector('#g1-tabs [data-panel="g1-a"]').click();  // 还原

    // 自测基建本身：A.css() 对不存在的选择器必须返回哨兵字符串，而不是 null
    A.check('ix-selftest-css-missing-returns-sentinel',
      A.css('#definitely-does-not-exist-xyz', 'color') === A.CSS_MISSING, '');

    // 模态与 toast
    DS.modal.open('<p id="m-body">内容</p>');
    A.check('ix-modal-opens', !!document.getElementById('m-body'), '');
    DS.modal.close();
    A.check('ix-modal-closes',
      document.querySelector('.ds-modal-backdrop').hidden === true, '');
    DS.toast.show('测试');
    A.check('ix-toast-shows', !!document.querySelector('.ds-toast'), '');

    // Review B3：backdrop 被宿主应用整体重渲染 body 删掉后，再次 open()
    // 不该在 document 上重新累加一个 Esc keydown 监听器（旧实现把这个
    // 监听器的注册跟"backdrop 存不存在"绑在一起判断，document 本身永不
    // 替换，这个判据会反复为真，监听器无上限累积）。
    DS.modal.open('<p>r1</p>');
    DS.modal.close();
    document.querySelector('.ds-modal-backdrop').remove();  // 模拟宿主整体重渲染删掉 backdrop
    var realAddEventListener = document.addEventListener;
    var modalKeydownAddCount = 0;
    document.addEventListener = function (type, fn, opts) {
      if (type === 'keydown') modalKeydownAddCount++;
      return realAddEventListener.call(document, type, fn, opts);
    };
    DS.modal.open('<p id="m-body-2">r2</p>');
    document.addEventListener = realAddEventListener;
    A.check('ix-modal-keydown-not-rebound-after-backdrop-removed',
      modalKeydownAddCount === 0, 'got ' + modalKeydownAddCount);
    // 功能性回归：backdrop 被重建后，Esc 依然能正确关闭当前这个新 backdrop
    // （证明监听器没有连带消失，只是不重复累加）。
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    A.check('ix-modal-esc-still-closes-after-backdrop-rebuilt',
      document.querySelector('.ds-modal-backdrop').hidden === true, '');

    // 还原标签页：这里把真实的 p-play/p-comp 切到了 p-comp，后面的 charts/
    // wheel 套件要用 barChart 的 canvas 做 getBoundingClientRect() 拖框选
    // 测试——留在隐藏的 p-comp 下会拿到全零矩形。真实访客不会停在这个中间
    // 状态上，所以切回默认的 p-play 不是在掩盖问题，只是把"测试过程产生的
    // 副作用"清干净。
    document.querySelector('[data-panel="p-play"]').click();
  });

  window.DS_SELFTEST_SUITES.push(function charts(A) {
    // Critical 修复：hbarChart/pieChart/scatterChart 等现在活在
    // 侧边栏的各个分组面板里，非默认分组默认 hidden。Chart.js 对零尺寸画布从不
    // 计算刻度（scales.x.ticks 恒为空数组），readings 下面 ticks[0] 会直接
    // TypeError 崩掉整套——这正是这些图表被创建时的真实布局状态（p-comp 在
    // 页面刚加载时就是隐藏的）。切到 p-comp 让它们真正可见，并对每张图调
    // 一次 resize()（Chart.js 不会在容器变可见后自动重新量测，必须显式
    // 触发）才能拿到真实计算出的 ticks；套件末尾切回 p-play，不把这个
    // 中间状态遗留给后面的 wheel 套件（它要用 barChart 做真实鼠标坐标测试）。
    document.querySelector('[data-panel="p-comp"]').click();   // 兼容层：显示全部分组
    [barChart, hbarChart, pieChart, scatterChart].forEach(function (c) {
      // c.resize() 顺带会重新判一次要不要给工具条让出顶部空间（charts.js
      // create() 里包了一层 chart.resize()，见 TOOLBAR_TOP_RESERVE 定义处
      // 的说明）——这些图表创建时宿主还是隐藏的（clientHeight=0，当时直接
      // 判"不需要"），这次 resize() 第一次给它们真实尺寸，同一次调用里就
      // 补上了，不需要额外再调。
      if (c) { c.resize(); c.update('none'); }
    });

    A.check('ch-bar-created', barChart !== null, '');
    A.check('ch-registry-counts', DS.charts.all().length === expectedRegistered,
      'got ' + DS.charts.all().length + ', want ' + expectedRegistered);

    // Review Focus #2：空数据集渲染空态而非空白画布。空态演示已并进折线图卡片
    // （「显示为空数据」开关）：勾上 → create() 返回 null、宿主里恰好一条占位提示、
    // 画布隐藏、工具条被清掉；取消勾选 → 提示摘掉、画布回来、图表重新建出来。
    var lineBox = document.getElementById('chk-line-empty');
    var lineHost = document.getElementById('c-line').parentNode;
    var lineBefore = DS.charts.all().length;
    lineBox.checked = true; lineBox.dispatchEvent(new Event('change', { bubbles: true }));
    var emptyChart = lineChart;
    A.check('ch-empty-returns-null', emptyChart === null && !document.getElementById('c-line')._dsChart, '');
    A.check('ch-empty-shows-tip',
      lineHost.querySelectorAll('.ds-chart-empty').length === 1, '');
    A.check('ch-empty-hides-canvas',
      document.getElementById('c-line').style.display === 'none', '');
    A.check('ch-empty-clears-toolbar-and-instance',
      lineHost.querySelectorAll('.ds-chart-toolbar').length === 0 && DS.charts.all().length === lineBefore - 1, DS.charts.all().length + ' vs ' + lineBefore);
    lineBox.checked = false; lineBox.dispatchEvent(new Event('change', { bubbles: true }));
    A.check('ch-empty-toggle-off-restores-the-chart',
      !!lineChart && lineHost.querySelectorAll('.ds-chart-empty').length === 0 && document.getElementById('c-line').style.display !== 'none' &&
        DS.charts.all().length === lineBefore && lineHost.querySelectorAll('.ds-chart-toolbar').length === 1, DS.charts.all().length + ' vs ' + lineBefore);
    lineChart.resize();

    // 单点数据不应被当成空
    A.check('ch-single-point-not-empty',
      DS.charts.isEmpty({ data: { datasets: [{ data: [1] }] } }) === false, '');

    // Review Focus #5：超长中文标签截断，tooltip 保留全称。读 Chart.js 真正
    // 算出来的产物：scales.x.ticks[i].label 是经过注册的 callback 处理过的
    // 最终刻度文本。超长类目名的演示已并进柱状图卡片（「加入一个超长类目名」开关）。
    var longBox = document.getElementById('chk-bar-long');
    longBox.checked = true; longBox.dispatchEvent(new Event('change', { bubbles: true }));
    var longChart = barChart;
    longChart.resize();
    var longTick = longChart.scales.x.ticks[0].label;
    var shortTick = longChart.scales.x.ticks[1].label;
    A.check('ch-long-label-truncated',
      longTick.length <= 11 && longTick.slice(-1) === '…', 'got ' + longTick);
    A.check('ch-short-label-not-truncated',
      shortTick === DS_MOCK.monthLabels(6)[1], 'got ' + shortTick);

    // 截断要跟着 indexAxis 走：c-hbar 是 indexAxis:'y' 的横向条形图，
    // 类目在 y 轴、数值在 x 轴。
    var hbarCategoryTick = hbarChart.scales.y.ticks[0].label;
    A.check('ch-hbar-category-axis-truncated',
      hbarCategoryTick.length <= 11 && hbarCategoryTick.slice(-1) === '…',
      'got ' + hbarCategoryTick);
    var hbarValueTicksHaveEllipsis = hbarChart.scales.x.ticks.some(function (t) {
      return String(t.label).indexOf('…') !== -1;
    });
    A.check('ch-hbar-value-axis-not-truncated', !hbarValueTicksHaveEllipsis,
      'got ' + hbarChart.scales.x.ticks.map(function (t) { return t.label; }).join(','));

    // tooltip 全称：Chart.js 对 category 轴的默认 title 走 context[0].label，
    // 本就不经过 ticks.callback，天生未截断。用 setActiveElements() 真实
    // 触发一次 tooltip，验证"用户确实能看到全称"这个需求本身。
    longChart.tooltip.setActiveElements([{ datasetIndex: 0, index: 0 }], { x: 0, y: 0 });
    longChart.update('none');
    var tipTitle = (longChart.tooltip.title && longChart.tooltip.title[0]) || '';
    A.check('ch-tooltip-keeps-full-label', tipTitle === longLabel, 'got ' + tipTitle);
    longChart.tooltip.setActiveElements([], { x: 0, y: 0 });
    longChart.update('none');
    // 取消开关还原柱状图（后面的断言都按原始月份数据读 barChart）
    longBox.checked = false; longBox.dispatchEvent(new Event('change', { bubbles: true }));
    A.check('ch-long-toggle-off-restores-month-labels', barChart !== longChart && barChart.data.labels.join() === DS_MOCK.monthLabels(6).join(), barChart.data.labels.join());

    // Review Focus #1：主题切换后图表颜色必须跟着变。先把颜色改脏，
    // 再切主题，断言脏值被 __dsAuto 路径真正覆盖掉。
    var gridBefore = barChart.options.scales.y.grid.color;
    barChart.data.datasets[0].backgroundColor = 'rgb(123, 45, 67)';
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
    var gridAfter = barChart.options.scales.y.grid.color;
    A.check('ch-retheme-grid-changed', gridBefore !== gridAfter,
      gridBefore + ' -> ' + gridAfter);
    A.check('ch-retheme-series-changed',
      barChart.data.datasets[0].backgroundColor === DS.charts.themeColors().series[0],
      'got ' + barChart.data.datasets[0].backgroundColor);
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');

    // Bug 3（用户报的）：paint() 此前写死 ['x', 'y']，双轴图的第二个轴
    // （常见命名 y1，对应 dataset.yAxisID）网格/刻度/轴线颜色从来没被
    // 注入过。c-dualaxis 的 config.options.scales.y1 创建时只给了
    // { position: 'right' }，grid/ticks/border 全部留白，这里直接读取
    // "paint() 跑完之后" y1 到底被写了什么——留白是故意的，确保能分辨
    // "完全没注入"（y1.grid 不存在）和"注入了但凑巧撞对颜色"两种情况。
    // scaleColors() 定义在外层（IIFE 顶部），'reportCharts' 套件的
    // ch-combo-* 断言复用同一份实现。
    var themeNow = DS.charts.themeColors();
    var y1Colors = scaleColors(dualAxisChart, 'y1');
    A.check('ch-dualaxis-y1-colors-injected',
      y1Colors.grid === themeNow.grid && y1Colors.ticks === themeNow.text &&
        y1Colors.border === themeNow.axis,
      'got ' + JSON.stringify(y1Colors) + ' want ' + JSON.stringify(themeNow));

    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
    var y1ColorsAfter = scaleColors(dualAxisChart, 'y1');
    var themeAfter = DS.charts.themeColors();
    A.check('ch-dualaxis-y1-colors-track-theme',
      y1ColorsAfter.grid === themeAfter.grid && y1ColorsAfter.grid !== y1Colors.grid &&
        y1ColorsAfter.ticks === themeAfter.text && y1ColorsAfter.border === themeAfter.axis,
      'before=' + JSON.stringify(y1Colors) + ' after=' + JSON.stringify(y1ColorsAfter));
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');

    // I1：弧形族不该被塞 x/y 轴
    A.check('ch-pie-no-x-scale', !pieChart.scales.x, '');
    A.check('ch-pie-no-y-scale', !pieChart.scales.y, '');

    // I2：弧形族每个扇区要各自上色
    var pieBg = pieChart.data.datasets[0].backgroundColor;
    A.check('ch-pie-sectors-have-color-array',
      Array.isArray(pieBg) && pieBg.length === 3, 'got ' + JSON.stringify(pieBg));
    A.check('ch-pie-sectors-distinct-colors',
      Array.isArray(pieBg) && pieBg[0] !== pieBg[1] && pieBg[1] !== pieBg[2],
      'got ' + JSON.stringify(pieBg));
    var surfaceColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-surface').trim();
    A.check('ch-pie-sector-border-is-surface',
      pieChart.data.datasets[0].borderColor === surfaceColor,
      'got ' + pieChart.data.datasets[0].borderColor);

    // I4：registry 里一张图 retheme 时抛错，不能把排在它后面的图拖下水。
    var guardGridBefore = guardChart.options.scales.y.grid.color;
    var realWarn = console.warn;
    var warnCalls = [];
    console.warn = function () { warnCalls.push(Array.prototype.slice.call(arguments)); };
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
    console.warn = realWarn;
    var guardGridAfter = guardChart.options.scales.y.grid.color;
    A.check('ch-retheme-isolates-failing-chart',
      guardGridBefore !== guardGridAfter, guardGridBefore + ' -> ' + guardGridAfter);
    A.check('ch-retheme-warns-on-failure', warnCalls.length >= 1, 'got ' + warnCalls.length);
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');

    // M4：同一块 canvas 二次 create() 不该抛错
    var reuseCanvas = document.getElementById('c-reuse');
    var reuseChart1 = DS.charts.create(reuseCanvas, {
      type: 'bar', data: { labels: ['甲'], datasets: [{ data: [1] }] }
    });
    var reuseThrew = false;
    var reuseChart2 = null;
    try {
      reuseChart2 = DS.charts.create(reuseCanvas, {
        type: 'bar', data: { labels: ['乙'], datasets: [{ data: [2] }] }
      });
    } catch (e) {
      reuseThrew = true;
    }
    A.check('ch-reuse-canvas-no-throw',
      !reuseThrew && reuseChart2 !== null, String(reuseThrew));
    A.check('ch-reuse-destroys-old-instance',
      reuseChart1.canvas === null, '');

    // Review I2：canvas 复用只应该绑一次 wheel 监听器。
    var realOnWheel = DS.charts._onWheel;
    var onWheelCalls = [];
    DS.charts._onWheel = function (chart, ev) {
      onWheelCalls.push(chart);
      return realOnWheel(chart, ev);
    };
    reuseCanvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    DS.charts._onWheel = realOnWheel;
    A.check('ch-reuse-wheel-bound-once',
      onWheelCalls.length === 1 && onWheelCalls[0] === reuseChart2,
      'calls=' + onWheelCalls.length);
    A.check('ch-reuse-toolbar-count-stays-one',
      reuseCanvas.parentNode.querySelectorAll('.ds-chart-toolbar').length === 1,
      'got ' + reuseCanvas.parentNode.querySelectorAll('.ds-chart-toolbar').length);
    DS.charts.resetZoom(reuseChart2);

    // Review C2：全屏模式下 destroy() 必须把 host 的 ds-chart-fullscreen
    // 一并摘掉。这个 class 是工具条 ⛶ 按钮加的，样式是 position:fixed;
    // inset:24px; z-index:150——下面马上 destroy() 会摘掉工具条本身（唯一
    // 的退出入口），如果 class 不清，host 会一直留着这份全屏样式，页面上
    // 留下一块盖住视口、没有任何关闭途径的空白面板，只能刷新页面才能恢复
    // （实测路径：放大看图 → 改筛选条件 → destroy() 重建）。
    reuseCanvas.parentNode.querySelector('[data-act="full"]').click();
    A.check('ch-fullscreen-active-before-destroy',
      reuseCanvas.parentNode.classList.contains('ds-chart-fullscreen') === true, '');

    // I5：destroy() 之后 all() 不应再包含该实例。
    DS.charts.destroy(reuseChart2);
    var stillRegistered = DS.charts.all().indexOf(reuseChart2) !== -1;
    A.check('ch-destroy-removes-from-registry', !stillRegistered, '');

    A.check('ch-destroy-removes-fullscreen-class',
      reuseCanvas.parentNode.classList.contains('ds-chart-fullscreen') === false, '');

    // Review I1：destroy() 之后宿主里不该再剩工具条，滚轮/拖框选也不该再对
    // 已销毁的实例发号施令。
    A.check('ch-destroy-removes-toolbar',
      reuseCanvas.parentNode.querySelectorAll('.ds-chart-toolbar').length === 0, '');
    var destroyedWheelThrew = false, destroyedDragThrew = false;
    try {
      reuseCanvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true }));
    } catch (e) { destroyedWheelThrew = true; }
    try {
      reuseCanvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
      reuseCanvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 0 }));
    } catch (e) { destroyedDragThrew = true; }
    A.check('ch-destroy-wheel-no-throw', !destroyedWheelThrew, '');
    A.check('ch-destroy-drag-no-throw', !destroyedDragThrew, '');

    // "数据变空"这条路径：create() 空数据早退分支同样要清掉上一轮的工具条。
    var scratchHost = document.createElement('div');
    scratchHost.className = 'ds-chart-host';
    var scratchCanvas = document.createElement('canvas');
    scratchHost.appendChild(scratchCanvas);
    document.body.appendChild(scratchHost);
    DS.charts.create(scratchCanvas, {
      type: 'bar', data: { labels: ['甲'], datasets: [{ data: [1] }] }
    });
    A.check('ch-empty-reuse-setup-has-toolbar',
      scratchHost.querySelectorAll('.ds-chart-toolbar').length === 1, '');
    DS.charts.create(scratchCanvas, { type: 'bar', data: { labels: [], datasets: [{ data: [] }] } });
    A.check('ch-empty-reuse-removes-toolbar',
      scratchHost.querySelectorAll('.ds-chart-toolbar').length === 0, '');
    scratchHost.remove();

    // 切回默认标签页：这个套件为了量测 p-comp 里的图表临时切换过去，
    // 不能把这个中间状态遗留给后面的 wheel 套件。
    document.querySelector('[data-panel="p-play"]').click();
  });

  window.DS_SELFTEST_SUITES.push(function wheel(A) {
    // 保险：barChart 的拖框选测试要用 getBoundingClientRect() 取真实像素
    // 坐标，p-play 隐藏时会拿到全零矩形。charts 套件末尾已经切回过一次，
    // 这里独立再确认一次——不依赖"前一个套件有没有记得切回来"这件事。
    document.querySelector('[data-panel="p-play"]').click();
    var c = barChart;

    function fakeWheel(dy, ctrl) {
      var ev = new WheelEvent('wheel', { deltaY: dy, ctrlKey: !!ctrl, cancelable: true });
      c.canvas.dispatchEvent(ev);
      return ev.defaultPrevented;
    }

    // page：任何情况都不拦截，页面照常滚动
    DS.charts.setWheelMode('page');
    DS.charts.resetZoom(c);
    A.check('wh-page-never-prevents', fakeWheel(-100, false) === false, '');
    A.check('wh-page-no-zoom', DS.charts.isZoomed(c) === false, '');

    // zoom：直接缩放
    DS.charts.setWheelMode('zoom');
    DS.charts.resetZoom(c);
    A.check('wh-zoom-prevents', fakeWheel(-100, false) === true, '');
    A.check('wh-zoom-zooms', DS.charts.isZoomed(c) === true, '');

    // ctrl-zoom：不按 Ctrl 放行，按了才缩放
    DS.charts.setWheelMode('ctrl-zoom');
    DS.charts.resetZoom(c);
    A.check('wh-ctrl-without-ctrl-passes', fakeWheel(-100, false) === false, '');
    A.check('wh-ctrl-without-ctrl-no-zoom', DS.charts.isZoomed(c) === false, '');
    A.check('wh-ctrl-with-ctrl-prevents', fakeWheel(-100, true) === true, '');
    A.check('wh-ctrl-with-ctrl-zooms', DS.charts.isZoomed(c) === true, '');

    // smart：未缩放时向外滚应放行（已在下限）
    DS.charts.setWheelMode('smart');
    DS.charts.resetZoom(c);
    A.check('wh-smart-out-at-limit-passes', fakeWheel(100, false) === false, '');
    A.check('wh-smart-in-zooms', fakeWheel(-100, false) === true, '');

    // Review C1（Critical）：向外滚回满量程这条真实用户路径本身必须恢复
    // 放行，不能只靠 resetZoom() 这个独立入口。旧实现 zoom() 向外缩到满
    // 量程时把 $ds.min/max 钳成 b.lo/b.hi 这两个具体数值（非 null），
    // isZoomed() 因此恒为 true；smart 模式判断"是否已到缩放下限、该放行
    // 翻页"正是靠 isZoomed()，一旦卡在恒真，用户向外滚多少次都无法把
    // 滚轮还给页面滚动。这里不调 resetZoom()，完全靠反复向外滚動这条路径
    // 本身把视图滚回满量程。
    DS.charts.resetZoom(c);
    fakeWheel(-100, false);
    fakeWheel(-100, false);
    for (var smartOutI = 0; smartOutI < 25; smartOutI++) fakeWheel(100, false);
    A.check('wh-smart-zoom-out-to-full-range-releases-wheel',
      DS.charts.isZoomed(c) === false && fakeWheel(100, false) === false,
      'isZoomed=' + DS.charts.isZoomed(c) + ' ds=' + JSON.stringify(c.$ds));
    DS.charts.resetZoom(c);

    // 工具条四个按钮都在，且提示文案跟随模式
    var btns = c.canvas.parentNode.querySelectorAll('.ds-chart-btn');
    A.check('wh-toolbar-has-4-buttons', btns.length === 4, 'got ' + btns.length);
    DS.charts.setWheelMode('ctrl-zoom');
    A.check('wh-hint-mentions-ctrl',
      c.canvas.parentNode.querySelector('.ds-chart-hint').textContent.indexOf('Ctrl') >= 0, '');
    DS.charts.setWheelMode('page');
    A.check('wh-hint-empty-in-page-mode',
      c.canvas.parentNode.querySelector('.ds-chart-hint').textContent === '', '');

    // 工具条：放大 / 复位
    DS.charts.setWheelMode('ctrl-zoom');
    DS.charts.resetZoom(c);
    c.canvas.parentNode.querySelector('[data-act="in"]').click();
    A.check('wh-toolbar-in-zooms', DS.charts.isZoomed(c) === true, '');
    var rangeAfterIn = c.$ds.max - c.$ds.min;
    c.canvas.parentNode.querySelector('[data-act="reset"]').click();
    A.check('wh-toolbar-reset-restores', DS.charts.isZoomed(c) === false, '');

    // 工具条：缩小应让范围变宽
    c.canvas.parentNode.querySelector('[data-act="in"]').click();
    c.canvas.parentNode.querySelector('[data-act="out"]').click();
    // Review C1 修复后，"缩小"有可能直接触底到满量程——这种情况下
    // $ds.min/max 会被收回 null（不再停在等于 b.lo/b.hi 的具体数值上，
    // 否则 isZoomed() 会恒为 true，见 charts.js zoom() 的注释），这里不能
    // 对 null 直接做减法（null - null 在 JS 里会被强转成 0，反而会被
    // 误判成"变窄了"）。满量程下的"当前范围宽度"改用 _bounds() 本身的
    // 宽度衡量。
    var rangeAfterOut = DS.charts.isZoomed(c)
      ? c.$ds.max - c.$ds.min
      : (function () { var bb = DS.charts._bounds(c); return bb.hi - bb.lo; })();
    A.check('wh-toolbar-out-widens-range', rangeAfterOut > rangeAfterIn,
      rangeAfterIn + ' -> ' + rangeAfterOut);
    DS.charts.resetZoom(c);

    // 工具条：全屏按钮切换宿主的 fullscreen class
    var host = c.canvas.parentNode;
    // Bug 2（用户报的）：全屏进出后图表尺寸不对。此前只验证了 class 加了又
    // 去了（CSS 层面），没验证 Chart.js 实际画布尺寸真的跟着变——这正是
    // 用户遇到的问题："全屏中图表没跟着放大、退出后尺寸也不对"。canvas.width/
    // height 是 Chart.js 的画布缓冲区像素尺寸，只有真正调用 resize() 才会
    // 变；CSS class 本身不会让它自己变化（这也是这条 bug 存在的原因）。
    var canvasSizeBeforeFullscreen = { w: c.canvas.width, h: c.canvas.height };
    var hostRectDuringFullscreen;
    c.canvas.parentNode.querySelector('[data-act="full"]').click();
    A.check('wh-toolbar-full-toggles-on', host.classList.contains('ds-chart-fullscreen') === true, '');
    hostRectDuringFullscreen = host.getBoundingClientRect();
    // 全屏面板是 position:fixed 的居中面板（遮罩 + 标题栏形态），宿主自己带 padding
    // （顶部留标题栏高度）。canvas 必须贴合宿主的"内容盒"（边框盒减去 padding 与边框）
    // ——这就是 bug 本身：此前 canvas 完全不随 host 变化。
    var hostCsFs = getComputedStyle(host);
    var hostContentW = hostRectDuringFullscreen.width - parseFloat(hostCsFs.paddingLeft) - parseFloat(hostCsFs.paddingRight) -
      parseFloat(hostCsFs.borderLeftWidth) - parseFloat(hostCsFs.borderRightWidth);
    var hostContentH = hostRectDuringFullscreen.height - parseFloat(hostCsFs.paddingTop) - parseFloat(hostCsFs.paddingBottom) -
      parseFloat(hostCsFs.borderTopWidth) - parseFloat(hostCsFs.borderBottomWidth);
    A.check('wh-fullscreen-canvas-tracks-host-size',
      Math.abs(c.canvas.width - hostContentW) < 3 && Math.abs(c.canvas.height - hostContentH) < 3,
      'canvas=' + c.canvas.width + 'x' + c.canvas.height +
        ' hostContent=' + Math.round(hostContentW) + 'x' + Math.round(hostContentH));
    A.check('wh-fullscreen-canvas-size-changes',
      c.canvas.width !== canvasSizeBeforeFullscreen.w || c.canvas.height !== canvasSizeBeforeFullscreen.h,
      'before=' + JSON.stringify(canvasSizeBeforeFullscreen) +
        ' after=' + c.canvas.width + 'x' + c.canvas.height);
    c.canvas.parentNode.querySelector('[data-act="full"]').click();
    A.check('wh-toolbar-full-toggles-off', host.classList.contains('ds-chart-fullscreen') === false, '');
    A.check('wh-fullscreen-canvas-restores-exact',
      c.canvas.width === canvasSizeBeforeFullscreen.w && c.canvas.height === canvasSizeBeforeFullscreen.h,
      'before=' + JSON.stringify(canvasSizeBeforeFullscreen) +
        ' after=' + c.canvas.width + 'x' + c.canvas.height);

    // 饼图等非笛卡尔图不挂工具条
    A.check('wh-pie-no-toolbar',
      pieChart.canvas.parentNode.querySelectorAll('.ds-chart-toolbar').length === 0, '');

    // 按索引区间缩放（zoomRange 本身，供拖框选调用）
    DS.charts.zoomRange(c, 0, 1);
    A.check('wh-zoomrange-applies', c.$ds.max === 1, 'got ' + c.$ds.max);
    DS.charts.resetZoom(c);

    // 拖框选：真实 mousedown/mouseup 两点足够远，应落地为一次缩放
    var rect = c.canvas.getBoundingClientRect();
    function fireMouse(type, clientX) {
      c.canvas.dispatchEvent(new MouseEvent(type, {
        clientX: clientX, clientY: rect.top + rect.height / 2, bubbles: true
      }));
    }
    fireMouse('mousedown', rect.left + rect.width * 0.32);
    fireMouse('mouseup', rect.left + rect.width * 0.62);
    A.check('wh-drag-select-zooms', DS.charts.isZoomed(c) === true, '');
    DS.charts.resetZoom(c);

    // 拖框选过窄（两点几乎重合，<0.5 索引）应被当成误触忽略
    fireMouse('mousedown', rect.left + 2);
    fireMouse('mouseup', rect.left + 2.2);
    A.check('wh-drag-tiny-ignored', DS.charts.isZoomed(c) === false, '');

    // crosshair：Chart.js 内置 index 模式，鼠标不需要精确落在数据点上
    A.check('wh-crosshair-interaction-mode',
      !!c.options.interaction && c.options.interaction.mode === 'index' &&
        c.options.interaction.intersect === false,
      JSON.stringify(c.options.interaction));
    A.check('wh-crosshair-tooltip-mode',
      c.options.plugins.tooltip.mode === 'index' &&
        c.options.plugins.tooltip.intersect === false,
      c.options.plugins.tooltip.mode + '/' + c.options.plugins.tooltip.intersect);

    // Review M1：zoomRange() 自己的"钳位之后过窄则忽略"分支要有真正走到它的用例。
    DS.charts.resetZoom(c);
    DS.charts.zoomRange(c, -5, 0.1);
    A.check('wh-zoomrange-narrow-after-clamp-ignored', DS.charts.isZoomed(c) === false,
      'min=' + c.$ds.min + ' max=' + c.$ds.max);

    // Review M3：工具条"四种模式下都可用"。
    DS.charts.setWheelMode('page');
    DS.charts.resetZoom(c);
    c.canvas.parentNode.querySelector('[data-act="in"]').click();
    A.check('wh-toolbar-works-in-page-mode', DS.charts.isZoomed(c) === true, '');
    c.canvas.parentNode.querySelector('[data-act="reset"]').click();
    A.check('wh-toolbar-reset-works-in-page-mode', DS.charts.isZoomed(c) === false, '');

    // Review M6：setWheelMode() 传未知字符串不该静默落到某个分支的兜底行为。
    DS.charts.setWheelMode('ctrl-zoom');
    var beforeMode = DS.charts.options().wheel;
    var realWarn3 = console.warn, warned3 = false;
    console.warn = function () { warned3 = true; };
    DS.charts.setWheelMode('bogus-mode');
    console.warn = realWarn3;
    A.check('wh-setwheelmode-rejects-unknown',
      DS.charts.options().wheel === beforeMode && warned3 === true,
      'wheel=' + DS.charts.options().wheel + ' warned=' + warned3);

    // Review M5：缩放按钮必须是 type="button"，且要有 aria-label。
    var allBtns = c.canvas.parentNode.querySelectorAll('.ds-chart-btn');
    var allTypeButton = Array.prototype.every.call(allBtns, function (b) { return b.getAttribute('type') === 'button'; });
    var allHaveAriaLabel = Array.prototype.every.call(allBtns, function (b) { return !!b.getAttribute('aria-label'); });
    A.check('wh-toolbar-buttons-type-button', allTypeButton, '');
    A.check('wh-toolbar-buttons-have-aria-label', allHaveAriaLabel, '');

    // Review M2：paint() 不该无条件覆盖调用方自己配置的 interaction/tooltip 模式。
    A.check('wh-pie-default-interaction-untouched',
      !pieChart.options.interaction || pieChart.options.interaction.mode !== 'index',
      JSON.stringify(pieChart.options.interaction));
    var customCanvas = document.createElement('canvas');
    var customHost = document.createElement('div');
    customHost.className = 'ds-chart-host';
    customHost.appendChild(customCanvas);
    document.body.appendChild(customHost);
    var customChart = DS.charts.create(customCanvas, {
      type: 'bar',
      data: { labels: ['甲', '乙'], datasets: [{ data: [1, 2] }] },
      options: { interaction: { mode: 'nearest', intersect: true } }
    });
    A.check('wh-paint-preserves-custom-interaction',
      customChart.options.interaction.mode === 'nearest' && customChart.options.interaction.intersect === true,
      JSON.stringify(customChart.options.interaction));
    DS.charts.destroy(customChart);
    customHost.remove();

    // Review C1（Critical）：横向条形图缩放要作用在类目轴（y），不能硬套 x 轴。
    var hbarXBefore = { min: hbarChart.scales.x.min, max: hbarChart.scales.x.max };
    DS.charts.resetZoom(hbarChart);
    hbarChart.canvas.parentNode.querySelector('[data-act="in"]').click();
    A.check('wh-hbar-zoom-targets-category-axis',
      DS.charts.isZoomed(hbarChart) === true &&
        hbarChart.options.scales.x.min == null && hbarChart.options.scales.x.max == null,
      'x.min=' + hbarChart.options.scales.x.min + ' x.max=' + hbarChart.options.scales.x.max);
    A.check('wh-hbar-value-axis-untouched',
      hbarChart.scales.x.min === hbarXBefore.min && hbarChart.scales.x.max === hbarXBefore.max,
      'before=' + JSON.stringify(hbarXBefore) +
        ' after=' + hbarChart.scales.x.min + '/' + hbarChart.scales.x.max);
    hbarChart.canvas.parentNode.querySelector('[data-act="reset"]').click();
    A.check('wh-hbar-reset-fully-restores', DS.charts.isZoomed(hbarChart) === false, '');

    // Review C1（Critical）：没有类目标签的笛卡尔图按数据域缩放。
    var scatterXBefore = { min: scatterChart.scales.x.min, max: scatterChart.scales.x.max };
    var scatterWidthBefore = scatterXBefore.max - scatterXBefore.min;
    scatterChart.canvas.parentNode.querySelector('[data-act="in"]').click();
    var scatterWidthAfter = scatterChart.scales.x.max - scatterChart.scales.x.min;
    A.check('wh-scatter-zoom-in-shrinks-domain',
      DS.charts.isZoomed(scatterChart) === true &&
        scatterWidthAfter < scatterWidthBefore &&
        scatterWidthAfter > scatterWidthBefore * 0.01 &&
        scatterChart.scales.x.min >= scatterXBefore.min - 1 &&
        scatterChart.scales.x.max <= scatterXBefore.max + 1,
      'before=' + JSON.stringify(scatterXBefore) +
        ' after=' + scatterChart.scales.x.min + '/' + scatterChart.scales.x.max);
    scatterChart.canvas.parentNode.querySelector('[data-act="reset"]').click();
    A.check('wh-scatter-reset-restores-domain',
      DS.charts.isZoomed(scatterChart) === false &&
        Math.abs(scatterChart.scales.x.max - scatterXBefore.max) < 0.01 &&
        Math.abs(scatterChart.scales.x.min - scatterXBefore.min) < 0.01,
      'before=' + JSON.stringify(scatterXBefore) +
        ' after=' + scatterChart.scales.x.min + '/' + scatterChart.scales.x.max);

    DS.charts.setWheelMode('ctrl-zoom');
    DS.charts.resetZoom(c);
  });

  window.DS_SELFTEST_SUITES.push(function isolation(A) {
    // Review Focus #4：两个实例的缩放状态互不影响，没有模块级共享游标。
    var list = DS.charts.all();
    A.check('iso-two-instances', list.length >= 2, 'got ' + list.length);
    // 取两个明确的笛卡尔图（注册表顺序会因重建而变，不能再假设前两项是它们）
    var a = barChart, b = lineChart;
    DS.charts.resetZoom(a); DS.charts.resetZoom(b);
    DS.charts.zoom(a, 2);
    A.check('iso-a-zoomed', DS.charts.isZoomed(a) === true, '');
    A.check('iso-b-untouched', DS.charts.isZoomed(b) === false, '');
    A.check('iso-state-not-shared', a.$ds !== b.$ds, '');
    a.$ds.min = 0.75;
    A.check('iso-mutating-a-does-not-touch-b', b.$ds.min !== 0.75, 'got ' + b.$ds.min);
    DS.charts.resetZoom(a);
  });

  window.DS_SELFTEST_SUITES.push(function svgCharts(A) {
    // 2026-10-23 甘特图重做为 HTML 元素绘制：以下四条按 data-* 契约改写（原来数 <rect>/<text>）。
    var g = document.querySelector('#s-gantt [data-gantt]');
    A.check('svg-gantt-rendered', !!g, '');
    var ganttBarTotal = ganttData.rows.reduce(function (a, r) { return a + r.bars.length; }, 0);
    A.check('svg-gantt-bar-count',
      g.querySelectorAll('[data-gantt-bar]').length === ganttBarTotal && ganttBarTotal > 20,
      'got ' + g.querySelectorAll('[data-gantt-bar]').length + ' vs ' + ganttBarTotal);
    // 第一根条的底色 = 它所在分档的 token 色（分档 = 按 value 落进 thresholds 的第几档）
    var gFirstBar = g.querySelector('[data-gantt-bar]');
    A.check('svg-gantt-uses-token-color',
      getComputedStyle(gFirstBar).backgroundColor === cssRgb(DS.charts.themeColors().seriesExt[+gFirstBar.getAttribute('data-band')]) &&
        gFirstBar.getAttribute('data-band') === String(ganttBandOf(ganttData.rows[0].bars[0].value)),
      'got ' + getComputedStyle(gFirstBar).backgroundColor + ' band ' + gFirstBar.getAttribute('data-band'));

    // 长标签截断：行标签元素的可见文字截断成 ≤11 字并以省略号结尾，title 属性存全称
    var firstLabel = g.querySelector('[data-gantt-label]');
    var firstLabelVisibleText = firstLabel.textContent;
    A.check('svg-gantt-label-truncated',
      firstLabelVisibleText.length <= 11 && firstLabelVisibleText.slice(-1) === '…',
      'got ' + firstLabelVisibleText);
    A.check('svg-gantt-label-title-has-full-text',
      firstLabel.getAttribute('title') === ganttLongLabel,
      'got ' + firstLabel.getAttribute('title'));

    var hm = document.querySelector('#s-heat svg');
    A.check('svg-heatmap-cell-count',
      hm.querySelectorAll('rect').length === 6, 'got ' + hm.querySelectorAll('rect').length);
    A.check('svg-heatmap-color-from-token',
      hm.querySelector('rect').getAttribute('fill') === DS.charts.themeColors().series[0],
      'got ' + hm.querySelector('rect').getAttribute('fill'));

    // 色阶最低档也必须可见：矩阵里有一个数值为 0 的格子。只判 fill-opacity
    // > 0 对"是否可见"没有鉴别力（Review D4：原地板值 0.08，#0072b2 叠在
    // 深色主题背景上合成得 rgb(22,31,39)，跟背景 rgb(24,24,27) 几乎相同，
    // 但 0.08 本身仍然 > 0，断言测不出这个问题）。改成直接算地板不透明度
    // 合成出来的颜色跟背景的真实对比度，深浅两套主题都要过。
    var opacities = Array.prototype.map.call(hm.querySelectorAll('rect'), function (r) {
      return parseFloat(r.getAttribute('fill-opacity'));
    });
    var floorOpacity = Math.min.apply(null, opacities);
    var themeBeforeOpacityCheck = DS.theme.get();
    ['light', 'dark'].forEach(function (themeName) {
      DS.theme.set(themeName);
      var bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-surface').trim();
      var seriesColor = DS.charts.themeColors().series[0];
      var composite = compositeOverBg(seriesColor, bg, floorOpacity);
      var cr = hexContrast(composite, bg);
      A.check('svg-heatmap-min-opacity-visible-' + themeName, cr >= 1.2,
        'opacity=' + floorOpacity + ' composite=' + composite + ' bg=' + bg +
          ' contrast=' + cr.toFixed(3));
    });
    DS.theme.set(themeBeforeOpacityCheck);

    // 复审发现：下面几条断言全部拿渲染结果反推 observedCell 当"地面真值"
    // 去验证偏移公式，这意味着"自适应公式本身算错了"（比如有人把整条公式
    // 换成写死的常量）完全测不出来——用 demo 默认的 3 列矩阵在真实卡片
    // 宽度下 cell 又恰好被钳到上限 72，范围断言 [28,72] 也卡在边界上，
    // 双重失明。这里用两个显式宽度（100px/200px，见 selftestMode 脚手架
    // 里的 #s-heat-w1/#s-heat-w2 探针容器，必须在可视布局里而不是
    // display:none，否则 clientWidth 塌缩成 0 只会命中兜底值 640）各渲一次
    // 同一个无行列标签的 3 列矩阵（labelW=labelH=0，公式简化成
    // floor(宿主宽/cols)），独立算出期望值，两个宽度都落在 [28,72] 内部、
    // 远离钳位边界，确保测的是公式本身而不是钳位分支。
    var probeMatrix = [[1, 2, 3], [4, 5, 6]];
    var w1Host = document.getElementById('s-heat-w1');
    var w2Host = document.getElementById('s-heat-w2');
    DS.svg.heatmap(w1Host, probeMatrix);
    DS.svg.heatmap(w2Host, probeMatrix);
    var padProbe = 2;
    var w1Cell = parseFloat(w1Host.querySelector('rect').getAttribute('width')) + padProbe;
    var w2Cell = parseFloat(w2Host.querySelector('rect').getAttribute('width')) + padProbe;
    var w1Expected = Math.floor(w1Host.clientWidth / 3);
    var w2Expected = Math.floor(w2Host.clientWidth / 3);
    A.check('svg-heatmap-cell-tracks-host-width-formula',
      w1Cell === w1Expected && w2Cell === w2Expected &&
        w1Cell !== w2Cell && w1Cell >= 28 && w1Cell <= 72 && w2Cell >= 28 && w2Cell <= 72,
      'w1=' + w1Cell + ' want ' + w1Expected + '; w2=' + w2Cell + ' want ' + w2Expected);

    // Task 8 新增：DS.svg.heatmap 的 opts.rows/opts.cols 公开参数——行列标签
    // 要渲染出来，且数据格要真的按 labelW/labelH 偏移，不是摆设配置。
    //
    // cell（格子边长）随宿主宽度自适应（见 charts-svg.js），不是写死的
    // 22px，断言不能再硬编码像素坐标——host.clientWidth 不同，cell 就不同，
    // 坐标也会跟着变。但也不能在断言里重新实现一遍"按宿主宽度算 cell"的
    // 自适应公式本身：那样"公式本身算错了"这种 bug 永远测不出来（断言和
    // 实现犯同一个错，自己骗自己）。改用第一个格子的渲染宽度反推出
    // observedCell 这个"地面真值"，再用它去验证偏移公式（labelW/labelH +
    // 行列号*cell + pad/2）是否被正确应用——这样验的是"偏移逻辑对不对"，
    // 不是"自适应公式对不对"。
    var colLabelEls = hm.querySelectorAll('text[text-anchor="middle"]');
    A.check('svg-heatmap-col-labels-rendered',
      colLabelEls.length === 3 && colLabelEls[0].childNodes[0].data === '上午',
      'count=' + colLabelEls.length);
    var allHeatRects = hm.querySelectorAll('rect');
    var firstDataRect = allHeatRects[0];
    var pad = 2;
    var observedCell = parseFloat(firstDataRect.getAttribute('width')) + pad;
    A.check('svg-heatmap-cell-size-in-adaptive-range',
      observedCell >= 28 && observedCell <= 72, 'got ' + observedCell);
    A.check('svg-heatmap-col-label-x-centered',
      colLabelEls[0].getAttribute('x') === String(70 + observedCell / 2),
      'got ' + colLabelEls[0].getAttribute('x') + ' want ' + (70 + observedCell / 2));
    var rowLabelEls = Array.prototype.filter.call(hm.querySelectorAll('text'), function (t) {
      return t.getAttribute('text-anchor') !== 'middle';
    });
    A.check('svg-heatmap-row-labels-rendered',
      rowLabelEls.length === 2 && rowLabelEls[0].childNodes[0].data === DS_MOCK.instruments()[0],
      'count=' + rowLabelEls.length);
    // 第一格（行0列0）的行列号都是 0，乘上 cell 还是 0，偏移公式退化成
    // labelW/labelH + pad/2，测不出"按 cell 伸缩"这部分逻辑——另查一个
    // 不在原点的格子（行1列1，matrix 按行优先顺序排列，第 5 个 <rect>）。
    A.check('svg-heatmap-cell-offset-by-labels',
      firstDataRect.getAttribute('x') === String(70 + pad / 2) &&
        firstDataRect.getAttribute('y') === String(22 + pad / 2),
      'x=' + firstDataRect.getAttribute('x') + ' y=' + firstDataRect.getAttribute('y'));
    var secondRowSecondColRect = allHeatRects[4];
    A.check('svg-heatmap-cell-offset-scales-with-cell-size',
      secondRowSecondColRect.getAttribute('x') === String(70 + 1 * observedCell + pad / 2) &&
        secondRowSecondColRect.getAttribute('y') === String(22 + 1 * observedCell + pad / 2),
      'x=' + secondRowSecondColRect.getAttribute('x') + ' y=' + secondRowSecondColRect.getAttribute('y') +
        ' observedCell=' + observedCell);

    // 主题重绘：(2026-10-22 起深浅序列色已不同值，下面仍保留) 改用两种
    // 有鉴别力的手法：1）栅格线颜色随主题变化；2）先把填充色污染成垃圾值，
    // 切主题后断言它被正确覆盖回当前 token 值。
    var themeBefore = DS.theme.get();
    var gridBefore = getComputedStyle(g.querySelector('[data-gantt-tick]')).borderLeftColor;
    gFirstBar.style.backgroundColor = 'rgb(123, 45, 67)';
    hm.querySelector('rect').setAttribute('fill', 'rgb(9, 9, 9)');
    DS.theme.set(themeBefore === 'dark' ? 'light' : 'dark');

    var gridAfter = getComputedStyle(document.querySelector('#s-gantt [data-gantt-tick]')).borderLeftColor;
    A.check('svg-retheme-grid-color-changes',
      gridBefore !== gridAfter && gridAfter === cssRgb(DS.charts.themeColors().grid), gridBefore + ' -> ' + gridAfter);
    var gBarAfter = document.querySelector('#s-gantt [data-gantt-bar]');
    A.check('svg-gantt-retheme-restores-token-color',
      gBarAfter !== gFirstBar &&
        getComputedStyle(gBarAfter).backgroundColor === cssRgb(DS.charts.themeColors().seriesExt[+gBarAfter.getAttribute('data-band')]),
      'got ' + getComputedStyle(gBarAfter).backgroundColor);
    A.check('svg-heatmap-retheme-restores-token-color',
      document.querySelector('#s-heat svg rect').getAttribute('fill') === DS.charts.themeColors().series[0],
      'got ' + document.querySelector('#s-heat svg rect').getAttribute('fill'));
    DS.theme.set(themeBefore);

    // Task 7 遗留补测：DS.svg 的 registry 重绘时，一个宿主在重绘阶段
    // （不是首次挂载）抛错，不能拖垮其余宿主。两个 guard 分别挂载在 poison
    // 前后——不管遍历方向是正序还是逆序，poison 两侧总有一个排在它"之后"
    // 处理，只要隔离失效就必然有一个会露馅，断言不押在"遍历方向不变"这个
    // 假设上。同一组六条分类序列色深浅主题同值（tokens.css 的设计取舍）——
    // "颜色变了吗"对 guard 一样没有鉴别力，沿用上面刚验证过的套路：先把
    // guard 的填充染成垃圾值，断言它被正确覆盖回当前 token 值，这样只有
    // retheme 真的跑到 guard 身上才会通过。
    var guardHost = document.getElementById('s-iso-guard');
    var guardHost2 = document.getElementById('s-iso-guard2');
    guardHost.querySelector('[data-gantt-bar]').style.backgroundColor = 'rgb(1, 2, 3)';
    guardHost2.querySelector('[data-gantt-bar]').style.backgroundColor = 'rgb(4, 5, 6)';
    var svgRealWarn = console.warn;
    var svgWarnCalls = [];
    console.warn = function () { svgWarnCalls.push(Array.prototype.slice.call(arguments)); };
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
    console.warn = svgRealWarn;
    var guardColorAfter = getComputedStyle(guardHost.querySelector('[data-gantt-bar]')).backgroundColor;
    var guardColorAfter2 = getComputedStyle(guardHost2.querySelector('[data-gantt-bar]')).backgroundColor;
    A.check('svg-retheme-isolates-failing-host',
      guardColorAfter === cssRgb(DS.charts.themeColors().series[0]) && guardColorAfter !== 'rgb(1, 2, 3)' &&
        guardColorAfter2 === cssRgb(DS.charts.themeColors().series[0]) && guardColorAfter2 !== 'rgb(4, 5, 6)',
      'guard=' + guardColorAfter + ' guard2=' + guardColorAfter2);
    // 同一次主题切换里 charts.js 的 poisonChart 也会 console.warn，只断言
    // "调用过至少一次"会被那条不相干的 warn 顶替，即使 DS.svg 自己的
    // try/catch 失效、警告消失也测不出来（变异验证过：删掉 charts-svg.js
    // 里那句 console.warn('DS.svg: ...')，这条原本的写法仍然是绿的）。
    // 改成断言内容确实来自 DS.svg 自己的警告。
    var svgOwnWarn = svgWarnCalls.some(function (args) {
      return String(args[0]).indexOf('DS.svg') === 0;
    });
    A.check('svg-retheme-warns-on-host-failure', svgOwnWarn,
      'got ' + JSON.stringify(svgWarnCalls.map(function (a) { return String(a[0]); })));
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
  });

  /* ---------- Task 8 新增：demo 页本身的断言 ---------- */
  window.DS_SELFTEST_SUITES.push(function demoPage(A) {
    // 滚轮模式选择器在顶栏（DS.seg 分段按钮），不再是侧栏面板里的单选组
    function wheelBtn(mode) { return document.querySelector('.ds-nav #wheel-seg .ds-seg-btn[data-value="' + mode + '"]'); }
    var wheelBtns = Array.prototype.slice.call(document.querySelectorAll('.ds-nav #wheel-seg .ds-seg-btn'));
    A.check('demo-four-wheel-options',
      wheelBtns.length === 4 && wheelBtns.map(function (b) { return b.textContent; }).join() === 'ctrl-zoom,page,zoom,smart' &&
        document.querySelectorAll('input[name=wheel]').length === 0, wheelBtns.map(function (b) { return b.textContent; }).join());
    A.check('demo-default-is-ctrl-zoom',
      !!wheelBtn('ctrl-zoom') && wheelBtn('ctrl-zoom').getAttribute('aria-pressed') === 'true' &&
        document.querySelectorAll('.ds-nav #wheel-seg [aria-pressed="true"]').length === 1 && DS.charts.options().wheel === 'ctrl-zoom', '');

    // 选择器切换必须立刻改变所有已存在实例的行为，无需重建图表。非笛卡尔
    // 图（c-pie）没有 $ds，不该被这条断言误判。
    //
    // 用带 ctrlKey 的滚轮事件，而不是不带 ctrl 的——默认的 ctrl-zoom 模式
    // 对"不按 Ctrl 的滚轮"本来就不拦截，如果选择器切换其实完全没生效，
    // 这条断言也会误判为通过（变异验证过：让 setWheelMode() 整体失效，
    // 不带 ctrl 的写法仍然是绿的）。page 模式必须连按住 Ctrl 的滚轮也放行，
    // 这才是和出厂默认 ctrl-zoom 真正二选一的行为。
    wheelBtn('page').click();
    var ev = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true });
    barChart.canvas.dispatchEvent(ev);
    A.check('demo-selector-takes-effect-live', ev.defaultPrevented === false, '');
    A.check('demo-selector-applies-to-all',
      DS.charts.all().every(function (c) { return !c.$ds || c.$ds.mode === 'page'; }), '');

    wheelBtn('ctrl-zoom').click();
    DS.charts.resetZoom(barChart);

    A.check('demo-two-live-charts', barChart !== null && lineChart !== null, '');
    (function () {
      var box = document.getElementById('chk-line-empty');
      box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
      var shown = lineChart === null && !!document.querySelector('#c-line') && !!document.getElementById('c-line').parentNode.querySelector('.ds-chart-empty');
      box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true }));
      A.check('demo-empty-state-shown', shown && !!lineChart, '');
    })();
    A.check('demo-table-rows', document.querySelectorAll('#t-detail tbody tr').length === 8,
      'got ' + document.querySelectorAll('#t-detail tbody tr').length);
    A.check('demo-gantt-drawn', !!document.querySelector('#s-gantt [data-gantt] [data-gantt-bar]'), '');
    A.check('demo-heatmap-drawn', !!document.querySelector('#s-heat svg'), '');
    A.check('demo-sidebar-present-with-six-items',
      document.querySelectorAll('#side .ds-side-item').length === 6 && document.querySelectorAll('#nav-tabs').length === 0 &&
        !document.getElementById('g-interact'), '');

    // Review A2：?theme= 只用于本次会话展示（demo 页截图/视觉验收），
    // 绝不能写入 localStorage——否则分享一条带 ?theme=dark 的链接，访客
    // 打开过一次之后，往后不带参数访问也会被永久锁在深色。
    // themeOverrideStorageSnapshot 是覆盖代码跑完那一刻、早于任何 selftest
    // 套件自己调用 DS.theme.set() 之前取的快照，不会被本套件前面那些
    // 主题切换断言污染。
    A.check('demo-theme-override-does-not-persist',
      (themeOverride !== 'dark' && themeOverride !== 'light') ||
        themeOverrideStorageSnapshot !== themeOverride,
      'override=' + themeOverride + ' storageAtLoad=' + themeOverrideStorageSnapshot);
  });

  /* ---------- 补四种报表主力图表：双轴组合图 / 堆叠柱状图 / 面积图 /
     时间轴（模拟）。实例活在"组件全览"（p-comp），默认 hidden，跟
     longChart/hbarChart 等同病相怜——读 ticks/像素坐标前必须先切到 p-comp
     并 resize()，否则零尺寸画布量不出真实刻度。 ---------- */
  window.DS_SELFTEST_SUITES.push(function reportCharts(A) {
    document.querySelector('[data-panel="p-comp"]').click();
    [comboChart, stackedChart, areaChart, timeaxisChart].forEach(function (c) {
      // 同上一个套件：c.resize() 顺带重新判一次要不要给工具条让出顶部
      // 空间。stackedChart 的三项图例正是"按需留白"这条规则要保护的真实
      // 场景——创建时宿主隐藏判定过"不需要"，这次 resize() 第一次给它真实
      // 尺寸，同一次调用里就补上了。
      if (c) { c.resize(); c.update('none'); }
    });

    // ---------------- 双轴组合图 ----------------
    A.check('ch-combo-created', comboChart !== null, '');

    var themeNowCombo = DS.charts.themeColors();
    var y1ColorsCombo = scaleColors(comboChart, 'y1');
    A.check('ch-combo-y1-colors-injected',
      y1ColorsCombo.grid === themeNowCombo.grid && y1ColorsCombo.ticks === themeNowCombo.text &&
        y1ColorsCombo.border === themeNowCombo.axis,
      'got ' + JSON.stringify(y1ColorsCombo) + ' want ' + JSON.stringify(themeNowCombo));

    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
    var y1ColorsComboAfter = scaleColors(comboChart, 'y1');
    var themeAfterCombo = DS.charts.themeColors();
    A.check('ch-combo-y1-colors-track-theme',
      y1ColorsComboAfter.grid === themeAfterCombo.grid && y1ColorsComboAfter.grid !== y1ColorsCombo.grid &&
        y1ColorsComboAfter.ticks === themeAfterCombo.text && y1ColorsComboAfter.border === themeAfterCombo.axis,
      'before=' + JSON.stringify(y1ColorsCombo) + ' after=' + JSON.stringify(y1ColorsComboAfter));
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');

    // Bug：双轴组合图常见的两套网格线叠在一起是视觉噪音。默认只让主轴
    // （y）画网格，副轴（y1）关掉。
    A.check('ch-combo-y1-grid-hidden-by-default',
      comboChart.options.scales.y1.grid.drawOnChartArea === false,
      'got ' + comboChart.options.scales.y1.grid.drawOnChartArea);
    A.check('ch-combo-primary-grid-not-hidden',
      comboChart.options.scales.y.grid.drawOnChartArea !== false,
      'got ' + comboChart.options.scales.y.grid.drawOnChartArea);

    // 调用方显式配置过 grid.drawOnChartArea 的话，paint() 不该强行覆盖成
    // false——"没传才补默认值"，不是"总是补"。
    var scratchHostOverride = document.createElement('div');
    scratchHostOverride.className = 'ds-chart-host';
    var scratchCanvasOverride = document.createElement('canvas');
    scratchHostOverride.appendChild(scratchCanvasOverride);
    document.body.appendChild(scratchHostOverride);
    var overrideChart = DS.charts.create(scratchCanvasOverride, {
      type: 'bar',
      data: {
        labels: ['一'],
        datasets: [
          { label: 'A', data: [1], yAxisID: 'y' },
          { label: 'B', type: 'line', data: [2], yAxisID: 'y1' }
        ]
      },
      options: { scales: { y1: { position: 'right', grid: { drawOnChartArea: true } } } }
    });
    A.check('ch-combo-secondary-grid-respects-explicit-override',
      overrideChart.options.scales.y1.grid.drawOnChartArea === true,
      'got ' + overrideChart.options.scales.y1.grid.drawOnChartArea);
    DS.charts.destroy(overrideChart);
    scratchHostOverride.remove();

    // 类目轴上调用方自己提供的 ticks.callback 不该被默认的长标签截断逻辑
    // 冲掉——这正是时间轴退化方案（DS.charts.dateTicks()）能工作的前提。
    var scratchHostTicks = document.createElement('div');
    scratchHostTicks.className = 'ds-chart-host';
    var scratchCanvasTicks = document.createElement('canvas');
    scratchHostTicks.appendChild(scratchCanvasTicks);
    document.body.appendChild(scratchHostTicks);
    var customTickChart = DS.charts.create(scratchCanvasTicks, {
      type: 'bar',
      data: { labels: ['一', '二'], datasets: [{ label: 'A', data: [1, 2] }] },
      options: { scales: { x: { ticks: { callback: function () { return 'CUSTOM-MARK'; } } } } }
    });
    A.check('ch-category-custom-ticks-callback-preserved',
      customTickChart.options.scales.x.ticks.callback() === 'CUSTOM-MARK', '');
    DS.charts.destroy(customTickChart);
    scratchHostTicks.remove();

    // ---------------- __dsAutoBg/__dsAutoBorder（复审核心 bug）----------------
    // 此前背景色/边框色共用同一个 __dsAuto 标志：调用方只给 borderColor、
    // 不给 backgroundColor（折线图最常见的自定义写法之一）时，背景色分支
    // 按"没给"自动上色并把共享标志置真，边框分支的 `|| d.__dsAuto` 条件
    // 连带命中，把调用方刚设好的颜色当场覆盖掉。四个数据集覆盖全部组合：
    // 都不给 / 只给 border / 只给 bg（对称的潜伏 bug：bg 保留但 border
    // 这侧此前永远不会在 retheme 时更新）/ 两个都给。
    (function () {
      var colorScratchHost = document.createElement('div');
      colorScratchHost.className = 'ds-chart-host';
      var colorScratchCanvas = document.createElement('canvas');
      colorScratchHost.appendChild(colorScratchCanvas);
      document.body.appendChild(colorScratchHost);

      var colorChart = DS.charts.create(colorScratchCanvas, {
        type: 'bar',
        data: {
          labels: ['一'],
          datasets: [
            { label: '都不给', data: [1] },
            { label: '只给border', data: [2], borderColor: 'magenta' },
            { label: '只给bg', data: [3], backgroundColor: 'cyan' },
            { label: '都给', data: [4], backgroundColor: 'cyan', borderColor: 'magenta' }
          ]
        }
      });
      var themeAtCreate = DS.charts.themeColors();
      var cds = colorChart.data.datasets;

      A.check('ch-dataset-colors-both-auto-when-omitted',
        cds[0].backgroundColor === themeAtCreate.series[0] && cds[0].borderColor === themeAtCreate.series[0],
        JSON.stringify({ bg: cds[0].backgroundColor, border: cds[0].borderColor }));

      A.check('ch-dataset-colors-border-only-preserves-caller-border',
        cds[1].backgroundColor === themeAtCreate.series[1] && cds[1].borderColor === 'magenta',
        JSON.stringify({ bg: cds[1].backgroundColor, border: cds[1].borderColor }));

      A.check('ch-dataset-colors-bg-only-preserves-caller-bg',
        cds[2].backgroundColor === 'cyan' && cds[2].borderColor === themeAtCreate.series[2],
        JSON.stringify({ bg: cds[2].backgroundColor, border: cds[2].borderColor }));

      A.check('ch-dataset-colors-both-given-preserved',
        cds[3].backgroundColor === 'cyan' && cds[3].borderColor === 'magenta',
        JSON.stringify({ bg: cds[3].backgroundColor, border: cds[3].borderColor }));

      // retheme 之后：自动上色的一侧要跟着"当前主题"重算，调用方显式给的
      // 颜色必须原样不变——这正是对称潜伏 bug（只给 bg 时 border 该跟着
      // retheme 更新）的直接验证。六条序列色深浅主题同值，光比较"retheme
      // 后等不等于当前主题色"对这条潜伏 bug **没有鉴别力**：如果 retheme
      // 根本没碰这个字段，它仍然停在创建时算出来的旧值，而旧值恰好也等于
      // "当前主题"的 series 色（因为两套主题这条序列色本来就同值）——实测
      // 验证过这个坑：先按"直接比较"的写法试过一版，把 __dsAutoBg/
      // __dsAutoBorder 改回合并成一个 __dsAuto 的旧 bug 代码复现一遍，
      // 'bg-only' 这组断言依然全绿。改用 README 决策记录第 20 条同一套
      // 手法：retheme 前把"应该被自动重算"的那个字段污染成哨兵垃圾值，
      // 断言 retheme 之后它被正确覆盖回当前主题色——只有 retheme 真的摸过
      // 这个字段才会通过。
      cds[1].backgroundColor = 'rgb(11, 22, 33)';
      cds[2].borderColor = 'rgb(44, 55, 66)';
      DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
      var themeAfter = DS.charts.themeColors();
      A.check('ch-dataset-colors-border-only-bg-tracks-retheme',
        cds[1].backgroundColor === themeAfter.series[1], 'got ' + cds[1].backgroundColor);
      A.check('ch-dataset-colors-border-only-border-survives-retheme',
        cds[1].borderColor === 'magenta', 'got ' + cds[1].borderColor);
      A.check('ch-dataset-colors-bg-only-border-tracks-retheme',
        cds[2].borderColor === themeAfter.series[2], 'got ' + cds[2].borderColor);
      A.check('ch-dataset-colors-bg-only-bg-survives-retheme',
        cds[2].backgroundColor === 'cyan', 'got ' + cds[2].backgroundColor);
      A.check('ch-dataset-colors-both-given-survive-retheme',
        cds[3].backgroundColor === 'cyan' && cds[3].borderColor === 'magenta', '');
      DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');

      DS.charts.destroy(colorChart);
      colorScratchHost.remove();
    })();

    // 弧形族同病（src/charts.js 里紧邻 __dsAuto 的那两行）：doughnut 数据集
    // 只给 borderColor，backgroundColor 该自动给数组色板，borderColor
    // 原样保留——此前会被覆盖成 --color-surface。
    (function () {
      var arcScratchHost = document.createElement('div');
      arcScratchHost.className = 'ds-chart-host';
      var arcScratchCanvas = document.createElement('canvas');
      arcScratchHost.appendChild(arcScratchCanvas);
      document.body.appendChild(arcScratchHost);
      var arcChart = DS.charts.create(arcScratchCanvas, {
        type: 'doughnut',
        data: { labels: ['a', 'b'], datasets: [{ data: [1, 2], borderColor: 'magenta' }] }
      });
      A.check('ch-arc-dataset-border-only-preserves-caller-border',
        Array.isArray(arcChart.data.datasets[0].backgroundColor) &&
          arcChart.data.datasets[0].borderColor === 'magenta',
        JSON.stringify(arcChart.data.datasets[0]));
      DS.charts.destroy(arcChart);
      arcScratchHost.remove();
    })();

    // ---------------- 堆叠柱状图 ----------------
    A.check('ch-stacked-created', stackedChart !== null, '');

    var themeNowStacked = DS.charts.themeColors();
    A.check('ch-stacked-colors-from-series-tokens',
      stackedChart.data.datasets[0].backgroundColor === themeNowStacked.series[0] &&
        stackedChart.data.datasets[1].backgroundColor === themeNowStacked.series[1] &&
        stackedChart.data.datasets[2].backgroundColor === themeNowStacked.series[2],
      stackedChart.data.datasets.map(function (d) { return d.backgroundColor; }).join(','));

    var stackedLegendItems = (stackedChart.legend && stackedChart.legend.legendItems) || [];
    A.check('ch-stacked-legend-count', stackedLegendItems.length === 3,
      'got ' + stackedLegendItems.length);

    // 线上可见的破损（复审实测）：三项图例的这张堆叠柱，图例第三项"设备C"
    // 曾经被 .ds-chart-toolbar（position:absolute，悬浮在宿主右上角）整个
    // 压住，深浅主题都复现——单项图例的既有图表从没暴露过这个问题。真正
    // 验证"不再被压住"要用两边的真实几何位置比较，不是回读配置回声。
    //
    // 这里不能再用"legend.top 必须不早于工具条下边缘"这种整体粗判断——
    // "按需留白"改版之后，图表是否需要让出顶部空间取决于图例的逐项命中框
    // 是否真的会落进工具条的横向范围，跟当前这块画布具体多宽有关（charts.js
    // 里 legendOverlapsToolbar() 的同一份判断）；画布足够宽时legend 两者
    // 水平方向根本不会碰到，legend.top 留在 Chart.js 默认值（没有额外留白）
    // 也完全正确，用旧的粗判断反而会把"根本不需要留白、也确实没被压住"的
    // 正常状态误判成"失败"。改成跟库内部同一套逐项命中框 vs 工具条包围盒
    // 的矩形相交判断，不管这张图在当前视口宽度下最终有没有被补上留白，只
    // 要图例的任何一项命中框都不落进工具条范围，就是真正"不被遮挡"。
    var stackedToolbarEl = stackedChart.canvas.parentNode.querySelector('.ds-chart-toolbar');
    var stackedToolbarRect = stackedToolbarEl.getBoundingClientRect();
    var stackedCanvasRect = stackedChart.canvas.getBoundingClientRect();
    var stackedToolbarRel = {
      left: stackedToolbarRect.left - stackedCanvasRect.left,
      right: stackedToolbarRect.right - stackedCanvasRect.left,
      top: stackedToolbarRect.top - stackedCanvasRect.top,
      bottom: stackedToolbarRect.bottom - stackedCanvasRect.top
    };
    var stackedOverlappingHitbox = (stackedChart.legend.legendHitBoxes || []).find(function (hb) {
      var hLeft = hb.left, hRight = hb.left + hb.width, hTop = hb.top, hBottom = hb.top + hb.height;
      return hLeft < stackedToolbarRel.right && hRight > stackedToolbarRel.left &&
        hTop < stackedToolbarRel.bottom && hBottom > stackedToolbarRel.top;
    });
    A.check('ch-stacked-legend-not-covered-by-toolbar',
      !stackedOverlappingHitbox,
      'overlapping hitbox=' + JSON.stringify(stackedOverlappingHitbox) +
        ' toolbarRel=' + JSON.stringify(stackedToolbarRel) +
        ' paddingTop=' + (stackedChart.options.layout && stackedChart.options.layout.padding &&
          stackedChart.options.layout.padding.top));

    // 真正验证"堆叠"本身：最上面一段柱子的顶部像素，应该落在"三段累加值"
    // 对应的像素位置，而不是它自己的值单独从 0 起算的位置——这是
    // scales.x/y.stacked:true 真正生效的可观察后果，不是只回读配置echo。
    var stackedCatIndex = 0;
    var stackedCumulative = stackedChart.data.datasets.reduce(function (sum, d) {
      return sum + d.data[stackedCatIndex];
    }, 0);
    var stackedExpectedY = stackedChart.scales.y.getPixelForValue(stackedCumulative);
    var stackedTopMeta = stackedChart.getDatasetMeta(stackedChart.data.datasets.length - 1);
    var stackedActualY = stackedTopMeta.data[stackedCatIndex].y;
    A.check('ch-stacked-bars-cumulative-height',
      Math.abs(stackedActualY - stackedExpectedY) < 2,
      'expected=' + stackedExpectedY + ' actual=' + stackedActualY);

    stackedChart.tooltip.setActiveElements([{ datasetIndex: 1, index: 2 }], { x: 0, y: 0 });
    stackedChart.update('none');
    var stackedDp = stackedChart.tooltip.dataPoints && stackedChart.tooltip.dataPoints[0];
    A.check('ch-stacked-tooltip-shows-segment-value',
      !!stackedDp && stackedDp.raw === stackedRaw[1].data[2],
      'got ' + (stackedDp && stackedDp.raw) + ' want ' + stackedRaw[1].data[2]);
    stackedChart.tooltip.setActiveElements([], { x: 0, y: 0 });
    stackedChart.update('none');

    // 百分比堆叠：Chart.js 无原生支持，这里通过数据归一化实现——切换开关
    // 之后每个月份三段加起来应约等于 100，tooltip 要能还原原始绝对值。
    var percentCheckbox = document.getElementById('chk-stacked-percent');
    percentCheckbox.checked = true;
    percentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    var percentSumsOk = stackedLabels.every(function (_, i) {
      var sum = stackedChart.data.datasets.reduce(function (s, d) { return s + d.data[i]; }, 0);
      return Math.abs(sum - 100) < 0.6;
    });
    A.check('ch-stacked-percent-sums-to-100', percentSumsOk,
      stackedLabels.map(function (_, i) {
        return stackedChart.data.datasets.reduce(function (s, d) { return s + d.data[i]; }, 0);
      }).join(','));

    stackedChart.tooltip.setActiveElements([{ datasetIndex: 1, index: 2 }], { x: 0, y: 0 });
    stackedChart.update('none');
    var percentTipLines = stackedChart.tooltip.body && stackedChart.tooltip.body[0] &&
      stackedChart.tooltip.body[0].lines;
    var percentTipLine = (percentTipLines && percentTipLines[0]) || '';
    A.check('ch-stacked-percent-tooltip-shows-original-value',
      percentTipLine.indexOf('原始值 ' + stackedRaw[1].data[2]) !== -1,
      'got ' + percentTipLine);
    stackedChart.tooltip.setActiveElements([], { x: 0, y: 0 });
    stackedChart.update('none');

    percentCheckbox.checked = false;
    percentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    var restoredOk = stackedChart.data.datasets.every(function (d, di) {
      return d.data.join(',') === stackedRaw[di].data.join(',');
    });
    A.check('ch-stacked-percent-toggle-off-restores-raw', restoredOk,
      stackedChart.data.datasets.map(function (d) { return d.data.join('/'); }).join(' | '));

    // ---------------- 按需留白（修 bug 引入的新隐患）----------------
    // 复审发现：paint() 此前无条件给所有笛卡尔图注入 layout.padding.top=30
    // 来避让工具条，代价是单项图例的普通图表平白损失一截绘图区，
    // .ds-chart-host--compact（90px）配真实数据时绘图区被压到仅剩 1.6px，
    // 事实上不可用——compact 的唯一既有用例（c-empty）走的是空数据早退
    // 分支，paint() 根本没跑到，没暴露。这里用三个不依赖响应式网格实际宽度
    // （不想被视口大小摆布）的独立 scratch 图表直接验证新行为。

    // 1) 单项图例的普通图表：不应该被加留白。
    (function () {
      var host = document.createElement('div');
      host.className = 'ds-chart-host';
      var canvas = document.createElement('canvas');
      host.appendChild(canvas);
      document.body.appendChild(host);
      var chart = DS.charts.create(canvas, {
        type: 'line',
        data: { labels: ['a', 'b', 'c'], datasets: [{ label: 'v', data: [1, 2, 3] }] }
      });
      var paddingTop = (chart.options.layout && chart.options.layout.padding &&
        chart.options.layout.padding.top) || 0;
      A.check('ch-toolbar-pad-single-legend-no-padding', paddingTop === 0,
        'got paddingTop=' + paddingTop);
      DS.charts.destroy(chart);
      host.remove();
    })();

    // 2) compact 容器（90px）配真实数据：不应该被加留白，绘图区必须可用——
    // 这正是本次要修的那个具体破损（复现条件：三项图例 + 90px 矮宿主）。
    // 宽度刻意收窄到 450px（跟下面第 3 个用例同一个已验证会触发真实重叠的
    // 宽度）：如果只用默认宽度，图例横向伸不到工具条所在的列，不管
    // LEGEND_TOOLBAR_MIN_HOST_HEIGHT 这条矮宿主豁免有没有生效，重叠判断
    // 本身都会算出"不重叠"，测不出矮宿主豁免这条规则是否真的在工作
    // （变异验证过：只删掉高度豁免、留着重叠判断，默认宽度下这条断言测
    // 不出区别）。收窄宽度后，不豁免的话重叠判断会判真，断言才有鉴别力。
    (function () {
      var host = document.createElement('div');
      host.className = 'ds-chart-host ds-chart-host--compact';
      host.style.width = '450px';
      var canvas = document.createElement('canvas');
      host.appendChild(canvas);
      document.body.appendChild(host);
      var chart = DS.charts.create(canvas, {
        type: 'bar',
        data: {
          labels: months6,   // 固定 6 个月夹具：这条测的是矮宿主留白规则，不随 demo 的 12 月数据变
          datasets: stackedRaw.map(function (d) { return { label: d.label, data: d.data.slice(0, 6) }; })
        },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } }
      });
      var paddingTop = (chart.options.layout && chart.options.layout.padding &&
        chart.options.layout.padding.top) || 0;
      var chartAreaHeight = chart.chartArea.bottom - chart.chartArea.top;
      A.check('ch-toolbar-pad-compact-no-padding', paddingTop === 0,
        'got paddingTop=' + paddingTop);
      // 90px 宿主，之前无条件 +30px 会把绘图区压到 1.6px（实测复现过，
      // 90 - 图例一行 - x 轴刻度一行 - 30px 留白 几乎吃光）；这里只要求
      // 绘图区明显超过那个坏值（实测修复后约 29.6px），用 20px 做下限——
      // 比"1.6px"远得多、足以抓住"又无条件注入了 30px 留白"这类回归，也
      // 给 Chart.js 版本升级后图例/刻度几像素的正常波动留了余量。
      A.check('ch-toolbar-pad-compact-chart-area-usable', chartAreaHeight >= 20,
        'got chartAreaHeight=' + chartAreaHeight + ' (host 90px)');
      DS.charts.destroy(chart);
      host.remove();
    })();

    // 3) 三项图例的堆叠柱：在足够窄的宿主下（复现条件——c-stacked 本身在
    // 当前视口宽度下不一定窄到会撞上工具条，不能拿它单独验证"修复确实生
    // 效"，必须用固定宽度排除视口影响），工具条必须被正确避让，图例每一
    // 项命中框都不能落进工具条的矩形范围。
    (function () {
      var host = document.createElement('div');
      host.className = 'ds-chart-host';
      host.style.width = '450px';
      var canvas = document.createElement('canvas');
      host.appendChild(canvas);
      document.body.appendChild(host);
      var chart = DS.charts.create(canvas, {
        type: 'bar',
        data: {
          labels: stackedLabels,
          datasets: stackedRaw.map(function (d) { return { label: d.label, data: d.data.slice() }; })
        },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } }
      });
      var toolbarEl = chart.canvas.parentNode.querySelector('.ds-chart-toolbar');
      var toolbarRect = toolbarEl.getBoundingClientRect();
      var canvasRect = chart.canvas.getBoundingClientRect();
      var toolbarRel = {
        left: toolbarRect.left - canvasRect.left, right: toolbarRect.right - canvasRect.left,
        top: toolbarRect.top - canvasRect.top, bottom: toolbarRect.bottom - canvasRect.top
      };
      var overlapping = (chart.legend.legendHitBoxes || []).find(function (hb) {
        var hLeft = hb.left, hRight = hb.left + hb.width, hTop = hb.top, hBottom = hb.top + hb.height;
        return hLeft < toolbarRel.right && hRight > toolbarRel.left &&
          hTop < toolbarRel.bottom && hBottom > toolbarRel.top;
      });
      A.check('ch-toolbar-pad-narrow-stacked-legend-protected', !overlapping,
        'overlapping=' + JSON.stringify(overlapping) + ' toolbarRel=' + JSON.stringify(toolbarRel) +
          ' paddingTop=' + (chart.options.layout && chart.options.layout.padding &&
            chart.options.layout.padding.top));
      DS.charts.destroy(chart);
      host.remove();
    })();

    // 4) 创建时宿主隐藏（clientHeight=0，create() 当时直接判"不需要"留白），
    // 之后变可见并调用原生 chart.resize()——不手动调用
    // DS.charts._fitToolbarLegend()——留白判断应该照样自动补上。这验证的
    // 是 create() 里给 chart.resize 包的那层：不管是调用方自己调
    // resize()，还是 Chart.js 内置 ResizeObserver 自动调用，都应该经过
    // 同一层包装重新判一次（demo 页里"组件全览"标签页下那几张图表能在
    // 真实浏览器里不被压住，靠的就是这层包装，不是手动调用）。
    (function () {
      var hiddenWrap = document.createElement('div');
      hiddenWrap.style.display = 'none';
      document.body.appendChild(hiddenWrap);
      var host = document.createElement('div');
      host.className = 'ds-chart-host';
      host.style.width = '450px';
      var canvas = document.createElement('canvas');
      host.appendChild(canvas);
      hiddenWrap.appendChild(host);
      var chart = DS.charts.create(canvas, {
        type: 'bar',
        data: {
          labels: stackedLabels,
          datasets: stackedRaw.map(function (d) { return { label: d.label, data: d.data.slice() }; })
        },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } }
      });
      var paddingWhileHidden = (chart.options.layout && chart.options.layout.padding &&
        chart.options.layout.padding.top) || 0;
      hiddenWrap.style.display = '';
      chart.resize(); // 不手动调 DS.charts._fitToolbarLegend()
      var toolbarEl = chart.canvas.parentNode.querySelector('.ds-chart-toolbar');
      var toolbarRect = toolbarEl.getBoundingClientRect();
      var canvasRect = chart.canvas.getBoundingClientRect();
      var toolbarRel = {
        left: toolbarRect.left - canvasRect.left, right: toolbarRect.right - canvasRect.left,
        top: toolbarRect.top - canvasRect.top, bottom: toolbarRect.bottom - canvasRect.top
      };
      var overlappingAfterReveal = (chart.legend.legendHitBoxes || []).find(function (hb) {
        var hLeft = hb.left, hRight = hb.left + hb.width, hTop = hb.top, hBottom = hb.top + hb.height;
        return hLeft < toolbarRel.right && hRight > toolbarRel.left &&
          hTop < toolbarRel.bottom && hBottom > toolbarRel.top;
      });
      A.check('ch-toolbar-pad-resize-wrapper-auto-refits', paddingWhileHidden === 0 && !overlappingAfterReveal,
        'paddingWhileHidden=' + paddingWhileHidden + ' overlappingAfterReveal=' + JSON.stringify(overlappingAfterReveal));
      DS.charts.destroy(chart);
      hiddenWrap.remove();
    })();

    // ---------------- 面积图 ----------------
    A.check('ch-area-created', areaChart !== null, '');

    var areaBg0 = areaChart.data.datasets[0].backgroundColor;
    var areaBorder0 = areaChart.data.datasets[0].borderColor;
    var areaRgba0 = parseRgba(areaBg0);
    A.check('ch-area-fill-translucent',
      !!areaRgba0 && areaRgba0.a > 0 && areaRgba0.a < 1, 'got ' + areaBg0);

    var areaBorderRgb0 = hexToRgbComponents(areaBorder0);
    A.check('ch-area-fill-rgb-matches-border',
      !!areaRgba0 && areaRgba0.r === areaBorderRgb0.r && areaRgba0.g === areaBorderRgb0.g &&
        areaRgba0.b === areaBorderRgb0.b,
      'fill=' + JSON.stringify(areaRgba0) + ' border=' + JSON.stringify(areaBorderRgb0));

    // 第三个数据集（目标线）没有 fill，backgroundColor 该保持不透明——跟
    // 普通折线图此前的行为一致，不该被面积图的半透明分支连带影响。
    var areaPlainBg = areaChart.data.datasets[2].backgroundColor;
    A.check('ch-area-plain-dataset-stays-opaque',
      /^#[0-9a-f]{6}$/i.test(areaPlainBg) && parseRgba(areaPlainBg) === null,
      'got ' + areaPlainBg);

    // 复审发现：fill 的对象写法 {target, above, below}（Chart.js 官方支持，
    // 分别给填充区域上下两侧配不同颜色）没有被 isFilledLine 识别，这种写法
    // 下 backgroundColor 此前仍是不透明色——正是这批要消灭的"实心色块互相
    // 遮挡"问题本身。
    var fillObjectHost = document.createElement('div');
    fillObjectHost.className = 'ds-chart-host';
    var fillObjectCanvas = document.createElement('canvas');
    fillObjectHost.appendChild(fillObjectCanvas);
    document.body.appendChild(fillObjectHost);
    var fillObjectChart = DS.charts.create(fillObjectCanvas, {
      type: 'line',
      data: {
        labels: ['一', '二'],
        datasets: [{ label: 'X', data: [1, 2], fill: { target: 'origin' } }]
      }
    });
    var fillObjectBg = parseRgba(fillObjectChart.data.datasets[0].backgroundColor);
    A.check('ch-area-fill-object-form-recognized',
      !!fillObjectBg && fillObjectBg.a > 0 && fillObjectBg.a < 1,
      'got ' + fillObjectChart.data.datasets[0].backgroundColor);
    DS.charts.destroy(fillObjectChart);
    fillObjectHost.remove();

    // 复审发现：hexToRgba() 硬假设 token 是十六进制；README 明确鼓励使用者
    // 替换整套色板，换成 rgb()/hsl() 这类非十六进制格式时，此前会静默产出
    // 一条带 NaN 的非法 rgba() 字符串（浏览器判这条属性整体无效，填充直接
    // 画不出来，不抛错不告警）。覆盖 --chart-s1 成非十六进制值，验证现在
    // 会退回调用方给的颜色字符串本身（不透明，牺牲半透明效果但图形还在），
    // 而不是产出带 NaN 的垃圾值。用完立刻把覆盖去掉，不能让它泄漏给后面
    // 任何依赖 --chart-s1 真实色值的断言（包括这个套件稍后可能触发的
    // retheme）。
    document.documentElement.style.setProperty('--chart-s1', 'rgb(1, 2, 3)');
    var nonHexHost = document.createElement('div');
    nonHexHost.className = 'ds-chart-host';
    var nonHexCanvas = document.createElement('canvas');
    nonHexHost.appendChild(nonHexCanvas);
    document.body.appendChild(nonHexHost);
    var nonHexChart = DS.charts.create(nonHexCanvas, {
      type: 'line',
      data: { labels: ['一', '二'], datasets: [{ label: 'X', data: [1, 2], fill: true }] }
    });
    var nonHexBg = nonHexChart.data.datasets[0].backgroundColor;
    A.check('ch-area-fallback-on-nonhex-token',
      nonHexBg === 'rgb(1, 2, 3)' && nonHexBg.indexOf('NaN') === -1,
      'got ' + nonHexBg);
    document.documentElement.style.removeProperty('--chart-s1');
    DS.charts.destroy(nonHexChart);
    nonHexHost.remove();

    // 半透明填充在深浅两套主题下都要跟背景有可感知的对比度（WCAG 相对亮度
    // 公式，跟热力图 svg-heatmap-min-opacity-visible-* 用的是同一套），
    // 不是只判 alpha > 0——那对"是否肉眼可见"没有鉴别力。
    //
    // 复审发现：上一版只采样 datasets[0]（s1 蓝）一条颜色，而 s1 恰好是
    // 浅色主题下对比度第二好的一条——用它单独代表"六条序列色都够用"对
    // s5 黄这类偏亮的颜色完全没有鉴别力（变异验证过：把 alpha 调回 0.22
    // 甚至 0.18，这条断言照样全绿，因为被测的从来不是最差的那条颜色）。
    // 改成遍历 DS.charts.themeColors().series 全部六条，各自合成后取对比度
    // 最小值——alpha 从真实渲染出来的 areaChart.data.datasets[0].backgroundColor
    // 里读（不在测试里重新硬编一份 AREA_FILL_ALPHA 的数字，src/charts.js
    // 改了这个值的话测试自动跟着用新值，不会出现"测试和实现各算各的、
    // 两边恰好对不上也测不出来"的情况）。
    var themeBeforeAreaContrast = DS.theme.get();
    ['light', 'dark'].forEach(function (themeName) {
      DS.theme.set(themeName);
      var bg = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();
      var fillRgba = parseRgba(areaChart.data.datasets[0].backgroundColor);
      var seriesColors = DS.charts.themeColors().series;
      var perColorContrast = seriesColors.map(function (hex) {
        var compositeHex = compositeOverBg(hex, bg, fillRgba.a);
        return hexContrast(compositeHex, bg);
      });
      var minContrast = Math.min.apply(null, perColorContrast);
      A.check('ch-area-fill-visible-contrast-' + themeName, minContrast >= 1.2,
        'alpha=' + fillRgba.a + ' minContrast=' + minContrast.toFixed(3) +
          ' perColor=' + perColorContrast.map(function (v) { return v.toFixed(3); }).join(',') + ' bg=' + bg);
    });
    DS.theme.set(themeBeforeAreaContrast);

    // 2026-10-22 色板重做后深浅两套十色各自取值、逐位不同。这条锁住"主题切换
    // 真的换了序列色"：之前深浅同值时，所有"颜色变了吗"类断言恒真/恒假，
    // 现在要显式确认前提成立，否则下面依赖主题差异的断言会悄悄失去鉴别力。
    var lightExt, darkExt;
    DS.theme.set('light'); lightExt = DS.charts.themeColors().seriesExt.slice();
    DS.theme.set('dark'); darkExt = DS.charts.themeColors().seriesExt.slice();
    DS.theme.set(themeBeforeAreaContrast);
    A.check('ch-series-ext-differ-between-themes',
      lightExt.length === 10 && darkExt.length === 10 &&
        lightExt.every(function (c, i) { return c !== darkExt[i]; }),
      'light=' + lightExt.join(',') + ' dark=' + darkExt.join(','));

    // ---------------- 时间轴（模拟） ----------------
    A.check('ch-timeaxis-created', timeaxisChart !== null, '');

    var timeaxisTickLabels = timeaxisChart.scales.x.ticks.map(function (t) { return String(t.label); });
    var timeaxisTicksFormatted = timeaxisTickLabels.length > 0 &&
      timeaxisTickLabels.every(function (s) { return /^\d{1,2}\/\d{1,2}$/.test(s); });
    A.check('ch-timeaxis-ticks-formatted', timeaxisTicksFormatted,
      'got ' + timeaxisTickLabels.join(','));

    // 复审线上实测过的破损：不钉 min/max 时第一个刻度会落在数据起点之前，
    // 数据点少的时候刻度还会连续重复同一天。读 Chart.js 真实算出来的刻度
    // 值（而不是重新实现一遍"应该长什么样"），核对每个刻度的时间戳都落在
    // 数据域 [timeaxisDates[0], timeaxisDates[末尾]] 以内，且格式化后的标签
    // 字符串两两不重复。
    var timeaxisDataMin = timeaxisDates[0];
    var timeaxisDataMax = timeaxisDates[timeaxisDates.length - 1];
    var timeaxisTickValues = timeaxisChart.scales.x.ticks.map(function (t) { return t.value; });
    var timeaxisTicksWithinRange = timeaxisTickValues.length > 0 &&
      timeaxisTickValues.every(function (v) { return v >= timeaxisDataMin && v <= timeaxisDataMax; });
    A.check('ch-timeaxis-ticks-within-data-range', timeaxisTicksWithinRange,
      'dataRange=[' + timeaxisDataMin + ',' + timeaxisDataMax + '] got ' + timeaxisTickValues.join(','));

    var timeaxisUniqueLabels = {};
    timeaxisTickLabels.forEach(function (l) { timeaxisUniqueLabels[l] = true; });
    A.check('ch-timeaxis-ticks-no-duplicate-labels',
      Object.keys(timeaxisUniqueLabels).length === timeaxisTickLabels.length,
      'got ' + timeaxisTickLabels.join(','));

    var timeaxisBefore = { min: timeaxisChart.scales.x.min, max: timeaxisChart.scales.x.max };
    timeaxisChart.canvas.parentNode.querySelector('[data-act="in"]').click();
    var timeaxisAfterWidth = timeaxisChart.scales.x.max - timeaxisChart.scales.x.min;
    A.check('ch-timeaxis-zoom-works-on-data-domain',
      DS.charts.isZoomed(timeaxisChart) === true &&
        timeaxisAfterWidth < (timeaxisBefore.max - timeaxisBefore.min),
      'before=' + JSON.stringify(timeaxisBefore) + ' afterWidth=' + timeaxisAfterWidth);
    timeaxisChart.canvas.parentNode.querySelector('[data-act="reset"]').click();

    // dateTicks() 本身是个无状态纯函数，不需要真实图表就能单独核验两种格式。
    // 固定用 UTC 时间戳，断言产出的字符串不随渲染机器本地时区变化。
    var mdFn = DS.charts.dateTicks('md');
    A.check('ch-datetics-md-format',
      mdFn(Date.UTC(2024, 0, 5)) === '1/5', 'got ' + mdFn(Date.UTC(2024, 0, 5)));
    var ymdFn = DS.charts.dateTicks('ymd');
    A.check('ch-datetics-ymd-format',
      ymdFn(Date.UTC(2024, 11, 31)) === '2024-12-31', 'got ' + ymdFn(Date.UTC(2024, 11, 31)));

    // ---------------- 幽灵轴（复审发现的既有问题）----------------
    // 全部数据集都把 yAxisID 指到 'y1'（双轴图里只要一根竖轴的常见写法），
    // 不该凭空造出一根没人用的 'y' 轴——这根幽灵轴会被 Chart.js 真的实例化
    // 并绘制，量程退化成默认的 0..1，且会被当成"主轴"画网格线（不吃额外轴
    // 的 drawOnChartArea 默认规则），比没有这根轴更容易误导人。
    var ghostAxisHost = document.createElement('div');
    ghostAxisHost.className = 'ds-chart-host';
    var ghostAxisCanvas = document.createElement('canvas');
    ghostAxisHost.appendChild(ghostAxisCanvas);
    document.body.appendChild(ghostAxisHost);
    var ghostAxisChart = DS.charts.create(ghostAxisCanvas, {
      type: 'line',
      data: {
        labels: ['一', '二'],
        datasets: [{ label: 'X', data: [1, 2], yAxisID: 'y1' }]
      },
      options: { scales: { y1: { position: 'right' } } }
    });
    A.check('ch-no-ghost-y-axis-when-only-y1-used',
      !ghostAxisChart.scales.y && !ghostAxisChart.options.scales.y,
      'scales keys: ' + Object.keys(ghostAxisChart.options.scales).join(','));
    A.check('ch-ghost-axis-case-y1-still-themed',
      ghostAxisChart.options.scales.y1.grid.color === DS.charts.themeColors().grid, '');
    DS.charts.destroy(ghostAxisChart);
    ghostAxisHost.remove();

    // 反例：调用方自己显式声明过的轴（哪怕没有 dataset 引用）要保留，不能
    // 被这条"没人用就不创建"的规则反过来误伤——这是调用方故意要一条纯装饰
    // 轴线的合法用法。
    var explicitAxisHost = document.createElement('div');
    explicitAxisHost.className = 'ds-chart-host';
    var explicitAxisCanvas = document.createElement('canvas');
    explicitAxisHost.appendChild(explicitAxisCanvas);
    document.body.appendChild(explicitAxisHost);
    var explicitAxisChart = DS.charts.create(explicitAxisCanvas, {
      type: 'line',
      data: {
        labels: ['一', '二'],
        datasets: [{ label: 'X', data: [1, 2], yAxisID: 'y1' }]
      },
      options: { scales: { y: { display: false }, y1: { position: 'right' } } }
    });
    A.check('ch-explicit-unused-axis-not-deleted',
      !!explicitAxisChart.options.scales.y, 'got ' + JSON.stringify(explicitAxisChart.options.scales.y));
    DS.charts.destroy(explicitAxisChart);
    explicitAxisHost.remove();

    // ---------------- 雷达图 / 极区图的 'r' 轴主题注入（既有问题）----------------
    // 此前 paint() 对非笛卡尔图整个跳过，radar/polarArea 共用的
    // RadialLinearScale（默认轴名 'r'）从来没拿到过主题色：深色主题下网格/
    // 角线仍是 Chart.js 默认的浅色、刻度文字默认深灰、刻度数字背后还有一块
    // 默认半透明白底，在深色 surface 上都很突兀。
    var radarHost = document.createElement('div');
    radarHost.className = 'ds-chart-host';
    var radarCanvas = document.createElement('canvas');
    radarHost.appendChild(radarCanvas);
    document.body.appendChild(radarHost);
    var radarChart = DS.charts.create(radarCanvas, {
      type: 'radar',
      data: {
        labels: ['速度', '稳定性', '准确率'],
        datasets: [{ label: '仪器甲', data: [8, 6, 9] }]
      }
    });
    var radarThemeNow = DS.charts.themeColors();
    var rScale = radarChart.options.scales.r;
    A.check('ch-radar-r-grid-themed', rScale.grid.color === radarThemeNow.grid, 'got ' + rScale.grid.color);
    A.check('ch-radar-r-angle-lines-themed',
      rScale.angleLines.color === radarThemeNow.grid, 'got ' + rScale.angleLines.color);
    A.check('ch-radar-r-point-labels-themed',
      rScale.pointLabels.color === radarThemeNow.text, 'got ' + rScale.pointLabels.color);
    A.check('ch-radar-r-ticks-themed', rScale.ticks.color === radarThemeNow.text, 'got ' + rScale.ticks.color);
    A.check('ch-radar-r-ticks-backdrop-transparent',
      rScale.ticks.backdropColor === 'transparent', 'got ' + rScale.ticks.backdropColor);

    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
    var radarThemeAfter = DS.charts.themeColors();
    A.check('ch-radar-r-grid-tracks-theme',
      radarChart.options.scales.r.grid.color === radarThemeAfter.grid &&
        radarChart.options.scales.r.grid.color !== rScale.grid.color,
      'before=' + rScale.grid.color + ' after=' + radarChart.options.scales.r.grid.color);
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');

    // polarArea 同样用 'r' 轴，且同时是 isArc() 成员（扇区按数据点数组着色）
    // ——两条路径要同时生效，不能因为被归到 arc 就又跳过 r 轴注入。
    var polarHost = document.createElement('div');
    polarHost.className = 'ds-chart-host';
    var polarCanvas = document.createElement('canvas');
    polarHost.appendChild(polarCanvas);
    document.body.appendChild(polarHost);
    var polarChart = DS.charts.create(polarCanvas, {
      type: 'polarArea',
      data: { labels: ['甲', '乙', '丙'], datasets: [{ data: [3, 5, 2] }] }
    });
    A.check('ch-polararea-r-grid-themed',
      polarChart.options.scales.r.grid.color === DS.charts.themeColors().grid, '');
    A.check('ch-polararea-still-gets-arc-colors',
      Array.isArray(polarChart.data.datasets[0].backgroundColor) &&
        polarChart.data.datasets[0].backgroundColor.length === 3, '');
    DS.charts.destroy(radarChart);
    DS.charts.destroy(polarChart);
    radarHost.remove();
    polarHost.remove();

    // ---------------- 桑基图（Sankey，第四类非笛卡尔图）----------------
    // 真实演示卡片："组件全览"里那张，DS_MOCK.sankeyFlows() 固定给出两层
    // 4 仪器 + 25 项目 = 29 个节点、49 条流向记录（每个项目对应 1–4 台仪器）；
    // 默认只显示流量前 20 个项目，榜外 5 个项目共 6 条流向，所以画出来的是
    // 4 + 20 = 24 个节点、49 - 6 = 43 条流向。
    var sankeyChart = sankeyComp.chart();
    A.check('ch-sankey-demo-card-created', sankeyChart !== null, '');
    A.check('ch-sankey-demo-universe-49-flows-29-nodes',
      sankeyUniverse.length === 49 &&
        Object.keys(DS.charts._sankeyNodeLayers(sankeyUniverse)).length === 29,
      'flows=' + sankeyUniverse.length);
    var sankeyDemoMeta = sankeyChart.getDatasetMeta(0);
    A.check('ch-sankey-demo-card-flow-count', sankeyDemoMeta.data.length === 43,
      'got ' + sankeyDemoMeta.data.length);
    A.check('ch-sankey-demo-card-node-count',
      !!sankeyDemoMeta.controller._nodes && sankeyDemoMeta.controller._nodes.size === 24,
      'got ' + (sankeyDemoMeta.controller._nodes && sankeyDemoMeta.controller._nodes.size));

    // 源端 4 个节点两两不撞色：真实卡片里 idx0（一号仪器→项目01）与 idx1
    // （二号仪器→项目01）是两个不同的源端节点。变异验证见报告。
    var sankeyDemoDs = sankeyChart.data.datasets[0];
    A.check('ch-sankey-same-layer-nodes-distinct-colors',
      sankeyDemoDs.colorFrom({ dataset: sankeyDemoDs, dataIndex: 0 }) !==
        sankeyDemoDs.colorFrom({ dataset: sankeyDemoDs, dataIndex: 1 }),
      'A(idx0)=' + sankeyDemoDs.colorFrom({ dataset: sankeyDemoDs, dataIndex: 0 }) +
        ' B(idx1)=' + sankeyDemoDs.colorFrom({ dataset: sankeyDemoDs, dataIndex: 1 }));

    // 独立小样本：节点数精确等于序列色数量（6 个），colorFrom/colorTo 的
    // 返回值可以逐一核对具体取值，不是"随便挑一个比较"。直接调用 paint()
    // 装配出来的 colorFrom/colorTo 函数本身，传入的 ctx 形状
    // {dataset, dataIndex} 和 Chart.js 在内部调用 scriptable 选项时一致
    // （ctx.dataset.data[ctx.dataIndex] 取回原始 {from,to,flow} 记录）。
    var sankeyHost = document.createElement('div');
    sankeyHost.className = 'ds-chart-host';
    var sankeyCanvas = document.createElement('canvas');
    sankeyHost.appendChild(sankeyCanvas);
    document.body.appendChild(sankeyHost);
    var sankeyFixtureData = [
      { from: '接收点A', to: '一号仪器', flow: 10 },
      { from: '接收点B', to: '一号仪器', flow: 6 },
      { from: '接收点B', to: '二号仪器', flow: 8 },
      { from: '一号仪器', to: '正常完成', flow: 9 },
      { from: '一号仪器', to: '复查', flow: 4 },
      { from: '二号仪器', to: '正常完成', flow: 5 },
      { from: '二号仪器', to: '复查', flow: 3 }
    ];
    var sankeyChart2 = DS.charts.create(sankeyCanvas, {
      type: 'sankey',
      data: { datasets: [{ label: '流向', data: sankeyFixtureData }] }
    });
    var sankeyMeta = sankeyChart2.getDatasetMeta(0);
    A.check('ch-sankey-renders-flows', sankeyMeta.data.length === 7, 'got ' + sankeyMeta.data.length);
    A.check('ch-sankey-renders-nodes',
      !!sankeyMeta.controller._nodes && sankeyMeta.controller._nodes.size === 6,
      'got ' + (sankeyMeta.controller._nodes && sankeyMeta.controller._nodes.size));

    var sankeyThemeNow = DS.charts.themeColors();
    var sankeyDs = sankeyChart2.data.datasets[0];
    // 节点配色顺序（D2）：按层号、同层按首现顺序排成一条线顺次取十色
    // seriesExt：接收点A/B → 序号 0/1；一号仪器/二号仪器 → 第 1 层，续编
    // 序号 2/3；正常完成/复查 → 序号 4/5。所以 dataIndex0 的 from=接收点A
    // 是 seriesExt[0]，to=一号仪器是 seriesExt[2]（旧的"每层从 0 重编"会
    // 得到 series[0]，相邻层撞色）。
    A.check('ch-sankey-color-from-uses-node-token',
      sankeyDs.colorFrom({ dataset: sankeyDs, dataIndex: 0 }) === sankeyThemeNow.seriesExt[0],
      'got ' + sankeyDs.colorFrom({ dataset: sankeyDs, dataIndex: 0 }));
    // dataIndex 0 的 to 是"一号仪器"——第 1 层里第一个被发现的节点，层内
    // 编号 0，而不是旧实现下的全局编号 1。这条断言在旧/新算法下取值不同
    // （旧：series[1]；新：series[0]），本身就是一次低成本的回归哨兵。
    A.check('ch-sankey-color-to-uses-node-token',
      sankeyDs.colorTo({ dataset: sankeyDs, dataIndex: 0 }) === sankeyThemeNow.seriesExt[2],
      'got ' + sankeyDs.colorTo({ dataset: sankeyDs, dataIndex: 0 }));
    // 变异防护：colorFrom 对两个不同节点必须给出不同颜色——如果实现退化成
    // "永远返回 series[0]"，上面两条断言可能侥幸撞对第一个节点，这一条
    // 才能抓住"所有节点同色"的恒真陷阱。dataIndex1 的 from 是"接收点B"，
    // 和 dataIndex0 的 from"接收点A"同层但编号不同。
    A.check('ch-sankey-color-differs-per-node',
      sankeyDs.colorFrom({ dataset: sankeyDs, dataIndex: 0 }) !==
        sankeyDs.colorFrom({ dataset: sankeyDs, dataIndex: 1 }),
      'idx0=' + sankeyDs.colorFrom({ dataset: sankeyDs, dataIndex: 0 }) +
        ' idx1=' + sankeyDs.colorFrom({ dataset: sankeyDs, dataIndex: 1 }));

    // 查不到节点时的中性灰兜底：手工构造一个 colorFrom 闭包创建时从未见过
    // 的节点键（ctx.dataset 换成一个独立的假数据集，和创建 sankeyChart2 时
    // 用来计算 nodeColorIndex 的 sankeyFixtureData 完全无关），nodeColorIndex
    // 里必然查不到这个键。变异验证：把 seriesColorFor 的兜底分支改回
    // `c.series[(nodeColorIndex[key]||0) % c.series.length]`（查不到就当
    // 第 0 个），这条断言会转红，因为那样会返回 series[0] 而不是中性灰。
    var sankeyFallbackExpected = getComputedStyle(document.documentElement)
      .getPropertyValue('--chart-axis').trim();
    A.check('ch-sankey-color-fallback-for-unknown-node',
      sankeyDs.colorFrom({ dataset: { data: [{ from: '__ds_test_unknown_node__', to: 'x', flow: 1 }] }, dataIndex: 0 })
        === sankeyFallbackExpected,
      'got ' + sankeyDs.colorFrom({ dataset: { data: [{ from: '__ds_test_unknown_node__', to: 'x', flow: 1 }] }, dataIndex: 0 }) +
        ' want ' + sankeyFallbackExpected);
    A.check('ch-sankey-color-fallback-differs-from-series0',
      sankeyFallbackExpected !== sankeyThemeNow.series[0],
      'fallback 和 series[0] 撞色，没法跟"兜底坏成 0 号序列色"区分开');

    // 排序优先级（没传才补）：接收点A/一号仪器/接收点B/二号仪器/正常完成/
    // 复查 的流量总和（当 from 累加一次、当 to 再累加一次）分别是
    // 10/29/14/16/14/7——一号仪器最高（样本在这个小样本里最集中），复查
    // 最低，两端排名明确，不受并列名次的 tie-break 细节影响。
    A.check('ch-sankey-priority-auto-assigned-top',
      sankeyDs.priority && sankeyDs.priority['一号仪器'] === 0,
      'got ' + JSON.stringify(sankeyDs.priority));
    A.check('ch-sankey-priority-auto-assigned-bottom',
      sankeyDs.priority && sankeyDs.priority['复查'] === 5,
      'got ' + JSON.stringify(sankeyDs.priority));

    // colorMode/size 走第三方插件自己的默认值（'gradient'/'max'），我们不
    // 需要也不应该在 paint() 里重复设置——这里断言的是"没传就是默认值"，
    // 不是我们自己写的逻辑，防的是以后有人手滑把这两个字段写死成别的值。
    var sankeyResolvedFlowOpts = sankeyChart2.getDatasetMeta(0).data[0].options;
    A.check('ch-sankey-colorMode-defaults-gradient',
      sankeyResolvedFlowOpts.colorMode === 'gradient', 'got ' + sankeyResolvedFlowOpts.colorMode);
    A.check('ch-sankey-size-defaults-max',
      (sankeyDs.size || 'max') === 'max', 'got ' + sankeyDs.size);

    // 图例默认关闭：桑基图节点名直接画在图上，图例是多余的——这是
    // chartjs-chart-sankey 自己的 overrides，paint() 不应该把它翻回来。
    A.check('ch-sankey-legend-display-false',
      sankeyChart2.legend && sankeyChart2.legend.options.display === false,
      'got ' + (sankeyChart2.legend && sankeyChart2.legend.options.display));

    // tooltip：从→到 + 流量 + 占源节点总流出的百分比。用 dataIndex 0
    // （接收点A→一号仪器，flow 10，接收点A 只有这一条流出，占比必然是
    // 100.0%）和 dataIndex 1（接收点B→一号仪器，flow 6，接收点B 总流出
    // 6+8=14，占比 42.9%）两条分别核对——只测第一条的话，如果占比计算
    // 整个被写死成 100%，idx0 恰好也看不出区别，idx1 才有鉴别力。
    var sankeyTooltipLabel = sankeyChart2.options.plugins.tooltip.callbacks.label;
    A.check('ch-sankey-tooltip-has-from-to-flow',
      sankeyTooltipLabel({ dataset: sankeyDs, dataIndex: 0 }) === '接收点A → 一号仪器: 10 (100.0%)',
      'got ' + sankeyTooltipLabel({ dataset: sankeyDs, dataIndex: 0 }));
    A.check('ch-sankey-tooltip-percentage-not-always-100',
      sankeyTooltipLabel({ dataset: sankeyDs, dataIndex: 1 }) === '接收点B → 一号仪器: 6 (42.9%)',
      'got ' + sankeyTooltipLabel({ dataset: sankeyDs, dataIndex: 1 }));

    A.check('ch-sankey-label-color-from-text-token',
      sankeyDs.color === sankeyThemeNow.text, 'got ' + sankeyDs.color);
    var sankeySurface = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-surface').trim();
    A.check('ch-sankey-node-border-from-surface-token',
      sankeyDs.borderColor === sankeySurface, 'got ' + sankeyDs.borderColor);

    // 不被误判成笛卡尔图：$ds 缩放状态和缩放工具条都只在 create() 判定
    // isCartesian(config.type) 为真时才会被挂上（见 src/charts.js create()），
    // sankey 一旦被错误并入白名单，这两条都会翻过来。
    A.check('ch-sankey-not-treated-as-cartesian',
      !sankeyChart2.$ds, 'got $ds=' + JSON.stringify(sankeyChart2.$ds));
    A.check('ch-sankey-no-zoom-buttons-mounted',
      !sankeyHost.querySelector('[data-act="in"],[data-act="out"],[data-act="reset"],.ds-chart-hint'), '');
    A.check('ch-sankey-d5-fullscreen-button-mounted',
      !!sankeyHost.querySelector('.ds-chart-toolbar [data-act="full"]'), '');
    // 不被注入 x/y 轴颜色：chartjs-chart-sankey 自己的 overrides 已经把 x/y
    // 设成 display:false 的内部数值轴，Chart.js 仍会给它们解析出一套自己的
    // 默认 grid/ticks 颜色（不是我们的主题色，这里不能拿"有没有颜色"当判据,
    // 必须直接跟 DS 的主题 token 比较）——paint() 的笛卡尔分支如果误判成
    // 笛卡尔图，会把 grid.color/ticks.color 硬塞成 c.grid/c.text，这里应该
    // 跟那两个 token 值都不相等，证明笛卡尔分支确实没碰过这两根轴。
    A.check('ch-sankey-x-scale-grid-not-theme-grid',
      sankeyChart2.options.scales.x.grid.color !== sankeyThemeNow.grid,
      'grid.color=' + sankeyChart2.options.scales.x.grid.color + ' themeGrid=' + sankeyThemeNow.grid);
    A.check('ch-sankey-x-scale-ticks-not-theme-text',
      sankeyChart2.options.scales.x.ticks.color !== sankeyThemeNow.text,
      'ticks.color=' + sankeyChart2.options.scales.x.ticks.color + ' themeText=' + sankeyThemeNow.text);

    // 主题切换后重绘：s1..s6 六条序列色浅深主题下取值相同（tokens.css 的
    // 既定设计），切主题测不出颜色变化；但 --color-text 与 --color-surface
    // 两套主题下确实不同，借这两个字段验证 retheme() 真的重新跑过 paint()。
    var sankeyColorBefore = sankeyDs.color;
    var sankeyBorderBefore = sankeyDs.borderColor;
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
    var sankeyThemeAfter = DS.charts.themeColors();
    A.check('ch-sankey-retheme-updates-label-color',
      sankeyDs.color === sankeyThemeAfter.text && sankeyDs.color !== sankeyColorBefore,
      'before=' + sankeyColorBefore + ' after=' + sankeyDs.color);
    var sankeySurfaceAfter = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-surface').trim();
    A.check('ch-sankey-retheme-updates-node-border',
      sankeyDs.borderColor === sankeySurfaceAfter && sankeyDs.borderColor !== sankeyBorderBefore,
      'before=' + sankeyBorderBefore + ' after=' + sankeyDs.borderColor);
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');  // 复位

    // 调用方自定义 colorFrom 必须被尊重，不能被 paint() 覆盖掉——和弧形族
    // __dsAutoBg/__dsAutoBorder 的"调用方给了就不碰"是同一个约定。
    var sankeyOverrideHost = document.createElement('div');
    sankeyOverrideHost.className = 'ds-chart-host';
    var sankeyOverrideCanvas = document.createElement('canvas');
    sankeyOverrideHost.appendChild(sankeyOverrideCanvas);
    document.body.appendChild(sankeyOverrideHost);
    var sankeyCustomFn = function () { return 'magenta'; };
    var sankeyCustomPriority = { '接收点A': 9 };
    var sankeyOverrideChart = DS.charts.create(sankeyOverrideCanvas, {
      type: 'sankey',
      data: { datasets: [{ data: sankeyFixtureData.slice(0, 1), colorFrom: sankeyCustomFn, priority: sankeyCustomPriority }] }
    });
    A.check('ch-sankey-respects-caller-colorFrom',
      sankeyOverrideChart.data.datasets[0].colorFrom === sankeyCustomFn, '');
    A.check('ch-sankey-respects-caller-priority',
      sankeyOverrideChart.data.datasets[0].priority === sankeyCustomPriority, '');

    DS.charts.destroy(sankeyChart2);
    DS.charts.destroy(sankeyOverrideChart);
    sankeyHost.remove();
    sankeyOverrideHost.remove();

    // ---------------- 点击高亮：验证实际渲染输出，不是只验状态变量 ----------------
    // 独立拓扑：S1/S2（第 0 层）→ M1（第 1 层）→ E1/E2（第 2 层），
    // 4 条流向，足够覆盖"点击流向两端点按左右半区选中/再次点击同一个
    // 高亮节点回落基线/点击空白回落基线/非关联流向与节点实际淡出"。
    var sankeyHiHost = document.createElement('div');
    sankeyHiHost.className = 'ds-chart-host';
    var sankeyHiCanvas = document.createElement('canvas');
    sankeyHiHost.appendChild(sankeyHiCanvas);
    document.body.appendChild(sankeyHiHost);
    // idx4（S3->M2）是刻意加的一个独立连通分量，跟 S1/S2/M1/E1/E2 完全
    // 不共享任何节点——用来验证"彻底无关"的流向两端都会被淡化。idx0~3 这
    // 组本身因为共用 M1，点亮 S1 之后 M1->E1/M1->E2 只会淡化 to 端（因为
    // from 端 M1 本身跟高亮的 S1->M1 共享节点，仍然算关联），不能拿它们
    // 测"两端都淡化"，否则断言会错误地要求一个本不该发生的状态。
    var sankeyHiData = [
      { from: 'S1', to: 'M1', flow: 10 },
      { from: 'S2', to: 'M1', flow: 5 },
      { from: 'M1', to: 'E1', flow: 8 },
      { from: 'M1', to: 'E2', flow: 7 },
      { from: 'S3', to: 'M2', flow: 4 }
    ];
    var sankeyHiChart = DS.charts.create(sankeyHiCanvas, {
      type: 'sankey',
      data: { datasets: [{ data: sankeyHiData }] }
    });
    sankeyHiChart.resize();  // 见文件顶部注释：本机测试环境不触发 ResizeObserver

    // 悬停加深（插件默认 hoverColorFrom/To）是保留的真实交互；点击后光标仍在
    // 流向上，已解析颜色可能是"加深版"，且是否进入悬停态与事件时序有关。读颜色
    // 前先清掉悬停态（active 元素 + tooltip），断言才确定。
    function skClearHover(chart) {
      chart.setActiveElements([]);
      if (chart.tooltip) chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update('none');
    }
    function sankeyFireClick(chart, canvasX, canvasY) {
      var rect = chart.canvas.getBoundingClientRect();
      chart.canvas.dispatchEvent(new MouseEvent('click', {
        clientX: rect.left + canvasX, clientY: rect.top + canvasY, bubbles: true
      }));
      skClearHover(chart);
    }
    function sankeyFlowCenter(chart, idx) {
      return chart.getDatasetMeta(0).data[idx].getCenterPoint();
    }
    function sankeyReadPixel(chart, x, y) {
      var d = chart.ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    }

    // 点击前：S3->M2（idx4，跟 S1 所在连通分量完全无关）应该是分类序列色
    // 渐变——先记一笔"点击前"的像素，后面要跟"点击后"比对，不能只看
    // colorFrom 返回值（那只是生成颜色的函数，不代表真的画上了画布）。
    var sankeyIdx0Center = sankeyFlowCenter(sankeyHiChart, 0);
    var sankeyIdx2Center = sankeyFlowCenter(sankeyHiChart, 2);
    var sankeyIdx4Center = sankeyFlowCenter(sankeyHiChart, 4);
    var sankeyPixelIdx4Before = sankeyReadPixel(sankeyHiChart, sankeyIdx4Center.x, sankeyIdx4Center.y);

    // 点击 S1->M1 这条流向（idx0，三段式布局里这条连接第 0/1 层，中心点
    // 必然落在整张图左半区）——按约定应该高亮 from 端 'S1'。
    sankeyFireClick(sankeyHiChart, sankeyIdx0Center.x, sankeyIdx0Center.y);
    A.check('ch-sankey-click-selects-from-side-on-left-half',
      sankeyHiChart.$dsSankey.active && sankeyHiChart.$dsSankey.active.size === 1 &&
        sankeyHiChart.$dsSankey.active.has('S1'),
      'got ' + JSON.stringify(sankeyHiChart.$dsSankey.active && [...sankeyHiChart.$dsSankey.active]));

    var sankeyDimExpected = getComputedStyle(document.documentElement)
      .getPropertyValue('--chart-grid').trim();

    // 实际渲染输出核对 1：S3->M2（idx4）跟高亮的 S1 毫无关联（完全不同的
    // 连通分量），点击后这条流向的已解析 colorFrom/colorTo（Chart.js 在
    // update() 时真正算出来、draw() 真正会用的值，不是我们自己的闭包）
    // 两端都必须等于淡出色，不能是原来的分类序列色。
    var sankeyIdx4Opts = sankeyHiChart.getDatasetMeta(0).data[4].options;
    A.check('ch-sankey-unrelated-flow-resolved-color-dimmed',
      sankeyIdx4Opts.colorFrom === sankeyDimExpected && sankeyIdx4Opts.colorTo === sankeyDimExpected,
      'got colorFrom=' + sankeyIdx4Opts.colorFrom + ' colorTo=' + sankeyIdx4Opts.colorTo +
        ' want ' + sankeyDimExpected);

    // 实际渲染输出核对 2：直接读 canvas 像素——idx4 这条流向中心点的真实
    // 颜色，点击前后必须不同（点击前是分类序列色的半透明渐变，点击后应该
    // 偏向 --chart-grid 的灰）。只验状态变量（$dsSankey.active 被赋值）
    // 测不出"是不是真的重绘了"——headless chromium 下如果 update('none')
    // 没有真正触发重绘，这条会抓到。
    var sankeyPixelIdx4After = sankeyReadPixel(sankeyHiChart, sankeyIdx4Center.x, sankeyIdx4Center.y);
    A.check('ch-sankey-click-actually-repaints-canvas-pixels',
      sankeyPixelIdx4Before.join(',') !== sankeyPixelIdx4After.join(','),
      'before=' + sankeyPixelIdx4Before.join(',') + ' after=' + sankeyPixelIdx4After.join(','));

    // 关联流向（S1->M1 自己，idx0）不应该被淡化——已解析颜色必须还是分类
    // 序列色，不是淡出色。
    var sankeyIdx0Opts = sankeyHiChart.getDatasetMeta(0).data[0].options;
    A.check('ch-sankey-related-flow-not-dimmed',
      sankeyIdx0Opts.colorFrom !== sankeyDimExpected,
      'got ' + sankeyIdx0Opts.colorFrom);

    // D1 流向着色规则（与参照实现一致）：整条流向要么全亮要么全灰，判据
    // 是"起点或终点属于高亮集合 hl（={S1}）"。M1->E1（idx2）两端都不是 S1，
    // 是二跳流向 → 整条变灰（不再是"一头亮一头灰"的半截渐变）；S1->M1
    // （idx0）含 S1 → 整条保持原色。
    var sankeyIdx2OptsAfterS1 = sankeyHiChart.getDatasetMeta(0).data[2].options;
    A.check('ch-sankey-d1-two-hop-flow-from-end-dimmed',
      sankeyIdx2OptsAfterS1.colorFrom === sankeyDimExpected,
      'got ' + sankeyIdx2OptsAfterS1.colorFrom);
    A.check('ch-sankey-d1-two-hop-flow-to-end-dimmed',
      sankeyIdx2OptsAfterS1.colorTo === sankeyDimExpected,
      'got ' + sankeyIdx2OptsAfterS1.colorTo);
    A.check('ch-sankey-d1-hit-flow-both-ends-lit',
      sankeyIdx0Opts.colorFrom !== sankeyDimExpected && sankeyIdx0Opts.colorTo !== sankeyDimExpected,
      'from=' + sankeyIdx0Opts.colorFrom + ' to=' + sankeyIdx0Opts.colorTo);
    // 全图扫一遍：没有任何一条流向是"一头亮一头灰"
    var sankeyHalfLit = sankeyHiChart.getDatasetMeta(0).data.filter(function (e) {
      return (e.options.colorFrom === sankeyDimExpected) !== (e.options.colorTo === sankeyDimExpected);
    }).length;
    A.check('ch-sankey-d1-no-half-lit-flows', sankeyHalfLit === 0, 'half-lit=' + sankeyHalfLit);

    // 点击 M1->E1（idx2，连接第 1/2 层，中心点必然落在整张图右半区）——
    // 按约定应该高亮 to 端 'E1'，而不是 from 端 'M1'。
    sankeyFireClick(sankeyHiChart, sankeyIdx2Center.x, sankeyIdx2Center.y);
    A.check('ch-sankey-click-selects-to-side-on-right-half',
      sankeyHiChart.$dsSankey.active && sankeyHiChart.$dsSankey.active.size === 1 &&
        sankeyHiChart.$dsSankey.active.has('E1'),
      'got ' + JSON.stringify(sankeyHiChart.$dsSankey.active && [...sankeyHiChart.$dsSankey.active]));

    // 再次点击同一条流向：这次中心点仍然落在右半区，还是会解出 'E1'——
    // 当前高亮恰好就是 {'E1'}（size===1 且 has('E1')），应该回落基线
    // （这里基线是 null，没有筛选），表现为高亮完全清空。
    sankeyFireClick(sankeyHiChart, sankeyIdx2Center.x, sankeyIdx2Center.y);
    A.check('ch-sankey-click-same-node-again-reverts-to-baseline',
      sankeyHiChart.$dsSankey.active === null,
      'got ' + JSON.stringify(sankeyHiChart.$dsSankey.active));

    // 点击空白处（图表区域里不落在任何流向上的点，比如绘图区左上角）：
    // 先重新点亮一个高亮状态，再点空白，验证确实被清空。
    sankeyFireClick(sankeyHiChart, sankeyIdx0Center.x, sankeyIdx0Center.y);
    A.check('ch-sankey-blank-click-setup-has-highlight',
      sankeyHiChart.$dsSankey.active !== null, '前置条件失败：点击流向后仍然没有高亮');
    sankeyFireClick(sankeyHiChart, sankeyHiChart.chartArea.left + 1, sankeyHiChart.chartArea.top + 1);
    A.check('ch-sankey-click-blank-reverts-to-baseline',
      sankeyHiChart.$dsSankey.active === null,
      'got ' + JSON.stringify(sankeyHiChart.$dsSankey.active));

    // 筛选基线：设置基线本身不直接点亮——跟参照实现一致，筛选刚生效的
    // 瞬间（sankeySetBaseline 内部把 active 清零）没有任何高亮，图表显示
    // 全部原色；基线只在"点击空白"或"再次点击同一个单节点高亮"这类回退
    // 动作发生时才会被真正应用为当前高亮（清单第 19 条"没有点击高亮时…"
    // 说的是"没有点击覆盖态时回退到基线"，不是"设置基线=立刻显示基线"）。
    DS.charts.sankeySetBaseline(sankeyHiChart, ['S2']);
    A.check('ch-sankey-set-baseline-resets-active',
      sankeyHiChart.$dsSankey.active === null, 'got ' + JSON.stringify(sankeyHiChart.$dsSankey.active));
    var sankeyIdx0OptsJustAfterBaseline = sankeyHiChart.getDatasetMeta(0).data[0].options;
    A.check('ch-sankey-set-baseline-does-not-auto-highlight',
      sankeyIdx0OptsJustAfterBaseline.colorFrom !== sankeyDimExpected,
      'got ' + sankeyIdx0OptsJustAfterBaseline.colorFrom);

    // 清除高亮：sankeyClearHighlight 把 active 拉回当前基线（{'S2'}）——
    // 先把 active 改成别的值，再调用，确认真的被改回去，而不是巧合保持
    // 原值没变。
    sankeyHiChart.$dsSankey.active = new Set(['M1']);
    DS.charts.sankeyClearHighlight(sankeyHiChart);
    A.check('ch-sankey-clear-highlight-restores-baseline',
      sankeyHiChart.$dsSankey.active && sankeyHiChart.$dsSankey.active.size === 1 &&
        sankeyHiChart.$dsSankey.active.has('S2'),
      'got ' + JSON.stringify(sankeyHiChart.$dsSankey.active && [...sankeyHiChart.$dsSankey.active]));

    // 基线生效之后（active 已经等于基线 {'S2'}）：S1->M1（不含 S2）应该被
    // 淡化，S2->M1（含 S2）不应该——这才是"基线构成默认高亮"这条规则真正
    // 的渲染验证点。
    var sankeyIdx0OptsBaseline = sankeyHiChart.getDatasetMeta(0).data[0].options;
    var sankeyIdx1OptsBaseline = sankeyHiChart.getDatasetMeta(0).data[1].options;
    A.check('ch-sankey-baseline-dims-unrelated-flow',
      sankeyIdx0OptsBaseline.colorFrom === sankeyDimExpected, 'got ' + sankeyIdx0OptsBaseline.colorFrom);
    A.check('ch-sankey-baseline-keeps-related-flow',
      sankeyIdx1OptsBaseline.colorFrom !== sankeyDimExpected, 'got ' + sankeyIdx1OptsBaseline.colorFrom);

    DS.charts.destroy(sankeyHiChart);
    sankeyHiHost.remove();

    // ---------------- 高亮关联集合：纯函数单测（不经过真实点击） ----------------
    var sankeyPureFlows = [
      { from: 'A', to: 'B', flow: 1 },
      { from: 'B', to: 'C', flow: 1 },
      { from: 'X', to: 'Y', flow: 1 }
    ];
    A.check('ch-sankey-connected-keys-null-without-seeds',
      DS.charts._sankeyConnectedKeys(sankeyPureFlows, null) === null, '');
    A.check('ch-sankey-connected-keys-null-with-empty-set',
      DS.charts._sankeyConnectedKeys(sankeyPureFlows, new Set()) === null, '');
    var sankeyConnectedFromB = DS.charts._sankeyConnectedKeys(sankeyPureFlows, new Set(['B']));
    // B 同时是 A->B 的 to 和 B->C 的 from：两条流向都关联，连通集应该是
    // {A,B,C}，不包含不相关的 X/Y——既要测"该有的都有"，也要测"不该有的
    // 没有"，否则一个"把所有节点都标记为关联"的退化实现也能骗过前半句。
    A.check('ch-sankey-connected-keys-expands-both-sides',
      !!sankeyConnectedFromB.A && !!sankeyConnectedFromB.B && !!sankeyConnectedFromB.C,
      'got ' + JSON.stringify(sankeyConnectedFromB));
    A.check('ch-sankey-connected-keys-excludes-unrelated',
      !sankeyConnectedFromB.X && !sankeyConnectedFromB.Y,
      'got ' + JSON.stringify(sankeyConnectedFromB));

    // ---------------- 节点分层：纯函数单测 ----------------
    var sankeyLayers = DS.charts._sankeyNodeLayers(sankeyHiData);
    A.check('ch-sankey-layers-roots-are-zero',
      sankeyLayers.S1 === 0 && sankeyLayers.S2 === 0,
      'got ' + JSON.stringify(sankeyLayers));
    A.check('ch-sankey-layers-middle-is-one',
      sankeyLayers.M1 === 1, 'got ' + sankeyLayers.M1);
    A.check('ch-sankey-layers-leaves-are-two',
      sankeyLayers.E1 === 2 && sankeyLayers.E2 === 2,
      'got ' + JSON.stringify(sankeyLayers));

    // ---------------- 按角色聚合流量：供筛选下拉算计数用 ----------------
    var sankeyFromTotalsCheck = DS.charts.sankeyGroupTotals(sankeyHiData, 'from');
    A.check('ch-sankey-group-totals-from',
      sankeyFromTotalsCheck.S1 === 10 && sankeyFromTotalsCheck.S2 === 5 && sankeyFromTotalsCheck.M1 === 15,
      'got ' + JSON.stringify(sankeyFromTotalsCheck));
    var sankeyToTotalsCheck = DS.charts.sankeyGroupTotals(sankeyHiData, 'to');
    A.check('ch-sankey-group-totals-to',
      sankeyToTotalsCheck.M1 === 15 && sankeyToTotalsCheck.E1 === 8 && sankeyToTotalsCheck.E2 === 7,
      'got ' + JSON.stringify(sankeyToTotalsCheck));

    // ---------------- 节点筛选下拉（库组件 DS.sankey.mount 生成）----------------
    // 千分位格式：构造一个计数 >= 1000 的条目，不能用真实 demo 数据侧试
    // （真实流量总和都在三位数以内，看不出千分位分隔符有没有生效）。
    var sankeyProbeHost = document.createElement('div');
    document.body.appendChild(sankeyProbeHost);
    var sankeyProbeComp = DS.sankey.mount(sankeyProbeHost,
      [{ from: '探针节点', to: '探针终点', flow: 1234 }], { id: 'sankeyprobe' });
    var sankeyProbeCount = sankeyProbeHost.querySelector('#sankeyprobe-from-list .ds-sankey-drop-count');
    A.check('ch-sankey-drop-count-uses-thousands-separator',
      !!sankeyProbeCount && sankeyProbeCount.textContent === (1234).toLocaleString(),
      'got ' + (sankeyProbeCount && sankeyProbeCount.textContent));
    sankeyProbeComp.destroy();
    sankeyProbeHost.remove();

    // D3：「仪器筛选」只列首层节点（4 台仪器）、「项目筛选」只列末层节点（25 个
    // 项目，不超过 maxToItems=40 所以全列）；两份列表互不重叠。
    var skInstNames = DS_MOCK.instruments();
    A.check('ch-sankey-d3-from-list-only-first-layer',
      sankeyFromList.querySelectorAll('.ds-sankey-drop-item:not(.all)').length === 4 &&
        [].every.call(sankeyFromList.querySelectorAll('.ds-sankey-drop-item:not(.all) input'),
          function (cb) { return skInstNames.indexOf(cb.value) !== -1; }),
      'got ' + [].map.call(sankeyFromList.querySelectorAll('input[value]'), function (cb) { return cb.value; }).join(','));
    A.check('ch-sankey-d3-to-list-only-last-layer',
      sankeyToList.querySelectorAll('.ds-sankey-drop-item:not(.all)').length === 25 &&
        [].every.call(sankeyToList.querySelectorAll('.ds-sankey-drop-item:not(.all) input'),
          function (cb) { return cb.value.indexOf('项目') === 0; }),
      'got ' + [].map.call(sankeyToList.querySelectorAll('input[value]'), function (cb) { return cb.value; }).join(','));
    A.check('ch-sankey-demo-buttons-use-custom-labels',
      document.getElementById('sankey-from-btn').textContent.indexOf('仪器筛选') === 0 &&
        document.getElementById('sankey-to-btn').textContent.indexOf('项目筛选') === 0,
      document.getElementById('sankey-from-btn').textContent + '|' + document.getElementById('sankey-to-btn').textContent);

    // 勾选即时重算：记下勾选前的流向数，勾中"流出端"下拉的第一项
    // （流量最大的接收点，按 sankeyRankedItems 降序排列）之后应用一个
    // change 事件，图表应该立即换了一份更少的数据——不需要额外的"确认"
    // 按钮。
    var sankeyCanvasBeforeFilter = document.getElementById('c-sankey');
    var sankeyFlowCountBeforeFilter = sankeyComp.chart().getDatasetMeta(0).data.length;
    var sankeyFromFirstCb = sankeyFromList.querySelectorAll('.ds-sankey-drop-item:not(.all) input')[0];
    sankeyFromFirstCb.checked = true;
    sankeyFromFirstCb.dispatchEvent(new Event('change', { bubbles: true }));
    A.check('ch-sankey-filter-change-recomputes-immediately',
      sankeyComp.chart().getDatasetMeta(0).data.length < sankeyFlowCountBeforeFilter,
      'before=' + sankeyFlowCountBeforeFilter + ' after=' + sankeyComp.chart().getDatasetMeta(0).data.length);
    // 彻底销毁旧实例、换新 canvas：筛选后的 <canvas id="c-sankey"> 元素
    // 不应该还是同一个 DOM 节点（参照实现"Always recreate canvas"那条
    // 注释的教训）——只验证 chart 实例变了不够，旧实现也可能只是复用同一块
    // canvas 调 DS.charts.create() второй次，那样仍然算是"重建了图表实例"
    // 但没有满足"连 canvas 也要换"这条更严格的要求。
    A.check('ch-sankey-filter-recreates-canvas-element',
      document.getElementById('c-sankey') !== sankeyCanvasBeforeFilter, '');
    // 徽标：选中 1 项之后应显示 "(1)"。
    A.check('ch-sankey-filter-badge-shows-count',
      sankeyFromBadge.hidden === false && sankeyFromBadge.textContent === '(1)',
      'hidden=' + sankeyFromBadge.hidden + ' text=' + sankeyFromBadge.textContent);

    // 全选联动：点"流入端"下拉的"全选"行应该让所有子项一起勾上。
    var sankeyToAllCb = sankeyToList.querySelector('.ds-sankey-drop-item.all input');
    sankeyToAllCb.checked = true;
    sankeyToAllCb.dispatchEvent(new Event('change', { bubbles: true }));
    var sankeyToItemCbs = sankeyToList.querySelectorAll('.ds-sankey-drop-item:not(.all) input');
    A.check('ch-sankey-filter-select-all-checks-every-item',
      [].every.call(sankeyToItemCbs, function (cb) { return cb.checked; }),
      'got ' + [].map.call(sankeyToItemCbs, function (cb) { return cb.checked; }).join(','));
    // 子项全勾时，"全选"自己也应该显示为勾中状态（反过来验证"全选"复选框
    // 本身会跟着子项状态同步，不是只能由它驱动子项、单向联动）。
    sankeyToItemCbs[0].checked = false;
    sankeyToItemCbs[0].dispatchEvent(new Event('change', { bubbles: true }));
    A.check('ch-sankey-filter-all-unchecks-when-one-item-unchecked',
      sankeyToAllCb.checked === false, '');
    sankeyToItemCbs[0].checked = true;
    sankeyToItemCbs[0].dispatchEvent(new Event('change', { bubbles: true }));
    A.check('ch-sankey-filter-all-rechecks-when-every-item-checked',
      sankeyToAllCb.checked === true, '');

    // 清除筛选：点击"清除筛选"按钮之后，两个下拉应该全部清空，徽标隐藏，
    // 图表恢复成默认视图（流量前 20 个项目的 43 条流向）。
    sankeyClearBtn.click();
    A.check('ch-sankey-filter-clear-restores-full-data',
      sankeyComp.chart().getDatasetMeta(0).data.length === 43,
      'got ' + sankeyComp.chart().getDatasetMeta(0).data.length);
    A.check('ch-sankey-filter-clear-hides-badges',
      sankeyFromBadge.hidden === true && sankeyToBadge.hidden === true, '');
    A.check('ch-sankey-filter-clear-unchecks-all',
      sankeyFromList.querySelectorAll('input:checked').length === 0 &&
        sankeyToList.querySelectorAll('input:checked').length === 0, '');

    // ================= 桑基图缺陷修复批（D1-D5 + 组件下沉）的断言 =================
    // 这一批尽量用真实 DOM 事件：canvas.dispatchEvent(new MouseEvent('click'))、
    // 复选框/按钮的 .click()；命中检测按 Chart.js 事件对象格式
    // {type:'click', native:{}, x, y}（未派发的 MouseEvent 的 offsetX 是页面
    // 坐标，Chart.js 会当画布坐标用，命中会全部落空）。
    function skCss(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    function skHit(chart, x, y) {
      var pts = chart.getElementsAtEventForMode({ type: 'click', native: {}, x: x, y: y }, 'nearest', { intersect: true }, false);
      return pts.length ? pts[0].index : -1;
    }
    function skFindPoint(chart, idx, side) {
      var el = chart.getDatasetMeta(0).data[idx], a = chart.chartArea, mid = (a.left + a.right) / 2;
      var x0 = Math.min(el.x, el.x2), x1 = Math.max(el.x, el.x2);
      var y0 = Math.min(el.y, el.y2) - 2, y1 = Math.max(el.y, el.y2) + el.height + 2;
      for (var fx = 0.15; fx <= 0.85; fx += 0.05) {
        var x = x0 + (x1 - x0) * fx;
        if (side === 'L' && x >= mid) continue;
        if (side === 'R' && x <= mid) continue;
        for (var y = y0; y <= y1; y += 1) { if (skHit(chart, x, y) === idx) return { x: x, y: y }; }
      }
      return null;
    }
    function skRealClick(chart, x, y) {
      var r = chart.canvas.getBoundingClientRect();
      chart.canvas.dispatchEvent(new MouseEvent('click', {
        clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true, view: window }));
    }
    function skFlowCols(chart) {
      skClearHover(chart);
      return chart.getDatasetMeta(0).data.map(function (e) { return [e.options.colorFrom, e.options.colorTo]; });
    }

    // ---- D1：整条流向要么全亮要么全灰（真实图，真实 DOM 点击）----
    // demo 主图是两层（仪器 → 项目），默认视图 40 条流向；"二跳"只在三层及以上
    // 才存在，那部分迁到下面独立构造的三层 scratch 图上断言。
    var skDemo = sankeyComp.chart();
    skDemo.resize(); skDemo.update('none');
    var skDemoFlows = skDemo.data.datasets[0].data;
    var skDim = skCss('--chart-grid');
    var skInst0 = DS_MOCK.instruments()[0];           // 一号仪器
    var skSrcIdx = 0;                                 // 一号仪器 -> 项目01
    var skPL = skFindPoint(skDemo, skSrcIdx, 'L');
    A.check('ch-sankey-d1-demo-found-clickable-point', !!skPL, 'no hit point on flow 0');
    if (skPL) {
      skRealClick(skDemo, skPL.x, skPL.y);
      var skHl = skDemo.$dsSankey.active;
      A.check('ch-sankey-d1-demo-real-click-sets-highlight',
        !!skHl && skHl.size === 1 && skHl.has(skInst0), 'active=' + (skHl && [].slice.call(skHl).join(',')));
      var skCols = skFlowCols(skDemo), skHalf = 0, skNbrFlows = 0, skNbrDim = 0, skLit = 0;
      var skNbr = {};
      skDemoFlows.forEach(function (f) { if (f.from === skInst0 || f.to === skInst0) { skNbr[f.from] = true; skNbr[f.to] = true; } });
      skDemoFlows.forEach(function (f, i) {
        var fd = skCols[i][0] === skDim, td = skCols[i][1] === skDim;
        if (fd !== td) skHalf++;
        var touch = f.from === skInst0 || f.to === skInst0;
        if (touch && !fd && !td) skLit++;
        // 两层图里"不直连但经邻居项目相连"的流向：别的仪器做同一个项目
        if (!touch && (skNbr[f.from] || skNbr[f.to])) { skNbrFlows++; if (fd && td) skNbrDim++; }
      });
      A.check('ch-sankey-d1-demo-no-half-lit-flows', skHalf === 0, 'half-lit=' + skHalf + '/43');
      // 按新数据（49 条）人工核算：一号仪器参与前 20 个项目中的 14 个
      // （项目01/02/03/04/05/06/07/08/10/11/13/14/16/18）= 14 条直连流向；这 14 个项目
      // 各自的流向共 36 条，扣掉直连 14 条 = 22 条邻居流向（别的仪器做同一项目），
      // 必须整条灰。
      A.check('ch-sankey-d1-demo-neighbour-flows-fully-dim', skNbrFlows === 22 && skNbrDim === 22,
        'dim ' + skNbrDim + '/' + skNbrFlows);
      A.check('ch-sankey-d1-demo-touching-flows-fully-lit', skLit === 14, 'lit=' + skLit + '/14');
      // 点同一点第二次：回到基线，颜色整体复原（不残留灰）
      skRealClick(skDemo, skPL.x, skPL.y);
      A.check('ch-sankey-d1-demo-second-click-restores-all-colors',
        skDemo.$dsSankey.active === null && skFlowCols(skDemo).every(function (c) { return c[0] !== skDim && c[1] !== skDim; }), '');
      // 点击右半区（项目端）：高亮的是该项目节点，而不是仪器
      var skPR = skFindPoint(skDemo, skSrcIdx, 'R');
      A.check('ch-sankey-d1-demo-right-half-found-point', !!skPR, 'no right-half hit point');
      if (skPR) {
        skRealClick(skDemo, skPR.x, skPR.y);
        var skHlR = skDemo.$dsSankey.active;
        A.check('ch-sankey-d1-demo-right-half-click-selects-project',
          !!skHlR && skHlR.size === 1 && skHlR.has('项目01'), 'active=' + (skHlR && [].slice.call(skHlR).join(',')));
        skRealClick(skDemo, skPR.x, skPR.y);
        A.check('ch-sankey-d1-demo-right-half-second-click-restores', skDemo.$dsSankey.active === null, '');
      }
    }

    // ---- 独立构造的三层 scratch 图：中间层/二跳/三层可达性等"只对多层有意义"的能力 ----
    // 3 源 + 4 中间 + 3 终点 = 10 节点、12 + 12 = 24 条流向（demo 主图是两层，
    // 库本身仍支持多层，覆盖不能丢）。
    function skMakeThree() {
      var o = [], si, mi, ei;
      for (si = 1; si <= 3; si++) for (mi = 1; mi <= 4; mi++) o.push({ from: '源' + si, to: '中' + mi, flow: 5 + ((si * 7 + mi * 3) % 30) });
      for (mi = 1; mi <= 4; mi++) for (ei = 1; ei <= 3; ei++) o.push({ from: '中' + mi, to: '终' + ei, flow: 5 + ((mi * 5 + ei * 11) % 30) });
      return o;
    }
    var skThreeHost = document.createElement('div');
    document.body.appendChild(skThreeHost);
    var skThreeComp = DS.sankey.mount(skThreeHost, skMakeThree(), { id: 'sk3' });
    var sk3 = skThreeComp.chart();
    sk3.resize(); sk3.update('none');
    var sk3Flows = sk3.data.datasets[0].data;
    var sk3PL = skFindPoint(sk3, 0, 'L');
    A.check('ch-sankey-d1-3layer-found-clickable-point', !!sk3PL, 'no hit point on flow 0');
    if (sk3PL) {
      skRealClick(sk3, sk3PL.x, sk3PL.y);
      var sk3Hl = sk3.$dsSankey.active;
      A.check('ch-sankey-d1-3layer-real-click-sets-highlight',
        !!sk3Hl && sk3Hl.size === 1 && sk3Hl.has('源1'), 'active=' + (sk3Hl && [].slice.call(sk3Hl).join(',')));
      var sk3Cols = skFlowCols(sk3), sk3Half = 0, sk3TwoHop = 0, sk3TwoHopDim = 0, sk3Lit = 0, sk3Nbr = {};
      sk3Flows.forEach(function (f) { if (f.from === '源1' || f.to === '源1') { sk3Nbr[f.from] = true; sk3Nbr[f.to] = true; } });
      sk3Flows.forEach(function (f, i) {
        var fd = sk3Cols[i][0] === skDim, td = sk3Cols[i][1] === skDim;
        if (fd !== td) sk3Half++;
        var touch = f.from === '源1' || f.to === '源1';
        if (touch && !fd && !td) sk3Lit++;
        if (!touch && sk3Nbr[f.from]) { sk3TwoHop++; if (fd && td) sk3TwoHopDim++; }
      });
      A.check('ch-sankey-d1-3layer-no-half-lit-flows', sk3Half === 0, 'half-lit=' + sk3Half + '/24');
      A.check('ch-sankey-d1-3layer-two-hop-flows-fully-dim', sk3TwoHop === 12 && sk3TwoHopDim === 12,
        'two-hop dim ' + sk3TwoHopDim + '/' + sk3TwoHop);
      A.check('ch-sankey-d1-3layer-touching-flows-fully-lit', sk3Lit === 4, 'lit=' + sk3Lit + '/4');
      skRealClick(sk3, sk3PL.x, sk3PL.y);
      A.check('ch-sankey-d1-3layer-second-click-restores-all-colors',
        sk3.$dsSankey.active === null && skFlowCols(sk3).every(function (c) { return c[0] !== skDim && c[1] !== skDim; }), '');
    }

    // ---- D2：十色 token + 配色编号规则 ----
    var skTheme = DS.charts.themeColors();
    var skExtOk = skTheme.seriesExt.length === 10 && new Set(skTheme.seriesExt).size === 10 &&
      skTheme.seriesExt.every(function (c, i) { return c === skCss('--chart-s' + (i + 1)); });
    A.check('ch-sankey-d2-series-ext-is-ten-distinct-tokens', skExtOk, JSON.stringify(skTheme.seriesExt));
    A.check('ch-sankey-d2-core-series-still-six', skTheme.series.length === 6, 'got ' + skTheme.series.length);
    function skNodeColors(chart) {
      var fl = chart.data.datasets[0].data, cols = skFlowCols(chart), m = {};
      fl.forEach(function (f, i) { m[f.from] = cols[i][0]; m[f.to] = cols[i][1]; });
      return m;
    }
    var skNC = skNodeColors(skDemo), skLayers = DS.charts._sankeyNodeLayers(skDemoFlows);
    var skByLayer = {};
    Object.keys(skLayers).forEach(function (k) { (skByLayer[skLayers[k]] = skByLayer[skLayers[k]] || []).push(k); });
    A.check('ch-sankey-d2-demo-layers-are-4-and-20',
      Object.keys(skByLayer).join() === '0,1' && skByLayer[0].length === 4 && skByLayer[1].length === 20, JSON.stringify(skByLayer));
    // 配色编号规则（参照实现 palette[(i + 源端数) % N]）：源端第 i 个取
    // seriesExt[i]，目标端第 j 个取 seriesExt[(j + 4) % 10]；节点编号按全量数据
    // 顺序固定，所以榜内项目在默认视图里的颜色只由它的编号决定。
    var skInstOrder = DS_MOCK.instruments();
    A.check('ch-sankey-d2-demo-source-colors-follow-index',
      skInstOrder.every(function (k, i) { return skNC[k] === skTheme.seriesExt[i]; }),
      JSON.stringify(skInstOrder.map(function (k) { return skNC[k]; })));
    var skProjBad = [];
    Object.keys(skNC).forEach(function (k) {
      if (k.indexOf('项目') !== 0) return;
      var j = parseInt(k.slice(2), 10) - 1;
      if (skNC[k] !== skTheme.seriesExt[(j + 4) % 10]) skProjBad.push(k);
    });
    A.check('ch-sankey-d2-demo-target-colors-continue-after-sources',
      skProjBad.length === 0 && Object.keys(skNC).length === 24, 'bad=' + skProjBad.join());
    A.check('ch-sankey-d2-demo-source-colors-distinct',
      new Set(skInstOrder.map(function (k) { return skNC[k]; })).size === 4, '');
    // 24 个节点 > 10 色：必然循环复用（与参照实现一致，可接受），但 10 色都要用上
    A.check('ch-sankey-d2-demo-24-nodes-cycle-through-all-ten-colors',
      new Set(Object.keys(skNC).map(function (k) { return skNC[k]; })).size === 10, '');
    // 源端 + 目标端总数 <= 色板（4 + 6 = 10）时两侧零撞色
    var skSmall = [];
    skInstOrder.forEach(function (n) { for (var q = 1; q <= 6; q++) skSmall.push({ from: n, to: '小' + q, flow: 10 + q }); });
    var skSmallHost = document.createElement('div');
    document.body.appendChild(skSmallHost);
    var skSmallComp = DS.sankey.mount(skSmallHost, skSmall, { id: 'sk10' });
    var skSmallNC = skNodeColors(skSmallComp.chart());
    A.check('ch-sankey-d2-two-layer-total-within-palette-no-clash',
      Object.keys(skSmallNC).length === 10 && new Set(Object.keys(skSmallNC).map(function (k) { return skSmallNC[k]; })).size === 10,
      JSON.stringify(skSmallNC));
    skSmallComp.destroy(); skSmallHost.remove();
    // 三层 scratch：相邻两层合计 7 <= 10，同层/相邻层零撞色，每条流向首尾异色
    var sk3NC = skNodeColors(sk3), sk3Layers = DS.charts._sankeyNodeLayers(sk3Flows), sk3ByLayer = {};
    Object.keys(sk3Layers).forEach(function (k) { (sk3ByLayer[sk3Layers[k]] = sk3ByLayer[sk3Layers[k]] || []).push(k); });
    A.check('ch-sankey-d2-3layer-layers-are-3-4-3',
      [0, 1, 2].map(function (l) { return (sk3ByLayer[l] || []).length; }).join() === '3,4,3', JSON.stringify(sk3ByLayer));
    A.check('ch-sankey-d2-3layer-ten-nodes-ten-colors',
      new Set(Object.keys(sk3NC).map(function (k) { return sk3NC[k]; })).size === 10, '');
    var skAdjClash = 0, skSameClash = 0;
    [0, 1, 2].forEach(function (l) {
      var cs = sk3ByLayer[l].map(function (k) { return sk3NC[k]; });
      if (new Set(cs).size < cs.length) skSameClash++;
      if (l < 2) {
        var nxt = sk3ByLayer[l + 1].map(function (k) { return sk3NC[k]; });
        nxt.forEach(function (c) { if (cs.indexOf(c) !== -1) skAdjClash++; });
      }
    });
    A.check('ch-sankey-d2-3layer-adjacent-layers-no-clash', skAdjClash === 0, 'clashes=' + skAdjClash);
    A.check('ch-sankey-d2-3layer-same-layer-no-clash', skSameClash === 0, 'layers with clash=' + skSameClash);
    A.check('ch-sankey-d2-3layer-every-flow-has-visible-gradient',
      skFlowCols(sk3).every(function (c) { return c[0] !== c[1]; }), '');
    // 节点颜色在筛选前后不变（nodeOrder 固定为全量数据顺序）
    var skSrcCb = document.querySelector('#sankey-from-list .ds-sankey-drop-item:not(.all) input');
    var skPickFilterKey = skSrcCb.value, skColorBeforeFilter = skNC[skPickFilterKey];
    skSrcCb.click();
    A.check('ch-sankey-d2-node-color-stable-across-filter',
      !!skColorBeforeFilter && skNodeColors(sankeyComp.chart())[skPickFilterKey] === skColorBeforeFilter, '');
    document.getElementById('sankey-clear-btn').click();
    // 深色主题用深色 token（s7..s10 深浅两套不同）；项目04 编号 (3+4)%10=7 -> s8
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
    var skThemeB = DS.charts.themeColors();
    var skNCb = skNodeColors(sankeyComp.chart());
    var skExt7Changed = skThemeB.seriesExt[6] !== skTheme.seriesExt[6];
    A.check('ch-sankey-d2-theme-switch-uses-theme-ext-tokens',
      skExt7Changed && skNCb['项目04'] === skThemeB.seriesExt[7] && skNCb['项目04'] !== skNC['项目04'],
      'ext7 light/dark=' + skTheme.seriesExt[6] + '/' + skThemeB.seriesExt[6] + ' node=' + skNCb['项目04']);
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
    document.getElementById('sankey-clear-btn').click();

    // ---- D3：两层图勾选仪器后只保留它自己的流向；三层 scratch 保留完整去向 ----
    skSrcCb = document.querySelector('#sankey-from-list .ds-sankey-drop-item:not(.all) input');
    var skPickKey = skSrcCb.value;
    skSrcCb.click();
    var skAfter = sankeyComp.chart().data.datasets[0].data;
    var skExpectPick = sankeyUniverse.filter(function (f) { return f.from === skPickKey && parseInt(f.to.slice(2), 10) <= 20; }).length;
    A.check('ch-sankey-d3-demo-pick-source-keeps-only-its-top20-flows',
      skExpectPick >= 10 && skAfter.length === skExpectPick && skAfter.every(function (f) { return f.from === skPickKey; }),
      'got ' + skAfter.length + ' want ' + skExpectPick);
    A.check('ch-sankey-d3-demo-pick-source-keeps-top20-targets-only',
      skAfter.every(function (f) { return parseInt(f.to.slice(2), 10) <= 20; }), '');
    document.getElementById('sankey-clear-btn').click();
    // 三层 scratch：勾选源 1 后保留 源1->中* (4) + 中*->终* (12) = 16
    skThreeHost.querySelector('#sk3-from-list .ds-sankey-drop-item:not(.all) input[value="源1"]').click();
    var sk3After = skThreeComp.chart().data.datasets[0].data;
    var sk3Down = sk3After.filter(function (f) { return f.from.indexOf('源') !== 0; }).length;
    A.check('ch-sankey-d3-3layer-pick-source-keeps-downstream-flows', sk3Down === 12, 'downstream flows=' + sk3Down);
    A.check('ch-sankey-d3-3layer-pick-source-total-16', sk3After.length === 16, 'got ' + sk3After.length);
    A.check('ch-sankey-d3-3layer-other-sources-excluded',
      sk3After.every(function (f) { return f.from === '源1' || f.from.indexOf('源') !== 0; }), '');
    skThreeComp.destroy();
    skThreeHost.remove();

    // ---- Top-N 在 demo 真实卡片上：默认前 20 个项目；勾选 -> 只剩勾选项（榜内/榜外都一样） ----
    function skDemoTargets() {
      return sankeyComp.chart().data.datasets[0].data.map(function (f) { return f.to; })
        .filter(function (t, i, a) { return a.indexOf(t) === i; });
    }
    var skTop0 = skDemoTargets();
    A.check('ch-sankey-demo-topn-default-shows-20-projects', skTop0.length === 20 && sankeyComp.chart().data.datasets[0].data.length === 43,
      'got ' + skTop0.length);
    A.check('ch-sankey-demo-topn-default-is-highest-flow-20',
      skTop0.indexOf('项目01') !== -1 && skTop0.indexOf('项目20') !== -1 &&
        skTop0.indexOf('项目21') === -1 && skTop0.indexOf('项目25') === -1, skTop0.join());
    // 新语义（用户实测反馈：旧的"追加"语义下勾榜内项目数据完全不变，等于筛选没反应）：
    // 目标端勾了任何项 -> 只显示勾选的；一项都没勾 -> 默认前 20。
    // 期望值按 mockdata 人工核对：项目03 有 3 条流向(372)、项目02 有 3 条(386)、
    // 项目25 有 1 条(20)、项目01 有 4 条(400)。
    function skPick(name) {
      return [].filter.call(document.querySelectorAll('#sankey-to-list input'), function (c) { return c.value === name; })[0];
    }
    function skDemoN() { return sankeyComp.chart() ? sankeyComp.chart().data.datasets[0].data.length : 0; }
    skPick('项目03').click();
    var skTop1 = skDemoTargets();
    A.check('ch-sankey-demo-topn-checking-insider-shows-only-it',
      skTop1.length === 1 && skTop1[0] === '项目03' && skDemoN() === 3, 'got ' + skTop1.join() + ' flows=' + skDemoN());
    skPick('项目02').click();
    var skTopTwo = skDemoTargets().sort().join();
    A.check('ch-sankey-demo-topn-checking-two-insiders-shows-only-those',
      skTopTwo === '项目02,项目03' && skDemoN() === 6, 'got ' + skTopTwo + ' flows=' + skDemoN());
    document.getElementById('sankey-clear-btn').click();
    skPick('项目25').click();
    var skTop2 = skDemoTargets();
    A.check('ch-sankey-demo-topn-checking-outsider-shows-only-it',
      skTop2.length === 1 && skTop2[0] === '项目25' && skDemoN() === 1, 'got ' + skTop2.join() + ' flows=' + skDemoN());
    skPick('项目03').click();
    A.check('ch-sankey-demo-topn-insider-plus-outsider-shows-exactly-two',
      skDemoTargets().sort().join() === '项目03,项目25' && skDemoN() === 4, 'got ' + skDemoTargets().join() + ' flows=' + skDemoN());
    document.getElementById('sankey-clear-btn').click();
    A.check('ch-sankey-demo-topn-clear-returns-to-20', skDemoTargets().length === 20 && skDemoN() === 43, '');
    // 两端同时勾：所选仪器 ∩ 所选项目之间的流向；不可达则空态
    var skBackup = DS_MOCK.instruments()[3];
    var skBackupFlows = sankeyUniverse.filter(function (f) { return f.from === skBackup; });
    var skBackupTo = skBackupFlows.map(function (f) { return f.to; });
    var skBothProj = ['项目01', '项目02', '项目03'].filter(function (k) { return skBackupTo.indexOf(k) !== -1; })[0];
    var skNoProj = ['项目01', '项目02', '项目03', '项目04', '项目05', '项目06'].filter(function (k) { return skBackupTo.indexOf(k) === -1; })[0];
    sankeyComp.setSelection({ from: [skBackup], to: [skBothProj] });
    A.check('ch-sankey-demo-both-ends-shows-only-the-path',
      skDemoN() === 1 && sankeyComp.chart().data.datasets[0].data[0].from === skBackup &&
        sankeyComp.chart().data.datasets[0].data[0].to === skBothProj, 'flows=' + skDemoN());
    sankeyComp.setSelection({ from: [skBackup], to: [skNoProj] });
    A.check('ch-sankey-demo-both-ends-unreachable-shows-empty-state',
      sankeyComp.chart() === null && !!document.querySelector('#sankey-host .ds-chart-empty'), 'proj=' + skNoProj);
    document.getElementById('sankey-clear-btn').click();
    A.check('ch-sankey-demo-after-empty-state-clear-restores-43', skDemoN() === 43, '');

    // ================= 桑基图：每一列铺满绘图区纵向高度（dsSankeyFill）=================
    // 几何量一律从控制器的节点（_nodes）+ y 轴换算成像素，另外用 canvas 像素
    // 扫描独立核对"真正画出来的"首/末行（不依赖同一份模型）。
    function skGeom(chart) {
      var ctrl = chart.getDatasetMeta(0).controller, ys = chart.scales.y, xs = chart.scales.x;
      var cols = {}, fin = {}, fout = {};
      // 节点流量取自原始数据（不取控制器的 in/out，防止实现改写 in/out 来"拉伸"节点）
      chart.data.datasets[0].data.forEach(function (f) {
        fout[f.from] = (fout[f.from] || 0) + f.flow; fin[f.to] = (fin[f.to] || 0) + f.flow;
      });
      ctrl._nodes.forEach(function (n, key) {
        var val = Math.max(fin[key] || fout[key], fout[key] || fin[key]);
        // 画出来的节点高度 = 控制器按节点自己的 in/out 画的那个值（与插件 _drawNodes 一致）
        var drawn = Math.max(n.in || n.out, n.out || n.in);
        var top = ys.getPixelForValue(n.y), bot = ys.getPixelForValue(n.y + drawn);
        (cols[n.x] = cols[n.x] || []).push({ key: key, top: top, bottom: bot, h: bot - top, val: val, n: n, px: xs.getPixelForValue(n.x) });
      });
      var out = Object.keys(cols).sort(function (a, b) { return a - b; }).map(function (k) {
        return cols[k].sort(function (a, b) { return a.top - b.top; });
      });
      return out;
    }
    function skFillDev(chart) {
      var a = chart.chartArea, worst = 0, info = [];
      skGeom(chart).forEach(function (col) {
        var d = Math.max(Math.abs(col[0].top - a.top), Math.abs(col[col.length - 1].bottom - a.bottom));
        info.push(col.length + 'n:' + col[0].top.toFixed(1) + '-' + col[col.length - 1].bottom.toFixed(1));
        if (d > worst) worst = d;
      });
      return { worst: worst, info: info.join(' ') + ' area=' + a.top.toFixed(1) + '-' + a.bottom.toFixed(1), cols: info.length };
    }
    function skPaintDev(chart) {
      var a = chart.chartArea, dpr = chart.currentDevicePixelRatio || 1, ctx = chart.ctx, worst = 0, info = [];
      skGeom(chart).forEach(function (col) {
        var x = Math.round((col[0].px + 5) * dpr);
        var data = ctx.getImageData(x, 0, 1, chart.canvas.height).data, first = -1, last = -1;
        for (var r = 0; r < chart.canvas.height; r++) {
          if (data[r * 4 + 3] > 200) { if (first < 0) first = r; last = r; }
        }
        first /= dpr; last = (last + 1) / dpr;
        info.push(first.toFixed(1) + '-' + last.toFixed(1));
        var d = first < 0 ? 999 : Math.max(Math.abs(first - a.top), Math.abs(last - a.bottom));
        if (d > worst) worst = d;
      });
      return { worst: worst, info: info.join(' ') + ' area=' + a.top.toFixed(1) + '-' + a.bottom.toFixed(1) };
    }
    function skScaleDev(chart) {
      var ratios = [];
      skGeom(chart).forEach(function (col) { col.forEach(function (g) { ratios.push(g.h / g.val); }); });
      var mn = Math.min.apply(null, ratios), mx = Math.max.apply(null, ratios);
      var flowR = chart.getDatasetMeta(0).data.map(function (e, i) { return e.height / chart.data.datasets[0].data[i].flow; });
      var fmn = Math.min.apply(null, flowR), fmx = Math.max.apply(null, flowR);
      return { nodeSpread: (mx - mn) / mx, ratio: mx, flowSpread: (fmx - fmn) / fmx, flowRatio: fmx, min: mn };
    }
    function skEndpointDev(chart) {
      var g = skGeom(chart), byKey = {}, worst = 0;
      g.forEach(function (col) { col.forEach(function (n) { byKey[n.key] = n; }); });
      chart.getDatasetMeta(0).data.forEach(function (e, i) {
        var f = chart.data.datasets[0].data[i], a = byKey[f.from], b = byKey[f.to];
        var d1 = Math.max(a.top - e.y, e.y + e.height - a.bottom, 0);
        var d2 = Math.max(b.top - e.y2, e.y2 + e.height - b.bottom, 0);
        worst = Math.max(worst, d1, d2);
      });
      return worst;
    }
    function skAllGeomOk(chart) {
      var f = skFillDev(chart), p = skPaintDev(chart), e = skEndpointDev(chart), c = skScaleDev(chart);
      return { ok: f.worst <= 2 && p.worst <= 2 && e <= 1 && c.nodeSpread < 0.01 && c.flowSpread < 0.01 && Math.abs(c.ratio - c.flowRatio) / c.ratio < 0.01,
        txt: 'fill=' + f.worst.toFixed(2) + ' paint=' + p.worst.toFixed(2) + ' endpoint=' + e.toFixed(2) +
          ' scale=' + c.nodeSpread.toFixed(4) + '/' + c.flowSpread.toFixed(4) + ' ' + f.info };
    }
    // 在流向内部选点：固定整数 x，扫整数 y，取连续命中 >=5px 区段的中点（避开两条流向交界）
    function skFindMid(chart, idx, side) {
      var el = chart.getDatasetMeta(0).data[idx], a = chart.chartArea, mid = (a.left + a.right) / 2;
      var x0 = Math.min(el.x, el.x2), x1 = Math.max(el.x, el.x2);
      for (var fx = 0.15; fx <= 0.85; fx += 0.05) {
        var x = Math.round(x0 + (x1 - x0) * fx);
        if (side === 'L' && x >= mid) continue;
        if (side === 'R' && x <= mid) continue;
        var run = 0;
        for (var y = Math.floor(Math.min(el.y, el.y2)); y <= Math.ceil(Math.max(el.y, el.y2) + el.height) + 1; y++) {
          if (skHit(chart, x, y) === idx) run++;
          else { if (run >= 5) return { x: x, y: y - 1 - Math.floor((run - 1) / 2) }; run = 0; }
        }
        if (run >= 5) return { x: x, y: Math.ceil(Math.max(el.y, el.y2) + el.height) + 1 - Math.floor((run - 1) / 2) };
      }
      return null;
    }

    skDemo = sankeyComp.chart();
    skDemo.resize(); skDemo.update('none');
    var skG0 = skGeom(skDemo);
    A.check('ch-sankey-fill-demo-columns-4-and-20', skG0.length === 2 && skG0[0].length === 4 && skG0[1].length === 20,
      skG0.map(function (c) { return c.length; }).join());
    var skF0 = skFillDev(skDemo);
    A.check('ch-sankey-fill-demo-every-column-first-top-last-bottom-match-area', skF0.cols === 2 && skF0.worst <= 2, skF0.info);
    var skP0 = skPaintDev(skDemo);
    A.check('ch-sankey-fill-demo-painted-pixels-span-area', skP0.worst <= 2, skP0.info);
    var skS0 = skScaleDev(skDemo);
    A.check('ch-sankey-fill-demo-node-height-proportional-to-flow-single-scale',
      skS0.nodeSpread < 0.01 && skS0.flowSpread < 0.01 && Math.abs(skS0.ratio - skS0.flowRatio) / skS0.ratio < 0.01,
      'nodeSpread=' + skS0.nodeSpread + ' flowSpread=' + skS0.flowSpread + ' ratio=' + skS0.ratio + '/' + skS0.flowRatio);
    var skE0 = skEndpointDev(skDemo);
    A.check('ch-sankey-fill-demo-flow-endpoints-inside-their-nodes', skE0 <= 1, 'worst=' + skE0.toFixed(2));
    A.check('ch-sankey-fill-demo-gaps-nonneg-and-ordered',
      skG0.every(function (c) { return c.every(function (g, i) { return i === 0 || g.top >= c[i - 1].bottom - 0.01; }); }), '');

    // 三层 scratch（3/4/3 节点三列）
    var skT3Host = document.createElement('div');
    document.body.appendChild(skT3Host);
    var skT3Comp = DS.sankey.mount(skT3Host, skMakeThree(), { id: 'skfill3' });
    var skT3 = skT3Comp.chart();
    skT3.resize(); skT3.update('none');
    var skT3F = skFillDev(skT3);
    A.check('ch-sankey-fill-3layer-every-column-first-top-last-bottom-match-area', skT3F.cols === 3 && skT3F.worst <= 2, skT3F.info);
    var skT3P = skPaintDev(skT3);
    A.check('ch-sankey-fill-3layer-painted-pixels-span-area', skT3P.worst <= 2, skT3P.info);
    var skT3S = skScaleDev(skT3);
    A.check('ch-sankey-fill-3layer-node-height-proportional-to-flow-single-scale',
      skT3S.nodeSpread < 0.01 && skT3S.flowSpread < 0.01 && Math.abs(skT3S.ratio - skT3S.flowRatio) / skT3S.ratio < 0.01,
      'nodeSpread=' + skT3S.nodeSpread + ' flowSpread=' + skT3S.flowSpread);
    var skT3E = skEndpointDev(skT3);
    A.check('ch-sankey-fill-3layer-flow-endpoints-inside-their-nodes', skT3E <= 1, 'worst=' + skT3E.toFixed(2));

    // 点击高亮 / 筛选重建 / 全屏进出之后仍铺满且流向贴合（demo 真实卡片，真实点击）
    var skFpIdx = -1, skFp = null, skFi;
    for (skFi = 0; skFi < skDemo.data.datasets[0].data.length && !skFp; skFi++) { skFp = skFindMid(skDemo, skFi, 'L'); if (skFp) skFpIdx = skFi; }
    A.check('ch-sankey-fill-demo-click-point-found', !!skFp, 'no >=5px run');
    if (skFp) {
      skRealClick(skDemo, skFp.x, skFp.y);
      var skAfterClick = skAllGeomOk(skDemo);
      A.check('ch-sankey-fill-after-click-highlight-still-filled', !!skDemo.$dsSankey.active && skAfterClick.ok, skAfterClick.txt);
      skRealClick(skDemo, skFp.x, skFp.y);
    }
    sankeyComp.setSelection({ from: DS_MOCK.instruments().slice(0, 2), to: [] });
    var skRb = sankeyComp.chart(), skRbG = skGeom(skRb), skRbOk;
    skRb.resize(); skRb.update('none');
    skRbOk = skAllGeomOk(skRb);
    A.check('ch-sankey-fill-after-filter-rebuild-still-filled',
      skRb !== skDemo && skRbG.length === 2 && skRbG[0].length === 2 && skRbOk.ok, skRbOk.txt);
    sankeyComp.clear();
    var skFsD = sankeyComp.chart(), skFsDHost = skFsD.canvas.parentNode, skFsH0 = skFsD.height;
    skFsD.resize();
    skFsDHost.querySelector('[data-act="full"]').click();
    var skFsOk = skAllGeomOk(skFsD);
    A.check('ch-sankey-fill-after-fullscreen-enter-redistributed',
      skFsDHost.classList.contains('ds-chart-fullscreen') && skFsD.height > skFsH0 && skFsOk.ok,
      'h ' + skFsH0 + ' -> ' + skFsD.height + ' ' + skFsOk.txt);
    skFsDHost.querySelector('[data-act="full"]').click();
    var skFsOk2 = skAllGeomOk(skFsD);
    A.check('ch-sankey-fill-after-fullscreen-exit-still-filled',
      !skFsDHost.classList.contains('ds-chart-fullscreen') && skFsD.height === skFsH0 && skFsOk2.ok, skFsOk2.txt);
    skT3Comp.destroy();
    skT3Host.remove();

    // 单节点列：居中（1 节点无法首贴顶末贴底）；另一列仍铺满
    var skOneHost = document.createElement('div');
    document.body.appendChild(skOneHost);
    var skOneComp = DS.sankey.mount(skOneHost, [
      { from: '源', to: '甲', flow: 30 }, { from: '源', to: '乙', flow: 20 }, { from: '源', to: '丙', flow: 10 }
    ], { id: 'skone' });
    var skOne = skOneComp.chart();
    skOne.resize(); skOne.update('none');
    var skOneG = skGeom(skOne), skOneA = skOne.chartArea;
    var skOneMid = (skOneG[0][0].top + skOneG[0][0].bottom) / 2;
    A.check('ch-sankey-fill-single-node-column-centered',
      skOneG[0].length === 1 && Math.abs(skOneMid - (skOneA.top + skOneA.bottom) / 2) <= 2 &&
        skOneG[0][0].top > skOneA.top + 1, 'mid=' + skOneMid.toFixed(1) + ' area=' + skOneA.top.toFixed(1) + '-' + skOneA.bottom.toFixed(1));
    var skOneF = skFillDev(skOne);
    A.check('ch-sankey-fill-single-node-neighbour-column-still-fills',
      Math.abs(skOneG[1][0].top - skOneA.top) <= 2 && Math.abs(skOneG[1][2].bottom - skOneA.bottom) <= 2 && skEndpointDev(skOne) <= 1,
      skF0.info + ' | ' + skOneF.info);
    skOneComp.destroy();
    skOneHost.remove();

    // ---- demo 数据多样性：每个项目对应的仪器数 ----
    var skFlowsA = DS_MOCK.sankeyFlows(), skFlowsB = DS_MOCK.sankeyFlows();
    var skPerProj = {}, skPerInst = {}, skProjFlows = {}, skProjTotal = {};
    skFlowsA.forEach(function (f) {
      skPerProj[f.to] = (skPerProj[f.to] || 0) + 1;
      skPerInst[f.from] = (skPerInst[f.from] || 0) + f.flow;
      (skProjFlows[f.to] = skProjFlows[f.to] || []).push(f.flow);
      skProjTotal[f.to] = (skProjTotal[f.to] || 0) + f.flow;
    });
    var skDist = { 1: 0, 2: 0, 3: 0, 4: 0, other: 0 };
    Object.keys(skPerProj).forEach(function (k) { var c = skPerProj[k]; if (skDist[c] !== undefined && c <= 4) skDist[c]++; else skDist.other++; });
    A.check('ch-sankey-demo-data-instrument-count-per-project-covers-1-to-4',
      skDist[1] > 0 && skDist[2] > 0 && skDist[3] > 0 && skDist[4] > 0 && skDist.other === 0 &&
        Object.keys(skPerProj).length === 25, JSON.stringify(skDist));
    A.check('ch-sankey-demo-data-no-single-count-dominates',
      Math.max(skDist[1], skDist[2], skDist[3], skDist[4]) <= 12, JSON.stringify(skDist));
    A.check('ch-sankey-demo-data-shares-uneven-within-multi-instrument-projects',
      Object.keys(skProjFlows).filter(function (k) { return skProjFlows[k].length >= 2; }).every(function (k) {
        var v = skProjFlows[k]; return Math.max.apply(null, v) >= 1.3 * Math.min.apply(null, v);
      }), '');
    var skInstTot = Object.keys(skPerInst).map(function (k) { return skPerInst[k]; });
    A.check('ch-sankey-demo-data-instrument-workloads-differ-backup-lowest',
      skInstTot.length === 4 && Math.max.apply(null, skInstTot) >= 3 * Math.min.apply(null, skInstTot) &&
        skPerInst[DS_MOCK.instruments()[3]] === Math.min.apply(null, skInstTot), JSON.stringify(skPerInst));
    A.check('ch-sankey-demo-data-deterministic-and-project-totals-gradient',
      JSON.stringify(skFlowsA) === JSON.stringify(skFlowsB) && skProjTotal['项目01'] === 400 && skProjTotal['项目20'] === 134 &&
        skProjTotal['项目21'] === 60 && skProjTotal['项目25'] === 20, '');

    // 纯函数：4 层链 + 死分支。X 是第 0 层的另一个源；P→Q→R→T1，P→Q2 死在没入选的 T9
    var skChain = [
      { from: 'P', to: 'Q', flow: 5 }, { from: 'Q', to: 'R', flow: 5 }, { from: 'R', to: 'T1', flow: 5 },
      { from: 'X', to: 'Q', flow: 3 }, { from: 'R', to: 'T9', flow: 1 }
    ];
    var skR1 = DS.sankey.filterFlows(skChain, { from: ['P'], to: [] }, { topN: 1 });
    A.check('ch-sankey-d3-pure-multi-layer-reachability',
      skR1.flows.length === 3 && skR1.flows.every(function (f) { return f.from !== 'X' && f.to !== 'T9'; }),
      JSON.stringify(skR1.flows));
    A.check('ch-sankey-d3-pure-endpoints-first-and-last-layer',
      DS.sankey.endpoints(skChain).sources.sort().join() === 'P,X' &&
        DS.sankey.endpoints(skChain).sinks.sort().join() === 'T1,T9', '');
    A.check('ch-sankey-d3-pure-middle-nodes-not-selectable',
      DS.sankey.filterFlows(skChain, { from: ['Q'], to: [] }, { topN: 5 }).flows.length === 5, 'Q is not a source: ignored, all sources used');

    // ---- D4：目标端默认 Top-N、勾选只看勾选（30 个目标端的合成数据）----
    var skBig = [{ from: 'S1', to: 'M1', flow: 1 }];
    for (var ti = 1; ti <= 30; ti++) {
      skBig.push({ from: 'M1', to: 'T' + (ti < 10 ? '0' : '') + ti, flow: 100 - ti });  // T01 最大，T30 最小
    }
    var skF0 = DS.sankey.filterFlows(skBig, {}, {});
    var skSinks0 = skF0.flows.filter(function (f) { return f.from === 'M1'; }).map(function (f) { return f.to; });
    A.check('ch-sankey-d4-default-top20-of-30', skSinks0.length === 20 && skF0.shownSinks.length === 20, 'got ' + skSinks0.length);
    A.check('ch-sankey-d4-default-top20-are-highest-flow',
      skSinks0.indexOf('T01') !== -1 && skSinks0.indexOf('T20') !== -1 && skSinks0.indexOf('T21') === -1, skSinks0.join());
    var skF1 = DS.sankey.filterFlows(skBig, { to: ['T25'] }, {});
    var skSinks1 = skF1.flows.filter(function (f) { return f.from === 'M1'; }).map(function (f) { return f.to; });
    A.check('ch-sankey-d4-selecting-sink-restricts-to-selection',
      skSinks1.length === 1 && skSinks1[0] === 'T25' && skF1.shownSinks.join() === 'T25', 'got ' + skSinks1.join());
    var skSinks1b = DS.sankey.filterFlows(skBig, { to: ['T03', 'T30', 'T07'] }, {}).flows
      .filter(function (f) { return f.from === 'M1'; }).map(function (f) { return f.to; }).sort().join();
    A.check('ch-sankey-d4-selecting-several-sinks-shows-exactly-those', skSinks1b === 'T03,T07,T30', 'got ' + skSinks1b);
    var skSinks1c = DS.sankey.filterFlows(skBig, { to: ['T03'] }, { topN: 5 }).flows
      .filter(function (f) { return f.from === 'M1'; }).map(function (f) { return f.to; }).join();
    A.check('ch-sankey-d4-selecting-insider-ignores-topn', skSinks1c === 'T03', 'got ' + skSinks1c);
    A.check('ch-sankey-d4-topn-configurable',
      DS.sankey.filterFlows(skBig, {}, { topN: 5 }).shownSinks.length === 5 &&
        DS.sankey.filterFlows(skBig, {}, { topN: 0 }).shownSinks.length === 0, '');
    var skF2 = DS.sankey.filterFlows(skBig.concat([{ from: 'S2', to: 'M1', flow: 1 }]), { from: ['S2'] }, {});
    A.check('ch-sankey-d4-source-selection-restricts-to-selected',
      skF2.flows.every(function (f) { return f.from !== 'S1'; }), JSON.stringify(skF2.flows.slice(0, 2)));
    // 组件 + 真实复选框：mount 一个 30 目标端的图，topN=5，勾选 T30 -> 只剩 T30
    var skBigHost = document.createElement('div');
    document.body.appendChild(skBigHost);
    var skBigComp = DS.sankey.mount(skBigHost, skBig, { id: 'skbig', topN: 5 });
    var skBigTo = function () {
      return skBigComp.chart().data.datasets[0].data.filter(function (f) { return f.from === 'M1'; }).map(function (f) { return f.to; });
    };
    A.check('ch-sankey-d4-component-default-shows-topn', skBigTo().length === 5, 'got ' + skBigTo().length);
    A.check('ch-sankey-d4-component-to-list-lists-all-30',
      skBigHost.querySelectorAll('#skbig-to-list .ds-sankey-drop-item:not(.all)').length === 30, '');
    var skT30 = [].filter.call(skBigHost.querySelectorAll('#skbig-to-list input'), function (c) { return c.value === 'T30'; })[0];
    skT30.click();
    A.check('ch-sankey-d4-component-checking-sink-shows-only-it',
      skBigTo().length === 1 && skBigTo()[0] === 'T30', 'got ' + skBigTo().join());
    A.check('ch-sankey-d4-component-badge-counts-selection',
      skBigHost.querySelector('#skbig-to-badge').textContent === '(1)', '');

    // ---- 目标端下拉上限：末层 60 个节点，默认只列流量前 40（maxToItems 可配）----
    var skHuge = [{ from: 'S1', to: 'M1', flow: 1 }];
    for (var hi = 1; hi <= 60; hi++) {
      skHuge.push({ from: 'M1', to: 'U' + (hi < 10 ? '0' : '') + hi, flow: 200 - hi * 2 });  // U01 最大
    }
    function skListKeys(host, id) {
      return [].map.call(host.querySelectorAll('#' + id + '-to-list .ds-sankey-drop-item:not(.all) input'), function (c) { return c.value; });
    }
    var skHugeHost = document.createElement('div');
    document.body.appendChild(skHugeHost);
    var skHugeComp = DS.sankey.mount(skHugeHost, skHuge, { id: 'skhuge' });
    var skHugeKeys = skListKeys(skHugeHost, 'skhuge');
    A.check('ch-sankey-list-cap-default-40-items', skHugeKeys.length === 40, 'got ' + skHugeKeys.length);
    A.check('ch-sankey-list-cap-keeps-highest-flow-40',
      skHugeKeys[0] === 'U01' && skHugeKeys[39] === 'U40' && skHugeKeys.indexOf('U41') === -1,
      skHugeKeys[0] + '..' + skHugeKeys[skHugeKeys.length - 1]);
    A.check('ch-sankey-list-cap-sorted-by-flow-desc',
      skHugeKeys.every(function (k, i) { return i === 0 || skHugeKeys[i - 1] < k; }), '');
    A.check('ch-sankey-list-cap-does-not-change-default-topn-view',
      skHugeComp.visibleFlows().filter(function (f) { return f.from === 'M1'; }).length === 20, '');
    skHugeComp.destroy();
    skHugeComp = DS.sankey.mount(skHugeHost, skHuge, { id: 'skhuge', maxToItems: 10 });
    A.check('ch-sankey-list-cap-configurable', skListKeys(skHugeHost, 'skhuge').length === 10, '');
    skHugeComp.destroy();
    skHugeHost.remove();
    var skFewHost = document.createElement('div');
    document.body.appendChild(skFewHost);
    var skFewComp = DS.sankey.mount(skFewHost, skBig, { id: 'skfew' });
    A.check('ch-sankey-list-cap-not-applied-below-limit', skListKeys(skFewHost, 'skfew').length === 30, '');
    skFewComp.destroy();
    skFewHost.remove();

    // ---- D5：桑基图全屏（真实按钮点击）----
    skBigHost.style.width = '420px';
    var skFsChart = skBigComp.chart();
    skBigComp.setSelection({ from: ['S1'], to: [] });
    skFsChart = skBigComp.chart();
    skFsChart.resize();
    var skFsHost = skFsChart.canvas.parentNode;
    var skFsBtns = [].map.call(skFsHost.querySelectorAll('.ds-chart-toolbar [data-act]'), function (b) { return b.getAttribute('data-act'); });
    A.check('ch-sankey-d5-toolbar-only-fullscreen-button', skFsBtns.join() === 'full', 'got ' + skFsBtns.join());
    var skFlow0 = skFsChart.data.datasets[0].data.findIndex(function (f) { return f.to === 'T01'; });
    var skFsPt = skFindPoint(skFsChart, skFlow0, 'R');
    if (skFsPt) skRealClick(skFsChart, skFsPt.x, skFsPt.y);
    var skActiveBefore = skFsChart.$dsSankey.active, skBaseBefore = skFsChart.$dsSankey.baseline;
    var skW0 = skFsChart.width, skH0 = skFsChart.height;
    skFsHost.querySelector('[data-act="full"]').click();
    A.check('ch-sankey-d5-click-enters-fullscreen-class', skFsHost.classList.contains('ds-chart-fullscreen'), '');
    A.check('ch-sankey-d5-fullscreen-resizes-canvas',
      skFsChart.width > skW0 && skFsChart.height > skH0, 'before=' + skW0 + 'x' + skH0 + ' after=' + skFsChart.width + 'x' + skFsChart.height);
    // 重建之后才进全屏（本组件 setSelection 已重建过一次）：新实例的
    // ResizeObserver 首次回调会晚到并带着"创建时"的旧尺寸，不能把刚放大的画布缩回去
    // ——模拟这次迟到的回调：用旧尺寸显式调用 resize(w,h)，必须仍是全屏尺寸。
    skFsChart.resize(skW0, skH0);
    A.check('ch-sankey-d5-stale-observer-size-after-rebuild-ignored',
      skFsChart.width > skW0 && skFsChart.height > skH0, 'after stale resize ' + skFsChart.width + 'x' + skFsChart.height);
    A.check('ch-sankey-d5-fullscreen-keeps-same-instance-and-state',
      skBigComp.chart() === skFsChart && skFsChart.$dsSankey.active === skActiveBefore &&
        skFsChart.$dsSankey.baseline === skBaseBefore && !!skActiveBefore, 'active=' + !!skActiveBefore);
    A.check('ch-sankey-d5-fullscreen-keeps-filter-selection',
      skBigComp.getSelection().from.join() === 'S1' && skBigHost.querySelector('#skbig-from-badge').textContent === '(1)', '');
    skFsHost.querySelector('[data-act="full"]').click();
    A.check('ch-sankey-d5-second-click-exits-fullscreen-and-restores-size',
      !skFsHost.classList.contains('ds-chart-fullscreen') && skFsChart.width === skW0 && skFsChart.height === skH0,
      'size ' + skFsChart.width + 'x' + skFsChart.height + ' want ' + skW0 + 'x' + skH0);
    skFsHost.querySelector('[data-act="full"]').click();         // 再进全屏后重建：class 必须被清掉
    skBigComp.clear();
    A.check('ch-sankey-d5-rebuild-in-fullscreen-clears-class',
      !skBigComp.chart().canvas.parentNode.classList.contains('ds-chart-fullscreen'), '');
    // demo 真实卡片也有全屏入口
    A.check('ch-sankey-d5-demo-card-has-fullscreen-button',
      !!document.querySelector('#sankey-host .ds-chart-toolbar [data-act="full"]') &&
        !document.querySelector('#sankey-host [data-act="in"]'), '');

    // ---- 组件下沉：库 API 的销毁与重建 ----
    var skCanvasBefore = document.getElementById('c-skbig');
    var skRegBefore = DS.charts.all().length;
    skBigComp.setSelection({ from: [], to: ['T30'] });
    A.check('ch-sankey-comp-rebuild-swaps-canvas', document.getElementById('c-skbig') !== skCanvasBefore, '');
    A.check('ch-sankey-comp-rebuild-keeps-registry-size', DS.charts.all().length === skRegBefore, DS.charts.all().length + ' vs ' + skRegBefore);
    skBigComp.destroy();
    skBigHost.remove();
    A.check('ch-sankey-comp-destroy-releases-registry', DS.charts.all().length === skRegBefore - 1, DS.charts.all().length);
    A.check('ch-sankey-comp-empty-selection-shows-empty-state-not-crash', (function () {
      var h = document.createElement('div'); document.body.appendChild(h);
      var c = DS.sankey.mount(h, [{ from: 'a', to: 'b', flow: 1 }], { id: 'skempty', topN: 0 });
      var ok = c.chart() === null && !!h.querySelector('.ds-chart-empty');
      c.destroy(); h.remove(); return ok;
    })(), '');

    // ---- 全屏往返：真实 demo 页 Grid 卡片里的 c-bar / c-hbar / c-sankey ----
    // 旧断言 wh-fullscreen-canvas-restores-exact 为什么没拦住回退：c-bar 在默认
    // 隐藏的另一个标签页里，套件跑到那里时它的宿主是 display:none，画布 0x0，
    // "进全屏前 0x0 / 退出后 0x0" 精确相等是空洞的恒真断言（外加它只量画布、
    // 不量容器）。这里先显式切到图表所在的标签页并 resize，加一条"进全屏前
    // 必须有真实尺寸"的非空洞守卫，并同时断言画布和宿主容器宽度都精确恢复
    // （容器被撑大会把同一行其他卡片挤变形）。
    function skShowPanel(id) {
      document.querySelector('[data-panel="' + id + '"]').click();
      ['c-bar', 'c-hbar', 'c-sankey'].forEach(function (cid) {
        var ch = document.getElementById(cid)._dsChart;
        if (ch && ch.canvas.parentNode.clientWidth > 0) ch.resize();
      });
    }
    ['c-bar', 'c-hbar', 'c-sankey'].forEach(function (cid) {
      skShowPanel(cid === 'c-bar' ? 'p-play' : 'p-comp');
      var cv = document.getElementById(cid), ch = cv._dsChart, hostEl = cv.parentNode;
      var before = { w: ch.width, h: ch.height, hw: hostEl.clientWidth, cardW: hostEl.parentNode.clientWidth };
      A.check('ch-fs-roundtrip-' + cid + '-nonvacuous-before', before.w > 100 && before.h > 100 && before.hw > 100,
        JSON.stringify(before));
      hostEl.querySelector('[data-act="full"]').click();
      var during = { w: ch.width, h: ch.height, hw: hostEl.clientWidth };
      // 窄视口下全屏宽度可能不变，面积（主要是高度）必然变大
      A.check('ch-fs-roundtrip-' + cid + '-enlarges', during.w * during.h > before.w * before.h, JSON.stringify(during));
      hostEl.querySelector('[data-act="full"]').click();
      var after = { w: ch.width, h: ch.height, hw: hostEl.clientWidth, cardW: hostEl.parentNode.clientWidth };
      A.check('ch-fs-roundtrip-' + cid + '-canvas-restores-exact',
        after.w === before.w && after.h === before.h, JSON.stringify(before) + ' -> ' + JSON.stringify(after));
      A.check('ch-fs-roundtrip-' + cid + '-container-width-restores-exact',
        after.hw === before.hw && after.cardW === before.cardW, JSON.stringify(before) + ' -> ' + JSON.stringify(after));
    });
    // 先重建再进全屏（竞态修复不能被撤销）：对真实 demo 的桑基卡片
    skShowPanel('p-comp');
    document.getElementById('sankey-clear-btn').click();
    var skRb = document.getElementById('c-sankey'), skRbChart = skRb._dsChart, skRbHost = skRb.parentNode;
    skRbChart.resize();
    var skRbHW0 = skRbHost.clientWidth, skRbW0 = skRbChart.width, skRbA0 = skRbChart.width * skRbChart.height;
    skRbHost.querySelector('[data-act="full"]').click();
    var skRbH0 = skRbA0 / skRbW0;
    skRbChart.resize(skRbW0, skRbH0);   // 迟到的旧尺寸回调
    A.check('ch-fs-roundtrip-sankey-after-rebuild-enlarges', skRbW0 > 100 && skRbChart.width * skRbChart.height > skRbA0,
      skRbW0 + 'x' + skRbH0 + ' -> ' + skRbChart.width + 'x' + skRbChart.height);
    skRbHost.querySelector('[data-act="full"]').click();
    A.check('ch-fs-roundtrip-sankey-after-rebuild-restores-exact',
      skRbChart.width === skRbW0 && skRbChart.height === skRbH0 && skRbHost.clientWidth === skRbHW0, skRbW0 + ' -> ' + skRbChart.width + ' host ' + skRbHost.clientWidth);
    // ---- 机制断言（确定性复现，不依赖视口宽度）----
    // 现场：全屏时画布 inline width 是全屏宽（571 宽的卡片全屏到 1358）；退出全屏
    // 时若立刻量容器，Grid 子项 min-width:auto 会被这个过宽画布撑开，量出来的容器
    // 宽就是 1358，画布按 1358 定型、卡片/宿主一起被撑大。测试视口窄时全屏宽度
    // 等于卡片宽、复现不出来，所以直接给画布一个"全屏残留"的 5000px inline 宽度，
    // 再 resize()，要求画布与容器都回到布局应有的宽度。两个修复（CSS min-width:0 +
    // resize 前先收起 inline 宽度）各自单独都足够，所以变异验证要两个一起撤。
    ['c-bar', 'c-hbar', 'c-sankey'].forEach(function (cid) {
      skShowPanel(cid === 'c-bar' ? 'p-play' : 'p-comp');
      var pcv = document.getElementById(cid), pch = pcv._dsChart, phost = pcv.parentNode, pcard = phost.parentNode;
      pch.resize();
      var pb = { w: pch.width, hw: phost.clientWidth, cardW: pcard.clientWidth };
      pcv.style.width = '5000px';
      pch.resize();
      var pa = { w: pch.width, hw: phost.clientWidth, cardW: pcard.clientWidth };
      A.check('ch-fs-poisoned-inline-width-' + cid + '-restores-canvas-and-container',
        pb.w > 100 && pa.w === pb.w && pa.hw === pb.hw && pa.cardW === pb.cardW,
        JSON.stringify(pb) + ' -> ' + JSON.stringify(pa));
    });
    // CSS 层：Grid 子项（卡片）与图表宿主的 min-width 必须是 0（库的默认值）
    var skCardEl = document.getElementById('c-hbar').parentNode.parentNode;
    A.check('ch-fs-css-grid-item-min-width-zero',
      getComputedStyle(skCardEl).minWidth === '0px' && getComputedStyle(skCardEl.querySelector('.ds-chart-host')).minWidth === '0px',
      'card=' + getComputedStyle(skCardEl).minWidth + ' host=' + getComputedStyle(skCardEl.querySelector('.ds-chart-host')).minWidth);
    // resize 层（脱离 Grid 的 CSS 保护）：Flex 子项同样有 min-width:auto，且这个外层
    // 包装 div 不吃库的 CSS，只能靠 resize() 先收起 inline 宽度
    var skFlex = document.createElement('div');
    skFlex.style.cssText = 'display:flex;width:300px';
    var skFlexItem = document.createElement('div');
    skFlexItem.style.flex = '1 1 0%';
    var skFlexHost = document.createElement('div');
    skFlexHost.className = 'ds-chart-host';
    var skFlexCv = document.createElement('canvas');
    skFlexHost.appendChild(skFlexCv); skFlexItem.appendChild(skFlexHost); skFlex.appendChild(skFlexItem);
    document.body.appendChild(skFlex);
    var skFlexChart = DS.charts.create(skFlexCv, { type: 'bar', data: { labels: ['a', 'b'], datasets: [{ label: 'x', data: [1, 2] }] } });
    skFlexChart.resize();
    var skFlexW0 = skFlexChart.width;
    skFlexCv.style.width = '5000px';
    skFlexChart.resize();
    A.check('ch-fs-poisoned-inline-width-flex-item-restores',
      skFlexW0 > 50 && skFlexW0 <= 300 && skFlexChart.width === skFlexW0, skFlexW0 + ' -> ' + skFlexChart.width);
    DS.charts.destroy(skFlexChart);
    skFlex.remove();
    skShowPanel('p-play');

    // ---------------- 空数据：不崩，退化成"暂无数据" ----------------
    var sankeyEmptyHost = document.createElement('div');
    sankeyEmptyHost.className = 'ds-chart-host';
    var sankeyEmptyCanvas = document.createElement('canvas');
    sankeyEmptyHost.appendChild(sankeyEmptyCanvas);
    document.body.appendChild(sankeyEmptyHost);
    var sankeyEmptyChart = DS.charts.create(sankeyEmptyCanvas, {
      type: 'sankey',
      data: { datasets: [{ data: [] }] }
    });
    A.check('ch-sankey-empty-data-no-crash-returns-null', sankeyEmptyChart === null, '');
    A.check('ch-sankey-empty-data-shows-placeholder',
      !!sankeyEmptyHost.querySelector('.ds-chart-empty'), '');
    sankeyEmptyHost.remove();

    document.querySelector('[data-panel="p-play"]').click();
  });
  /* ---------- 样本量套件：散点/折线/面积/时间轴/双轴/堆叠的 demo 数据量
     与结构。期望值都是按 mockdata.js 的生成规则人工核对过的常量。 ---------- */
  window.DS_SELFTEST_SUITES.push(function samples(A) {
    function show(canvasId) {
      var cv = document.getElementById(canvasId);
      if (!cv.offsetWidth) {
        document.querySelector('[data-panel="' + (cv.closest('#p-comp') ? 'p-comp' : 'p-play') + '"]').click();
      }
      cv._dsChart.resize();
      return cv._dsChart;
    }
    function pearson(pts) {
      var n = pts.length, sx = 0, sy = 0, i;
      pts.forEach(function (p) { sx += p.x; sy += p.y; });
      var mx = sx / n, my = sy / n, sxy = 0, sxx = 0, syy = 0;
      for (i = 0; i < n; i++) {
        var dx = pts[i].x - mx, dy = pts[i].y - my;
        sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
      }
      return sxy / Math.sqrt(sxx * syy);
    }
    function signChanges(arr) {
      var c = 0, prev = 0;
      for (var i = 1; i < arr.length; i++) {
        var d = arr[i] - arr[i - 1], sg = d > 0 ? 1 : d < 0 ? -1 : 0;
        if (sg && prev && sg !== prev) c++;
        if (sg) prev = sg;
      }
      return c;
    }
    function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
    function fire(chart, type, fx) {
      var r = chart.canvas.getBoundingClientRect();
      chart.canvas.dispatchEvent(new MouseEvent(type, {
        clientX: r.left + r.width * fx, clientY: r.top + r.height / 2, bubbles: true
      }));
    }

    // ---- 散点：3 台仪器各一个系列，共 200 点（70+70+52 主体各自带离群点）----
    var sc = show('c-scatter'), scSer = DS_MOCK.scatterSeries();
    var scDs = sc.data.datasets;
    var scTotal = scDs.reduce(function (a, d) { return a + d.data.length; }, 0);
    A.check('ch-sample-scatter-3-series-200-points-deterministic',
      scDs.length === 3 && scTotal === 200 &&
        JSON.stringify(scDs.map(function (d) { return d.data; })) === JSON.stringify(DS_MOCK.scatterSeries().map(function (d) { return d.data; })) &&
        scDs.map(function (d) { return d.label; }).join() === '一号仪器,二号仪器,三号仪器', 'n=' + scTotal);
    function resid(pts) { return pts.map(function (p) { return p.y - 0.8 * p.x; }); }
    function sd(a) { var m = mean(a); return Math.sqrt(mean(a.map(function (v) { return (v - m) * (v - m); }))); }
    var scMain = scSer.map(function (s) { return s.data.slice(0, s.mainCount); });
    var scR = scMain.map(pearson);
    A.check('ch-sample-scatter-each-series-positively-correlated',
      scR.every(function (r) { return r > 0.8 && r < 0.999; }) && scR[0] > scR[2],
      'r=' + scR.map(function (r) { return r.toFixed(3); }).join('/'));
    var scMean = scMain.map(function (p) { return mean(resid(p)); });
    A.check('ch-sample-scatter-series2-is-clearly-slower',
      scMean[1] - scMean[0] > 20 && Math.abs(scMean[2] - scMean[0]) < 8,
      'resid means=' + scMean.map(function (v) { return v.toFixed(1); }).join('/'));
    var scSd = scMain.map(function (p) { return sd(resid(p)); });
    A.check('ch-sample-scatter-series3-is-most-volatile',
      scSd[2] > 2 * scSd[0] && scSd[2] > 2 * scSd[1] * 0.9,
      'sd=' + scSd.map(function (v) { return v.toFixed(1); }).join('/'));
    var scOut = 0, scOutN = 0;
    scSer.forEach(function (s, k) {
      s.data.slice(s.mainCount).forEach(function (p) {
        scOutN++;
        if (Math.abs(p.y - 0.8 * p.x - scMean[k]) > 30) scOut++;
      });
    });
    A.check('ch-sample-scatter-has-8-visible-outliers', scOutN === 8 && scOut >= 6, 'n=' + scOutN + ' far=' + scOut);
    // 图例：开着，点图例项能隐藏/显示系列（Chart.js 默认行为没被库关掉）
    var scLg = sc.legend, scLgItem = scLg.legendItems[1];
    A.check('ch-sample-scatter-legend-shown-with-3-items',
      sc.options.plugins.legend.display !== false && scLg.legendItems.length === 3, '');
    scLg.options.onClick.call(scLg, { type: 'click', native: {} }, scLgItem, scLg);
    var scHidden = sc.isDatasetVisible(1) === false && sc.isDatasetVisible(0) === true;
    scLg.options.onClick.call(scLg, { type: 'click', native: {} }, scLg.legendItems[1], scLg);
    A.check('ch-sample-scatter-legend-click-toggles-series',
      scHidden && sc.isDatasetVisible(1) === true, 'hidden=' + scHidden);
    // 系列色取自色板 --chart-s1..s3 且互不相同（深浅两套主题各验一次）
    function scSeriesColors() {
      sc.tooltip.setActiveElements([], { x: 0, y: 0 }); sc.update('none');
      return sc.data.datasets.map(function (d) { return d.borderColor; });
    }
    var scColL = scSeriesColors();
    DS.theme.set('dark');
    var scColD = scSeriesColors();
    DS.theme.set('light');
    A.check('ch-sample-scatter-series-colors-distinct-in-both-themes',
      [scColL, scColD].every(function (c) { return c.length === 3 && c[0] !== c[1] && c[1] !== c[2] && c[0] !== c[2]; }) &&
        scColL.join() !== scColD.join(), scColL.join('|') + ' // ' + scColD.join('|'));
    // 真实拖框选：域缩放
    // 散点现在是 xy 矩形框选：y 方向也要有跨度（同一高度的 mousedown/mouseup 是一条
    // 细线，按设计被当作误触忽略）。
    function fireXY(chart, type, fx, fy) {
      var r = chart.canvas.getBoundingClientRect();
      chart.canvas.dispatchEvent(new MouseEvent(type, {
        clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, bubbles: true
      }));
    }
    fireXY(sc, 'mousedown', 0.3, 0.3); fireXY(sc, 'mouseup', 0.6, 0.6);
    A.check('ch-sample-scatter-drag-select-zooms-dense-domain', DS.charts.isZoomed(sc) === true, '');
    DS.charts.resetZoom(sc);
    // 悬浮框能看出是哪个系列的点：用二号仪器最后一个点（x,y 像素）做 nearest 命中
    var scPt = scDs[1].data[10];
    var scEl = sc.getDatasetMeta(1).data[10];
    sc.tooltip.setActiveElements([], { x: 0, y: 0 });
    sc.update('none');
    var scHit = sc.getElementsAtEventForMode({ type: 'mousemove', native: {}, x: scEl.x, y: scEl.y },
      sc.options.interaction.mode, { intersect: sc.options.interaction.intersect }, false);
    A.check('ch-sample-scatter-interaction-is-nearest-single-point',
      sc.options.interaction.mode === 'nearest' && scHit.length === 1 &&
        scHit[0].datasetIndex === 1 && scHit[0].index === 10, 'hit=' + JSON.stringify(scHit.map(function (h) { return [h.datasetIndex, h.index]; })));
    sc.tooltip.setActiveElements([{ datasetIndex: 1, index: 10 }], { x: scEl.x, y: scEl.y });
    sc.update('none');
    var scLine = (sc.tooltip.body && sc.tooltip.body[0] && sc.tooltip.body[0].lines[0]) || '';
    A.check('ch-sample-scatter-tooltip-names-the-series',
      sc.tooltip.dataPoints.length === 1 && scLine.indexOf('二号仪器') === 0, 'line=' + scLine);
    sc.tooltip.setActiveElements([], { x: 0, y: 0 });
    sc.update('none');

    // ---- 折线：40 周 × 2，上升趋势 + 周期（多次折返）----
    var ln = show('c-line');
    var lnAvg = ln.data.datasets[0].data, lnMax = ln.data.datasets[1].data;
    A.check('ch-sample-line-40-weeks-two-series',
      ln.data.labels.length === 40 && lnAvg.length === 40 && lnMax.length === 40 && ln.data.labels[39] === '第40周', '');
    A.check('ch-sample-line-trend-up-and-periodic',
      mean(lnAvg.slice(30)) > mean(lnAvg.slice(0, 10)) + 8 && signChanges(lnAvg) >= 8,
      'first10=' + mean(lnAvg.slice(0, 10)).toFixed(1) + ' last10=' + mean(lnAvg.slice(30)).toFixed(1) + ' turns=' + signChanges(lnAvg));
    fire(ln, 'mousedown', 0.2); fire(ln, 'mouseup', 0.5);
    A.check('ch-sample-line-drag-select-zooms-40-categories', DS.charts.isZoomed(ln) === true, '');
    DS.charts.resetZoom(ln);

    // ---- 面积：45 天日数据，标签 M/D 不重复 ----
    var ar = show('c-area');
    A.check('ch-sample-area-45-days-three-series-unique-labels',
      ar.data.labels.length === 45 && ar.data.datasets.every(function (d) { return d.data.length === 45; }) &&
        ar.data.labels.filter(function (l, i, a) { return a.indexOf(l) === i; }).length === 45 &&
        ar.data.labels[0] === '1/1' && ar.data.labels[44] === '2/14', ar.data.labels[44]);
    A.check('ch-sample-area-weekly-cycle-present',
      signChanges(ar.data.datasets[0].data) >= 12, 'turns=' + signChanges(ar.data.datasets[0].data));

    // ---- 折线图（按日期）：92 天 × 3 台仪器，日期完全对齐；刻度每 7 天一个 ----
    var ta = show('c-timeaxis'), taPts = ta.data.datasets[0].data;
    var taTicks = ta.scales.x.ticks.map(function (t) { return t.value; });
    A.check('ch-sample-timeaxis-92-days-consecutive',
      taPts.length === 92 && taPts.every(function (p, i) { return i === 0 || p.x - taPts[i - 1].x === 86400000; }), '');
    A.check('ch-sample-timeaxis-3-series-dates-fully-aligned',
      ta.data.datasets.length === 3 && ta.data.datasets.every(function (d) {
        return d.data.length === 92 && d.data.every(function (p, i) { return p.x === taPts[i].x; });
      }) && ta.data.datasets.map(function (d) { return d.label; }).join() === '一号仪器,二号仪器,三号仪器', '');
    A.check('ch-sample-timeaxis-series-differ-in-level',
      mean(ta.data.datasets[0].data.map(function (p) { return p.y; })) >
        mean(ta.data.datasets[1].data.map(function (p) { return p.y; })) + 8 &&
      mean(ta.data.datasets[1].data.map(function (p) { return p.y; })) >
        mean(ta.data.datasets[2].data.map(function (p) { return p.y; })) + 8, '');
    A.check('ch-sample-timeaxis-14-weekly-ticks-from-first-to-last-day',
      taTicks.length === 14 && taTicks[0] === taPts[0].x && taTicks[13] === taPts[91].x &&
        taTicks.every(function (v, i) { return i === 0 || v - taTicks[i - 1] === 7 * 86400000; }),
      taTicks.length + ' ticks: ' + ta.scales.x.ticks.map(function (t) { return t.label; }).join(','));
    A.check('ch-sample-timeaxis-ticks-labels-md-and-unique',
      ta.scales.x.ticks[0].label === '1/1' && ta.scales.x.ticks[13].label === '4/1' &&
        ta.scales.x.ticks.map(function (t) { return t.label; }).filter(function (l, i, a) { return a.indexOf(l) === i; }).length === 14, '');
    // 真实 mousemove 悬停：悬浮框标题 = 该点日期（M/D（周几）），与 x 轴刻度一致，
    // 且列出 3 个系列、全部是同一天。读之前先清悬停态。
    function hoverX(chart, xv) {
      var r = chart.canvas.getBoundingClientRect(), k = r.width / chart.width;
      var ca = chart.chartArea;
      var px = chart.scales.x.getPixelForValue(xv), py = (ca.top + ca.bottom) / 2;
      var ev = new MouseEvent('mousemove', {
        clientX: r.left + px * k, clientY: r.top + py * k, bubbles: true
      });
      chart.canvas.dispatchEvent(ev);
      // Chart.js 自己的 mousemove 监听器经 rAF 节流，本机 headless chromium 的
      // rAF 永不回调，真实 mousemove 到不了 tooltip；所以把同一个真实
      // MouseEvent 包进 Chart.js 事件对象，直接交给它的事件处理入口。
      chart._eventHandler({ type: 'mousemove', native: ev, x: px, y: py, chart: chart });
    }
    function clearHover(chart) {
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.setActiveElements([]);
      chart.update('none');
    }
    clearHover(ta);
    hoverX(ta, taPts[10].x);               // 2024-01-11，周四
    var taTitle = (ta.tooltip.title || []).join('|');
    A.check('ch-sample-timeaxis-tooltip-title-is-date-with-weekday-on-real-mousemove',
      taTitle === '1/11（周四）', 'title=' + JSON.stringify(ta.tooltip.title));
    var taDp = ta.tooltip.dataPoints || [];
    A.check('ch-sample-timeaxis-tooltip-lists-all-series-same-day',
      taDp.length === 3 && taDp.every(function (d) { return d.parsed.x === taPts[10].x; }) &&
        taDp.map(function (d) { return d.dataset.label; }).join() === '一号仪器,二号仪器,三号仪器' &&
        ta.tooltip.body.length === 3,
      'dp=' + taDp.map(function (d) { return d.dataset.label + '@' + d.parsed.x; }).join());
    clearHover(ta);
    hoverX(ta, taTicks[2]);                // 刻度 1/15（周一）
    var taTickLabel = ta.scales.x.ticks[2].label;
    A.check('ch-sample-timeaxis-tooltip-title-matches-axis-tick-date',
      taTickLabel === '1/15' && (ta.tooltip.title || [])[0] === taTickLabel + '（周一）',
      'tick=' + taTickLabel + ' title=' + JSON.stringify(ta.tooltip.title));
    clearHover(ta);
    // 调用方自己写了 title 回调：不得被覆盖（用独立的临时图，ymd 格式）
    var cuCanvas = document.createElement('canvas'), cuHost = document.createElement('div');
    cuHost.className = 'ds-chart-host'; cuHost.style.height = '200px'; cuHost.style.width = '400px';
    cuHost.appendChild(cuCanvas);
    document.getElementById('c-timeaxis').closest('.ds-card').appendChild(cuHost);
    var cuTitle = function () { return '自定义标题'; };
    var cuDates = DS_MOCK.dates(8);
    function mkDateChart(withCustom, fmt) {
      var cb = withCustom ? { title: cuTitle } : {};
      return DS.charts.create(cuCanvas, {
        type: 'line',
        data: { datasets: [{ label: 'a', data: cuDates.map(function (t, i) { return { x: t, y: i + 1 }; }) }] },
        options: {
          plugins: { tooltip: { callbacks: cb } },
          scales: { x: { type: 'linear', min: cuDates[0], max: cuDates[7],
            ticks: { stepSize: 86400000, callback: DS.charts.dateTicks(fmt) } } }
        }
      });
    }
    var cu = mkDateChart(true, 'ymd');
    var cuRegistryCfgTitleSame = cu.options.plugins.tooltip.callbacks.title === cuTitle;
    clearHover(cu);
    hoverX(cu, cuDates[3]);
    var cuT1 = (cu.tooltip.title || []).join('|');
    DS.theme.set('dark');                   // retheme 会重跑 paint()，仍不得覆盖
    clearHover(cu);
    hoverX(cu, cuDates[3]);
    var cuT2 = (cu.tooltip.title || []).join('|');
    DS.theme.set('light');
    A.check('ch-sample-timeaxis-caller-title-callback-never-overridden',
      cuRegistryCfgTitleSame && cu.options.plugins.tooltip.callbacks.title === cuTitle &&
        cuT1 === '自定义标题' && cuT2 === '自定义标题', 't1=' + cuT1 + ' t2=' + cuT2);
    DS.charts.destroy(cu);
    cu = mkDateChart(false, 'ymd');
    clearHover(cu);
    hoverX(cu, cuDates[3]);                 // 2024-01-04，周四
    var cuT3 = (cu.tooltip.title || []).join('|');
    DS.theme.set('dark');
    clearHover(cu);
    hoverX(cu, cuDates[3]);
    var cuT4 = (cu.tooltip.title || []).join('|');
    DS.theme.set('light');
    A.check('ch-sample-timeaxis-ymd-format-title-and-survives-retheme',
      cuT3 === '2024-01-04（周四）' && cuT4 === cuT3, 't3=' + cuT3 + ' t4=' + cuT4);
    DS.charts.destroy(cu);
    cuHost.remove();
    fire(ta, 'mousedown', 0.25); fire(ta, 'mouseup', 0.5);
    var taZ = ta.scales.x.max - ta.scales.x.min;
    A.check('ch-sample-timeaxis-drag-select-zooms-to-a-sub-range',
      DS.charts.isZoomed(ta) === true && taZ < 91 * 86400000 * 0.5 && taZ > 0, 'width days=' + taZ / 86400000);
    DS.charts.resetZoom(ta);

    // ---- 双轴 12 月、堆叠 12 月（含百分比开关往返）----
    var cb = show('c-combo');
    A.check('ch-sample-combo-12-months',
      cb.data.labels.length === 12 && cb.data.datasets.every(function (d) { return d.data.length === 12; }) &&
        cb.data.labels[11] === '十二月', '');
    var st = show('c-stacked');
    A.check('ch-sample-stacked-12-months-three-devices',
      st.data.labels.length === 12 && st.data.datasets.length === 3 &&
        st.data.datasets.every(function (d) { return d.data.length === 12; }), '');
    // 类目型图保持适中：柱状图 6 个月、横向条 3 类
    A.check('ch-sample-category-bars-stay-moderate',
      document.getElementById('c-bar')._dsChart.data.labels.length === 6 &&
        document.getElementById('c-hbar')._dsChart.data.labels.length === 3, '');
    document.querySelector('[data-panel="p-play"]').click();
  });
  /* ---------- 气泡图 / xy 框选缩放 / 数据表弹窗套件（B1–B10）。
     预言值都由测试自己从 DS_MOCK.bubbleItems() 与 token 独立算出，不读库内部
     的中间结果。每条断言都做过变异验证（见 bubble-report.md）。 ---------- */
  window.DS_SELFTEST_SUITES.push(function bubble(A) {
    var N = 'ch-bubble-';
    DS.theme.set('light');
    function showComp() { document.querySelector('[data-panel="p-comp"]').click(); }
    showComp();
    var bc = document.getElementById('c-bubble')._dsChart;
    bc.resize();
    var items = DS_MOCK.bubbleItems();
    var qual = items.filter(function (it) { return it.count >= 5; })
      .sort(function (a, b) { return b.count - a.count; });
    var top50 = qual.slice(0, 50);
    var pts = bc.data.datasets[0].data;

    function tok(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(); }
    function clearHover(chart) {
      chart.canvas.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.setActiveElements([]);
      chart.update('none');
    }
    function near(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-6 : eps); }
    function mk(its, opts, w, h) {
      var host = document.createElement('div');
      host.className = 'ds-chart-host';
      host.style.cssText = 'width:' + (w || 700) + 'px;height:' + (h || 400) + 'px';
      var cvs = document.createElement('canvas');
      host.appendChild(cvs);
      document.body.appendChild(host);
      var chart = DS.charts.bubble(cvs, its, opts);
      return { chart: chart, host: host, done: function () { DS.charts.destroy(chart); host.remove(); } };
    }
    // 在 draw() 期间监听 fillText / strokeText，记录文本、当时的样式
    function spyLabels(chart, names) {
      var ctx = chart.ctx, f0 = ctx.fillText, s0 = ctx.strokeText, rec = [], halos = [];
      ctx.fillText = function (t) {
        if (names.indexOf(String(t)) !== -1) {
          rec.push({ t: String(t), x: arguments[1], y: arguments[2], fill: ctx.fillStyle, shadow: ctx.shadowBlur,
            font: ctx.font, align: ctx.textAlign, base: ctx.textBaseline });
        }
        return f0.apply(ctx, arguments);
      };
      ctx.strokeText = function (t) {
        if (names.indexOf(String(t)) !== -1) halos.push({ t: String(t), stroke: ctx.strokeStyle });
        return s0.apply(ctx, arguments);
      };
      try { chart.draw(); } finally { delete ctx.fillText; delete ctx.strokeText; }
      return { fills: rec, halos: halos };
    }
    function trunc12(n) { return n.length > 12 ? n.substring(0, 12) + '..' : n; }

    // ================= B1 数据 =================
    A.check(N + 'demo-canvas-id-and-instance', !!document.getElementById('c-bubble') &&
      document.getElementById('c-bubble')._dsChart === bc && bc.config.type === 'bubble', '');
    A.check(N + 'demo-data-shape-60-items-deterministic', items.length >= 30 && items.length === 60 &&
      JSON.stringify(items) === JSON.stringify(DS_MOCK.bubbleItems()) &&
      items.filter(function (it) { return it.count < 5; }).length >= 5 && qual.length > 50, 'n=' + items.length + ' qual=' + qual.length);
    A.check(N + 'b1-one-bubble-per-entry-filtered-sorted-top50',
      pts.length === 50 && bc.data.datasets.length === 1 &&
        JSON.stringify(pts.map(function (p) { return p.x; })) === JSON.stringify(top50.map(function (it) { return it.count; })) &&
        JSON.stringify(pts.map(function (p) { return p.name; })) === JSON.stringify(top50.map(function (it) { return it.name; })) &&
        pts.every(function (p, i) { return p.y === top50[i].value && p.count === p.x; }),
      'n=' + pts.length);
    var lowNames = items.filter(function (it) { return it.count < 5; }).map(function (it) { return it.name; });
    A.check(N + 'b1-entries-below-5-are-filtered-out',
      pts.every(function (p) { return p.x >= 5; }) &&
        pts.every(function (p) { return lowNames.indexOf(p.name) === -1; }), '');
    var cut = qual.slice(50);
    A.check(N + 'b1-top50-cut-drops-only-the-smallest-qualifying',
      cut.length === 5 && cut.every(function (it) { return it.count >= 5 && it.count <= pts[49].x; }) &&
        cut.every(function (it) { return !pts.some(function (p) { return p.name === it.name; }); }),
      'cut=' + cut.length);
    (function () {
      var bnd = [{ name: 'a5', count: 5, value: 10 }, { name: 'a4', count: 4, value: 10 }, { name: 'a6', count: 6, value: 10 },
        { name: 'bad', count: 50, value: NaN }];
      var t = mk(bnd, {});
      var d = t.chart.data.datasets[0].data;
      A.check(N + 'b1-boundary-5-kept-4-dropped-nonfinite-dropped',
        d.length === 2 && d[0].name === 'a6' && d[1].name === 'a5', JSON.stringify(d.map(function (p) { return p.name; })));
      t.done();
      var big = [], i;
      for (i = 0; i < 60; i++) big.push({ name: 'n' + i, count: 100 + i, value: 1 });
      var t2 = mk(big, { topN: 7, minCount: 120 });
      var d2 = t2.chart.data.datasets[0].data;
      A.check(N + 'b1-minCount-and-topN-options-respected', d2.length === 7 && d2[0].x === 159 && d2[6].x === 153, d2.length);
      t2.done();
    })();

    // ================= B2 半径：面积 ∝ 数量 =================
    var maxC = pts[0].x;
    var unclamped = pts.filter(function (p) { return p.r > 5 + 1e-9; });
    var clamped = pts.filter(function (p) { return p.r <= 5 + 1e-9; });
    A.check(N + 'b2-area-proportional-to-count-not-radius',
      unclamped.length >= 20 && unclamped.every(function (p) { return near(p.r * p.r / p.x, 35 * 35 / maxC, 1e-9); }) &&
        // 区分"半径∝数量"：数量差 4 倍的两个气泡，半径差 2 倍（面积差 4 倍）
        (function () {
          var a = unclamped[0], b = unclamped.filter(function (p) { return p.x < a.x / 3.5 && p.x > a.x / 4.5; })[0];
          return !!b && near((a.r * a.r) / (b.r * b.r), a.x / b.x, 1e-9) && (a.r / b.r) < 2.5;
        })(), 'unclamped=' + unclamped.length);
    A.check(N + 'b2-largest-radius-35-min-radius-5-clamp',
      near(pts[0].r, 35, 1e-9) && pts.every(function (p) { return p.r >= 5; }) &&
        clamped.length >= 10 && clamped.every(function (p) { return p.r === 5 && p.x < maxC / 49 + 1e-9; }) &&
        unclamped.every(function (p) { return p.x >= maxC / 49 - 1e-9; }), 'clamped=' + clamped.length);
    var bmeta = bc.getDatasetMeta(0);
    A.check(N + 'b2-rendered-element-radius-equals-r',
      pts.every(function (p, i) { return near(bmeta.data[i].options.radius, p.r, 1e-9); }), '');

    // ================= B3 配色（走 token，十色循环） =================
    function parseHsla(c) {
      var m = /^hsla\(\s*([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)\s*\)$/.exec(String(c).trim());
      return m ? { h: +m[1], s: +m[2], l: +m[3], a: +m[4] } : null;
    }
    function colorsOf(chart) {
      clearHover(chart);
      var m = chart.getDatasetMeta(0);
      return m.data.map(function (el) { return { bg: parseHsla(el.options.backgroundColor), bd: parseHsla(el.options.borderColor), bw: el.options.borderWidth }; });
    }
    function checkRamp() {
      var cs = colorsOf(bc), n = cs.length, ok = n === 50, bad = '';
      var S = parseFloat(tok('--chart-ramp-s')), L = parseFloat(tok('--chart-ramp-l'));
      cs.forEach(function (c, i) {
        var good = c.bg && c.bd && near(c.bg.h, i * 360 / n, 1) && near(c.bd.h, i * 360 / n, 1) &&
          (i === 0 || c.bg.h > cs[i - 1].bg.h) &&
          near(c.bg.s, S, 1e-9) && near(c.bg.l, L, 1e-9) && near(c.bd.s, S, 1e-9) && near(c.bd.l, L, 1e-9) &&
          c.bg.a === 0.7 && c.bd.a === 1 && c.bw === 1.5;
        if (!good && !bad) bad = 'i=' + i + ' ' + JSON.stringify(c);
        ok = ok && good;
      });
      return ok ? '' : bad;
    }
    var colL = checkRamp();
    var sl = [parseFloat(tok('--chart-ramp-s')), parseFloat(tok('--chart-ramp-l'))];
    A.check(N + 'b3-light-hue-ramp-i*360/n-monotone-S-L-from-tokens-fill-0.7-border-1-1.5px', colL === '' && sl[0] === 65 && sl[1] === 55, colL + ' ' + sl);
    A.check(N + 'b3-adjacent-ranks-similar-hue-and-first-last-span-the-wheel', (function () {
      var cs = colorsOf(bc), n = cs.length;
      for (var i = 1; i < n; i++) if (!near(cs[i].bg.h - cs[i - 1].bg.h, 360 / n, 1)) return false;
      return cs[0].bg.h === 0 && cs[n - 1].bg.h > 340;
    })(), '');
    var colLraw = colorsOf(bc).map(function (c) { return [c.bd.h, c.bd.s, c.bd.l].join(); }).join('|');
    DS.theme.set('dark');
    var colD = checkRamp();
    var slD = [parseFloat(tok('--chart-ramp-s')), parseFloat(tok('--chart-ramp-l'))];
    var colDraw = colorsOf(bc).map(function (c) { return [c.bd.h, c.bd.s, c.bd.l].join(); }).join('|');
    A.check(N + 'b3-dark-theme-S-L-follow-dark-tokens-and-differ-from-light', colD === '' && colDraw !== colLraw &&
      (slD[0] !== sl[0] || slD[1] !== sl[1]), colD + ' ' + slD);
    DS.theme.set('light');
    A.check(N + 'b3-switch-back-to-light-recomputes-from-light-tokens', checkRamp() === '', '');
    A.check(N + 'b3-rampColors-api-n-hues-alpha-default-1-and-reads-tokens', (function () {
      var r = DS.charts.rampColors(4, { alpha: 0.5 }), d = DS.charts.rampColors(2).map(parseHsla);
      var p = r.map(parseHsla);
      return r.length === 4 && p.every(function (c, i) { return c.h === i * 90 && c.s === sl[0] && c.l === sl[1] && c.a === 0.5; }) &&
        d.length === 2 && d[0].a === 1 && d[1].h === 180 && DS.charts.rampColors(0).length === 0;
    })(), '');

    // ================= B4 无图例 =================
    A.check(N + 'b4-no-legend', bc.options.plugins.legend.display === false &&
      (!bc.legend || (bc.legend.height === 0 && bc.legend.legendHitBoxes.length === 0)), '');

    // ================= B5 标签 =================
    var maxX = pts[0].x;
    var bigPts = pts.filter(function (p) { return p.x > maxX * 0.15; });
    var allNames = pts.map(function (p) { return p.name; }).concat(pts.map(function (p) { return trunc12(p.name); }));
    clearHover(bc);
    var spyL = spyLabels(bc, allNames);
    var drawnNames = spyL.fills.map(function (r) { return r.t; });
    var bigNames = bigPts.map(function (p) { return trunc12(p.name); });
    A.check(N + 'b5-only-big-bubbles-labelled-x-above-15pct-of-max',
      bigPts.length >= 8 && bigPts.length < 30 && spyL.fills.length >= 5 && spyL.fills.length <= bigPts.length &&
        drawnNames.every(function (t) { return bigNames.indexOf(t) !== -1; }) &&
        pts.filter(function (p) { return p.x <= maxX * 0.15; }).every(function (p) {
          return !spyL.fills.some(function (r) { return r.t === trunc12(p.name); });
        }), 'big=' + bigPts.length + ' drawn=' + spyL.fills.length);
    // ---- 标签避让：标签之间不重叠；冲突时留大的；缩放后散开能显示更多；被跳过的仍能悬停看名字 ----
    var mcv = document.createElement('canvas').getContext('2d');
    function boxesOf(recs, pad) {
      mcv.font = recs.length ? recs[0].font : '500 10px sans-serif';
      return recs.map(function (r) {
        var w = mcv.measureText(r.t).width + pad, h = 10 + pad;
        return { l: r.x - w / 2, r: r.x + w / 2, t: r.y - h / 2, b: r.y + h / 2 };
      });
    }
    function overlapPairs(bs) {
      var n = 0;
      for (var i = 0; i < bs.length; i++) for (var j = i + 1; j < bs.length; j++) {
        if (bs[i].l < bs[j].r && bs[i].r > bs[j].l && bs[i].t < bs[j].b && bs[i].b > bs[j].t) n++;
      }
      return n;
    }
    var pairsTight = overlapPairs(boxesOf(spyL.fills, 0));
    var pairsPadded = overlapPairs(boxesOf(spyL.fills, 4));
    A.check(N + 'b5-avoid-drawn-labels-have-zero-overlapping-pairs-demo',
      spyL.fills.length >= 5 && pairsTight === 0 && pairsPadded === 0, 'drawn=' + spyL.fills.length + ' pairs=' + pairsTight + '/' + pairsPadded);
    // 被跳过的大气泡：一定存在，且每个都与某个"数量不小于它"的已画标签相交
    var skippedIdx = [];
    bigPts.forEach(function (p) { if (drawnNames.indexOf(trunc12(p.name)) === -1) skippedIdx.push(pts.indexOf(p)); });
    var drawnBoxes = boxesOf(spyL.fills, 4);
    var drawnSize = spyL.fills.map(function (r) { return pts.findIndex(function (p) { return trunc12(p.name) === r.t; }); })
      .map(function (i) { return pts[i].x; });
    A.check(N + 'b5-avoid-conflict-keeps-the-bigger-bubble-label',
      skippedIdx.length >= 3 && skippedIdx.every(function (i) {
        var el = bmeta.data[i];
        mcv.font = spyL.fills[0].font;
        var w = mcv.measureText(trunc12(pts[i].name)).width + 4, h = 14;
        var bx = { l: el.x - w / 2, r: el.x + w / 2, t: el.y - h / 2, b: el.y + h / 2 };
        return drawnBoxes.some(function (o, k) {
          return bx.l < o.r && bx.r > o.l && bx.t < o.b && bx.b > o.t && drawnSize[k] >= pts[i].x;
        });
      }), 'skipped=' + skippedIdx.length);
    A.check(N + 'b5-avoid-skipped-bubbles-still-show-their-name-in-tooltip',
      skippedIdx.length >= 3 && skippedIdx.every(function (i) { return tipAt(bc, i).indexOf(pts[i].name + ': ') === 0; }), '');
    clearHover(bc);
    // 框选放大后散开：同一区域里画出的标签数变多
    (function () {
      DS.charts.resetZoom(bc); bc.resize(); clearHover(bc);
      var rx0 = 250, rx1 = 1300, ry0 = 55, ry1 = 115;
      var before = spyLabels(bc, allNames).fills.filter(function (r) {
        var i = pts.findIndex(function (p) { return trunc12(p.name) === r.t; });
        return pts[i].x >= rx0 && pts[i].x <= rx1 && pts[i].y >= ry0 && pts[i].y <= ry1;
      }).length;
      var p0 = { x: bc.scales.x.getPixelForValue(rx0), y: bc.scales.y.getPixelForValue(ry1) };
      var p1 = { x: bc.scales.x.getPixelForValue(rx1), y: bc.scales.y.getPixelForValue(ry0) };
      DS.charts._dragBegin(bc, p0.x, p0.y); DS.charts._dragMove(bc, p1.x, p1.y); DS.charts._dragEnd(bc, p1.x, p1.y);
      clearHover(bc);
      var z = spyLabels(bc, allNames).fills;
      var zb = boxesOf(z, 0);
      A.check(N + 'b5-avoid-zoom-in-shows-more-labels-in-the-same-region-and-still-no-overlap',
        DS.charts.isZoomed(bc) && z.length > before && overlapPairs(zb) === 0 && overlapPairs(boxesOf(z, 4)) === 0,
        'before=' + before + ' after=' + z.length);
      // 小气泡区域放大：全量下低于 15% 门槛（从不出标签）的气泡，相对视野内最大者重新判定
      (function () {
        DS.charts.resetZoom(bc); bc.resize(); clearHover(bc);
        var gMax = Math.max.apply(null, pts.map(function (p) { return p.x; }));
        var small = pts.filter(function (p) { return !(p.x > gMax * 0.15); });
        var sx = Math.max.apply(null, small.map(function (p) { return p.x; }));
        var sy0 = Math.min.apply(null, small.map(function (p) { return p.y; }));
        var sy1 = Math.max.apply(null, small.map(function (p) { return p.y; }));
        var full = spyLabels(bc, allNames).fills.filter(function (r) {
          return small.some(function (p) { return trunc12(p.name) === r.t; });
        }).length;
        DS.charts.zoomBox(bc, { x: [0, sx * 1.05], y: [sy0 - 2, sy1 + 2] });
        clearHover(bc);
        var zl = spyLabels(bc, allNames).fills;
        var zs = zl.filter(function (r) { return small.some(function (p) { return trunc12(p.name) === r.t; }); }).length;
        A.check(N + 'b5-zoom-into-small-bubbles-relabels-them-by-the-visible-max',
          small.length >= 3 && full === 0 && DS.charts.isZoomed(bc) && zs >= 2 && overlapPairs(boxesOf(zl, 4)) === 0,
          'small=' + small.length + ' full=' + full + ' zoomed=' + zs);
        DS.charts.resetZoom(bc); clearHover(bc);
        DS.charts._dragBegin(bc, p0.x, p0.y); DS.charts._dragMove(bc, p1.x, p1.y); DS.charts._dragEnd(bc, p1.x, p1.y);
        clearHover(bc);
      })();
      var ca2 = bc.chartArea;
      A.check(N + 'b5-avoid-offscreen-bubbles-after-zoom-get-no-label-and-take-no-space',
        bc.$dsBubbleLabels.length > 0 && bc.$dsBubbleLabels.every(function (l) { return l.x >= ca2.left && l.x <= ca2.right && l.y >= ca2.top && l.y <= ca2.bottom; }) &&
          bc.getDatasetMeta(0).data.some(function (el) { return el.x < ca2.left || el.x > ca2.right; }), '');
      DS.charts.resetZoom(bc);
      clearHover(bc);
      var back = spyLabels(bc, allNames).fills.length;
      A.check(N + 'b5-avoid-reset-zoom-recomputes-back-to-the-original-set', back === spyL.fills.length, back + ' vs ' + spyL.fills.length);
      // 全屏变大后重新计算：不重叠，且不比小图少
      var bh = document.getElementById('bubble-host');
      bh.querySelector('[data-act="full"]').click();
      clearHover(bc);
      var fsL = spyLabels(bc, allNames).fills;
      bh.querySelector('[data-act="full"]').click();
      A.check(N + 'b5-avoid-fullscreen-recomputes-no-overlap-and-not-fewer',
        fsL.length >= spyL.fills.length && overlapPairs(boxesOf(fsL, 4)) === 0, 'fs=' + fsL.length);
      DS.theme.set('dark'); clearHover(bc);
      var dkL = spyLabels(bc, allNames).fills;
      DS.theme.set('light');
      A.check(N + 'b5-avoid-after-theme-switch-still-no-overlap', dkL.length >= 5 && overlapPairs(boxesOf(dkL, 4)) === 0, '');
      clearHover(bc);
    })();
    A.check(N + 'b5-label-style-10px-500-weight-centered-on-bubble',
      spyL.fills.every(function (r) {
        return /^500 10px/.test(r.font) && r.align === 'center' && r.base === 'middle';
      }) && spyL.fills.every(function (r) {
        var idx = pts.findIndex(function (p) { return trunc12(p.name) === r.t; });
        return near(r.x, bmeta.data[idx].x, 0.01) && near(r.y, bmeta.data[idx].y, 0.01);
      }), spyL.fills[0] && spyL.fills[0].font);
    A.check(N + 'b5-demo-has-long-name-truncated-and-12-char-name-intact',
      spyL.fills.some(function (r) { return r.t === '超长名称演示项目编号甲乙..'; }) &&
        spyL.fills.some(function (r) { return r.t === '这个项目名称正好十二个字'; }), '');
    (function () {
      var names = ['n11-aaaaaaa', 'n12-aaaaaaaa', 'n13-aaaaaaaaa', 'n20-aaaaaaaaaaaaaaaa'];
      var lens = names.map(function (n) { return n.length; });
      var its = names.map(function (n, i) { return { name: n, count: 1000 - i * 10, value: 50 + i * 20 }; });
      its.push({ name: 'tiny-small', count: 20, value: 30 });
      var t = mk(its, {});
      var wanted = names.map(function (n) { return trunc12(n); }).concat(['tiny-small']).concat(names);
      var r = spyLabels(t.chart, wanted).fills.map(function (x) { return x.t; });
      A.check(N + 'b5-truncation-rule-11-12-intact-13-20-cut-to-12-plus-dotdot',
        lens.join() === '11,12,13,20' &&
          r.join('|') === 'n11-aaaaaaa|n12-aaaaaaaa|n13-aaaaaaaa..|n20-aaaaaaaa..', r.join('|'));
      A.check(N + 'b5-small-bubble-not-labelled', r.indexOf('tiny-small') === -1, '');
      // 直接 create({type:'bubble'}) 同样自动带标签/无图例/颜色/xy 缩放
      DS.charts.destroy(t.chart);
      var cfg = { type: 'bubble', data: { datasets: [{ data: [
        { x: 100, y: 5, r: 30, name: 'raw-big', count: 100 }, { x: 5, y: 9, r: 5, name: 'raw-small', count: 5 }] }] } };
      var c2 = DS.charts.create(t.host.querySelector('canvas'), cfg);
      var r2 = spyLabels(c2, ['raw-big', 'raw-small']).fills.map(function (x) { return x.t; });
      A.check(N + 'direct-create-type-bubble-gets-b3-b4-b5-b6-and-xy',
        r2.join() === 'raw-big' && c2.options.plugins.legend.display === false && c2.$ds.xy === true &&
          Array.isArray(c2.data.datasets[0].backgroundColor) && /hsla\(.*, 0\.7\)/.test(c2.data.datasets[0].backgroundColor[0]) &&
          (c2.setActiveElements([{ datasetIndex: 0, index: 0 }]), c2.tooltip.setActiveElements([{ datasetIndex: 0, index: 0 }], { x: 0, y: 0 }), c2.update('none'),
            c2.tooltip.body[0].lines[0] === 'raw-big: 100, 5.0'), '');
      clearHover(c2);
      DS.charts.destroy(c2);
      t.host.remove();
    })();
    // 独立预言：用 canvas 像素把"气泡填充(hsla,alpha) 叠在卡片底(--color-surface)上"合成出来
    var pxc = document.createElement('canvas'); pxc.width = pxc.height = 1;
    var pxx = pxc.getContext('2d', { willReadFrequently: true });
    function compositeBg(fillCss, surfHex) {
      pxx.clearRect(0, 0, 1, 1);
      pxx.fillStyle = surfHex; pxx.fillRect(0, 0, 1, 1);
      pxx.fillStyle = fillCss; pxx.fillRect(0, 0, 1, 1);
      var d = pxx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    }
    function lumRgb(c) {
      function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function contrastRgb(a, b) {
      var x = lumRgb(a), y = lumRgb(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }
    var labelMinInfo = {};
    function labelThemeCheck(theme) {
      DS.theme.set(theme);
      clearHover(bc);
      var strokes = 0, s0 = bc.ctx.strokeText;
      bc.ctx.strokeText = function () { strokes++; return s0.apply(bc.ctx, arguments); };
      var sp;
      try { sp = spyLabels(bc, allNames); } finally { delete bc.ctx.strokeText; }
      var surf = tok('--color-surface'), dkInk = tok('--chart-label-ink-dark'), ltInk = tok('--chart-label-ink-light');
      var min = 99, minHue = -1, below45 = [], bad = 0;
      sp.fills.forEach(function (r) {
        var idx = pts.findIndex(function (p) { return trunc12(p.name) === r.t; });
        var fc = bmeta.data[idx].options.backgroundColor;
        var bg = compositeBg(fc, surf);
        var fg = hexToRgbComponents(String(r.fill));
        var cr = contrastRgb(bg, fg);
        if (cr < min) { min = cr; minHue = parseHsla(fc).h; }
        if (cr < 4.5) below45.push(parseHsla(fc).h.toFixed(0) + ':' + cr.toFixed(2));
        // 取的是深/浅两个 token 里对比度更高者
        var best = Math.max(contrastRgb(bg, hexToRgbComponents(dkInk)), contrastRgb(bg, hexToRgbComponents(ltInk)));
        if (cr < best - 0.02) bad++;
      });
      labelMinInfo[theme] = { min: min, hue: minHue };
      return { n: sp.fills.length, strokes: strokes, text: tok('--color-text'), dkInk: dkInk, ltInk: ltInk, bad: bad,
        shadow: sp.fills.every(function (r) { return r.shadow === 0; }),
        fonts: sp.fills.every(function (r) { return /^500 10px /.test(r.font); }),
        fills: sp.fills.map(function (r) { return String(r.fill); }), min: min, minHue: minHue, below45: below45 };
    }
    var lt = labelThemeCheck('light'), dk = labelThemeCheck('dark');
    A.check(N + 'b5-no-halo-no-strokeText-and-shadowBlur-0-font-500-10px',
      lt.n >= 5 && dk.n >= 5 && lt.strokes === 0 && dk.strokes === 0 && lt.shadow && dk.shadow && lt.fonts && dk.fonts, JSON.stringify([lt.strokes, dk.strokes, lt.shadow, dk.shadow]));
    A.check(N + 'b5-light-label-color-is-reference-1e293b-from-token',
      lt.dkInk === '#1e293b' && lt.text === '#1e293b' && lt.fills.every(function (f) { return f === '#1e293b'; }), JSON.stringify(lt.fills.slice(0, 3)));
    A.check(N + 'b5-light-label-contrast-vs-composite-bubble-bg-ge-4.5', lt.min >= 4.5 && lt.below45.length === 0, 'min=' + lt.min + '@' + lt.minHue);
    A.check(N + 'b5-dark-label-contrast-vs-composite-bubble-bg-ge-4.5-and-picks-higher-of-dark-light-ink',
      dk.min >= 4.5 && dk.below45.length === 0 && dk.bad === 0 && dk.dkInk !== dk.ltInk, 'min=' + dk.min + '@' + dk.minHue + ' below=' + dk.below45);
    A.check(N + 'b5-dark-labels-use-both-inks-or-token-values-only',
      dk.fills.every(function (f) { return f === dk.dkInk || f === dk.ltInk; }), JSON.stringify(dk.fills.slice(0, 3)));
    A.check(N + 'b5-dark-and-light-ink-tokens-contrast-themselves-sanely', hexContrast(dk.dkInk, dk.ltInk) >= 10, '');
    DS.theme.set('light');

    // ================= B6 悬浮框 =================
    function tipAt(chart, i) {
      clearHover(chart);
      var el = chart.getDatasetMeta(0).data[i];
      chart.setActiveElements([{ datasetIndex: 0, index: i }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index: i }], { x: el.x, y: el.y });
      chart.update('none');
      return (chart.tooltip.body && chart.tooltip.body[0] && chart.tooltip.body[0].lines[0]) || '';
    }
    var iFast = pts.findIndex(function (p) { return p.y === 22; });
    var iSmall = pts.length - 1;
    A.check(N + 'b6-tooltip-text-name-N-slides-X.X-min-avg',
      [0, 5, iFast, iSmall].every(function (i) {
        var p = pts[i];
        return tipAt(bc, i) === p.name + ': ' + p.count.toLocaleString('en-US') + ' 片, ' + p.y.toFixed(1) + ' 分钟平均';
      }) && /, 22\.0 分钟平均$/.test(tipAt(bc, iFast)) && /: 2,\d{3} 片/.test(tipAt(bc, 0)),
      tipAt(bc, 0) + ' | ' + tipAt(bc, iFast));
    clearHover(bc);
    (function () {
      var t = mk([{ name: 'u1', count: 1200, value: 3.26 }, { name: 'u2', count: 700, value: 8 }], { countUnit: '次', valueUnit: '小时' });
      A.check(N + 'b6-tooltip-units-configurable', tipAt(t.chart, 0) === 'u1: 1,200 次, 3.3 小时', tipAt(t.chart, 0));
      A.check(N + 'b6-tooltip-no-unit-no-dangling-space', (function () {
        var t3 = mk([{ name: 'z', count: 10, value: 1 }], {});
        var s = tipAt(t3.chart, 0); t3.done(); return s === 'z: 10, 1.0';
      })(), '');
      t.done();
    })();
    (function () {
      var el = bmeta.data[0], a = bc.chartArea;
      var onBubble = bc.getElementsAtEventForMode({ type: 'mousemove', native: {}, x: el.x, y: el.y }, bc.options.interaction.mode,
        { intersect: bc.options.interaction.intersect }, false);
      var blank = bc.getElementsAtEventForMode({ type: 'mousemove', native: {}, x: a.left + 3, y: a.top + 3 }, bc.options.interaction.mode,
        { intersect: bc.options.interaction.intersect }, false);
      A.check(N + 'b6-hover-hits-bubble-under-cursor-but-not-blank-space',
        onBubble.length === 1 && onBubble[0].index === 0 && blank.length === 0 &&
          bc.options.interaction.intersect === true && bc.options.interaction.mode === 'nearest' &&
          bc.options.plugins.tooltip.intersect === true && bc.options.plugins.tooltip.mode === 'nearest',
        'on=' + onBubble.length + ' blank=' + blank.length);
    })();

    // ================= B7 坐标轴 =================
    A.check(N + 'b7-both-axes-have-titles',
      bc.options.scales.x.title.display === true && bc.options.scales.x.title.text === '样本数' &&
        bc.options.scales.y.title.display === true && bc.options.scales.y.title.text === '平均时长（分钟）', '');
    A.check(N + 'b7-both-axes-begin-at-zero-in-demo', bc.scales.x.min === 0 && bc.scales.y.min === 0 &&
      bc.options.scales.x.beginAtZero === true && bc.options.scales.y.beginAtZero === true, bc.scales.x.min + ',' + bc.scales.y.min);
    (function () {
      // 数据远离 0（x≥600、y≥100）：没有 beginAtZero 的话两根轴都不会从 0 开始
      var t = mk([{ name: 'p', count: 600, value: 100 }, { name: 'q', count: 800, value: 130 }, { name: 'r', count: 1000, value: 160 }], {});
      A.check(N + 'b7-axes-start-at-zero-even-when-data-is-far-from-zero', t.chart.scales.x.min === 0 && t.chart.scales.y.min === 0,
        t.chart.scales.x.min + ',' + t.chart.scales.y.min);
      t.done();
    })();

    // ================= B8 xy 框选缩放 =================
    function view(chart) { return { x0: chart.scales.x.min, x1: chart.scales.x.max, y0: chart.scales.y.min, y1: chart.scales.y.max }; }
    function pxOf(chart, vx, vy) { return { x: chart.scales.x.getPixelForValue(vx), y: chart.scales.y.getPixelForValue(vy) }; }
    function boxDrag(chart, p0, p1) {
      DS.charts._dragBegin(chart, p0.x, p0.y);
      DS.charts._dragMove(chart, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      DS.charts._dragMove(chart, p1.x, p1.y);
      DS.charts._dragEnd(chart, p1.x, p1.y);
    }
    function xyCases(label, chart, fx0, fx1, fy0, fy1) {
      chart.resize();
      DS.charts.resetZoom(chart);
      var v0 = view(chart), w0 = v0.x1 - v0.x0, h0 = v0.y1 - v0.y0;
      var tx0 = v0.x0 + w0 * fx0, tx1 = v0.x0 + w0 * fx1, ty0 = v0.y0 + h0 * fy0, ty1 = v0.y0 + h0 * fy1;
      boxDrag(chart, pxOf(chart, tx0, ty1), pxOf(chart, tx1, ty0));     // 从左下拖到右上
      var v1 = view(chart);
      A.check('ch-xyzoom-' + label + '-box-narrows-both-axes-to-the-dragged-rectangle',
        DS.charts.isZoomed(chart) && near(v1.x0, tx0, w0 * 1e-6) && near(v1.x1, tx1, w0 * 1e-6) &&
          near(v1.y0, ty0, h0 * 1e-6) && near(v1.y1, ty1, h0 * 1e-6) &&
          (v1.x1 - v1.x0) < w0 * 0.9 && (v1.y1 - v1.y0) < h0 * 0.9,
        JSON.stringify(v0) + ' -> ' + JSON.stringify(v1));
      // 反向拖（右上到左下）得到同一个矩形
      DS.charts.resetZoom(chart);
      boxDrag(chart, pxOf(chart, tx1, ty0), pxOf(chart, tx0, ty1));
      var v1b = view(chart);
      A.check('ch-xyzoom-' + label + '-reverse-drag-direction-same-rectangle',
        near(v1b.x0, tx0, w0 * 1e-6) && near(v1b.x1, tx1, w0 * 1e-6) && near(v1b.y0, ty0, h0 * 1e-6) && near(v1b.y1, ty1, h0 * 1e-6), '');
      chart.canvas.parentNode.querySelector('[data-act="reset"]').click();
      var v2 = view(chart);
      A.check('ch-xyzoom-' + label + '-reset-button-restores-both-axes',
        !DS.charts.isZoomed(chart) && near(v2.x0, v0.x0, 1e-9) && near(v2.x1, v0.x1, 1e-9) && near(v2.y0, v0.y0, 1e-9) && near(v2.y1, v0.y1, 1e-9),
        JSON.stringify(v0) + ' -> ' + JSON.stringify(v2));
      // 工具条 +/−：两个方向等比
      chart.canvas.parentNode.querySelector('[data-act="in"]').click();
      var v3 = view(chart);
      A.check('ch-xyzoom-' + label + '-plus-button-zooms-both-axes-by-the-same-factor',
        near((v3.x1 - v3.x0) / w0, 0.8, 1e-6) && near((v3.y1 - v3.y0) / h0, 0.8, 1e-6) &&
          near((v3.x0 + v3.x1) / 2, (v0.x0 + v0.x1) / 2, w0 * 1e-6) && near((v3.y0 + v3.y1) / 2, (v0.y0 + v0.y1) / 2, h0 * 1e-6), JSON.stringify(v3));
      chart.canvas.parentNode.querySelector('[data-act="out"]').click();
      var v4 = view(chart);
      A.check('ch-xyzoom-' + label + '-minus-button-zooms-back-out-on-both-axes',
        !DS.charts.isZoomed(chart) && near(v4.x1, v0.x1, 1e-9) && near(v4.y1, v0.y1, 1e-9) && near(v4.x0, v0.x0, 1e-9) && near(v4.y0, v0.y0, 1e-9), JSON.stringify(v4));
      // 误触：点击 / 太窄的矩形 / 只有一个方向够宽——都不缩放，也不留下矩形
      var c0 = pxOf(chart, tx0, ty0);
      boxDrag(chart, c0, { x: c0.x + 3, y: c0.y + 3 });
      var vA = view(chart);
      boxDrag(chart, c0, { x: c0.x + 120, y: c0.y + 2 });
      var vB = view(chart);
      boxDrag(chart, c0, { x: c0.x + 2, y: c0.y + 120 });
      var vC = view(chart);
      A.check('ch-xyzoom-' + label + '-click-or-thin-rectangle-is-ignored-on-both-axes',
        !DS.charts.isZoomed(chart) && JSON.stringify(vA) === JSON.stringify(v0) && JSON.stringify(vB) === JSON.stringify(v0) &&
          JSON.stringify(vC) === JSON.stringify(v0) && chart.$ds.drag === null, JSON.stringify([vA, vB, vC]));
      // zoomBox 自身的规则（不经 6px 像素阈值）：任一方向的数据区间 < 满量程 1% 或缺某根轴 → 整体忽略
      var vBox0 = JSON.stringify(view(chart));
      var thinY = DS.charts.zoomBox(chart, { x: [tx0, tx1], y: [ty0, ty0 + h0 * 0.005] });
      var thinX = DS.charts.zoomBox(chart, { x: [tx0, tx0 + w0 * 0.005], y: [ty0, ty1] });
      var noY = DS.charts.zoomBox(chart, { x: [tx0, tx1] });
      A.check('ch-xyzoom-' + label + '-zoomBox-rejects-a-too-narrow-or-missing-axis-as-a-whole',
        thinY === false && thinX === false && noY === false && JSON.stringify(view(chart)) === vBox0 && !DS.charts.isZoomed(chart), '');
      // 真实原生鼠标事件（我们自己直接挂在 canvas 上的监听，不走 Chart.js 的 rAF 节流）
      var r = chart.canvas.getBoundingClientRect(), k = r.width / chart.width;
      var pa = pxOf(chart, tx0, ty1), pb = pxOf(chart, tx1, ty0);
      function nat(type, p) {
        chart.canvas.dispatchEvent(new MouseEvent(type, { clientX: r.left + p.x * k, clientY: r.top + p.y * k, bubbles: true, button: 0 }));
      }
      nat('mousedown', pa); nat('mousemove', pb); nat('mouseup', pb);
      var v5 = view(chart);
      // clientX/clientY 在 Chromium 里被截成整数，容差给 2 像素对应的数据值
      var ex = w0 * 2 / chart.chartArea.width, ey = h0 * 2 / chart.chartArea.height;
      A.check('ch-xyzoom-' + label + '-native-mousedown-move-up-drives-the-same-box',
        near(v5.x0, tx0, ex) && near(v5.x1, tx1, ex) && near(v5.y0, ty0, ey) && near(v5.y1, ty1, ey) &&
          (v5.x1 - v5.x0) < w0 * 0.9 && (v5.y1 - v5.y0) < h0 * 0.9, JSON.stringify(v5));
      // 拖出绘图区：钳到边缘，不会算出超出数据域的范围
      DS.charts.resetZoom(chart);
      var ca = chart.chartArea;
      boxDrag(chart, { x: ca.left - 50, y: ca.bottom + 40 }, pxOf(chart, tx1, ty0));
      var v6 = view(chart);
      A.check('ch-xyzoom-' + label + '-drag-starting-outside-plot-area-clamps-to-its-edge',
        near(v6.x0, v0.x0, w0 * 1e-6) && near(v6.y0, v0.y0, h0 * 1e-6) && near(v6.x1, tx1, w0 * 1e-6) && near(v6.y1, ty0, h0 * 1e-6), JSON.stringify(v6));
      // 平移
      DS.charts.resetZoom(chart);
      boxDrag(chart, pxOf(chart, tx0, ty1), pxOf(chart, tx1, ty0));
      var z = view(chart), zw = z.x1 - z.x0, zh = z.y1 - z.y0;
      var spanBefore = Math.abs(chart.scales.x.getPixelForValue(z.x1) - chart.scales.x.getPixelForValue(z.x0));
      var moved = DS.charts.panBy(chart, 30, 0);
      var p1 = view(chart);
      A.check('ch-xyzoom-' + label + '-pan-right-moves-window-left-keeps-width-and-y',
        moved && p1.x0 < z.x0 && near(p1.x1 - p1.x0, zw, zw * 1e-9) && near(p1.y0, z.y0, 1e-9) && near(p1.y1, z.y1, 1e-9) &&
          near(z.x0 - p1.x0, 30 * zw / spanBefore, zw * 1e-6), JSON.stringify(z) + ' -> ' + JSON.stringify(p1));
      DS.charts.panBy(chart, 0, 25);
      var p2 = view(chart);
      A.check('ch-xyzoom-' + label + '-pan-down-moves-window-up-keeps-height',
        p2.y0 > p1.y0 && near(p2.y1 - p2.y0, zh, zh * 1e-9) && near(p2.x0, p1.x0, 1e-9), JSON.stringify(p2));
      DS.charts.panBy(chart, 100000, 100000);
      var p3 = view(chart);
      A.check('ch-xyzoom-' + label + '-pan-clamped-inside-data-domain-width-preserved',
        near(p3.x0, v0.x0, w0 * 1e-6) && near(p3.y1, v0.y1, h0 * 1e-6) && near(p3.x1 - p3.x0, zw, zw * 1e-6) && near(p3.y1 - p3.y0, zh, zh * 1e-6), JSON.stringify(p3));
      DS.charts.resetZoom(chart);
      A.check('ch-xyzoom-' + label + '-pan-when-not-zoomed-is-a-noop',
        DS.charts.panBy(chart, 50, 50) === false && !DS.charts.isZoomed(chart), '');
      // Shift+拖动 = 平移（原生事件）；不带 Shift = 框选
      boxDrag(chart, pxOf(chart, tx0, ty1), pxOf(chart, tx1, ty0));
      var s0 = view(chart);
      function natS(type, p) {
        chart.canvas.dispatchEvent(new MouseEvent(type, { clientX: r.left + p.x * k, clientY: r.top + p.y * k, bubbles: true, button: 0, shiftKey: true }));
      }
      var cc = pxOf(chart, (tx0 + tx1) / 2, (ty0 + ty1) / 2);
      natS('mousedown', cc); natS('mousemove', { x: cc.x - 20, y: cc.y + 15 }); natS('mouseup', { x: cc.x - 20, y: cc.y + 15 });
      var s1 = view(chart);
      A.check('ch-xyzoom-' + label + '-shift-drag-pans-instead-of-zooming',
        s1.x0 > s0.x0 && s1.y0 > s0.y0 && near(s1.x1 - s1.x0, s0.x1 - s0.x0, w0 * 1e-9) && near(s1.y1 - s1.y0, s0.y1 - s0.y0, h0 * 1e-9), JSON.stringify(s0) + ' -> ' + JSON.stringify(s1));
      DS.charts.resetZoom(chart);
      // 滚轮模式照常适用：ctrl-zoom 下无 Ctrl 不动，带 Ctrl 两个方向一起缩
      var wv = view(chart), noop = { deltaY: -1, ctrlKey: false, preventDefault: function () {} };
      DS.charts._onWheel(chart, noop);
      var wA = view(chart);
      DS.charts._onWheel(chart, { deltaY: -1, ctrlKey: true, preventDefault: function () {} });
      var wB = view(chart);
      A.check('ch-xyzoom-' + label + '-wheel-modes-still-apply-ctrl-wheel-zooms-both-axes',
        JSON.stringify(wA) === JSON.stringify(wv) && (wB.x1 - wB.x0) < w0 && (wB.y1 - wB.y0) < h0, JSON.stringify(wB));
      DS.charts.resetZoom(chart);
    }
    xyCases('bubble', bc, 0.2, 0.6, 0.15, 0.55);
    document.querySelector('[data-panel="p-comp"]').click();
    var scc = document.getElementById('c-scatter')._dsChart;
    xyCases('scatter', scc, 0.25, 0.65, 0.2, 0.7);

    // 选框反馈：半透明 --color-primary 矩形（填充 0.12），拖拽中可见，结束后擦掉
    function pixel(chart, x, y) {
      var dpr = chart.currentDevicePixelRatio || 1;
      var p = chart.ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return [p[0], p[1], p[2], p[3]];
    }
    // 把 (rgb, alpha) 以 source-over 叠到 RGBA 像素 under 上（straight alpha）
    function over(under, rgb, a) {
      var ua = under[3] / 255, oa = a + ua * (1 - a);
      return [0, 1, 2].map(function (i) { return (rgb[i] * a + under[i] * ua * (1 - a)) / oa; }).concat([oa * 255]);
    }
    function closeTo(got, exp, ec, ea) {
      return [0, 1, 2].every(function (i) { return Math.abs(got[i] - exp[i]) <= ec; }) && Math.abs(got[3] - exp[3]) <= ea;
    }
    function selectionCheck(theme) {
      DS.theme.set(theme);
      bc.resize(); DS.charts.resetZoom(bc); clearHover(bc);
      var a = bc.chartArea;
      var x0 = Math.round(a.left) + 200, y0 = Math.round(a.top) + 60, x1 = x0 + 160, y1 = y0 + 90;   // 整数坐标：1px 描边正好占满一行像素
      var sx = x0 + 70, sy = y0 + 40;                      // 矩形内部一点（避开描边）
      bc.draw();
      var before = pixel(bc, sx, sy), outside = pixel(bc, x1 + 40, y1 + 40), edgeBefore = pixel(bc, x0 + 40, y0);
      DS.charts._dragBegin(bc, x0, y0);
      DS.charts._dragMove(bc, x1, y1);
      var during = pixel(bc, sx, sy), outsideDuring = pixel(bc, x1 + 40, y1 + 40), edgeDuring = pixel(bc, x0 + 40, y0);
      var t = hexToRgbComponents(tok('--color-primary')), prim = [t.r, t.g, t.b];
      var inside = closeTo(during, over(before, prim, 0.12), 8, 2);
      // 描边那一行像素同时被填充（0.12）和描边（0.6）覆盖，先填充后描边
      var edgeExp = over(over(edgeBefore, prim, 0.12), prim, 0.6);
      var edgeOk = closeTo(edgeDuring, edgeExp, 8, 3);
      var untouched = outside.join() === outsideDuring.join();
      DS.charts._dragCancel(bc);
      var after = pixel(bc, sx, sy);
      // 被忽略的框选（太窄）松手后矩形也必须擦掉：这里在 (x0+80, y0+1) 取点，矩形高 3px
      bc.draw();
      var thinBefore = pixel(bc, x0 + 80, y0 + 1);
      DS.charts._dragBegin(bc, x0, y0);
      DS.charts._dragMove(bc, x1, y0 + 3);
      var thinDuring = pixel(bc, x0 + 80, y0 + 1);
      DS.charts._dragEnd(bc, x1, y0 + 3);
      var thinAfter = pixel(bc, x0 + 80, y0 + 1);
      var thinErased = thinDuring.join() !== thinBefore.join() && thinAfter.join() === thinBefore.join() && !DS.charts.isZoomed(bc);
      return { inside: inside, edgeOk: edgeOk, untouched: untouched, erased: after.join() === before.join() && thinErased,
        d: before.join() + ' -> ' + during.join() + ' exp ' + over(before, prim, 0.12).map(Math.round).join() +
          ' | edge ' + edgeBefore.join() + ' -> ' + edgeDuring.join() + ' exp ' + edgeExp.map(Math.round).join() };
    }
    var selL = selectionCheck('light'), selD = selectionCheck('dark');
    DS.theme.set('light');
    A.check('ch-xyzoom-selection-rectangle-is-translucent-primary-token-light',
      selL.inside && selL.edgeOk && selL.untouched && selL.erased, JSON.stringify(selL));
    A.check('ch-xyzoom-selection-rectangle-is-translucent-primary-token-dark',
      selD.inside && selD.edgeOk && selD.untouched && selD.erased, JSON.stringify(selD));
    // 1 维图保持原语义：有类目标签 = 只缩放类目轴，不带第二根轴状态
    var barC = document.getElementById('c-bar')._dsChart;
    barC.resize();
    DS.charts.resetZoom(barC);
    var ba = barC.chartArea;
    boxDrag(barC, { x: ba.left + 30, y: ba.top + 5 }, { x: ba.left + 160, y: ba.bottom - 5 });
    A.check('ch-xyzoom-category-charts-keep-1d-zoom-semantics',
      barC.$ds.xy !== true && barC.$ds.sec === undefined && DS.charts.isZoomed(barC) && barC.options.scales.y.min === undefined &&
        barC.options.scales.x.min != null, '');
    DS.charts.resetZoom(barC);
    // 有类目标签的图即使显式 dsZoom:'xy' 也保持 1 维语义（类目轴没有第二根数值域概念）
    (function () {
      var host = document.createElement('div'); host.className = 'ds-chart-host'; host.style.cssText = 'width:500px;height:300px';
      var cvs = document.createElement('canvas'); host.appendChild(cvs); document.body.appendChild(host);
      var c = DS.charts.create(cvs, { type: 'bar', data: { labels: ['a', 'b', 'c', 'd'], datasets: [{ label: 'x', data: [1, 2, 3, 4] }] }, options: { dsZoom: 'xy' } });
      A.check('ch-xyzoom-labelled-category-chart-ignores-dsZoom-xy', c.$ds.xy !== true && c.$ds.sec === undefined, '');
      DS.charts.destroy(c); host.remove();
    })();
    // 固定的 min/max 在 xy 复位后两根轴都要还回去
    (function () {
      var host = document.createElement('div'); host.className = 'ds-chart-host'; host.style.cssText = 'width:600px;height:360px';
      var cvs = document.createElement('canvas'); host.appendChild(cvs); document.body.appendChild(host);
      var c = DS.charts.create(cvs, { type: 'scatter', data: { datasets: [{ data: [{ x: 10, y: 10 }, { x: 90, y: 80 }, { x: 50, y: 40 }] }] },
        options: { scales: { x: { min: -20, max: 120 }, y: { min: -10, max: 100 } } } });
      boxDrag(c, pxOf(c, 0, 80), pxOf(c, 60, 20));
      var zoomedOk = near(c.scales.x.min, 0, 1e-6) && near(c.scales.y.max, 80, 1e-6);
      DS.charts.resetZoom(c);
      A.check('ch-xyzoom-reset-restores-pinned-min-max-on-both-axes',
        zoomedOk && c.scales.x.min === -20 && c.scales.x.max === 120 && c.scales.y.min === -10 && c.scales.y.max === 100,
        c.scales.x.min + '..' + c.scales.x.max + ' ' + c.scales.y.min + '..' + c.scales.y.max);
      DS.charts.destroy(c);
      var c3 = DS.charts.create(cvs, { type: 'scatter', data: { datasets: [{ data: [{ x: 1, y: 1 }, { x: 9, y: 8 }] }] }, options: { dsZoom: 'x' } });
      A.check('ch-xyzoom-option-dsZoom-x-opts-a-scatter-out-of-xy', c3.$ds.xy !== true && c3.$ds.sec === undefined, '');
      DS.charts.destroy(c3);
      host.remove();
    })();

    // ================= B9 / B10 数据表弹窗 =================
    function tbl() { return document.querySelector('#ds-chart-table'); }
    function rowsAll() { return Array.prototype.slice.call(tbl().tBodies[0].rows); }
    function rowsVis() { return rowsAll().filter(function (r) { return !r.hidden; }); }
    function col(i) { return rowsVis().map(function (r) { return r.cells[i].textContent; }); }
    function num(t) { return parseFloat(String(t).replace(/,/g, '')); }
    function backdrop() { return document.querySelector('.ds-modal-backdrop'); }
    function isOpen() { var b = backdrop(); return !!b && !b.hidden; }
    function btnOf(chart) { return chart.canvas.parentNode.querySelector('[data-act="table"]'); }
    function openT(chart) { DS.modal.close(); btnOf(chart).click(); }
    function typeSearch(v) {
      var inp = document.querySelector('.ds-table-modal-search');
      inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function mono(arr, cmp) { for (var i = 1; i < arr.length; i++) if (cmp(arr[i - 1], arr[i]) > 0) return false; return true; }
    function th(i) { return tbl().tHead.rows[0].cells[i]; }

    var tbtn = btnOf(bc);
    A.check('ch-table-b9-toolbar-button-is-inline-svg-not-a-unicode-glyph',
      !!tbtn && !!tbtn.querySelector('svg') && tbtn.textContent.trim() === '' && tbtn.getAttribute('aria-label') === '表格' &&
        tbtn.parentNode.classList.contains('ds-chart-toolbar') &&
        Array.prototype.map.call(tbtn.parentNode.querySelectorAll('[data-act]'), function (b) { return b.getAttribute('data-act'); }).join() === 'out,in,reset,table,full', '');
    A.check('ch-table-b9-charts-without-a-table-spec-have-no-button', !btnOf(barC) && !btnOf(scc), '');
    openT(bc);
    A.check('ch-table-b9-click-opens-modal-with-table-in-ds-modal', isOpen() && !!tbl() && backdrop().querySelector('.ds-modal .ds-table-modal') !== null &&
      tbl().classList.contains('ds-table'), '');
    A.check('ch-table-b9-columns-hash-name-count-avg-with-numeric-right-aligned',
      Array.prototype.map.call(tbl().tHead.rows[0].cells, function (c) { return c.textContent; }).join('|') === '#|项目名称|样本数|平均时长(分钟)' &&
        th(2).classList.contains('num') && th(3).classList.contains('num') && !th(0).classList.contains('num') && !th(1).classList.contains('num') &&
        rowsAll().every(function (r) { return r.cells[2].classList.contains('num') && r.cells[3].classList.contains('num') && !r.cells[1].classList.contains('num'); }) &&
        rowsAll().length === 50 &&
        getComputedStyle(th(2)).textAlign === 'right' && getComputedStyle(rowsAll()[0].cells[2]).textAlign === 'right' &&
        getComputedStyle(th(1)).textAlign === 'left', '');
    A.check('ch-table-b9-reuses-ds-tables-sortable', tbl().dataset.dsSortableBound === '1', '');
    // B10 数字格式
    A.check('ch-table-b10-count-thousands-separator-avg-one-decimal',
      rowsAll().every(function (r, i) {
        var p = pts[i];
        return r.cells[2].textContent === p.count.toLocaleString('en-US') && /^\d{1,3}(,\d{3})*$/.test(r.cells[2].textContent) &&
          r.cells[3].textContent === p.y.toFixed(1) && /^\d+\.\d$/.test(r.cells[3].textContent);
      }) && col(2).some(function (t) { return t.indexOf(',') !== -1; }) && col(3).indexOf('22.0') !== -1, col(2)[0] + ' ' + col(3)[0]);
    A.check('ch-table-b9-initial-order-is-count-descending-and-index-1-to-n',
      mono(col(2).map(num), function (a, b) { return b - a; }) && col(0).join() === pts.map(function (_, i) { return i + 1; }).join(), '');
    // 排序方向
    th(1).click();
    var nameAsc = col(1);
    var nameOk1 = th(1).getAttribute('aria-sort') === 'ascending' && mono(nameAsc, function (a, b) { return a.localeCompare(b, 'zh-Hans-CN'); });
    th(1).click();
    var nameDesc = col(1);
    var nameOk2 = th(1).getAttribute('aria-sort') === 'descending' && JSON.stringify(nameDesc) === JSON.stringify(nameAsc.slice().reverse());
    A.check('ch-table-b9-sort-name-first-click-ascending-second-descending', nameOk1 && nameOk2, nameAsc.slice(0, 3).join());
    A.check('ch-table-b9-sort-renumbers-index-column', col(0).join() === pts.map(function (_, i) { return i + 1; }).join(), '');
    function numSortCheck(ci) {
      openT(bc);                              // 重新打开：排序状态清零
      var noSortYet = !th(ci).hasAttribute('aria-sort');
      th(ci).click();
      var first = th(ci).getAttribute('aria-sort'), a = col(ci).map(num);
      th(ci).click();
      var second = th(ci).getAttribute('aria-sort'), b = col(ci).map(num);
      return noSortYet && first === 'descending' && mono(a, function (x, y) { return y - x; }) &&
        second === 'ascending' && mono(b, function (x, y) { return x - y; }) && a[0] !== b[0];
    }
    A.check('ch-table-b9-sort-count-first-click-descending-second-ascending', numSortCheck(2), '');
    A.check('ch-table-b9-sort-avg-first-click-descending-second-ascending', numSortCheck(3), '');
    // 搜索
    openT(bc);
    typeSearch('alpha');
    var alphaVis = col(1);
    typeSearch('ALPHA');
    var alphaVis2 = col(1);
    typeSearch('ssay');
    var subVis = col(1);
    A.check('ch-table-b9-search-case-insensitive-substring-on-name',
      alphaVis.join() === 'Alpha Assay' && alphaVis2.join() === 'Alpha Assay' && subVis.join() === 'Alpha Assay', alphaVis.join());
    typeSearch('项目0');
    var expect0 = pts.filter(function (p) { return p.name.toLowerCase().indexOf('项目0') !== -1; }).map(function (p) { return p.name; });
    A.check('ch-table-b9-search-substring-matches-many-and-index-renumbered',
      expect0.length >= 3 && col(1).join() === expect0.join() && col(0).join() === expect0.map(function (_, i) { return i + 1; }).join(), expect0.length + ' vs ' + col(1).length);
    typeSearch('654');
    A.check('ch-table-b9-search-matches-name-only-not-numbers', rowsVis().length === 0 && !tbl().parentNode.querySelector('.ds-table-modal-empty').hidden, '');
    typeSearch('');
    A.check('ch-table-b9-clearing-search-restores-all-rows', rowsVis().length === 50 && tbl().parentNode.querySelector('.ds-table-modal-empty').hidden, '');
    // 排序与过滤可叠加
    typeSearch('项目');
    th(2).click();
    var comb = col(2).map(num);
    A.check('ch-table-b9-sort-and-filter-compose', comb.length > 5 && comb.length < 50 && mono(comb, function (a, b) { return b - a; }) &&
      col(1).every(function (n) { return n.indexOf('项目') !== -1; }), '');
    // 重新打开清空
    typeSearch('alpha');
    DS.modal.close();
    btnOf(bc).click();
    var inp2 = document.querySelector('.ds-table-modal-search');
    A.check('ch-table-b9-reopen-clears-search-box-and-filter', inp2.value === '' && rowsVis().length === 50 && col(2).map(num).length === 50 &&
      !th(2).hasAttribute('aria-sort'), 'value=' + inp2.value + ' rows=' + rowsVis().length);
    // 关闭方式
    A.check('ch-table-b9-close-via-x-button', (function () {
      document.querySelector('.ds-table-modal-close').click(); return !isOpen();
    })(), '');
    A.check('ch-table-b9-close-via-backdrop-click-not-via-modal-click', (function () {
      openT(bc);
      tbl().click();
      var stays = isOpen();
      backdrop().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return stays && !isOpen();
    })(), '');
    A.check('ch-table-b9-close-via-escape', (function () {
      openT(bc);
      var was = isOpen();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return was && !isOpen();
    })(), '');
    A.check('ch-table-b9-x-close-button-glyph-is-multiplication-sign',
      (openT(bc), document.querySelector('.ds-table-modal-close').textContent === '×'), '');
    DS.modal.close();
    // 全屏下打开：弹窗必须在全屏图表之上
    var bhost = document.getElementById('bubble-host');
    bhost.querySelector('[data-act="full"]').click();
    var fsOn = bhost.classList.contains('ds-chart-fullscreen');
    btnOf(bc).click();
    var cx = Math.floor(window.innerWidth / 2), cy = Math.floor(window.innerHeight / 2);
    var hit = document.elementFromPoint(cx, cy);
    var hostZ = +getComputedStyle(bhost).zIndex, backZ = +getComputedStyle(backdrop()).zIndex;
    var hitCorner = document.elementFromPoint(40, 40);
    A.check('ch-table-b9-opens-above-fullscreen-chart-elementFromPoint-hits-modal',
      fsOn && isOpen() && !!hit && !!hit.closest('.ds-modal-backdrop') && !hit.closest('.ds-chart-host') &&
        !!hitCorner && !!hitCorner.closest('.ds-modal-backdrop') && backZ > hostZ,
      'hit=' + (hit && hit.tagName + '.' + hit.className) + ' z=' + backZ + '>' + hostZ);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    A.check('ch-table-b9-escape-closes-modal-in-fullscreen-and-chart-stays-fullscreen', !isOpen() && bhost.classList.contains('ds-chart-fullscreen'), '');
    bhost.querySelector('[data-act="full"]').click();
    A.check('ch-table-b9-table-button-works-again-after-leaving-fullscreen',
      !bhost.classList.contains('ds-chart-fullscreen') && (btnOf(bc).click(), isOpen() && rowsAll().length === 50), '');
    DS.modal.close();

    // 通用：任何图表都能挂数据表（create 的 dsTable、attachTable、rows 为函数）
    (function () {
      var host = document.createElement('div'); host.className = 'ds-chart-host'; host.style.cssText = 'width:500px;height:300px';
      var cvs = document.createElement('canvas'); host.appendChild(cvs); document.body.appendChild(host);
      var live = [{ k: '甲', v: 3 }, { k: 'b<i>乙</i>&', v: 12000 }];
      var c = DS.charts.create(cvs, {
        type: 'bar', data: { labels: ['甲', 'b'], datasets: [{ label: 'x', data: [3, 5] }] },
        dsTable: { title: '通用', columns: [{ key: 'k', label: '键' }, { key: 'v', label: '值', num: true, format: function (v) { return v.toLocaleString('en-US'); } }],
          rows: function () { return live.slice(); }, index: false }
      });
      var b = btnOf(c);
      openT(c);
      var hd = Array.prototype.map.call(tbl().tHead.rows[0].cells, function (x) { return x.textContent; }).join('|');
      A.check('ch-table-general-bar-chart-with-dsTable-gets-button-and-table',
        !!b && hd === '键|值' && rowsAll().length === 2 && col(1).join('|') === '3|12,000' && tbl().tBodies[0].rows[1].cells[1].textContent === '12,000' &&
          th(1).classList.contains('num') && th(1).getAttribute('data-sort-first') === 'desc', hd);
      A.check('ch-table-general-html-in-cell-text-is-escaped',
        tbl().tBodies[0].rows[1].cells[0].textContent === 'b<i>乙</i>&' && !tbl().querySelector('i'), '');
      A.check('ch-table-general-no-index-column-when-index-false', tbl().tHead.rows[0].cells.length === 2, '');
      A.check('ch-table-general-search-defaults-to-first-column', (function () {
        typeSearch('<I>'); var n = rowsVis().length; typeSearch(''); return n === 1;
      })(), '');
      live.push({ k: '丙', v: 1 });
      openT(c);
      A.check('ch-table-general-rows-function-is-re-evaluated-on-every-open', rowsAll().length === 3, rowsAll().length);
      DS.modal.close();
      DS.charts.destroy(c);
      // attachTable 挂到没有工具条的饼图：只出现 表格/全屏 两个按钮
      var pc = DS.charts.create(cvs, { type: 'doughnut', data: { labels: ['a', 'b'], datasets: [{ data: [1, 2] }] } });
      var noBar = !host.querySelector('.ds-chart-toolbar');
      DS.charts.attachTable(pc, { title: '饼', columns: [{ key: 'l', label: '类别' }, { key: 'n', label: '数', num: true }], rows: [{ l: 'a', n: 1 }, { l: 'b', n: 2 }] });
      A.check('ch-table-general-attach-to-doughnut-adds-minimal-toolbar',
        noBar && Array.prototype.map.call(host.querySelectorAll('[data-act]'), function (x) { return x.getAttribute('data-act'); }).join() === 'table,full', '');
      openT(pc);
      A.check('ch-table-general-doughnut-table-opens-and-sorts', rowsAll().length === 2 && (th(2).click(), col(2).join() === '2,1'), '');
      DS.modal.close();
      DS.charts.destroy(pc);
      host.remove();
    })();
    (function () {
      var t = mk([{ name: '<b>x</b>&"q"', count: 50, value: 1 }], {});
      openT(t.chart);
      A.check('ch-table-bubble-name-with-html-is-escaped', tbl().tBodies[0].rows[0].cells[1].textContent === '<b>x</b>&"q"' && !tbl().querySelector('b'), '');
      DS.modal.close();
      t.done();
    })();
    DS.modal.close();
    document.querySelector('[data-panel="p-play"]').click();
  });
})();
