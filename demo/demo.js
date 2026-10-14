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
    function scaleColors(chart, axis) {
      var s = (chart.options.scales && chart.options.scales[axis]) || {};
      return {
        grid: s.grid && s.grid.color,
        ticks: s.ticks && s.ticks.color,
        border: s.border && s.border.color
      };
    }
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
})();
