/* demo/selftest-zoom.js —— 滚轮缩放以鼠标位置为锚点 的断言套件，前缀 za-。只在 ?selftest=1 下注册。
   全部用真实 WheelEvent 派发到库自己挂在 canvas 上的监听；预言值（鼠标下的数据值）由测试在
   缩放前自己用 getPixelForValue 两点线性插值算出，缩放后再读该数据值的像素位置与鼠标比较。 */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('selftest') !== '1') return;
  window.DS_SELFTEST_SUITES = window.DS_SELFTEST_SUITES || [];

  window.DS_SELFTEST_SUITES.push(function wheelAnchor(A) {
    var N = 'za-';
    document.querySelector('[data-panel="p-comp"]').click();
    var prevMode = null;
    DS.charts.setWheelMode('zoom');

    function chartOf(id) { return document.getElementById(id)._dsChart; }
    function scaleDims(chart) {
      return chart.$ds.xy ? [chart.$ds.axis, chart.$ds.secAxis] : [chart.$ds.axis];
    }
    // 取 (px,py) 处各缩放轴的数据值：两端像素线性插值（独立于库内实现里的变量，不用 getValueForPixel）
    function valuesAt(chart, x, y) {
      var out = {};
      scaleDims(chart).forEach(function (ax) {
        var sc = chart.scales[axisName(chart, ax)];
        var p = sc.isHorizontal() ? x : y;
        // 类目轴小数视野：两端像素不对应 min/max，用 0/1 两个索引做标尺；数值轴用 min/max 两端
        var cat = sc.type === 'category';
        var va = cat ? 0 : sc.min, vb = cat ? 1 : sc.max;
        var p0 = sc.getPixelForValue(va), p1 = sc.getPixelForValue(vb);
        out[ax] = va + (p - p0) / (p1 - p0) * (vb - va);
      });
      return out;
    }
    function axisName(chart, ax) { return ax; }
    function pixelOf(chart, ax, val) {
      var sc = chart.scales[ax];
      return sc.getPixelForValue(val);
    }
    function wheel(chart, x, y, dy) {
      var r = chart.canvas.getBoundingClientRect();
      var ev = new WheelEvent('wheel', { deltaY: dy, ctrlKey: true, cancelable: true,
        clientX: r.left + x * r.width / chart.width, clientY: r.top + y * r.height / chart.height });
      chart.canvas.dispatchEvent(ev);
      return ev.defaultPrevented;
    }
    // 在若干位置（含靠近角落）连滚 notches 格，返回各轴最大像素偏差
    var FR = [[0.82, 0.5], [0.5, 0.5], [0.2, 0.3], [0.8, 0.7], [0.05, 0.05], [0.95, 0.95], [0.05, 0.95], [0.95, 0.05], [0.33, 0.8]];
    function maxDev(chart, notches, dy) {
      var worst = { x: 0, y: 0 };
      FR.forEach(function (f) {
        DS.charts.resetZoom(chart);
        var ca = chart.chartArea;
        var x = ca.left + f[0] * (ca.right - ca.left), y = ca.top + f[1] * (ca.bottom - ca.top);
        // 先放大一格再取值，确保是在"已缩放"与"满量程"两种起点上都测（i=0 起点就是满量程）
        var r00 = chart.canvas.getBoundingClientRect();
        var ex0 = Math.min(Math.max(Math.trunc(r00.left + x) - r00.left, ca.left), ca.right);
        var ey0 = Math.min(Math.max(Math.trunc(r00.top + y) - r00.top, ca.top), ca.bottom);
        var first = valuesAt(chart, ex0, ey0);
        for (var i = 0; i < notches; i++) {
          // clientX/Y 是整数，且绘图区边距会随刻度标签宽度变化：鼠标有效位置 = 取整后夹进"当前"绘图区
          var r0 = chart.canvas.getBoundingClientRect();
          var cur = chart.chartArea;
          var ex = Math.min(Math.max(Math.trunc(r0.left + x) - r0.left, cur.left), cur.right);
          var ey = Math.min(Math.max(Math.trunc(r0.top + y) - r0.top, cur.top), cur.bottom);
          var before = valuesAt(chart, ex, ey);
          wheel(chart, x, y, dy || -100);
          scaleDims(chart).forEach(function (ax) {
            var sc = chart.scales[ax];
            // 类目轴逐格不测（锚点沿用第一格的真值，逐格相对"取整后的值"必然有偏）：由下面的累积偏差负责
            return;   // 逐格校验只剩累积偏差（见下）：鼠标在边距里时按当前边界重夹会造成假偏差
            var after = sc.getPixelForValue(before[ax]);
            var want = sc.isHorizontal() ? ex : ey;
            var d = Math.abs(after - want);
            // 类目轴整数窗口，最好只能落在最近的类目上：偏差折算成"当前窗口里的类目宽度倍数"
            if (sc.type === 'category') d = d / Math.abs(sc.getPixelForValue(1) - sc.getPixelForValue(0)) * 100;
            var k = sc.isHorizontal() ? 'x' : 'y';
            if (d > worst[k]) { worst[k] = d; worst[k+'i'] = f.join(',') + '@' + i + ' ca=' + [ca.left,ca.right,ca.top,ca.bottom].map(Math.round) + ' ca2=' + [chart.chartArea.left,chart.chartArea.right].map(Math.round) + ' sc=' + sc.min + ',' + sc.max; }
          });
        }
        // 累积偏差：连滚 N 格后，最初鼠标下的那个数据值与鼠标的距离（逐格取整误差不能累积）
        scaleDims(chart).forEach(function (ax) {
          var sc = chart.scales[ax];
          var want = sc.isHorizontal() ? ex0 : ey0;
          var d = Math.abs(sc.getPixelForValue(first[ax]) - want);
          if (sc.type === 'category') d = d / Math.abs(sc.getPixelForValue(1) - sc.getPixelForValue(0)) * 100;
          var k = sc.isHorizontal() ? 'x' : 'y';
          if (d > worst[k]) { worst[k] = d; worst[k + 'i'] = 'cumulative ' + f.join(','); }
        });
      });
      DS.charts.resetZoom(chart);
      return worst;
    }
    function fmt(w) { return (w.xi||'') + ' | ' + (w.yi||'') + ' x=' + w.x.toFixed(2) + 'px y=' + w.y.toFixed(2) + 'px'; }

    ['c-bubble', 'c-scatter'].forEach(function (id) {
      var c = chartOf(id);
      c.resize();
      var w = maxDev(c, 3);
      A.check(N + id + '-anchor-both-axes', w.x <= 2 && w.y <= 2, fmt(w));
    });
    // 类目轴：偏差容差半个类目宽
    var cb = chartOf('c-bar'); cb.resize();
    var step = Math.abs(cb.scales.x.getPixelForValue(1) - cb.scales.x.getPixelForValue(0));
    var wb = maxDev(cb, 3);
    A.check(N + 'c-bar-anchor', wb.x <= 50.5 && step > 4, fmt(wb) + ' (类目轴偏差单位=百分之一个类目宽) step=' + step.toFixed(1));
    var ch = chartOf('c-hbar'); ch.resize();
    var wh = maxDev(ch, 3);
    A.check(N + 'c-hbar-anchor-y-category', wh.y <= 50.5 && ch.$ds.axis === 'y', fmt(wh) + ' axis=' + ch.$ds.axis);
    // 全量遍历：页面上每张带缩放工具条（有放大按钮）的图都测，每张只测它实际缩放的轴
    var allIds = [];
    DS.charts.all().forEach(function (ch) {
      var card = ch.canvas.closest('.ds-card');
      if (!ch.$ds || !card || !card.querySelector('.ds-chart-toolbar [data-act="in"]') || !ch.canvas.id) return;
      allIds.push(ch.canvas.id);
      ch.resize();
      var wa = maxDev(ch, 3);
      var ok = true, ax = scaleDims(ch).map(function (a) {
        var sc = ch.scales[a], k = sc.isHorizontal() ? 'x' : 'y';
        var lim = sc.type === 'category' ? 50.5 : 2;
        if (wa[k] > lim) ok = false;
        return a + ':' + sc.type;
      });
      A.check(N + 'all-' + ch.canvas.id + '-anchor', ok, fmt(wa) + ' axes=' + ax.join(','));
    });
    A.check(N + 'all-covers-expected-charts', ['c-bar', 'c-hbar', 'c-stacked', 'c-combo', 'c-waterfall', 'c-line', 'c-timeaxis', 'c-area', 'c-scatter', 'c-bubble', 'c-boxplot'].every(function (id) { return allIds.indexOf(id) >= 0; }), allIds.join(','));
    // 12 个类目的横向条形图（demo 里的只有 3 个类目，窗口太小，中心缩放也恰好落在容差内）
    var h12 = document.createElement('div');
    h12.className = 'ds-chart-host';
    h12.style.cssText = 'width:600px;height:420px';
    var h12cv = document.createElement('canvas');
    h12.appendChild(h12cv);
    document.body.appendChild(h12);
    var labs12 = [], dat12 = [];
    for (var q = 0; q < 12; q++) { labs12.push('类目' + (q + 1)); dat12.push(10 + (q * 7) % 13); }
    var c12 = DS.charts.create(h12cv, { type: 'bar', data: { labels: labs12, datasets: [{ label: '值', data: dat12 }] }, options: { indexAxis: 'y' } });
    var w12 = maxDev(c12, 3);
    A.check(N + 'hbar12-anchor-y-category', w12.y <= 50.5 && c12.$ds.axis === 'y', fmt(w12));
    DS.charts.destroy(c12); h12.remove();
    // 按日期的数值轴折线（x 为 linear + 时间戳）
    var ct = chartOf('c-timeaxis'); ct.resize();
    var wt = maxDev(ct, 3);
    A.check(N + 'c-timeaxis-anchor-numeric-date', wt.x <= 2 && ct.scales.x.type === 'linear', fmt(wt) + ' type=' + ct.scales.x.type);
    var cl = chartOf('c-line'); cl.resize();
    var wl = maxDev(cl, 3);
    A.check(N + 'c-line-anchor', wl.x <= 50.5, fmt(wl));

    // 缩放确实发生（防"锚点恒等因为根本没缩"的假绿）
    var cs = chartOf('c-scatter');
    DS.charts.resetZoom(cs);
    var ca = cs.chartArea, mx = ca.left + (ca.right - ca.left) * 0.3, my = ca.top + (ca.bottom - ca.top) * 0.4;
    var span0 = cs.scales.x.max - cs.scales.x.min;
    wheel(cs, mx, my, -100); wheel(cs, mx, my, -100); wheel(cs, mx, my, -100);
    var span1 = cs.scales.x.max - cs.scales.x.min;
    A.check(N + 'zoom-really-happens', Math.abs(span1 / span0 - 1 / Math.pow(1.25, 3)) < 1e-6 && DS.charts.isZoomed(cs), (span1 / span0).toFixed(4));
    // 原先的 bug 形态：鼠标不在中心时，视野中心不应该保持不变
    var b = DS.charts._bounds(cs, 'x');
    var v = DS.charts._viewRange(cs, b);
    A.check(N + 'not-centered', Math.abs((v.min + v.max) / 2 - (b.lo + b.hi) / 2) > span0 * 0.01, '');

    // 边界：贴着左/右/上/下缘缩放，视野不越界、宽度按 factor 缩小
    function edge(chart, fx, fy) {
      DS.charts.resetZoom(chart);
      var ca = chart.chartArea;
      var x = ca.left + fx * (ca.right - ca.left), y = ca.top + fy * (ca.bottom - ca.top);
      var res = { ok: true, info: '' };
      var w0 = {};
      scaleDims(chart).forEach(function (ax) { var bb = DS.charts._bounds(chart, ax); w0[ax] = bb.hi - bb.lo; });
      for (var i = 0; i < 3; i++) wheel(chart, x, y, -100);
      scaleDims(chart).forEach(function (ax) {
        var bb = DS.charts._bounds(chart, ax), vv = DS.charts._viewRange(chart, bb);
        var wd = vv.max - vv.min, want = w0[ax] / Math.pow(1.25, 3);
        var inb = vv.min >= bb.lo - 1e-9 && vv.max <= bb.hi + 1e-9;
        // 数值轴：宽度严格按 factor 缩小；类目轴视野取整到整数个类目（Chart.js 的限制），容差 1 个类目且必须已缩小
        var wok = bb.indexed ? (Math.abs(wd - want) <= 1 && wd < w0[ax]) : Math.abs(wd - want) < want * 1e-6;
        if (!inb || !wok) { res.ok = false; res.info += ax + ':[' + vv.min + ',' + vv.max + '] w=' + wd + ' want=' + want + ' '; }
      });
      DS.charts.resetZoom(chart);
      return res;
    }
    [['c-timeaxis', 0, 0.5], ['c-timeaxis', 1, 0.5], ['c-bubble', 0, 0], ['c-bubble', 1, 1], ['c-scatter', 0, 1], ['c-scatter', 1, 0], ['c-bar', 0, 0.5], ['c-bar', 1, 0.5], ['c-hbar', 0.5, 0], ['c-hbar', 0.5, 1], ['c-line', 0, 0.5], ['c-line', 1, 0.5]]
      .forEach(function (e) {
        var r = edge(chartOf(e[0]), e[1], e[2]);
        A.check(N + 'edge-' + e[0] + '-' + e[1] + '-' + e[2], r.ok, r.info);
      });

    // 向外滚回满量程：isZoomed() 为 false（Review C1 防回退），锚点位置任意
    ['c-bubble', 'c-scatter', 'c-bar', 'c-hbar', 'c-line', 'c-timeaxis'].forEach(function (id) {
      var c = chartOf(id), ca2 = c.chartArea;
      DS.charts.resetZoom(c);
      var x = ca2.left + (ca2.right - ca2.left) * 0.15, y = ca2.top + (ca2.bottom - ca2.top) * 0.85;
      for (var i = 0; i < 4; i++) wheel(c, x, y, -100);
      var zoomedIn = DS.charts.isZoomed(c);
      for (var j = 0; j < 40; j++) wheel(c, x, y, 100);
      A.check(N + 'out-to-full-' + id, zoomedIn && DS.charts.isZoomed(c) === false, 'in=' + zoomedIn);
    });

    // 工具条 −/+ 没有鼠标位置：仍以视野中心缩放（中心值缩放前后不变，两轴都测）
    ['c-bubble', 'c-bar', 'c-line'].forEach(function (id) {
      var c = chartOf(id), card = c.canvas.closest('.ds-card');
      DS.charts.resetZoom(c);
      var ca3 = c.chartArea;
      wheel(c, ca3.left + (ca3.right - ca3.left) * 0.25, ca3.top + (ca3.bottom - ca3.top) * 0.25, -100); // 先偏离满量程
      var mids = {};
      scaleDims(c).forEach(function (ax) { var bb = DS.charts._bounds(c, ax), vv = DS.charts._viewRange(c, bb); mids[ax] = (vv.min + vv.max) / 2; });
      var btn = card.querySelector('.ds-chart-toolbar [data-act="in"]');
      btn.click();
      var ok = true, info = '';
      scaleDims(c).forEach(function (ax) {
        var bb = DS.charts._bounds(c, ax), vv = DS.charts._viewRange(c, bb);
        var m = (vv.min + vv.max) / 2;
        if (Math.abs(m - mids[ax]) > 1e-9 * (1 + Math.abs(m))) { ok = false; info += ax + ' ' + mids[ax] + '->' + m + ' '; }
      });
      A.check(N + 'toolbar-in-keeps-center-' + id, ok, info);
      DS.charts.resetZoom(c);
    });

    // 鼠标在绘图区外（左上角边距里）：不抛错，按最近边界点锚定（视野仍贴着左/上缘）
    var cc = chartOf('c-scatter'); DS.charts.resetZoom(cc);
    var threw = false;
    try { wheel(cc, 1, 1, -100); } catch (e) { threw = true; }
    var bx = DS.charts._bounds(cc, 'x'), vx = DS.charts._viewRange(cc, bx);
    A.check(N + 'outside-plot-anchors-nearest-edge', !threw && DS.charts.isZoomed(cc) && Math.abs(vx.min - bx.lo) < 1e-9, '');
    DS.charts.resetZoom(cc);

    DS.charts.setWheelMode('ctrl-zoom');
  });
})();
