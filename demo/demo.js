/* demo/demo.js —— report-design-ref 对外演示页：交互演练场 + 组件全览。

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

  // 超长中文标签：复用同一组变量名贯穿 charts / svgCharts 两套断言，
  // 分别验证 Chart.js 刻度截断和 SVG 甘特行标签截断走的是同一条规则。
  var longLabel = '全自动处理仪零三号机台';
  var ganttLongLabel = '自动化样本处理工作站零三号';

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

  document.getElementById('app').innerHTML = [
    '<div class="ds-nav">',
    '  <span class="ds-nav-title">report-design-ref</span>',
    '  <div class="ds-tabs" id="nav-tabs">',
    '    <button type="button" class="ds-tab" aria-selected="true" data-panel="p-play">交互演练场</button>',
    '    <button type="button" class="ds-tab" aria-selected="false" data-panel="p-comp">组件全览</button>',
    '  </div>',
    '  <span style="flex:1"></span>',
    '  <button type="button" class="ds-btn secondary" id="btn-theme">深 / 浅</button>',
    '</div>',

    /* ---------------- 交互演练场 ---------------- */
    '<div class="ds-panel" id="p-play"><div class="ds-wrap">',
    '  <div class="ds-banner info" style="margin-bottom:14px">',
    '    以下全部为合成数据，仅用于演示交互，不对应任何真实运行记录。下方可现场切换滚轮缩放方式，立即生效。',
    '  </div>',

    '  <div class="ds-card" style="margin-bottom:14px">',
    '    <div class="ds-card-title">滚轮缩放方式</div>',
    '    <div id="wheel-opts"></div>',
    '  </div>',

    '  <div class="ds-grid ds-grid-4" style="margin-bottom:14px">',
    '    <div class="ds-stat" id="t-stat"><div class="ds-stat-label">运行批次</div>',
    '      <div class="ds-stat-value">248</div>',
    '      <div class="ds-stat-delta up" id="t-delta-up">较上月 +12%</div></div>',
    '    <div class="ds-stat"><div class="ds-stat-label">平均时长</div>',
    '      <div class="ds-stat-value">02:14</div>',
    '      <div class="ds-stat-delta down" id="t-delta-down">较上月 −6%</div></div>',
    '    <div class="ds-stat"><div class="ds-stat-label">切片总数</div>',
    '      <div class="ds-stat-value">5,120</div>',
    '      <div class="ds-stat-delta">持平</div></div>',
    '    <div class="ds-stat"><div class="ds-stat-label">报警次数</div>',
    '      <div class="ds-stat-value">3</div>',
    '      <div class="ds-stat-delta up">较上月 +1</div></div>',
    '  </div>',

    '  <div class="ds-grid ds-grid-2" style="margin-bottom:14px">',
    '    <div class="ds-card"><div class="ds-card-title">月度批次</div>',
    '      <div class="ds-chart-host"><canvas id="c-bar"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-title">时长趋势</div>',
    '      <div class="ds-chart-host"><canvas id="c-line"></canvas></div></div>',
    '  </div>',

    '  <div class="ds-grid ds-grid-2" style="margin-bottom:14px">',
    '    <div class="ds-card"><div class="ds-card-title">机台排程（SVG 甘特）</div>',
    '      <div id="s-gantt"></div></div>',
    '    <div class="ds-card"><div class="ds-card-title">时段热力（SVG）</div>',
    '      <div id="s-heat"></div></div>',
    '  </div>',

    '  <div class="ds-card" style="margin-bottom:14px">',
    '    <div class="ds-card-title">运行明细（点击表头排序）</div>',
    '    <table class="ds-table" id="t-detail"><thead><tr>',
    '      <th>批次</th><th>仪器</th><th>切片数</th><th>时长(分)</th><th>状态</th>',
    '    </tr></thead><tbody>',
    detailRows.map(function (r) {
      return '<tr><td>' + r.batch + '</td><td>' + r.instrument +
             '</td><td class="num">' + r.slides +
             '</td><td class="num">' + r.minutes +
             '</td><td><span class="ds-badge ' + badgeOf[r.state] + '">' + r.state + '</span></td></tr>';
    }).join(''),
    '  </tbody></table></div>',

    '  <div class="ds-card"><div class="ds-card-title">空数据态</div>',
    '    <div class="ds-chart-host ds-chart-host--compact"><canvas id="c-empty"></canvas></div></div>',
    '</div></div>',

    /* ---------------- 组件全览 ---------------- */
    '<div class="ds-panel" id="p-comp" hidden><div class="ds-wrap">',

    '  <div class="ds-card" style="margin-bottom:14px"><div class="ds-card-title">按钮</div>',
    '    <button type="button" class="ds-btn primary" id="t-btn">主按钮</button> ',
    '    <button type="button" class="ds-btn secondary">次按钮</button></div>',

    '  <div class="ds-card" style="margin-bottom:14px"><div class="ds-card-title">徽标</div>',
    '    <span class="ds-badge blue" id="t-badge">蓝</span> ',
    '    <span class="ds-badge green">绿</span> ',
    '    <span class="ds-badge amber">琥珀</span> ',
    '    <span class="ds-badge red">红</span></div>',

    '  <div class="ds-grid" style="gap:10px;margin-bottom:14px">',
    '    <div class="ds-banner ok" id="t-banner-ok">ok —— 一切正常，退为安静的确认条</div>',
    '    <div class="ds-banner info">info —— 补充说明</div>',
    '    <div class="ds-banner warn" id="t-banner">warn —— 需要注意</div>',
    '    <div class="ds-banner bad">bad —— 出问题了</div>',
    '  </div>',

    '  <div class="ds-card" style="margin-bottom:14px"><div class="ds-card-title">上传区</div>',
    '    <div class="ds-dropzone">把文件拖到这里</div></div>',

    '  <div class="ds-card" id="t-card" style="margin-bottom:14px"><div class="ds-card-title">卡片与模态</div>',
    '    <button type="button" class="ds-btn secondary" id="btn-modal">打开模态</button> ',
    '    <button type="button" class="ds-btn secondary" id="btn-toast">弹出 toast</button></div>',

    '  <div class="ds-card" style="margin-bottom:14px"><div class="ds-card-title">表格（点击表头排序）</div>',
    '    <table class="ds-table" id="t-table"><thead><tr><th>示例值</th></tr></thead>',
    '      <tbody><tr><td>10</td></tr><tr><td>2</td></tr><tr><td>33</td></tr></tbody></table></div>',

    '  <div class="ds-grid ds-grid-2">',
    '    <div class="ds-card"><div class="ds-card-title">超长标签截断</div>',
    '      <div class="ds-chart-host"><canvas id="c-long"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-title">横向条形图</div>',
    '      <div class="ds-chart-host"><canvas id="c-hbar"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-title">环形图</div>',
    '      <div class="ds-chart-host"><canvas id="c-pie"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-title">散点图</div>',
    '      <div class="ds-chart-host"><canvas id="c-scatter"></canvas></div></div>',
    '  </div>',

    '  <div class="ds-grid ds-grid-2" style="margin-top:14px">',
    '    <div class="ds-card"><div class="ds-card-title">双轴组合图（量 + 率）</div>',
    '      <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:8px">',
    '        柱子是绝对量（批次数，左轴），折线是比率（达标率，右轴）——量纲不同的两个',
    '        指标共享一张图是报表最常见的形态。副轴（右轴）默认不画网格线，避免两套',
    '        网格叠在一起成为视觉噪音。</div>',
    '      <div class="ds-chart-host"><canvas id="c-combo"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-title">堆叠柱状图</div>',
    '      <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:8px">',
    '        多台设备各自贡献的批次数按月堆叠，配色走六条分类序列色。</div>',
    '      <label style="display:block;font-size:12px;cursor:pointer;margin-bottom:8px">',
    '        <input type="checkbox" id="chk-stacked-percent"> 显示为百分比堆叠',
    '        <span style="color:var(--color-text-secondary)">（Chart.js 无原生支持，内部做了一次数据归一化，悬浮仍可看到原始值）</span>',
    '      </label>',
    '      <div class="ds-chart-host"><canvas id="c-stacked"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-title">面积图（填充）</div>',
    '      <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:8px">',
    '        fill 数据集的填充色自动取线条色的半透明版本，两条面积图叠在一起也不会',
    '        互相完全遮挡；不填充的目标线仍是不透明色，画法不受影响。</div>',
    '      <div class="ds-chart-host"><canvas id="c-area"></canvas></div></div>',
    '    <div class="ds-card"><div class="ds-card-title">时间轴（按日期，模拟）</div>',
    '      <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:8px">',
    '        Chart.js 的 time/timeseries 轴需要额外的日期适配器，本库零外链、不联网',
    '        下载第三方库，所以这里用数值轴(linear) + 自定义刻度格式化模拟日期轴的',
    '        视觉效果，细节见 README「时间轴」一节。</div>',
    '      <div class="ds-chart-host"><canvas id="c-timeaxis"></canvas></div></div>',
    '  </div>',
    '</div></div>'
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
  DS.tabs.init('#nav-tabs');
  DS.tables.sortable('#t-detail');
  DS.tables.sortable('#t-table');
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

  /* ---------- 滚轮模式选择器：切换后立即生效，无需刷新 ---------- */
  var optsHost = document.getElementById('wheel-opts');
  optsHost.innerHTML = WHEEL_MODES.map(function (m) {
    return '<label style="display:block;margin:6px 0;font-size:13px;cursor:pointer">' +
      '<input type="radio" name="wheel" value="' + m[0] + '"' +
      (m[0] === 'ctrl-zoom' ? ' checked' : '') + '> ' +
      '<code>' + m[0] + '</code> — <span style="color:var(--color-text-secondary)">' +
      m[1] + '</span></label>';
  }).join('');
  optsHost.addEventListener('change', function (ev) {
    if (ev.target.name !== 'wheel') return;
    DS.charts.setWheelMode(ev.target.value);
    DS.toast.show('滚轮模式：' + ev.target.value);
  });

  /* ---------- 图表：registry 计数与 Task 3-7 保留断言共用同一个助手 ---------- */
  var expectedRegistered = 0;
  function makeChart(canvas, config) {
    var chart = DS.charts.create(canvas, config);
    if (chart) expectedRegistered++;
    return chart;
  }

  var months6 = DS_MOCK.months().slice(0, 6);
  var barChart = makeChart(document.getElementById('c-bar'), {
    type: 'bar',
    data: { labels: months6, datasets: [{ label: '批次', data: DS_MOCK.series(6, 1) }] }
  });
  var lineChart = makeChart(document.getElementById('c-line'), {
    type: 'line',
    data: {
      labels: months6,
      datasets: [
        { label: '平均时长', data: DS_MOCK.series(6, 2), tension: 0.3 },
        { label: '最长时长', data: DS_MOCK.series(6, 3), tension: 0.3 }
      ]
    }
  });
  var emptyChart = makeChart(document.getElementById('c-empty'), {
    type: 'line', data: { labels: [], datasets: [{ label: '空', data: [] }] }
  });
  var longChart = makeChart(document.getElementById('c-long'), {
    type: 'bar',
    data: { labels: [longLabel, '短'], datasets: [{ label: '时长', data: [5, 9] }] }
  });
  // 横向条形图（indexAxis:'y'）：类目在 y 轴、数值在 x 轴，长标签挂在这里。
  // 三个类目（而不是两个）是必须的：索引域缩放的下限 _minHalf() 固定是
  // 半个索引单位，两个类目的满量程半宽本身就等于这个下限——"放大"一次会
  // 立刻撞回满量程，Review C1 修复后这种情况会被正确识别成"未缩放"
  // （isZoomed()===false），测不出"缩放确实作用在 y 轴而不是 x 轴"这件事
  // 本身。三个类目能让"放大一次"产生真正小于满量程的视图。
  var hbarChart = makeChart(document.getElementById('c-hbar'), {
    type: 'bar',
    options: { indexAxis: 'y' },
    data: { labels: [longLabel, '短', '中'], datasets: [{ label: '时长', data: [5, 9, 7] }] }
  });
  var pieChart = makeChart(document.getElementById('c-pie'), {
    type: 'doughnut',
    data: { labels: ['类别一', '类别二', '类别三'], datasets: [{ data: [30, 50, 20] }] }
  });
  // 没有类目标签的笛卡尔图（scatter，x/y 都是 linear 量表）：缩放走数据域。
  var scatterChart = makeChart(document.getElementById('c-scatter'), {
    type: 'scatter',
    data: { datasets: [{ label: '样本', data: [{ x: 10, y: 5 }, { x: 30, y: 12 }, { x: 55, y: 7 }] }] }
  });

  /* ---------- 双轴组合图：柱子是量（批次数，y 轴），折线是率（达标率，
     y1 轴）。y1 只给 position，grid/ticks/border 故意留白——必须全部由
     paint() 自己注入，不能是调用方凑巧写对了颜色。y1 的 min/max/百分比
     ticks 由调用方自己定，paint() 不碰这些。 ---------- */
  var comboChart = makeChart(document.getElementById('c-combo'), {
    type: 'bar',
    data: {
      labels: months6,
      datasets: [
        { label: '批次数', data: DS_MOCK.series(6, 11), yAxisID: 'y' },
        { label: '达标率', type: 'line', data: DS_MOCK.rates(6, 12), yAxisID: 'y1', tension: 0.3 }
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
  var stackedLabels = months6;
  var stackedRaw = [
    { label: '设备A', data: DS_MOCK.series(6, 21) },
    { label: '设备B', data: DS_MOCK.series(6, 22) },
    { label: '设备C', data: DS_MOCK.series(6, 23) }
  ];
  function shallowCopy(o) {
    var out = {};
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k]; }
    return out;
  }
  // percent=true 时：Chart.js 不原生支持"100% 堆叠"，这里用数据预处理
  // （每一类按当月总量归一化成百分比）模拟出等效效果；tooltip 回调从
  // dataset.__dsRaw 读回原始绝对值一并展示，不会因为改成百分比就丢信息。
  function stackedConfig(percent) {
    var totals = stackedLabels.map(function (_, i) {
      return stackedRaw.reduce(function (sum, d) { return sum + d.data[i]; }, 0);
    });
    var datasets = stackedRaw.map(function (d) {
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

  /* ---------- 面积图：两条面积（本周/上周处理量）叠加 + 一条不填充的目标线。
     fill:true 的两个数据集要靠 paint() 把 backgroundColor 换成半透明版本，
     叠在一起才不会互相完全遮挡；目标线没有 fill 字段，backgroundColor 该
     保持不透明（跟普通折线图行为一致）。 ---------- */
  var weekdays = DS_MOCK.weekdays();
  var areaChart = makeChart(document.getElementById('c-area'), {
    type: 'line',
    data: {
      labels: weekdays,
      datasets: [
        { label: '本周处理量', data: DS_MOCK.series(7, 41), fill: true, tension: 0.3 },
        { label: '上周处理量', data: DS_MOCK.series(7, 42), fill: true, tension: 0.3 },
        { label: '目标线', data: DS_MOCK.series(7, 43), tension: 0, borderDash: [4, 4] }
      ]
    }
  });

  /* ---------- 时间轴（模拟）：没有内置日期适配器（见 README「时间轴」），
     x 轴用 'linear' + DS.charts.dateTicks('md') 把时间戳格式化成 M/D 标签。
     没有 labels 数组（点数据 {x,y}），跟散点图走同一条"按数据域缩放"路径。 ---------- */
  var timeaxisDates = DS_MOCK.dates(14);
  var timeaxisValues = DS_MOCK.series(14, 51);
  var timeaxisChart = makeChart(document.getElementById('c-timeaxis'), {
    type: 'line',
    data: {
      datasets: [{
        label: '每日批次数',
        data: timeaxisDates.map(function (t, i) { return { x: t, y: timeaxisValues[i] }; }),
        tension: 0.3
      }]
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
          ticks: { stepSize: 86400000, maxTicksLimit: 7, callback: DS.charts.dateTicks('md') }
        }
      }
    }
  });

  /* ---------- SVG 甘特 / 热力：Chart.js 画不了，复用同一套 token ---------- */
  DS.svg.gantt(document.getElementById('s-gantt'), [
    { label: ganttLongLabel, bars: [{ start: 0, end: 3, series: 0 }, { start: 4, end: 7, series: 1 }] },
    { label: '仪器二号', bars: [{ start: 1, end: 5, series: 2 }] }
  ]);
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
      A.css('#t-table th', 'position') === 'sticky',
      'got ' + A.css('#t-table th', 'position'));
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

    // 标签页：真实的两个标签页就叫这两个名字
    document.querySelector('[data-panel="p-comp"]').click();
    A.check('ix-tab-switches',
      document.getElementById('p-play').hidden && !document.getElementById('p-comp').hidden, '');

    // 表格排序：数字列按数值而非字典序（2/10/33 字典序会排错，用于区分两种排序）
    function numericColumn() {
      return Array.prototype.map.call(
        document.querySelectorAll('#t-table tbody td'),
        function (td) { return parseFloat(td.textContent.trim()); });
    }
    var th = document.querySelector('#t-table th');
    th.click();
    var asc = numericColumn();
    var ascMonotonic = asc.every(function (v, i) { return i === 0 || asc[i - 1] <= v; });
    A.check('ix-table-sorts-numeric', ascMonotonic, 'got ' + asc.join(','));
    th.click();
    var desc = numericColumn();
    var descMonotonic = desc.every(function (v, i) { return i === 0 || desc[i - 1] >= v; });
    A.check('ix-table-sorts-desc', descMonotonic, 'got ' + desc.join(','));

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
    // Critical 修复：longChart/hbarChart/pieChart/scatterChart 现在活在
    // "组件全览"（p-comp）里，p-comp 默认 hidden。Chart.js 对零尺寸画布从不
    // 计算刻度（scales.x.ticks 恒为空数组），readings 下面 ticks[0] 会直接
    // TypeError 崩掉整套——这正是这些图表被创建时的真实布局状态（p-comp 在
    // 页面刚加载时就是隐藏的）。切到 p-comp 让它们真正可见，并对每张图调
    // 一次 resize()（Chart.js 不会在容器变可见后自动重新量测，必须显式
    // 触发）才能拿到真实计算出的 ticks；套件末尾切回 p-play，不把这个
    // 中间状态遗留给后面的 wheel 套件（它要用 barChart 做真实鼠标坐标测试）。
    document.querySelector('[data-panel="p-comp"]').click();
    [longChart, hbarChart, pieChart, scatterChart].forEach(function (c) {
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

    // Review Focus #2：空数据集渲染空态而非空白画布
    A.check('ch-empty-returns-null', emptyChart === null, '');
    var emptyHost = document.getElementById('c-empty').parentNode;
    A.check('ch-empty-shows-tip',
      emptyHost.querySelectorAll('.ds-chart-empty').length === 1, '');
    A.check('ch-empty-hides-canvas',
      document.getElementById('c-empty').style.display === 'none', '');

    // 单点数据不应被当成空
    A.check('ch-single-point-not-empty',
      DS.charts.isEmpty({ data: { datasets: [{ data: [1] }] } }) === false, '');

    // Review Focus #5：超长中文标签截断，tooltip 保留全称。读 Chart.js 真正
    // 算出来的产物：scales.x.ticks[i].label 是经过注册的 callback 处理过的
    // 最终刻度文本。
    var longTick = longChart.scales.x.ticks[0].label;
    var shortTick = longChart.scales.x.ticks[1].label;
    A.check('ch-long-label-truncated',
      longTick.length <= 11 && longTick.slice(-1) === '…', 'got ' + longTick);
    A.check('ch-short-label-not-truncated',
      shortTick === '短', 'got ' + shortTick);

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
    // .ds-chart-fullscreen 是 position:fixed; inset:24px——高度几乎总是
    // 大涨（平时固定 260px，全屏后约等于视口高度），但宽度不一定：取决于
    // 卡片原宽度跟视口宽度的关系，窄视口下全屏宽度甚至可能比原来还小。
    // 不能断言"宽高都必然变大"，只能断言"canvas 真的跟着当前 host 尺寸走"
    // ——这就是 bug 本身：此前 canvas 完全不随 host 变化，两者会相差一大截
    // （差值约等于 host 尺寸变化量本身），resize() 生效后应该只差一个
    // host 内边距（16px）量级。
    A.check('wh-fullscreen-canvas-tracks-host-size',
      Math.abs(c.canvas.width - hostRectDuringFullscreen.width) < 60 &&
        Math.abs(c.canvas.height - hostRectDuringFullscreen.height) < 60,
      'canvas=' + c.canvas.width + 'x' + c.canvas.height +
        ' host=' + Math.round(hostRectDuringFullscreen.width) + 'x' + Math.round(hostRectDuringFullscreen.height));
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
    var a = list[0], b = list[1];
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
    var g = document.querySelector('#s-gantt svg');
    A.check('svg-gantt-rendered', !!g, '');
    A.check('svg-gantt-bar-count',
      g.querySelectorAll('rect').length === 3, 'got ' + g.querySelectorAll('rect').length);
    A.check('svg-gantt-uses-token-color',
      g.querySelector('rect').getAttribute('fill') === DS.charts.themeColors().series[0],
      'got ' + g.querySelector('rect').getAttribute('fill'));

    // 长标签截断：可见文字是 <text> 自身的第一个子节点（Text 节点），
    // <title> 是之后再 appendChild 进去的第二个子节点——不能读
    // firstLabel.textContent，它会把两者递归拼接到一起。
    var firstLabel = g.querySelector('text');
    var firstLabelVisibleText = firstLabel.childNodes[0].data;
    A.check('svg-gantt-label-truncated',
      firstLabelVisibleText.length <= 11 && firstLabelVisibleText.slice(-1) === '…',
      'got ' + firstLabelVisibleText);
    var firstTitle = firstLabel.querySelector('title');
    A.check('svg-gantt-label-title-has-full-text',
      !!firstTitle && firstTitle.textContent === ganttLongLabel,
      'got ' + (firstTitle && firstTitle.textContent));

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

    // 主题重绘：六条分类序列色深浅主题同值，"颜色变了吗"天生恒真。改用两种
    // 有鉴别力的手法：1）栅格线颜色随主题变化；2）先把填充色污染成垃圾值，
    // 切主题后断言它被正确覆盖回当前 token 值。
    var themeBefore = DS.theme.get();
    var gridBefore = g.querySelector('line').getAttribute('stroke');
    g.querySelector('rect').setAttribute('fill', 'rgb(123, 45, 67)');
    hm.querySelector('rect').setAttribute('fill', 'rgb(9, 9, 9)');
    DS.theme.set(themeBefore === 'dark' ? 'light' : 'dark');

    var gridAfter = document.querySelector('#s-gantt svg line').getAttribute('stroke');
    A.check('svg-retheme-grid-color-changes',
      gridBefore !== gridAfter, gridBefore + ' -> ' + gridAfter);
    A.check('svg-gantt-retheme-restores-token-color',
      document.querySelector('#s-gantt svg rect').getAttribute('fill') === DS.charts.themeColors().series[0],
      'got ' + document.querySelector('#s-gantt svg rect').getAttribute('fill'));
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
    guardHost.querySelector('rect').setAttribute('fill', 'rgb(1, 2, 3)');
    guardHost2.querySelector('rect').setAttribute('fill', 'rgb(4, 5, 6)');
    var svgRealWarn = console.warn;
    var svgWarnCalls = [];
    console.warn = function () { svgWarnCalls.push(Array.prototype.slice.call(arguments)); };
    DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark');
    console.warn = svgRealWarn;
    var guardColorAfter = guardHost.querySelector('rect').getAttribute('fill');
    var guardColorAfter2 = guardHost2.querySelector('rect').getAttribute('fill');
    A.check('svg-retheme-isolates-failing-host',
      guardColorAfter === DS.charts.themeColors().series[0] && guardColorAfter !== 'rgb(1, 2, 3)' &&
        guardColorAfter2 === DS.charts.themeColors().series[0] && guardColorAfter2 !== 'rgb(4, 5, 6)',
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
    A.check('demo-four-wheel-options',
      document.querySelectorAll('input[name=wheel]').length === 4, '');
    A.check('demo-default-is-ctrl-zoom',
      document.querySelector('input[name=wheel]:checked').value === 'ctrl-zoom', '');

    // 选择器切换必须立刻改变所有已存在实例的行为，无需重建图表。非笛卡尔
    // 图（c-pie）没有 $ds，不该被这条断言误判。
    //
    // 用带 ctrlKey 的滚轮事件，而不是不带 ctrl 的——默认的 ctrl-zoom 模式
    // 对"不按 Ctrl 的滚轮"本来就不拦截，如果选择器切换其实完全没生效，
    // 这条断言也会误判为通过（变异验证过：让 setWheelMode() 整体失效，
    // 不带 ctrl 的写法仍然是绿的）。page 模式必须连按住 Ctrl 的滚轮也放行，
    // 这才是和出厂默认 ctrl-zoom 真正二选一的行为。
    var pageRadio = document.querySelector('input[name=wheel][value=page]');
    pageRadio.checked = true;
    pageRadio.dispatchEvent(new Event('change', { bubbles: true }));
    var ev = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true });
    barChart.canvas.dispatchEvent(ev);
    A.check('demo-selector-takes-effect-live', ev.defaultPrevented === false, '');
    A.check('demo-selector-applies-to-all',
      DS.charts.all().every(function (c) { return !c.$ds || c.$ds.mode === 'page'; }), '');

    var back = document.querySelector('input[name=wheel][value=ctrl-zoom]');
    back.checked = true;
    back.dispatchEvent(new Event('change', { bubbles: true }));
    DS.charts.resetZoom(barChart);

    A.check('demo-two-live-charts', barChart !== null && lineChart !== null, '');
    A.check('demo-empty-state-shown', emptyChart === null &&
      !!document.querySelector('.ds-chart-empty'), '');
    A.check('demo-table-rows', document.querySelectorAll('#t-detail tbody tr').length === 8,
      'got ' + document.querySelectorAll('#t-detail tbody tr').length);
    A.check('demo-gantt-drawn', !!document.querySelector('#s-gantt svg'), '');
    A.check('demo-heatmap-drawn', !!document.querySelector('#s-heat svg'), '');
    A.check('demo-tabs-present',
      document.querySelectorAll('#nav-tabs .ds-tab').length === 2, '');

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
          labels: stackedLabels,
          datasets: stackedRaw.map(function (d) { return { label: d.label, data: d.data.slice() }; })
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
    // s4 琥珀这类偏亮的颜色完全没有鉴别力（变异验证过：把 alpha 调回 0.22
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

    document.querySelector('[data-panel="p-play"]').click();
  });
})();
