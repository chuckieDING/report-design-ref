/* demo/selftest-gantt.js —— 甘特图 DS.svg.gantt 的断言套件，前缀 gt-。只在 ?selftest=1 下注册。

   全部按公开契约（data-* 属性 / 类名 / 两个纯函数）定位，几何一律用 getBoundingClientRect 实测，
   不读库内变量。预言值由测试自己从 DS_MOCK.ganttDemo() 的原始数据独立算出（时间 → 像素、分档、
   构成排序、时刻文字），不复用库里的同名函数——否则"库算错、测试照着同一个错算"也会是绿的。

   防"断言恒真"：
     - 几何断言前先断言被量的元素可见且尺寸非零（隐藏面板里一切都是 0×0，0 ≤ 0 恒成立）；
     - 不拿 null/undefined 去做 !== 比较（缺元素时显式判 false）；
     - "选对了一侧/选对了字色"这类断言都配一个会选出另一种结果的对照输入，只有一种结果的输入测不出规则。 */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('selftest') !== '1') return;
  window.DS_SELFTEST_SUITES = window.DS_SELFTEST_SUITES || [];

  window.DS_SELFTEST_SUITES.push(function ganttSuite(A) {
    var N = 'gt-';
    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    function near(a, b, eps) { return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (eps == null ? 1 : eps); }
    function rect(el) { return el ? el.getBoundingClientRect() : null; }
    function cs(el) { return getComputedStyle(el); }

    // ---------- 独立实现的预言工具 ----------
    var SUP = { 1: '¹', 2: '²' };
    function clock(min) {                       // 只覆盖本套件用到的 0–2 天
      var t = Math.round(min), d = Math.floor(t / 1440), m = t - d * 1440;
      var hh = Math.floor(m / 60), mm = m % 60;
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + (d > 0 ? '⁺' + SUP[d] : '');
    }
    function parseRgb(s) {
      var m = /rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(String(s));
      return m ? [+m[1], +m[2], +m[3]] : null;
    }
    function lum(c) {
      function f(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    }
    function contrastRgb(a, b) {
      var x = parseRgb(a), y = parseRgb(b);
      if (!x || !y) return 0;
      var la = lum(x), lb = lum(y);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
    function hexToCss(hex) {
      hex = String(hex).replace('#', '');
      return 'rgb(' + parseInt(hex.substr(0, 2), 16) + ', ' + parseInt(hex.substr(2, 2), 16) + ', ' + parseInt(hex.substr(4, 2), 16) + ')';
    }
    function tokenCss(name) {
      var probe = document.createElement('i');
      probe.style.color = 'var(' + name + ')';
      document.body.appendChild(probe);
      var v = cs(probe).color;
      probe.remove();
      return v;
    }
    function move(el, x, y) {
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
    }
    function leave(el) { el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false })); }
    function tipEl() { return $$('.ds-gantt-tip')[0] || null; }
    function tipLines() { var t = tipEl(); return t ? $$('.ds-gantt-tip-line', t).map(function (d) { return d.textContent; }) : []; }
    function tipShown() { var t = tipEl(); return !!t && cs(t).opacity === '1'; }
    function hover(el) { var r = rect(el); move(el, Math.round(r.left + Math.min(10, r.width / 2)), 100); return tipLines(); }

    // ---------- 进入「进度」分组（真实点击），测完恢复进入前的分组与主题 ----------
    var prevItem = $('#side [aria-current="true"]');
    var themeBefore = DS.theme.get();
    DS.theme.set('light');
    $('#side .ds-side-item[data-panel="g-progress"]').click();

    var host = document.getElementById('s-gantt');
    var root = $('[data-gantt]', host);
    var demo = DS_MOCK.ganttDemo('x');
    var WS = demo.window.start, WE = demo.window.end, SPAN = WE - WS;
    var TH = demo.thresholds;
    function bandOf(v) { var i = 0; while (i < TH.length && v > TH[i]) i++; return i; }
    var allBars = [];
    demo.rows.forEach(function (r, ri) { r.bars.forEach(function (b, bi) { allBars.push({ r: r, ri: ri, bi: bi, b: b }); }); });

    var axis = root && $('.ds-gantt-axis', root);
    var ar = rect(axis);
    A.check(N + 'precondition-demo-gantt-is-visible-with-real-size',
      !!root && !!axis && ar.width >= 700 && ar.height > 0 && host.clientWidth > 800,
      ar ? ar.width + 'x' + ar.height + ' host ' + host.clientWidth : 'missing');
    var K = ar.width / SPAN;                         // 像素 / 分钟
    function xOf(t) { return ar.left + (t - WS) * K; }

    // ---------- 1. 纯函数 ----------
    var fc = DS.svg.fmtClock;
    A.check(N + 'fmtclock-formats-hh-mm-and-next-day-superscript',
      fc(360) === '06:00' && fc(0) === '00:00' && fc(1439) === '23:59' && fc(1440) === '00:00⁺¹' &&
        fc(1500) === '01:00⁺¹' && fc(1620) === '03:00⁺¹' && fc(2940) === '01:00⁺²' && fc(605) === '10:05',
      [fc(360), fc(1440), fc(1500), fc(2940), fc(605)].join(' '));
    A.check(N + 'fmtclock-rounds-total-minutes-first-never-shows-60',
      fc(1439.6) === '00:00⁺¹' && fc(59.6) === '01:00' && fc(59.4) === '00:59', fc(1439.6) + ' ' + fc(59.6));

    var LM = DS.svg.ganttLayoutMarkers;
    var e1 = LM([{ x: 5, label: '甲 06:00' }], 500)[0];
    var e1w = Math.round(7.2 + 5.6 * 6 + 26);       // 1 个汉字 + 6 个 ASCII（含空格）
    A.check(N + 'layout-left-edge-forces-label-to-the-right-of-the-line',
      e1.anchor === 'left' && e1.row === 0 && near(e1.range[0], -5, 0.01) && near(e1.range[1], 5 + e1w - 10, 0.01),
      JSON.stringify(e1));
    var e2 = LM([{ x: 495, label: '甲 06:00' }], 500)[0];
    A.check(N + 'layout-right-edge-forces-label-to-the-left-of-the-line',
      e2.anchor === 'right' && near(e2.range[0], 495 - e1w + 10, 0.01) && near(e2.range[1], 505, 0.01), JSON.stringify(e2));
    // 拥挤度想把标签推向放不下的一侧时，仍以"放得下"为先：第二条线右侧拥挤、左侧放不下 → 留在右侧并下移一行
    var eg = LM([{ x: 60, w: 60 }, { x: 20, w: 80 }], 1000);
    A.check(N + 'layout-never-pushes-a-label-past-the-edge-even-when-the-other-side-is-crowded',
      eg[1].anchor === 'left' && eg[1].row === 1 && eg[1].range[0] >= 0, JSON.stringify(eg));
    var t1 = LM([{ x: 100, w: 80 }], 500)[0], t2 = LM([{ x: 400, w: 80 }], 500)[0];
    A.check(N + 'layout-tie-picks-the-roomier-side', t1.anchor === 'left' && t2.anchor === 'right', t1.anchor + '/' + t2.anchor);
    // 稀疏侧：第三条标记线左侧 100px 内没有标签、右侧有（第 1 行那个），按拥挤度应放左侧（anchor right）；
    // 按"空间大的一侧"会放右侧——且放右侧在第 0 行也不碰撞，所以结果只取决于拥挤度规则。
    var d3 = LM([{ x: 500, w: 100 }, { x: 520, w: 100 }, { x: 380, w: 100 }], 1000);
    A.check(N + 'layout-density-picks-the-sparser-side-not-the-roomier-one',
      d3[1].row === 1 && d3[2].anchor === 'right' && d3[2].row === 0, JSON.stringify(d3));
    // 同行翻边：想要的一侧（并列 → 空间大 → 右侧）撞上第 0 行已有标签，另一侧空着 → 本行翻边，不下移
    var f3 = LM([{ x: 250, w: 100 }, { x: 700, w: 100 }, { x: 500, w: 120 }], 1000);
    A.check(N + 'layout-collision-flips-side-on-the-same-row-before-stacking',
      f3[0].anchor === 'left' && f3[1].anchor === 'right' && f3[2].anchor === 'right' && f3[2].row === 0, JSON.stringify(f3));
    var s3 = LM([{ x: 500, w: 100 }, { x: 500, w: 100 }, { x: 500, w: 100 }], 1000);
    A.check(N + 'layout-stacks-down-a-row-when-both-sides-collide',
      s3.map(function (r) { return r.row; }).join() === '0,1,2', JSON.stringify(s3));
    var many = [];
    for (var mi = 0; mi < 7; mi++) many.push({ x: 500, w: 100 });
    var c7 = LM(many, 1000).map(function (r) { return r.row; }).join();
    A.check(N + 'layout-caps-at-five-rows-then-forces-row-4', c7 === '0,1,2,3,4,4,4', c7);
    var p2 = LM([{ x: 500, w: 100, priority: 2 }, { x: 500, w: 100, priority: 1 }], 1000);
    var p0 = LM([{ x: 500, w: 100 }, { x: 500, w: 100 }], 1000);
    A.check(N + 'layout-priority-decides-who-claims-row-0-else-input-order',
      p2[1].row === 0 && p2[0].row === 1 && p0[0].row === 0 && p0[1].row === 1, JSON.stringify(p2));
    var wEst = LM([{ x: 500, label: '首个开始 06:10' }, { x: 100, label: 'a' }, { x: 900, label: '一二三四五六七八九十一二三四五六七八' }], 1000)
      .map(function (r) { return Math.round(r.range[1] - r.range[0]); });
    A.check(N + 'layout-label-width-estimate-cjk-7-2-ascii-5-6-plus-26-clamped-50-130',
      wEst.join() === '88,50,130', wEst.join());

    // ---------- 2. demo 数据覆盖规格要求 ----------
    var flagsOf = function (k) { return allBars.filter(function (x) { return x.b.flags && x.b.flags[k]; }).length; };
    var bandsPresent = {};
    allBars.forEach(function (x) { bandsPresent[bandOf(x.b.value)] = 1; });
    var mk = demo.markers, mkStyles = mk.map(function (m) { return m.style; });
    A.check(N + 'demo-data-covers-the-spec',
      demo.rows.length >= 6 && demo.rows.length <= 8 && WS === 360 && WE === 1620 &&
        allBars.some(function (x) { return x.b.start < 1440 && x.b.end > 1440 && x.b.end <= WE; }) &&
        allBars.some(function (x) { return x.b.end > WE; }) && flagsOf('overflow') > 0 && flagsOf('extra') > 0 &&
        demo.rows.filter(function (r) { return r.lanes > 1; }).length === 1 &&
        allBars.some(function (x) { return x.b.end - x.b.start === 1; }) &&
        mk.length === 6 && mkStyles.indexOf('solid') >= 0 && mkStyles.indexOf('dotted') >= 0 &&
        Object.keys(bandsPresent).length >= 5,
      'bands=' + Object.keys(bandsPresent).join() + ' rows=' + demo.rows.length);
    var rowsEl = $$('[data-gantt-row]', root);
    A.check(N + 'demo-renders-one-row-element-per-resource-with-a-label',
      rowsEl.length === demo.rows.length && rowsEl.every(function (r, i) { return r.getAttribute('data-gantt-row') === String(i) && !!$('[data-gantt-label]', r); }),
      rowsEl.length + '');
    var barEls = $$('[data-gantt-bar]', root);
    var want = allBars.map(function (x) { return x.ri + ':' + x.b.start + ':' + x.b.end; }).sort().join('|');
    var got = barEls.map(function (b) { return b.getAttribute('data-row') + ':' + b.getAttribute('data-start') + ':' + b.getAttribute('data-end'); }).sort().join('|');
    A.check(N + 'every-bar-carries-data-start-end-row-matching-the-source', barEls.length === allBars.length && want === got, got.slice(0, 200));
    A.check(N + 'bars-in-the-lanes-row-carry-data-lane',
      $$('[data-gantt-row="5"] [data-gantt-bar]', root).every(function (b) { return /^[0-5]$/.test(b.getAttribute('data-lane') || ''); }) &&
        $$('[data-gantt-bar][data-lane]', root).length === demo.rows[5].bars.length, '');

    // ---------- 3. 几何：时间 → 像素、最小宽、截断、行高 ----------
    function barEl(ri, bi) { return $$('[data-gantt-row="' + ri + '"] [data-gantt-bar]', root)[bi] || null; }
    var geoBad = [];
    allBars.forEach(function (x) {
      if (x.b.end > WE || x.b.end - x.b.start < 12) return;
      var r = rect(barEl(x.ri, x.bi));
      if (!near(r.left, xOf(x.b.start), 1) || !near(r.width, (x.b.end - x.b.start) * K, 1)) geoBad.push(x.ri + '/' + x.bi + ' ' + r.left.toFixed(1) + '~' + xOf(x.b.start).toFixed(1));
    });
    A.check(N + 'bar-left-and-width-follow-the-time-axis', geoBad.length === 0 && allBars.length > 20, geoBad.join('; '));
    var shortBar = barEl(1, 1), sr = rect(shortBar);
    A.check(N + 'one-minute-bar-is-at-least-8px-wide', near(sr.width, 8, 0.6) && near(sr.left, xOf(600), 1), sr.width + '');
    var trunc = barEl(4, 1), trr = rect(trunc);
    A.check(N + 'bar-past-the-window-is-clamped-to-the-right-edge-with-a-triangle',
      near(trr.right, ar.right, 1) && trr.width > 50 && trunc.getAttribute('data-truncated') === '1' &&
        /▶/.test(trunc.textContent) && !/▶/.test(barEl(2, 1).textContent), trr.right + ' vs ' + ar.right + ' text ' + trunc.textContent);
    var r0 = rect(rowsEl[0]), b00 = rect(barEl(0, 0));
    A.check(N + 'row-is-36-high-bar-top-7-height-24',
      near(r0.height, 36, 0.5) && near(b00.top - r0.top, 7, 0.5) && near(b00.height, 24, 0.5), r0.height + ' ' + (b00.top - r0.top) + ' ' + b00.height);
    A.check(N + 'rows-have-a-bottom-border-except-the-last',
      rowsEl.slice(0, -1).every(function (r) { return cs(r).borderBottomWidth === '1px'; }) && cs(rowsEl[rowsEl.length - 1]).borderBottomWidth === '0px', '');
    var laneRow = rect(rowsEl[5]), laneBars = $$('[data-gantt-bar]', rowsEl[5]);
    var laneBad = laneBars.filter(function (b) {
      var r = rect(b), lane = +b.getAttribute('data-lane');
      return !near(r.top - laneRow.top, lane * 7 + 3, 0.5) || !near(r.height, 6, 0.5) || b.textContent !== '';
    });
    A.check(N + 'lanes-row-height-and-thin-bars-per-lane',
      near(laneRow.height, 6 * 7 + 6, 0.5) && laneBars.length === 12 && laneBad.length === 0, laneRow.height + ' bad=' + laneBad.length);
    A.check(N + 'status-icons-on-overflow-and-extra-bars',
      !!$('.ds-gantt-icon[data-flag="overflow"]', barEl(2, 1)) && !!$('.ds-gantt-icon[data-flag="extra"]', barEl(3, 1)) &&
        !$('.ds-gantt-icon', barEl(0, 0)), '');
    A.check(N + 'bar-text-is-count-unit-then-small-duration',
      barEl(0, 1).firstChild.nodeType === 3 && barEl(0, 1).firstChild.data === '20件' && $('small', barEl(0, 1)).textContent === '2h5m', barEl(0, 1).textContent);

    // ---------- 4. 标记线 ----------
    var mEls = $$('[data-gantt-marker]', root);
    var head = $('.ds-gantt-head', root), hr = rect(head);
    var maxRow = Math.max.apply(null, mEls.map(function (m) { return +m.getAttribute('data-row'); }));
    A.check(N + 'axis-height-is-30-plus-22-per-marker-row', mEls.length === 6 && near(hr.height, 30 + (maxRow + 1) * 22, 0.5), hr.height + ' rows ' + (maxRow + 1));
    function mInfo(m) {
      return { el: m, row: +m.getAttribute('data-row'), anchor: m.getAttribute('data-anchor'), time: +m.getAttribute('data-time'),
        lab: rect($('[data-gantt-marker-label]', m)), line: rect($('[data-gantt-marker-line]', m)), text: $('[data-gantt-marker-label]', m).textContent };
    }
    var mi2 = mEls.map(mInfo);
    var overlapPairs = [];
    mi2.forEach(function (a, i) {
      mi2.forEach(function (b, j) {
        if (j <= i || a.row !== b.row) return;
        if (!(a.lab.right + 3.5 <= b.lab.left || b.lab.right + 3.5 <= a.lab.left)) overlapPairs.push(a.text + '|' + b.text);
      });
    });
    A.check(N + 'marker-labels-on-the-same-row-never-overlap', overlapPairs.length === 0 && mi2.every(function (m) { return m.lab.width >= 50; }), overlapPairs.join('; '));
    // 药丸的盒子宽度 = 布局用的宽度（≥ 字符估算、≤ 130），布局算出的区间就是药丸真实占据的区间
    function estW(t) { var w = 0; for (var i = 0; i < t.length; i++) w += /[\u4e00-\u9fff]/.test(t.charAt(i)) ? 7.2 : 5.6; return Math.min(130, Math.max(50, Math.round(w + 26))); }
    A.check(N + 'marker-label-box-is-at-least-the-layout-estimate-wide',
      mi2.every(function (m) { return m.lab.width >= estW(m.text) - 0.5 && m.lab.width <= 130.5; }), mi2.map(function (m) { return m.lab.width.toFixed(1) + '/' + estW(m.text); }).join());
    A.check(N + 'marker-labels-stay-inside-the-plot',
      // 左缘：anchor left 的标签从线左侧 10px 起（规格区间 [x−10, x+w−10]），线离左缘不足 10px 时允许探出这一截
      mi2.every(function (m) { return m.lab.left >= ar.left - 10 && m.lab.right <= ar.right + 0.5; }), mi2.map(function (m) { return m.lab.left.toFixed(0) + '-' + m.lab.right.toFixed(0); }).join() + ' axis ' + ar.left.toFixed(0) + '-' + ar.right.toFixed(0) + ' drawn ' + root.getAttribute('data-gantt-width') + ' host ' + host.clientWidth);
    A.check(N + 'marker-anchor-matches-label-geometry-and-line-sits-at-the-time',
      mi2.every(function (m) {
        var x = xOf(m.time);
        return near(m.line.left + 1, x, 1) && (m.anchor === 'left' ? near(m.lab.left, x - 10, 1) : near(m.lab.right, x + 10, 1));
      }), mi2.map(function (m) { return m.anchor + '@' + m.lab.left.toFixed(0); }).join());
    var first = mi2.filter(function (m) { return m.time === 370; })[0];
    A.check(N + 'demo-markers-stack-and-flip',
      maxRow >= 1 && mi2.some(function (m) { return m.anchor === 'left'; }) && mi2.some(function (m) { return m.anchor === 'right'; }) &&
        !!first && first.anchor === 'left', mi2.map(function (m) { return m.time + ':' + m.row + m.anchor; }).join());
    A.check(N + 'marker-label-top-is-2-plus-22-per-row', mi2.every(function (m) { return near(m.lab.top - hr.top, 2 + m.row * 22, 0.5); }), '');
    var lastRowBottom = rect(rowsEl[rowsEl.length - 1]).bottom, firstRowTop = rect(rowsEl[0]).top;
    A.check(N + 'marker-line-starts-just-below-its-own-label',
      mi2.every(function (m) { return m.line.top > m.lab.bottom && m.line.top <= m.lab.bottom + 6; }),
      mi2.map(function (m) { return (m.line.top - m.lab.bottom).toFixed(1); }).join());
    A.check(N + 'marker-line-runs-through-every-row-to-the-bottom',
      mi2.every(function (m) { return near(m.line.bottom, lastRowBottom, 1) && m.line.top < firstRowTop; }),
      mi2.map(function (m) { return m.line.bottom.toFixed(0); }).join() + ' vs ' + lastRowBottom.toFixed(0));
    A.check(N + 'marker-label-text-is-name-plus-clock',
      mk.every(function (m) { return mi2.some(function (x) { return x.time === m.time && x.text === m.label + ' ' + clock(m.time); }); }), mi2.map(function (m) { return m.text; }).join());
    A.check(N + 'marker-line-style-follows-the-option',
      mk.every(function (m) { var x = mi2.filter(function (y) { return y.time === m.time; })[0]; return !!x && cs($('[data-gantt-marker-line]', x.el)).borderLeftStyle === m.style; }), '');
    A.check(N + 'marker-label-paints-over-lines-with-a-surface-ring',
      mi2.every(function (m) { var l = $('[data-gantt-marker-label]', m.el), ln = $('[data-gantt-marker-line]', m.el); return +cs(l).zIndex > +cs(ln).zIndex && cs(l).backgroundColor === tokenCss('--color-surface') && /0px 0px 0px 2px/.test(cs(l).boxShadow); }), '');

    // ---------- 5. 刻度 ----------
    var ticks = $$('[data-gantt-tick]', root);
    var times = ticks.map(function (t) { return +t.getAttribute('data-time'); });
    var step = times[1] - times[0];
    A.check(N + 'ticks-are-whole-hours-across-the-window',
      times[0] === WS && times[times.length - 1] === WE && times.every(function (t) { return t % 60 === 0; }) && ticks.length === SPAN / step + 1, times.join());
    var markerXs = mk.map(function (m) { return xOf(m.time); });
    var tickBad = [], suppressed = 0;
    ticks.forEach(function (t, i) {
      var tx = rect(t).left;
      var close = markerXs.some(function (x) { return Math.abs(x - tx) < 10; });
      var hasText = !!$('[data-gantt-tick-text]', t);
      if (close && hasText) tickBad.push('text-near-marker@' + t.getAttribute('data-time'));
      if (close) suppressed++;
      if (!close && !hasText && i !== ticks.length - 2) tickBad.push('missing@' + t.getAttribute('data-time'));
    });
    A.check(N + 'tick-number-dropped-within-10px-of-a-marker-line-tick-line-kept', tickBad.length === 0 && suppressed >= 3, tickBad.join() + ' suppressed=' + suppressed);
    var tickTexts = $$('[data-gantt-tick-text]', root), tt0 = tickTexts[1];
    A.check(N + 'tick-text-is-10px-mono-on-surface-at-the-bottom',
      !!tt0 && cs(tt0).fontSize === '10px' && /mono|Consolas|Cascadia|Fira/i.test(cs(tt0).fontFamily) && cs(tt0).backgroundColor === tokenCss('--color-surface') &&
        near(hr.bottom - 1 - rect(tt0).bottom, 2, 1), tt0 ? cs(tt0).fontSize + ' ' + (hr.bottom - rect(tt0).bottom) : 'none');
    var lowest = Math.min.apply(null, tickTexts.map(function (t) { return rect(t).top; }));
    var lastLabBottom = Math.max.apply(null, mi2.map(function (m) { return m.lab.bottom; }));
    A.check(N + 'gap-from-last-marker-row-to-tick-numbers-at-least-12px', lowest - lastLabBottom >= 12, (lowest - lastLabBottom).toFixed(1));
    A.check(N + 'tick-numbers-do-not-overlap-each-other',
      tickTexts.every(function (t, i) { return i === 0 || rect(tickTexts[i - 1]).right <= rect(t).left; }), '');

    // ---------- 6. 字色对比度（浅/深两套） ----------
    var inkDarkCss = tokenCss('--gantt-ink-dark');
    function inkReport() {
      var bad = [], blacks = 0, whites = 0;
      $$('[data-gantt-bar]', $('#s-gantt')).forEach(function (b) {
        if (!b.textContent) return;
        var c = contrastRgb(cs(b).color, cs(b).backgroundColor);
        var sm = $('small', b);
        if (c < 4.5 || (sm && contrastRgb(cs(sm).color, cs(b).backgroundColor) < 4.5)) bad.push(b.textContent + ':' + c.toFixed(2));
        if (cs(b).color === inkDarkCss) blacks++; else whites++;
      });
      return { bad: bad, n: blacks + whites };
    }
    var inkL = inkReport();
    A.check(N + 'bar-text-contrast-at-least-4-5-light', inkL.bad.length === 0 && inkL.n > 10, inkL.bad.join());
    // 选黑还是选白要"按底色"：深底必须白字、浅底必须黑字（只有一种底色的输入测不出这条规则）
    var probeHost = document.createElement('div');
    probeHost.style.cssText = 'position:absolute;left:0;top:0;width:1100px';
    document.body.appendChild(probeHost);
    DS.svg.gantt(probeHost, [{ label: '甲', bars: [{ start: 60, end: 300, value: 1 }, { start: 400, end: 700, value: 9 }] }],
      { window: { start: 0, end: 720 }, colorScale: { thresholds: [5], colors: ['var(--color-text)', 'var(--color-surface)'] }, animate: false });
    var pb = $$('[data-gantt-bar]', probeHost);
    A.check(N + 'bar-ink-is-picked-by-background-white-on-dark-black-on-light',
      pb.length === 2 && cs(pb[0]).color === tokenCss('--gantt-ink-light') && cs(pb[1]).color === tokenCss('--gantt-ink-dark') &&
        tokenCss('--gantt-ink-light') !== tokenCss('--gantt-ink-dark'), pb.map(function (b) { return cs(b).color; }).join());

    // ---------- 7. 悬浮框 ----------
    var tb = barEl(0, 1);
    var tl = hover(tb);
    var tbr = rect(tb);
    var tip = tipEl();
    A.check(N + 'tooltip-hangs-on-body-fixed-no-pointer-events',
      !!tip && tip.parentNode === document.body && cs(tip).position === 'fixed' && cs(tip).pointerEvents === 'none' &&
        cs(tip).zIndex === '9999' && cs(tip).maxWidth === '260px' && $$('.ds-gantt-tip').length === 1, tip ? tip.parentNode.tagName : 'none');
    A.check(N + 'tooltip-shows-three-lines-title-count-duration-then-times-then-breakdown',
      tipShown() && tl.length === 3 && tl[0] === '第 2 段 · 20件 · 2h5m' && tl[1] === '08:10 → 10:15' && tl[2] === 'C类×9, A类×8, D类×3', JSON.stringify(tl));
    A.check(N + 'tooltip-follows-the-mouse-plus-14',
      near(parseFloat(tip.style.left), Math.round(tbr.left + Math.min(10, tbr.width / 2)) + 14, 0.5) && near(parseFloat(tip.style.top), 114, 0.5), tip.style.left + ',' + tip.style.top);
    move(tb, window.innerWidth - 20, 100);
    A.check(N + 'tooltip-left-is-clamped-to-innerwidth-minus-260', near(parseFloat(tip.style.left), window.innerWidth - 260, 0.5), tip.style.left);
    var tl2 = hover(barEl(2, 1));
    A.check(N + 'tooltip-shows-next-day-times-and-status', tl2[1] === '21:40 → ' + clock(1500) + ' [溢出]' && tl2[0] === '产线C 第 2 段 · 16件 · 3h20m', JSON.stringify(tl2));
    var tl3 = hover(trunc);
    A.check(N + 'tooltip-of-a-truncated-bar-ends-with-the-triangle', /▶$/.test(tl3[1] || '') && tl3[1].indexOf(clock(1700)) >= 0, JSON.stringify(tl3));
    leave(trunc);
    A.check(N + 'tooltip-hides-on-mouseleave', !tipShown() && cs(tipEl()).opacity === '0', cs(tipEl()).opacity);
    hover(tb);
    var shownBeforeScroll = tipShown();
    $('.ds-gantt-scroll', root).dispatchEvent(new Event('scroll'));
    var hiddenAfterScroll = !tipShown();
    hover(tb);
    var shownBeforeWheel = tipShown();
    tb.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 10 }));
    A.check(N + 'tooltip-hides-immediately-on-any-scroll-or-wheel',
      shownBeforeScroll && hiddenAfterScroll && shownBeforeWheel && !tipShown(), [shownBeforeScroll, hiddenAfterScroll, shownBeforeWheel].join());
    var laneTip = hover($('[data-gantt-bar][data-lane="2"]', root));
    A.check(N + 'lane-bars-have-no-text-but-a-tooltip-with-the-lane', /槽道 3/.test(laneTip[1] || ''), JSON.stringify(laneTip));
    hideAll();
    function hideAll() { window.dispatchEvent(new Event('scroll')); }

    // ---------- 8. 图例 ----------
    var legend = $('[data-gantt-legend]', root);
    var bandChips = $$('[data-gantt-legend-item][data-kind="band"]', legend);
    var thL = ['≤60分', '60–90分', '90–120分', '120–150分', '150–180分', '180–240分', '>240分'];
    var ext = DS.charts.themeColors().seriesExt;
    A.check(N + 'legend-has-one-chip-per-band-with-11px-rounded-swatch-in-the-band-color',
      bandChips.length === 7 && bandChips.every(function (c, i) {
        var sw = $('.ds-gantt-swatch', c), r = rect(sw);
        return c.textContent === thL[i] && near(r.width, 11, 0.5) && near(r.height, 11, 0.5) && cs(sw).borderTopLeftRadius === '3px' && cs(sw).backgroundColor === hexToCss(ext[i]);
      }), bandChips.map(function (c) { return c.textContent; }).join());
    A.check(N + 'legend-has-status-chips-for-overflow-and-extra',
      $$('[data-gantt-legend-item][data-kind="flag"]', legend).map(function (c) { return c.getAttribute('data-flag') + ':' + c.textContent; }).join() === 'overflow:溢出,extra:额外', '');
    var mChips = $$('[data-gantt-legend-item][data-kind="marker"]', legend);
    A.check(N + 'legend-has-a-chip-for-every-marker-line-in-its-style',
      mChips.length === 6 && mk.every(function (m, i) { return mChips[i].textContent === m.label && cs($('.ds-gantt-swatch-line', mChips[i])).borderLeftStyle === m.style; }), mChips.map(function (c) { return c.textContent; }).join());
    var big = allBars.filter(function (x) { return x.b.value > 240; });
    var bl = hover(bandChips[6]);
    A.check(N + 'legend-band-hover-lists-its-members',
      tipShown() && bl[0] === '>240分 · 共 ' + big.length + ' 项' && bl.length === 1 + big.length &&
        big.every(function (x) { return bl.some(function (l) { return l.indexOf(x.b.label) >= 0; }); }), JSON.stringify(bl));
    var ml = hover(mChips[4]);
    A.check(N + 'legend-marker-hover-explains-the-line', ml[0] === '截止 19:00' && /虚线/.test(ml[1] || ''), JSON.stringify(ml));
    hideAll();

    // 空档与超过 30 个成员（临时实例）
    var bars35 = [];
    for (var i = 0; i < 35; i++) bars35.push({ start: 10 * i, end: 10 * i + 5, value: 1, label: '项' + i });
    DS.svg.gantt(probeHost, [{ label: '甲', bars: bars35 }], { window: { start: 0, end: 360 }, colorScale: { thresholds: [5, 10] }, animate: false });
    var pc = $$('[data-gantt-legend-item][data-kind="band"]', probeHost);
    var l35 = hover(pc[0]), lEmpty = hover(pc[2]);
    A.check(N + 'legend-band-lists-at-most-30-then-says-how-many-more',
      l35.length === 32 && l35[0] === '≤5 · 共 35 项' && l35[31] === '…还有 5 个', l35.length + ' ' + l35[l35.length - 1]);
    A.check(N + 'legend-empty-band-says-no-items', lEmpty.length === 1 && lEmpty[0] === '>10 · 此区间内无项目', JSON.stringify(lEmpty));
    hideAll();

    // ---------- 9. 明细表 ----------
    var det = $('[data-gantt-details]', root);
    A.check(N + 'details-is-a-collapsed-details-element-with-a-ds-table-of-every-bar',
      !!det && det.tagName === 'DETAILS' && !det.open && !!$('table.ds-table', det) && $$('table.ds-table tbody tr', det).length === allBars.length, det ? det.tagName : 'none');
    det.open = true;
    det.dispatchEvent(new Event('toggle'));
    var firstRowCells = $$('table.ds-table tbody tr', det)[0].children;
    A.check(N + 'details-opens-and-shows-real-rows',
      rect($('table.ds-table', det)).height > 100 && firstRowCells[2].textContent === '06:10' && firstRowCells[4].textContent === '100', firstRowCells[2].textContent);

    // ---------- 10. 主题切换 ----------
    DS.theme.set('dark');
    root = $('[data-gantt]', host);
    var detAfter = $('[data-gantt-details]', root);
    var inkD = inkReport();
    var ttD = $$('[data-gantt-tick-text]', root)[1];
    A.check(N + 'dark-theme-redraws-with-dark-tokens',
      !!ttD && cs(ttD).backgroundColor === tokenCss('--color-surface') && tokenCss('--color-surface') !== tokenCss('--gantt-ink-light') &&
        cs($('[data-gantt-bar]', root)).backgroundColor === hexToCss(DS.charts.themeColors().seriesExt[+$('[data-gantt-bar]', root).getAttribute('data-band')]), ttD ? cs(ttD).backgroundColor : 'none');
    A.check(N + 'bar-text-contrast-at-least-4-5-dark', inkD.bad.length === 0 && inkD.n > 10, inkD.bad.join());
    A.check(N + 'details-open-state-survives-the-theme-redraw', !!detAfter && detAfter.open === true, '');
    A.check(N + 'theme-redraw-does-not-replay-the-entry-animation', !root.classList.contains('ds-gantt--anim'), root.className);
    DS.theme.set('light');
    root = $('[data-gantt]', host);
    $('[data-gantt-details]', root).open = false;
    $('[data-gantt-details]', root).dispatchEvent(new Event('toggle'));

    // ---------- 11. 宽度自适应 + 横向滚动时行标签 sticky ----------
    probeHost.style.width = '1300px';
    DS.svg.gantt(probeHost, demo.rows, { window: demo.window, markers: demo.markers, colorScale: { thresholds: TH }, animate: false });
    var sc = $('.ds-gantt-scroll', probeHost);
    var wideAxis = rect($('.ds-gantt-axis', probeHost));
    A.check(N + 'wide-host-fills-the-width-without-horizontal-scroll',
      near(rect($('[data-gantt]', probeHost)).width, 1300, 0.5) && sc.scrollWidth === sc.clientWidth && near(wideAxis.width, 1300 - 2 - 120, 1), sc.scrollWidth + '/' + sc.clientWidth + ' axis ' + wideAxis.width);
    probeHost.style.width = '500px';
    DS.svg.redrawIn(probeHost.parentNode);
    sc = $('.ds-gantt-scroll', probeHost);
    var narrowAxis = rect($('.ds-gantt-axis', probeHost));
    A.check(N + 'narrow-host-keeps-a-700px-plot-and-scrolls-horizontally',
      $('[data-gantt]', probeHost).getAttribute('data-gantt-width') === '500' && near(narrowAxis.width, 700, 1) && sc.scrollWidth > sc.clientWidth + 300, sc.scrollWidth + '/' + sc.clientWidth);
    var lab0 = $('[data-gantt-label]', probeHost), labLeft0 = rect(lab0).left, bar0Left = rect($('[data-gantt-bar]', probeHost)).left;
    sc.scrollLeft = 250;
    A.check(N + 'row-labels-stay-sticky-while-scrolling-horizontally',
      sc.scrollLeft === 250 && near(rect(lab0).left, labLeft0, 0.5) && near(rect($('[data-gantt-bar]', probeHost)).left, bar0Left - 250, 0.5) && cs(lab0).position === 'sticky',
      rect(lab0).left + ' vs ' + labLeft0);

    // ---------- 12. 空态 / 最简调用 / 缺省时间窗 / 开关 ----------
    DS.svg.gantt(probeHost, [], { emptyText: '今天没有排程' });
    var em = $('.ds-gantt-empty', probeHost);
    A.check(N + 'empty-rows-show-the-empty-text', !!em && em.textContent === '今天没有排程' && !$('[data-gantt-bar]', probeHost) && rect(em).height > 20, em ? em.textContent : 'none');
    DS.svg.gantt(probeHost, [{ label: '甲', bars: [] }]);
    A.check(N + 'rows-without-bars-also-show-the-default-empty-text', !!$('.ds-gantt-empty', probeHost) && $('.ds-gantt-empty', probeHost).textContent === '暂无数据', '');
    probeHost.style.width = '1100px';
    var reads = 0;
    DS.svg.gantt(probeHost, [{ get label() { reads++; return '旧调用'; }, bars: [{ start: 0, end: 3, series: 0 }, { start: 4, end: 7, series: 1 }] }]);
    var mini = $$('[data-gantt-bar]', probeHost);
    A.check(N + 'minimal-call-with-a-label-getter-still-works',
      mini.length === 2 && reads >= 1 && $('[data-gantt-label]', probeHost).textContent === '旧调用' &&
        cs(mini[1]).backgroundColor === hexToCss(DS.charts.themeColors().series[1]) && !$('[data-gantt-legend]', probeHost) &&
        $$('[data-gantt-tick]', probeHost).map(function (t) { return t.getAttribute('data-time'); }).join() === '0,60', mini.length + ' reads ' + reads);
    DS.svg.gantt(probeHost, [{ label: '甲', bars: [{ start: 370, end: 1000, value: 3 }] }],
      { markers: [{ time: 200, label: '窗外' }, { time: 600, label: '窗内' }], colorScale: { thresholds: [5] }, legend: true });
    A.check(N + 'default-window-is-the-data-range-on-whole-hours-and-out-of-window-markers-vanish',
      $$('[data-gantt-tick]', probeHost)[0].getAttribute('data-time') === '360' && $$('[data-gantt-tick]', probeHost).slice(-1)[0].getAttribute('data-time') === '1020' &&
        $$('[data-gantt-marker]', probeHost).length === 1 && $('[data-gantt-marker]', probeHost).getAttribute('data-time') === '600' &&
        $$('[data-gantt-legend-item][data-kind="marker"]', probeHost).length === 1, '');
    A.check(N + 'entry-animation-is-css-only-and-on-by-default',
      $('[data-gantt]', probeHost).classList.contains('ds-gantt--anim') && cs($('[data-gantt-bar]', probeHost)).animationName === 'ds-gantt-in', cs($('[data-gantt-bar]', probeHost)).animationName);
    DS.svg.gantt(probeHost, [{ label: '甲', bars: [{ start: 370, end: 1000, value: 3, breakdown: [['乙', 1], ['甲', 4]] }] }],
      { legend: false, animate: false, tooltip: function (b, r, ctx) { return ['自定义', String(ctx.duration), r.label]; } });
    var ct = hover($('[data-gantt-bar]', probeHost));
    A.check(N + 'legend-false-hides-it-animate-false-skips-it-tooltip-fn-overrides-lines',
      !$('[data-gantt-legend]', probeHost) && cs($('[data-gantt-bar]', probeHost)).animationName === 'none' && ct.join('|') === '自定义|630|甲', ct.join('|'));
    hideAll();
    probeHost.remove();

    // 恢复进入前的分组
    if (prevItem) prevItem.click(); else document.querySelector('[data-panel="p-comp"]').click();
    DS.theme.set(themeBefore);
  });
})();
