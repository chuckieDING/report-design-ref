/* demo/selftest-wb.js —— 瀑布图（wf-）/ 箱线图（bx-）的断言套件。只在 ?selftest=1 下注册。
   预言值全部由测试自己手算/从 token 解析，不读库内部的中间结果；颜色一律经"探针元素的计算色"与 token
   比对，源码里没有颜色字面量。几何断言用"拦截 canvas 绘制调用"读真实画出来的坐标，再与 scale 换算比对。
   悬浮框不走鼠标事件（Chart.js 的鼠标监听经 rAF 节流，本机 headless 里 rAF 不触发），一律用
   getElementsAtEventForMode + setActiveElements + tooltip.setActiveElements 驱动。 */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('selftest') !== '1') return;
  window.DS_SELFTEST_SUITES = window.DS_SELFTEST_SUITES || [];

  function $(sel) { return document.querySelector(sel); }
  function showPanel(id) { $('[data-panel="' + id + '"]').click(); }
  function cur(id) { return document.getElementById(id)._dsChart; }
  function resolved(prop, value) {
    var p = document.createElement('div');
    p.style.cssText = 'position:absolute;left:-9999px;top:0;' + prop + ':' + value;
    document.body.appendChild(p);
    var out = getComputedStyle(p).getPropertyValue(prop);
    p.remove();
    return out;
  }
  function tokRgb(name) { return resolved('color', 'var(' + name + ')'); }
  function rgbOf(c) { return resolved('color', c); }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1 : tol); }
  function keyEsc() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
  function btn(id, n) { return document.getElementById('seg-' + id).querySelector('[data-value="' + n + '"]'); }

  // 读解析后颜色/像素前先清悬停态（悬停会让柱子换成"悬停色"）
  function clearHover(chart) {
    chart.setActiveElements([]);
    if (chart.tooltip) chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update('none');
  }

  // 拦截 canvas 绘制：返回 chart.draw() 期间画出的单段描边线（moveTo+lineTo+stroke）与圆弧。
  function recordDraw(chart) {
    var ctx = chart.ctx, orig = {};
    ['beginPath', 'moveTo', 'lineTo', 'stroke', 'arc'].forEach(function (k) { orig[k] = ctx[k]; });
    var curPts = [], segs = [], arcs = [];
    ctx.beginPath = function () { curPts = []; return orig.beginPath.apply(ctx, arguments); };
    ctx.moveTo = function (x, y) { curPts = [[x, y]]; return orig.moveTo.apply(ctx, arguments); };
    ctx.lineTo = function (x, y) { curPts.push([x, y]); return orig.lineTo.apply(ctx, arguments); };
    ctx.stroke = function () {
      if (curPts.length === 2) {
        segs.push({ x1: curPts[0][0], y1: curPts[0][1], x2: curPts[1][0], y2: curPts[1][1],
          style: ctx.strokeStyle, width: ctx.lineWidth });
      }
      return orig.stroke.apply(ctx, arguments);
    };
    ctx.arc = function (x, y, r) { arcs.push({ x: x, y: y, r: r, fill: ctx.fillStyle }); return orig.arc.apply(ctx, arguments); };
    try { chart.draw(); } finally {
      ['beginPath', 'moveTo', 'lineTo', 'stroke', 'arc'].forEach(function (k) { delete ctx[k]; });
    }
    return { segs: segs, arcs: arcs };
  }

  // 驱动悬浮框：把指针放在 (x, y)，走图表自己的交互模式取元素，再设为激活并刷新
  function hoverAt(chart, x, y) {
    var mode = chart.options.interaction.mode;
    var pos = { x: x, y: y, native: true };
    var els = chart.getElementsAtEventForMode(pos, mode, { intersect: false }, false);
    chart.setActiveElements(els);
    chart.tooltip.setActiveElements(els, { x: x, y: y });
    chart.update('none');
    var tt = chart.tooltip;
    return {
      n: els.length, title: (tt.title || []).join('|'),
      lines: [].concat.apply([], (tt.body || []).map(function (b) { return b.lines; }))
    };
  }

  var made = [];
  function mk(w, h) {
    var host = document.createElement('div');
    host.className = 'ds-chart-host';
    host.style.cssText = 'width:' + (w || 640) + 'px;height:' + (h || 340) + 'px';
    var cv = document.createElement('canvas');
    host.appendChild(cv);
    document.body.appendChild(host);
    made.push(host);
    return cv;
  }
  function cleanup() {
    made.forEach(function (host) {
      var cv = host.querySelector('canvas');
      if (cv && cv._dsChart) DS.charts.destroy(cv._dsChart);
      host.remove();
    });
    made = [];
  }

  /* ================= 瀑布图 ================= */
  window.DS_SELFTEST_SUITES.push(function waterfall(A) {
    var N = 'wf-';
    DS.theme.set('light');
    showPanel('p-comp');
    var errs = [];
    var origErr = console.error, origWarn = console.warn, origLog = console.log;
    console.error = function () { errs.push('error: ' + Array.prototype.join.call(arguments, ' ')); };
    console.warn = function () { errs.push('warn: ' + Array.prototype.join.call(arguments, ' ')); };
    console.log = function () { errs.push('log: ' + Array.prototype.join.call(arguments, ' ')); };
    function onWinErr(ev) { errs.push('window error: ' + ev.message); }
    window.addEventListener('error', onWinErr);
    // 前面的套件故意留下了"毒化"图表/SVG（验证 retheme 逐图隔离），每次主题切换它们都会打一条
    // 带 'ds-test:' 的预期 warn；那是测试夹具的输出，不是被测组件的，统计时剔除。
    function ownErrs() { return errs.filter(function (m) { return m.indexOf('ds-test:') === -1; }); }

    // ---- 1. 累计与 [start, end]：固定数据，手算期望值写死 ----
    var fixed = [
      { label: 'A', value: 100, type: 'total' },   // 基线 100：[0,100]
      { label: 'B', value: 50 },                   // +50  → 150：[100,150]
      { label: 'C', value: -30 },                  // −30  → 120：[150,120]
      { label: 'D', type: 'total' },               // 小计取当前累计 120：[0,120]
      { label: 'E', value: 0 },                    // 0 算增加：[120,120]
      { label: 'F', value: -200 },                 // −200 → −80：[120,−80]
      { label: 'bad', value: 'abc' },              // 非有限数：忽略，不占柱位
      { label: 'G', type: 'total' },               // [0,−80]
      { label: 'H', value: 500, type: 'total' },   // 给了 value 的合计 = 新基线：[0,500]
      { label: 'I', value: 1 }                     // [500,501]
    ];
    var wd = DS.charts.waterfallData(fixed);
    A.check(N + 'data-ranges-equal-hand-computed-start-end',
      JSON.stringify(wd.ranges) === '[[0,100],[100,150],[150,120],[0,120],[120,120],[120,-80],[0,-80],[0,500],[500,501]]', JSON.stringify(wd.ranges));
    A.check(N + 'data-cumulative-equal-hand-computed',
      JSON.stringify(wd.cum) === '[100,150,120,120,120,-80,-80,500,501]', JSON.stringify(wd.cum));
    A.check(N + 'data-kinds-up-down-total-and-zero-counts-as-up-and-bad-value-dropped',
      wd.kinds.join() === 'total,up,down,total,up,down,total,total,up' && wd.labels.join('') === 'ABCDEFGHI' && wd.deltas[3] === null && wd.deltas[2] === -30,
      wd.kinds.join());

    // ---- 2. demo 图：默认 6 个增减项，范围与手算一致 ----
    var wf = cur('c-waterfall');
    wf.resize();
    A.check(N + 'demo-default-ranges-equal-hand-computed',
      JSON.stringify(wf.data.datasets[0].data) === '[[0,1200],[1200,1520],[1520,1370],[1370,1280],[0,1280],[1280,1340],[1340,1380],[1380,1310],[0,1310]]',
      JSON.stringify(wf.data.datasets[0].data));
    A.check(N + 'demo-has-both-increases-and-decreases-and-a-middle-subtotal',
      wf.data.datasets[0].dsWaterfall.kinds.indexOf('up') >= 0 && wf.data.datasets[0].dsWaterfall.kinds.indexOf('down') >= 0 &&
        wf.data.labels[4] === '小计' && wf.data.datasets[0].dsWaterfall.kinds[4] === 'total' &&
        wf.data.labels[0] === '上月工作量' && wf.data.labels[wf.data.labels.length - 1] === '本月工作量', wf.data.labels.join());
    // 实际画出来的柱子：像素高度由 scale 换算独立核对（柱的上下沿 = 两个端点值的像素）
    clearHover(wf);
    var meta = wf.getDatasetMeta(0), ys = wf.scales.y;
    var geomOk = meta.data.every(function (el, i) {
      var r = wf.data.datasets[0].data[i], p = el.getProps(['y', 'base'], true);
      var top = Math.min(ys.getPixelForValue(r[0]), ys.getPixelForValue(r[1])), bot = Math.max(ys.getPixelForValue(r[0]), ys.getPixelForValue(r[1]));
      return near(Math.min(p.y, p.base), top) && near(Math.max(p.y, p.base), bot);
    });
    A.check(N + 'demo-bar-pixel-extents-match-scale-of-start-end', meta.data.length === 9 && geomOk, '');

    // ---- 3. 三类颜色：数据集颜色与真实画布像素 ----
    var TOK = { up: '--color-success', down: '--color-danger', total: '--color-primary' };
    function colorsReport(chart) {
      clearHover(chart);
      var wfm = chart.data.datasets[0].dsWaterfall, bg = chart.data.datasets[0].backgroundColor, bd = chart.data.datasets[0].borderColor;
      var dpr = chart.currentDevicePixelRatio || 1, m = chart.getDatasetMeta(0), bad = [];
      m.data.forEach(function (el, i) {
        var want = tokRgb(TOK[wfm.kinds[i]]);
        if (rgbOf(bg[i]) !== want || rgbOf(bd[i]) !== want) bad.push(i + ':cfg');
        var p = el.getProps(['x', 'y', 'base'], true);
        var py = (p.y + p.base) / 2;
        var d = chart.ctx.getImageData(Math.round(p.x * dpr), Math.round(py * dpr), 1, 1).data;
        if ('rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')' !== want) bad.push(i + ':px=' + d[0] + ',' + d[1] + ',' + d[2]);
      });
      return bad;
    }
    var badL = colorsReport(wf);
    A.check(N + 'colors-increase-success-decrease-danger-total-primary-in-config-and-canvas-pixels', badL.length === 0, badL.join(' '));
    A.check(N + 'the-three-kinds-use-three-different-colors', (function () {
      var s = {}; ['--color-success', '--color-danger', '--color-primary'].forEach(function (t) { s[tokRgb(t)] = 1; });
      return Object.keys(s).length === 3;
    })(), '');

    // ---- 4. 连接线：端点与相邻柱终点/起点对齐（拦截 stroke 读坐标） ----
    function connectorReport(chart, horiz) {
      clearHover(chart);
      var rec = recordDraw(chart);
      var ds = chart.data.datasets[0], rg = ds.data, wfm = ds.dsWaterfall, m = chart.getDatasetMeta(0);
      var vs = horiz ? chart.scales.x : chart.scales.y, cs = horiz ? chart.scales.y : chart.scales.x;
      var color = tokRgb('--chart-axis'), found = 0, bad = [], width1 = true, colorOk = true;
      for (var i = 0; i < rg.length - 1; i++) {
        var thick = horiz ? m.data[i].height : m.data[i].width, thick2 = horiz ? m.data[i + 1].height : m.data[i + 1].width;
        var c1 = cs.getPixelForValue(i), c2 = cs.getPixelForValue(i + 1);
        var prevEnd = vs.getPixelForValue(rg[i][1]);
        // 下一柱"起点"：增减项取 start；合计柱取其顶（= 累计 = 前一柱终点）
        var nextStart = vs.getPixelForValue(wfm.kinds[i + 1] === 'total' ? rg[i + 1][1] : rg[i + 1][0]);
        var seg = rec.segs.filter(function (s) {
          return horiz
            ? near(s.x1, prevEnd) && near(s.x2, nextStart) && near(s.y1, c1 + thick / 2) && near(s.y2, c2 - thick2 / 2)
            : near(s.y1, prevEnd) && near(s.y2, nextStart) && near(s.x1, c1 + thick / 2) && near(s.x2, c2 - thick2 / 2);
        })[0];
        if (seg) {
          found++;
          if (seg.width !== 1) width1 = false;
          if (rgbOf(seg.style) !== color) colorOk = false;
        } else bad.push(i);
      }
      return { found: found, expected: rg.length - 1, bad: bad, width1: width1, colorOk: colorOk };
    }
    var cr = connectorReport(wf, false);
    A.check(N + 'connectors-endpoints-align-with-previous-end-and-next-start-within-1px', cr.found === cr.expected && cr.expected === 8, JSON.stringify(cr));
    A.check(N + 'connectors-are-thin-and-use-the-axis-token-color', cr.width1 && cr.colorOk, JSON.stringify(cr));
    // 横向
    var cvH = mk();
    var wfH = DS.charts.waterfall(cvH, DS_MOCK.waterfallItems(6), { indexAxis: 'y' });
    wfH.resize();
    var crH = connectorReport(wfH, true);
    A.check(N + 'horizontal-connectors-align-and-run-vertically', crH.found === crH.expected && crH.expected === 8 && wfH.options.indexAxis === 'y', JSON.stringify(crH));
    // 关闭
    var cvOff = mk();
    var wfOff = DS.charts.waterfall(cvOff, DS_MOCK.waterfallItems(6), { connector: false });
    wfOff.resize();
    var crOff = connectorReport(wfOff, false);
    A.check(N + 'connector-false-draws-no-connectors', crOff.found === 0, JSON.stringify(crOff));

    // ---- 5. 悬浮框文案与数字格式 ----
    function tipOf(chart, i) {
      var el = chart.getDatasetMeta(0).data[i], p = el.getProps(['x', 'y', 'base'], true);
      var cs = chart.options.indexAxis === 'y';
      return hoverAt(chart, p.x, (p.y + p.base) / 2 + (cs ? 0 : 0));
    }
    var t1 = tipOf(wf, 1), t2 = tipOf(wf, 2), t0 = tipOf(wf, 0), t4 = tipOf(wf, 4);
    A.check(N + 'tooltip-increase-shows-item-plus-and-cumulative-with-thousands',
      t1.title === '新增项目' && t1.lines.join('|') === '本项 +320|累计 1,520' && t1.n === 1, t1.title + ' ' + t1.lines.join('|'));
    A.check(N + 'tooltip-decrease-uses-true-minus-sign', t2.lines.join('|') === '本项 −150|累计 1,370', t2.lines.join('|'));
    A.check(N + 'tooltip-total-shows-only-total-with-thousands', t0.lines.join('|') === '合计 1,200' && t4.title === '小计' && t4.lines.join('|') === '合计 1,280',
      t0.lines.join('|') + ' / ' + t4.lines.join('|'));
    // 大数/负累计的格式
    var cvBig = mk();
    var wfBig = DS.charts.waterfall(cvBig, [
      { label: '起', value: 1200000, type: 'total' }, { label: '降', value: -2500000 }, { label: '升', value: 1234567 }, { label: '终', type: 'total' }
    ]);
    wfBig.resize();
    var b1 = tipOf(wfBig, 1), b2 = tipOf(wfBig, 2), b3 = tipOf(wfBig, 3);
    A.check(N + 'tooltip-large-and-negative-numbers-format-with-thousands',
      b1.lines.join('|') === '本项 −2,500,000|累计 −1,300,000' && b2.lines.join('|') === '本项 +1,234,567|累计 −65,433' && b3.lines.join('|') === '合计 −65,433',
      b1.lines.join('|') + ' / ' + b2.lines.join('|') + ' / ' + b3.lines.join('|'));
    var tickLbl = wfBig.scales.y.ticks.map(function (t) { return t.label; });
    A.check(N + 'value-axis-ticks-use-thousands-and-true-minus', tickLbl.some(function (t) { return /,/.test(t); }) && tickLbl.some(function (t) { return t.charAt(0) === '−'; }) &&
      !tickLbl.some(function (t) { return t.charAt(0) === '-'; }), tickLbl.join());
    clearHover(wf); clearHover(wfBig);

    // ---- 6. 数量级切换：柱数 = 增减项数 + 3 个合计；每档正负都有、累计与独立手算一致 ----
    var levelRes = [];
    [3, 10, 20, 6].forEach(function (n) {
      btn('c-waterfall', n).click();
      var c = cur('c-waterfall'); c.resize();
      var bars = c.getDatasetMeta(0).data.length;
      var items = DS_MOCK.waterfallItems(n);
      var run = 0, rangesWant = [];
      items.forEach(function (it) {
        if (it.type === 'total') { if (it.value != null) run = it.value; rangesWant.push([0, run]); }
        else { rangesWant.push([run, run + it.value]); run += it.value; }
      });
      var kinds = c.data.datasets[0].dsWaterfall.kinds;
      levelRes.push({ n: n, bars: bars, want: n + 3, ranges: JSON.stringify(c.data.datasets[0].data) === JSON.stringify(rangesWant),
        both: kinds.indexOf('up') >= 0 && kinds.indexOf('down') >= 0, one: DS.charts.all().filter(function (x) { return x.canvas && x.canvas.id === 'c-waterfall'; }).length === 1 });
    });
    A.check(N + 'scale-switch-bar-count-is-n-plus-three-totals-at-3-10-20-and-default',
      levelRes.every(function (r) { return r.bars === r.want; }), JSON.stringify(levelRes));
    A.check(N + 'scale-switch-ranges-match-independent-cumulative-and-both-signs-present-and-single-instance',
      levelRes.every(function (r) { return r.ranges && r.both && r.one; }), JSON.stringify(levelRes));

    // ---- 7. 缩放（类目轴单向）与工具条 ----
    wf = cur('c-waterfall'); wf.resize();
    var bar = wf.canvas.parentNode.querySelector('.ds-chart-toolbar');
    A.check(N + 'toolbar-has-zoom-reset-and-fullscreen-buttons', !!bar && ['out', 'in', 'reset', 'full'].every(function (a) { return !!bar.querySelector('[data-act="' + a + '"]'); }), '');
    DS.charts.zoomRange(wf, 2, 5);
    A.check(N + 'zoom-range-narrows-the-category-axis-only-and-reset-restores',
      DS.charts.isZoomed(wf) && wf.scales.x.min === 2 && wf.scales.x.max === 5 && wf.scales.y.min === 0, wf.scales.x.min + '..' + wf.scales.x.max);
    var inZoom = connectorReport(wf, false);
    // 视野外的连接线被裁剪、不要求；视野内的三条（索引 2→3、3→4、4→5）必须画在对的位置
    A.check(N + 'connectors-inside-the-zoomed-view-still-align', inZoom.bad.every(function (i) { return i < 2 || i > 4; }) && inZoom.found >= 3, JSON.stringify(inZoom));
    DS.charts.resetZoom(wf);
    A.check(N + 'reset-zoom-restores-full-range', !DS.charts.isZoomed(wf) && wf.scales.x.min === 0 && wf.scales.x.max === 8, wf.scales.x.min + '..' + wf.scales.x.max);

    // ---- 8. 全屏往返：画布与容器尺寸精确恢复 ----
    (function () {
      var c = cur('c-waterfall'); c.resize();
      var host = c.canvas.parentNode;
      var b0 = { w: c.width, h: c.height, hw: host.clientWidth, hh: host.clientHeight, cw: host.closest('.ds-card').clientWidth };
      host.querySelector('[data-act="full"]').click();
      var inFs = host.classList.contains('ds-chart-fullscreen') && c.width > b0.w;
      var title = host.querySelector('.ds-fs-title').textContent;
      keyEsc();
      var b1 = { w: c.width, h: c.height, hw: host.clientWidth, hh: host.clientHeight, cw: host.closest('.ds-card').clientWidth };
      A.check(N + 'fullscreen-roundtrip-restores-canvas-and-container-sizes-exactly',
        b0.w > 100 && inFs && title === '瀑布图' && !host.classList.contains('ds-chart-fullscreen') && JSON.stringify(b0) === JSON.stringify(b1),
        JSON.stringify(b0) + ' -> ' + JSON.stringify(b1));
      // 全屏里连接线仍对齐
      host.querySelector('[data-act="full"]').click();
      var rfs = connectorReport(c, false);
      keyEsc();
      A.check(N + 'connectors-align-in-fullscreen', rfs.found === rfs.expected, JSON.stringify(rfs));
    })();

    // ---- 9. 主题切换：颜色跟随 token ----
    var lightTok = { s: tokRgb('--color-success'), d: tokRgb('--color-danger'), p: tokRgb('--color-primary'), a: tokRgb('--chart-axis') };
    DS.theme.set('dark');
    var darkTok = { s: tokRgb('--color-success'), d: tokRgb('--color-danger'), p: tokRgb('--color-primary'), a: tokRgb('--chart-axis') };
    var wfd = cur('c-waterfall'); wfd.resize();
    var badD = colorsReport(wfd);
    var crD = connectorReport(wfd, false);
    A.check(N + 'dark-theme-bar-colors-follow-the-dark-tokens-which-differ-from-light',
      badD.length === 0 && darkTok.s !== lightTok.s && darkTok.d !== lightTok.d && darkTok.p !== lightTok.p, badD.join(' ') + JSON.stringify([lightTok, darkTok]));
    A.check(N + 'dark-theme-connectors-use-the-dark-axis-token', crD.found === crD.expected && crD.colorOk && darkTok.a !== lightTok.a, JSON.stringify(crD));
    DS.theme.set('light');
    var badL2 = colorsReport(cur('c-waterfall'));
    A.check(N + 'back-to-light-theme-colors-restored', badL2.length === 0, badL2.join(' '));

    // ---- 10. 空数据 / 注册 ----
    var cvEmpty = mk();
    var wfE = DS.charts.waterfall(cvEmpty, []);
    A.check(N + 'empty-items-render-the-empty-state-and-return-null', wfE === null && !!cvEmpty.parentNode.querySelector('.ds-chart-empty'), '');
    cleanup();

    A.check(N + 'no-console-output-or-errors-while-creating-switching-zooming-fullscreen-and-theming', ownErrs().length === 0, ownErrs().slice(0, 3).join(' | '));
    console.error = origErr; console.warn = origWarn; console.log = origLog;
    window.removeEventListener('error', onWinErr);
    showPanel('p-play');
  });

  /* ================= 箱线图 ================= */
  window.DS_SELFTEST_SUITES.push(function boxplot(A) {
    var N = 'bx-';
    DS.theme.set('light');
    showPanel('p-comp');
    var errs = [];
    var origErr = console.error, origWarn = console.warn, origLog = console.log;
    console.error = function () { errs.push('error: ' + Array.prototype.join.call(arguments, ' ')); };
    console.warn = function () { errs.push('warn: ' + Array.prototype.join.call(arguments, ' ')); };
    console.log = function () { errs.push('log: ' + Array.prototype.join.call(arguments, ' ')); };
    function onWinErr(ev) { errs.push('window error: ' + ev.message); }
    window.addEventListener('error', onWinErr);
    function ownErrs() { return errs.filter(function (m) { return m.indexOf('ds-test:') === -1; }); }
    function J(x) { return JSON.stringify(x); }
    function sTok(i) { return tokRgb('--chart-s' + ((i % 10) + 1)); }

    // ---- 1. 统计量：固定数据，期望值由 Python statistics.quantiles(method='inclusive')（= 线性插值/type 7）算出后写死 ----
    // 每条：[输入, {n,min,q1,median,q3,max,outliers}]
    var CASES = {
      A: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30], { n: 11, min: 1, q1: 3.5, median: 6, q3: 8.5, max: 10, outliers: [30] }],
      B: [[-2000, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 9000],
        { n: 14, min: 1000, q1: 1225, median: 1550, q3: 1875, max: 2100, outliers: [-2000, 9000] }],
      C: [[7], { n: 1, min: 7, q1: 7, median: 7, q3: 7, max: 7, outliers: [] }],
      D: [[0, 10, 10, 10, 10, 20], { n: 6, min: 10, q1: 10, median: 10, q3: 10, max: 10, outliers: [0, 20] }],   // IQR=0：围栏塌成一点
      E1: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16], { n: 11, min: 1, q1: 3.5, median: 6, q3: 8.5, max: 16, outliers: [] }],   // 恰在围栏 Q3+1.5·IQR=16 上：算须线内
      E2: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16.5], { n: 11, min: 1, q1: 3.5, median: 6, q3: 8.5, max: 10, outliers: [16.5] }]
    };
    Object.keys(CASES).forEach(function (k) {
      var got = DS.charts.boxStats(CASES[k][0]);
      A.check(N + 'stats-case-' + k + '-equals-reference', J(got) === J(CASES[k][1]), J(got) + ' vs ' + J(CASES[k][1]));
    });
    var shuffled = [30, 5, 1, 9, 3, 10, 7, 2, 8, 6, 4];
    A.check(N + 'stats-input-order-does-not-matter-and-input-not-mutated', J(DS.charts.boxStats(shuffled)) === J(CASES.A[1]) && shuffled[0] === 30, J(shuffled));
    A.check(N + 'stats-non-finite-values-ignored-and-empty-is-null',
      J(DS.charts.boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, NaN, null, 'x', 30])) === J(CASES.A[1]) && DS.charts.boxStats([]) === null && DS.charts.boxStats([NaN]) === null, '');
    var bd = DS.charts.boxplotData([{ label: 'p', values: CASES.A[0] }, { label: 'empty', values: [] }, { label: 'pre', stats: { min: 1, q1: 2, median: 3, q3: 4, max: 5, n: 9 } },
      { label: 'badpre', stats: { min: 1 } }]);
    A.check(N + 'data-empty-groups-dropped-and-precomputed-stats-accepted',
      bd.labels.join() === 'p,pre' && J(bd.stats[1]) === J({ n: 9, min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: [] }), J(bd));

    // ---- 2. demo：特征（集中/偏慢/方差大/离群点）与独立复算的统计量 ----
    function refQ(xs, p) { var x = xs.slice().sort(function (a, b) { return a - b; }), h = (x.length - 1) * p, lo = Math.floor(h); return x[lo] + (x[Math.min(lo + 1, x.length - 1)] - x[lo]) * (h - lo); }
    function refStats(vals) {
      var q1 = refQ(vals, 0.25), q3 = refQ(vals, 0.75), iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
      var ins = vals.filter(function (v) { return v >= lo && v <= hi; });
      return { n: vals.length, min: Math.min.apply(null, ins), q1: q1, median: refQ(vals, 0.5), q3: q3, max: Math.max.apply(null, ins),
        outliers: vals.filter(function (v) { return v < lo || v > hi; }).sort(function (a, b) { return a - b; }) };
    }
    var bx = cur('c-boxplot'); bx.resize();
    var groups4 = DS_MOCK.boxGroups(4), want4 = groups4.map(function (g) { return refStats(g.values); });
    function statsOfChart(chart) { return chart.data.datasets[0].dsBox.stats; }
    A.check(N + 'demo-default-is-four-instruments-with-30-to-80-samples-each',
      bx.data.labels.length === 4 && groups4.every(function (g) { return g.values.length >= 30 && g.values.length <= 80; }) && bx.data.labels.join() === groups4.map(function (g) { return g.label; }).join(), bx.data.labels.join());
    A.check(N + 'demo-stats-equal-independent-reimplementation-on-the-raw-samples',
      want4.every(function (w, i) { var g = statsOfChart(bx)[i]; return J(g) === J(w) || (g.n === w.n && Math.abs(g.q1 - w.q1) < 1e-9 && Math.abs(g.median - w.median) < 1e-9 && Math.abs(g.q3 - w.q3) < 1e-9 && g.min === w.min && g.max === w.max && J(g.outliers) === J(w.outliers)); }),
      J(statsOfChart(bx)) + ' vs ' + J(want4));
    A.check(N + 'demo-box-bars-are-floating-q1-q3',
      bx.data.datasets[0].data.every(function (d, i) { return d[0] === statsOfChart(bx)[i].q1 && d[1] === statsOfChart(bx)[i].q3; }), '');
    var iqr = function (w) { return w.q3 - w.q1; };
    A.check(N + 'demo-distributions-differ-concentrated-slow-wide-and-outliers',
      iqr(want4[0]) < 8 && want4[1].median > want4[0].median + 20 && iqr(want4[2]) > 2 * iqr(want4[0]) && iqr(want4[2]) > 20 &&
        want4[3].outliers.length >= 3 && want4[0].outliers.length === 0 && want4[1].outliers.length === 0, J(want4.map(function (w) { return [iqr(w), w.median, w.outliers.length]; })));

    // ---- 3. 绘制几何：拦截 stroke / arc 读坐标，与 scale 换算比对 ----
    function boxReport(chart, horiz, want, visible) {
      clearHover(chart);
      var rec = recordDraw(chart);
      var m = chart.getDatasetMeta(0);
      var vs = horiz ? chart.scales.x : chart.scales.y, cs = horiz ? chart.scales.y : chart.scales.x;
      var textRgb = tokRgb('--color-text');
      var r = { median: 0, whisker: 0, cap: 0, colorsOk: true, medianPx: [], missing: [], arcsOk: 0, arcsWant: 0, arcColorOk: true, extraArcs: 0 };
      function P(v) { return vs.getPixelForValue(v); }
      function find(a, b, c, d, i, col, isCap, c0, half) {
        // 线段 (沿类目方向位置 c0±…, 数值 a→b)：a,b 为数值像素；类目方向 [c1,c2]
        return rec.segs.filter(function (s) {
          var v1 = horiz ? s.x1 : s.y1, v2 = horiz ? s.x2 : s.y2, k1 = horiz ? s.y1 : s.x1, k2 = horiz ? s.y2 : s.x2;
          return near(v1, a) && near(v2, b) && near(k1, c) && near(k2, d);
        })[0];
      }
      want.forEach(function (w, i) {
        if (visible && !visible(i)) return;
        var c = cs.getPixelForValue(i), half = (horiz ? m.data[i].height : m.data[i].width) / 2;
        var col = sTok(i);
        var med = find(P(w.median), P(w.median), c - half, c + half);
        var up = find(P(w.q3), P(w.max), c, c), dn = find(P(w.q1), P(w.min), c, c);
        // 端帽：数值固定在须线端点，类目方向关于 c 对称，半宽在 (0.2, 1.0]×箱半宽内
        var capOf = function (v) {
          return rec.segs.filter(function (s) {
            var vv1 = horiz ? s.x1 : s.y1, vv2 = horiz ? s.x2 : s.y2, k1 = horiz ? s.y1 : s.x1, k2 = horiz ? s.y2 : s.x2;
            return near(vv1, P(v)) && near(vv2, P(v)) && near(k1 + k2, 2 * c) && (k2 - k1) / 2 >= 0.2 * half && (k2 - k1) / 2 <= half + 0.5;
          })[0];
        };
        var cu = capOf(w.max), cd = capOf(w.min);
        if (med) { r.median++; if (rgbOf(med.style) !== textRgb || med.width < 2) r.colorsOk = false; r.medianPx.push(med); } else r.missing.push(i + ':median');
        [up, dn].forEach(function (sg, k) {
          if (sg) { r.whisker++; if (rgbOf(sg.style) !== col) r.colorsOk = false; } else r.missing.push(i + ':whisker' + k);
        });
        [cu, cd].forEach(function (sg, k) {
          if (sg) { r.cap++; if (rgbOf(sg.style) !== col) r.colorsOk = false; } else r.missing.push(i + ':cap' + k);
        });
        // 离群点
        w.outliers.forEach(function (v) {
          r.arcsWant++;
          var ex = horiz ? P(v) : c, ey = horiz ? c : P(v);
          var a = rec.arcs.filter(function (q) { return near(q.x, ex) && near(q.y, ey) && near(q.r, 3, 0.6); })[0];
          if (a) { r.arcsOk++; if (rgbOf(a.fill) !== col) r.arcColorOk = false; } else r.missing.push(i + ':outlier' + v);
        });
      });
      if (!visible) r.extraArcs = rec.arcs.length - r.arcsWant;
      return r;
    }
    var rep = boxReport(bx, false, want4);
    A.check(N + 'draw-median-lines-at-the-scale-pixel-of-the-median-for-every-box', rep.median === 4 && rep.missing.filter(function (x) { return /median/.test(x); }).length === 0, J(rep));
    A.check(N + 'draw-whiskers-and-caps-end-at-the-farthest-in-fence-data-points', rep.whisker === 8 && rep.cap === 8, J(rep));
    A.check(N + 'draw-outlier-dots-at-scale-pixels-and-nothing-extra', rep.arcsWant >= 4 && rep.arcsOk === rep.arcsWant && rep.extraArcs === 0, J(rep));
    A.check(N + 'draw-colors-median-is-text-token-whiskers-caps-dots-are-category-tokens', rep.colorsOk && rep.arcColorOk, J(rep));
    // 箱体矩形像素（柱的上下沿 = Q3/Q1 的像素），以及箱体半透明、描边不透明、按类目取色
    clearHover(bx);
    var bm = bx.getDatasetMeta(0), bys = bx.scales.y;
    A.check(N + 'box-pixel-extents-equal-scale-of-q1-q3', bm.data.length === 4 && bm.data.every(function (el, i) {
      var p = el.getProps(['y', 'base'], true);
      return near(Math.min(p.y, p.base), bys.getPixelForValue(want4[i].q3)) && near(Math.max(p.y, p.base), bys.getPixelForValue(want4[i].q1));
    }), '');
    function alphaOf(c) { var m2 = /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/.exec(c); return m2 ? +m2[1] : null; }
    var bgs = bx.data.datasets[0].backgroundColor, bds = bx.data.datasets[0].borderColor;
    A.check(N + 'box-fill-is-semi-transparent-and-border-opaque-both-in-the-category-token-color',
      bgs.every(function (c, i) { var a = alphaOf(c); return a !== null && a > 0.2 && a < 0.6; }) &&
        bds.every(function (c, i) { return rgbOf(c) === sTok(i); }) &&
        bgs.every(function (c, i) { var t = rgbOf(bds[i]).match(/\d+/g), u = rgbOf(c).match(/\d+/g); return t.join() === u.slice(0, 3).join(); }), J(bgs) + J(bds));
    A.check(N + 'box-colors-cycle-through-the-ten-series-tokens-by-category', (function () {
      var cv = mk(); var c12 = DS.charts.boxplot(cv, DS_MOCK.boxGroups(12)); c12.resize();
      var b = c12.data.datasets[0].borderColor;
      return b.length === 12 && b.every(function (c, i) { return rgbOf(c) === sTok(i); }) && sTok(10) === sTok(0) && sTok(0) !== sTok(1);
    })(), '');
    // 画布像素：离群点中心 = 类目色；中位线中心 = 文本色
    clearHover(bx);
    var dpr = bx.currentDevicePixelRatio || 1;
    function px(x, y) { var d = bx.ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data; return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')'; }
    var ptEl = bx.getDatasetMeta(1).data[0], pp = ptEl.getProps(['x', 'y'], true);
    var gOf0 = bx.data.datasets[1].data[0].g;
    A.check(N + 'canvas-pixel-at-an-outlier-center-is-its-category-color', px(pp.x, pp.y) === sTok(gOf0), px(pp.x, pp.y) + ' vs ' + sTok(gOf0));
    var mp = rep.medianPx[0];
    A.check(N + 'canvas-pixel-on-the-median-line-is-the-text-token-color', px(bx.scales.x.getPixelForValue(0) + 8, mp.y1) === tokRgb('--color-text'), px(bx.scales.x.getPixelForValue(0) + 8, mp.y1));

    // ---- 4. 悬浮框：固定数据 A/B 的各统计量与数字格式 ----
    var cvT = mk();
    // 甲 与 丙 同图（量程小，类目内各点像素间距够大）；乙（大数、两个离群点）单独一张图，免得量程把甲的 6 与 30 压到同一像素
    var bt = DS.charts.boxplot(cvT, [{ label: '甲', values: CASES.A[0] }, { label: '丙', values: CASES.C[0] }]);
    bt.resize();
    var vsT = bt.scales.y, csT = bt.scales.x;
    function overBox(i, v) { return hoverAt(bt, csT.getPixelForValue(i), vsT.getPixelForValue(v)); }
    var tA = overBox(0, 6);
    A.check(N + 'tooltip-lists-max-q3-median-q1-min-n-and-outlier-count-for-a-box',
      tA.n === 1 && tA.title === '甲' && J(tA.lines) === J(['最大值（须线上端） 10', 'Q3 8.5', '中位数 6', 'Q1 3.5', '最小值（须线下端） 1', '样本数 11', '离群点个数 1']), tA.title + ' ' + J(tA.lines));
    var cvB = mk();
    var bb = DS.charts.boxplot(cvB, [{ label: '乙', values: CASES.B[0] }]);
    bb.resize();
    function overB(v) { return hoverAt(bb, bb.scales.x.getPixelForValue(0), bb.scales.y.getPixelForValue(v)); }
    var tB = overB(1550);
    A.check(N + 'tooltip-numbers-use-thousands-separators-and-true-minus',
      J(tB.lines) === J(['最大值（须线上端） 2,100', 'Q3 1,875', '中位数 1,550', 'Q1 1,225', '最小值（须线下端） 1,000', '样本数 14', '离群点个数 2']), J(tB.lines));
    var tC = overBox(1, 7);
    A.check(N + 'tooltip-single-sample-group-shows-all-stats-equal-and-zero-outliers',
      J(tC.lines) === J(['最大值（须线上端） 7', 'Q3 7', '中位数 7', 'Q1 7', '最小值（须线下端） 7', '样本数 1', '离群点个数 0']), J(tC.lines));
    var tW = overBox(0, 10);   // 指针压在须线端点上（箱体矩形之外）仍命中该类目
    A.check(N + 'tooltip-also-shows-when-the-pointer-is-on-the-whisker-outside-the-box', tW.n === 1 && tW.title === '甲' && tW.lines[0] === '最大值（须线上端） 10', J(tW));
    var oB = overB(-2000);
    var oA = overBox(0, 30);
    A.check(N + 'tooltip-on-an-outlier-shows-that-points-value-only', oA.n === 1 && oA.title === '甲' && J(oA.lines) === J(['离群点 30']) &&
      oB.n === 1 && oB.title === '乙' && J(oB.lines) === J(['离群点 −2,000']), J(oA) + J(oB));
    var oB2 = overB(9000);
    A.check(N + 'tooltip-on-the-other-outlier-of-the-same-box-shows-its-own-value', oB2.n === 1 && J(oB2.lines) === J(['离群点 9,000']), J(oB2));
    var nearMiss = hoverAt(bt, csT.getPixelForValue(0), vsT.getPixelForValue(30) + 20);   // 离群点下方 20px：不是离群点，回落到该类目的箱体
    A.check(N + 'pointer-20px-off-an-outlier-falls-back-to-the-box-tooltip', nearMiss.n === 1 && nearMiss.lines.length === 7, J(nearMiss));
    var outside = hoverAt(bt, bt.chartArea.left - 5, vsT.getPixelForValue(6));
    A.check(N + 'pointer-outside-the-plot-area-shows-no-tooltip', outside.n === 0, J(outside));
    clearHover(bt);
    // 横向：同样的命中与文案
    var cvHb = mk();
    var bh = DS.charts.boxplot(cvHb, [{ label: '甲', values: CASES.A[0] }, { label: '丙', values: CASES.C[0] }], { indexAxis: 'y' });
    bh.resize();
    var hb1 = hoverAt(bh, bh.scales.x.getPixelForValue(6), bh.scales.y.getPixelForValue(0));
    var hb2 = hoverAt(bh, bh.scales.x.getPixelForValue(30), bh.scales.y.getPixelForValue(0));
    A.check(N + 'horizontal-tooltips-box-and-outlier', hb1.title === '甲' && hb1.lines.length === 7 && hb1.lines[0] === '最大值（须线上端） 10' && J(hb2.lines) === J(['离群点 30']) && hb2.title === '甲', J(hb1) + J(hb2));
    var repH = boxReport(bh, true, [CASES.A[1], CASES.C[1]]);
    A.check(N + 'horizontal-draw-median-whiskers-caps-and-outliers-at-scale-pixels',
      repH.median === 2 && repH.whisker === 4 && repH.cap === 4 && repH.arcsOk === 1 && repH.arcsWant === 1 && repH.extraArcs === 0 && repH.colorsOk && repH.arcColorOk && bh.options.indexAxis === 'y', J(repH));
    clearHover(bh);

    // ---- 5. 量程：须线两端与离群点都在绘图区内 ----
    A.check(N + 'value-axis-range-contains-every-whisker-end-and-outlier', bb.scales.y.min <= -2000 && bb.scales.y.max >= 9000 && bt.scales.y.min <= 1 && bt.scales.y.max >= 30,
      bb.scales.y.min + '..' + bb.scales.y.max);
    // 须线比箱体长、又没有离群点的紧凑数据：量程仍要容下须线两端（Q1..Q3 之外的部分不是 bar 的数据），且不被硬拉到 0
    var tight = []; for (var ti = 0; ti < 30; ti++) tight.push(100 + (ti * 7 % 11));   // 100..110，Q1=102.25 Q3=107.75，须线 100..110
    var cvTight = mk();
    var btight = DS.charts.boxplot(cvTight, [{ label: '紧', values: tight }]);
    btight.resize();
    var ts = btight.data.datasets[0].dsBox.stats[0], tys = btight.scales.y, tar = btight.chartArea;
    A.check(N + 'value-axis-contains-whisker-ends-of-a-tight-group-without-being-forced-to-zero',
      ts.min === 100 && ts.max === 110 && tys.min <= 100 && tys.max >= 110 && tys.min > 50 &&
        tys.getPixelForValue(100) <= tar.bottom + 0.5 && tys.getPixelForValue(110) >= tar.top - 0.5, tys.min + '..' + tys.max);

    // ---- 6. 数量级切换：箱子数 = 类目数 ----
    var lv = [];
    [3, 10, 20, 4].forEach(function (n) {
      btn('c-boxplot', n).click();
      var c = cur('c-boxplot'); c.resize();
      var gs = DS_MOCK.boxGroups(n);
      var wantN = gs.map(function (g) { return refStats(g.values); });
      var r2 = boxReport(c, false, wantN);
      lv.push({ n: n, boxes: c.getDatasetMeta(0).data.length, labels: c.data.labels.length, medians: r2.median, dots: r2.arcsOk + '/' + r2.arcsWant, missing: r2.missing.length,
        one: DS.charts.all().filter(function (x) { return x.canvas && x.canvas.id === 'c-boxplot'; }).length });
    });
    A.check(N + 'scale-switch-box-count-equals-category-count-at-3-10-20-and-default',
      lv.every(function (x) { return x.boxes === x.n && x.labels === x.n && x.one === 1; }), J(lv));
    A.check(N + 'scale-switch-every-box-gets-its-median-whiskers-and-outliers-drawn',
      lv.every(function (x) { return x.medians === x.n && x.missing === 0; }), J(lv));
    A.check(N + 'scale-switch-prefix-stable-first-groups-identical-at-every-scale', J(DS_MOCK.boxGroups(20).slice(0, 4)) === J(DS_MOCK.boxGroups(4)) &&
      J(DS_MOCK.boxGroups(10).slice(0, 3)) === J(DS_MOCK.boxGroups(3)) && DS_MOCK.boxGroups(20).every(function (g) { return g.values.length >= 30 && g.values.length <= 85; }) &&
      new Set(DS_MOCK.boxGroups(20).map(function (g) { return g.label; })).size === 20, '');

    // ---- 7. 缩放（类目轴单向）、工具条 ----
    bx = cur('c-boxplot'); bx.resize();
    var bar = bx.canvas.parentNode.querySelector('.ds-chart-toolbar');
    A.check(N + 'toolbar-has-zoom-reset-and-fullscreen-buttons', !!bar && ['out', 'in', 'reset', 'full'].every(function (a) { return !!bar.querySelector('[data-act="' + a + '"]'); }), '');
    DS.charts.zoomRange(bx, 1, 2);
    var repZ = boxReport(bx, false, want4, function (i) { return i >= 1 && i <= 2; });
    A.check(N + 'zoom-range-narrows-the-category-axis-only-and-visible-boxes-still-draw-at-the-right-pixels',
      DS.charts.isZoomed(bx) && bx.scales.x.min === 1 && bx.scales.x.max === 2 && repZ.median === 2 && repZ.whisker === 4 && repZ.cap === 4 && repZ.missing.length === 0, J(repZ));
    DS.charts.resetZoom(bx);
    A.check(N + 'reset-zoom-restores-the-full-category-range', !DS.charts.isZoomed(bx) && bx.scales.x.min === 0 && bx.scales.x.max === 3, bx.scales.x.min + '..' + bx.scales.x.max);

    // ---- 8. 全屏往返 ----
    (function () {
      var c = cur('c-boxplot'); c.resize();
      var host = c.canvas.parentNode;
      var b0 = { w: c.width, h: c.height, hw: host.clientWidth, hh: host.clientHeight, cw: host.closest('.ds-card').clientWidth };
      host.querySelector('[data-act="full"]').click();
      var inFs = host.classList.contains('ds-chart-fullscreen') && c.width > b0.w;
      var title = host.querySelector('.ds-fs-title').textContent;
      var rfs = boxReport(c, false, want4);
      keyEsc();
      var b1 = { w: c.width, h: c.height, hw: host.clientWidth, hh: host.clientHeight, cw: host.closest('.ds-card').clientWidth };
      A.check(N + 'fullscreen-roundtrip-restores-canvas-and-container-sizes-exactly',
        b0.w > 100 && inFs && title === '箱线图' && !host.classList.contains('ds-chart-fullscreen') && J(b0) === J(b1), J(b0) + ' -> ' + J(b1));
      A.check(N + 'draw-geometry-still-correct-in-fullscreen', rfs.median === 4 && rfs.whisker === 8 && rfs.cap === 8 && rfs.arcsOk === rfs.arcsWant && rfs.missing.length === 0, J(rfs));
    })();

    // ---- 9. 主题切换：颜色跟随 token ----
    var lightS = [0, 1, 2, 3].map(sTok), lightText = tokRgb('--color-text');
    DS.theme.set('dark');
    var darkS = [0, 1, 2, 3].map(sTok), darkText = tokRgb('--color-text');
    var bxd = cur('c-boxplot'); bxd.resize();
    var repD = boxReport(bxd, false, want4);
    var bdD = bxd.data.datasets[0].borderColor.map(rgbOf), ptD = bxd.data.datasets[1].borderColor.map(rgbOf);
    A.check(N + 'dark-theme-borders-fills-whiskers-median-and-dots-follow-the-dark-tokens',
      J(bdD) === J(darkS) && darkS.join() !== lightS.join() && darkText !== lightText && repD.colorsOk && repD.arcColorOk && repD.median === 4 &&
        ptD.every(function (c, i) { return c === darkS[bxd.data.datasets[1].data[i].g]; }), J(bdD) + J(darkS));
    DS.theme.set('light');
    var bxl = cur('c-boxplot');
    var repL = boxReport(bxl, false, want4);
    A.check(N + 'back-to-light-theme-colors-restored', J(bxl.data.datasets[0].borderColor.map(rgbOf)) === J(lightS) && repL.colorsOk && repL.arcColorOk, J(repL));

    // ---- 10. 空数据 / 控制台 ----
    var cvE = mk();
    var bE = DS.charts.boxplot(cvE, [{ label: 'x', values: [] }, { label: 'y', values: [NaN] }]);
    A.check(N + 'no-valid-data-renders-the-empty-state-and-returns-null', bE === null && !!cvE.parentNode.querySelector('.ds-chart-empty'), '');
    cleanup();
    A.check(N + 'no-console-output-or-errors-while-creating-switching-zooming-fullscreen-and-theming', ownErrs().length === 0, ownErrs().slice(0, 3).join(' | '));
    console.error = origErr; console.warn = origWarn; console.log = origLog;
    window.removeEventListener('error', onWinErr);
    showPanel('p-play');
  });
})();
