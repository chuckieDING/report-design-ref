/* demo/selftest-layout.js —— 页面布局 / 全屏形态 / 卡片标题 / 按类目着色 / 数量级切换 的断言套件。
   只在 ?selftest=1 下注册（不在则整个文件什么都不做）。预言值全部由测试自己从
   token、视口与 DS_MOCK 独立算出，不读库内部的中间结果；颜色一律通过"探针元素的
   计算色"与 token 比对，源码里没有颜色字面量。 */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('selftest') !== '1') return;
  window.DS_SELFTEST_SUITES = window.DS_SELFTEST_SUITES || [];

  function $(sel) { return document.querySelector(sel); }
  function showPanel(id) { $('[data-panel="' + id + '"]').click(); }
  function chartOf(id) { return document.getElementById(id)._dsChart; }
  function px(v) { return parseFloat(v); }
  // 把任意 CSS 颜色/值通过探针元素解析成计算值（与 token 比对用）
  function resolved(prop, value) {
    var p = document.createElement('div');
    p.style.cssText = 'position:absolute;left:-9999px;top:0;' + prop + ':' + value;
    document.body.appendChild(p);
    var out = getComputedStyle(p).getPropertyValue(prop);
    p.remove();
    return out;
  }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1.5 : tol); }
  function keyEsc() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
  function fsBackdrops() { return document.querySelectorAll('.ds-fs-backdrop'); }

  window.DS_SELFTEST_SUITES.push(function layout(A) {
    var N = 'lay-';
    DS.theme.set('light');
    showPanel('p-play');
    chartOf('c-bar').resize();

    // ---------- 页面容器 / 网格 / 卡片 / 图表高度 ----------
    var wrap = $('.ds-wrap'), wcs = getComputedStyle(wrap);
    var W = document.documentElement.clientWidth;
    A.check(N + 'harness-viewport-is-desktop-wide', window.innerWidth >= 1400, 'innerWidth=' + window.innerWidth);
    A.check(N + 'wrap-has-no-max-width', wcs.maxWidth === 'none' || wcs.maxWidth === '100%', wcs.maxWidth);
    A.check(N + 'wrap-fills-window-width', near(wrap.getBoundingClientRect().width, W), wrap.getBoundingClientRect().width + ' vs ' + W);
    A.check(N + 'wrap-padding-24-32', wcs.paddingTop === '24px' && wcs.paddingLeft === '32px' && wcs.paddingRight === '32px', wcs.padding);
    var card = document.getElementById('c-bar').closest('.ds-card'), grid = card.parentNode;
    var gcs = getComputedStyle(grid);
    var contentW = wrap.clientWidth - px(wcs.paddingLeft) - px(wcs.paddingRight);
    // 侧边栏合并后，网格在 .ds-side-main 里：可用宽度 = 内容区 − 侧栏 − 间距
    var sideEl = $('#side'), mainEl = $('.ds-side-main');
    var gridW = mainEl.clientWidth;
    A.check(N + 'main-area-is-content-width-minus-sidebar-and-gap-24', near(gridW, contentW - sideEl.getBoundingClientRect().width - 24, 1.5) && near(sideEl.getBoundingClientRect().width, sideEl.classList.contains('ds-collapsed') ? 52 : 230, 0.5), gridW + ' vs ' + contentW + ' side=' + sideEl.getBoundingClientRect().width);
    var tracks = gcs.gridTemplateColumns.split(' ');
    A.check(N + 'grid-gap-24', gcs.columnGap === '24px' && gcs.rowGap === '24px', gcs.columnGap + '/' + gcs.rowGap);
    A.check(N + 'grid-two-columns-at-harness-viewport', tracks.length === 2 && near(px(tracks[0]), px(tracks[1]), 1) &&
      near(px(tracks[0]) * 2 + 24, gridW, 1.5), 'tracks=' + gcs.gridTemplateColumns + ' gridW=' + gridW);
    function ruleText(selPart, media) {
      var out = [];
      Array.prototype.forEach.call(document.styleSheets, function (ss) {
        Array.prototype.forEach.call(ss.cssRules, function (r) {
          if (media) {
            if (r.media && r.media.mediaText.indexOf(media) !== -1) {
              Array.prototype.forEach.call(r.cssRules, function (x) { if (x.selectorText && x.selectorText.indexOf(selPart) !== -1) out.push(x.cssText); });
            }
          } else if (r.selectorText && r.selectorText.indexOf(selPart) !== -1) out.push(r.cssText);
        });
      });
      return out.join('\n');
    }
    var gridRule = ruleText('.ds-charts-grid');
    A.check(N + 'grid-rule-is-fixed-repeat-2-minmax-0-1fr', /repeat\(\s*2\s*,\s*minmax\(\s*0(px)?\s*,\s*1fr\s*\)\s*\)/.test(gridRule) && !/auto-fit/.test(gridRule), gridRule.slice(0, 160));
    var mqRule = ruleText('.ds-charts-grid', 'max-width: 760px');
    A.check(N + 'grid-collapses-to-one-column-at-760', /grid-template-columns:\s*1fr/.test(mqRule) && !ruleText('.ds-charts-grid', 'max-width: 1100px'), mqRule.slice(0, 160));
    // 视口宽度：用同源 iframe（document.write 写入，同步布局）。把组件全览面板整段克隆进去，
    // 样式取自本页全部 <style>，iframe 的宽度就是它里面媒体查询看到的视口宽度。
    function probeAt(width) {
      var ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:absolute;left:-99999px;top:0;border:0;height:900px;width:' + width + 'px';
      document.body.appendChild(ifr);
      var css = [].map.call(document.querySelectorAll('style'), function (x) { return x.textContent; }).join('\n');
      var d = ifr.contentDocument;
      d.open();
      // 克隆整个 .ds-layout（侧栏 + 全部分组面板），把每个分组面板展开成可见
      var lay = $('.ds-layout').cloneNode(true);
      Array.prototype.forEach.call(lay.querySelectorAll('.ds-side-panel'), function (p) { p.hidden = false; });
      d.write('<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>' + css + '</style></head><body><div class="ds-wrap">' +
        lay.outerHTML + '</div></body></html>');
      d.close();
      var cvCard = function (id) { return d.getElementById(id).closest('.ds-card'); };
      var g = cvCard('c-hbar').parentNode;
      var out = { width: width, docW: d.documentElement.clientWidth, cols: getComputedStyle(g).gridTemplateColumns.split(' ').length,
        mainW: d.querySelector('.ds-side-main').getBoundingClientRect().width,
        sideW: d.querySelector('.ds-sidebar').getBoundingClientRect().width,
        normalW: cvCard('c-hbar').getBoundingClientRect().width,
        bubbleW: cvCard('c-bubble').getBoundingClientRect().width,
        sankeyW: cvCard('c-sankey').getBoundingClientRect().width,
        smallGridCols: getComputedStyle(d.getElementById('t-btn').closest('.ds-grid')).gridTemplateColumns.split(' ').length,
        smallW: d.getElementById('t-btn').closest('.ds-card').getBoundingClientRect().width,
        smallW2: d.getElementById('t-card').getBoundingClientRect().width };
      ifr.remove();
      return out;
    }
    [1440, 1920, 2560].forEach(function (w) {
      var r = probeAt(w);
      A.check(N + 'viewport-' + w + '-chart-grid-is-two-columns', r.cols === 2, JSON.stringify(r));
      A.check(N + 'viewport-' + w + '-bubble-and-sankey-cards-same-width-as-normal', near(r.bubbleW, r.normalW, 1) && near(r.sankeyW, r.normalW, 1) &&
        near(r.normalW, (r.docW - 64 - r.sideW - 24 - 24) / 2, 1.5) && near(r.mainW, r.docW - 64 - r.sideW - 24, 1.5), JSON.stringify(r));
      A.check(N + 'viewport-' + w + '-small-component-cards-follow-the-same-grid', r.smallGridCols === 2 && near(r.smallW, r.normalW, 1) && near(r.smallW2, r.normalW, 1), JSON.stringify(r));
    });
    var r700 = probeAt(700);
    A.check(N + 'viewport-700-chart-grid-is-one-column', r700.cols === 1 && r700.smallGridCols === 1 && near(r700.bubbleW, r700.normalW, 1) && near(r700.normalW, r700.docW - 64, 1.5), JSON.stringify(r700));
    var r761 = probeAt(761);
    A.check(N + 'viewport-761-still-two-columns', r761.cols === 2, JSON.stringify(r761));
    var cw = card.getBoundingClientRect().width;
    A.check(N + 'card-width-is-half-the-row-at-desktop-width', near(cw * 2 + 24, gridW, 1.5), 'card=' + cw);
    A.check(N + 'card-width-fills-its-grid-track', near(cw, px(tracks[0])), cw + ' vs ' + tracks[0]);
    var ccs = getComputedStyle(card);
    A.check(N + 'card-padding-24-and-shadow-sm-token',
      ccs.paddingTop === '24px' && ccs.paddingLeft === '24px' && ccs.boxShadow === resolved('box-shadow', 'var(--shadow-sm)'),
      ccs.padding + ' | ' + ccs.boxShadow);
    A.check(N + 'card-in-grid-has-no-extra-bottom-margin', ccs.marginBottom === '0px', ccs.marginBottom);
    A.check(N + 'card-radius-is-radius-lg-token', ccs.borderTopLeftRadius === resolved('border-top-left-radius', 'var(--radius-lg)'), ccs.borderTopLeftRadius);
    A.check(N + 'chart-host-height-350', getComputedStyle(document.getElementById('c-bar').parentNode).height === '350px' &&
      document.getElementById('c-bar').parentNode.clientHeight === 350, document.getElementById('c-bar').parentNode.clientHeight);
    // compact 宿主（紧凑高度 90）的唯一用例原来是 c-empty 卡片，卡片合并后改用探针宿主验证库的类
    (function () {
      var probe = document.createElement('div');
      probe.className = 'ds-chart-host ds-chart-host--compact';
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:400px';
      probe.innerHTML = '<canvas></canvas>';
      document.body.appendChild(probe);
      var ch = DS.charts.create(probe.firstChild, { type: 'line', data: { labels: [], datasets: [{ label: '空', data: [] }] } });
      A.check(N + 'compact-host-stays-short', ch === null && probe.clientHeight === 90 && !!probe.querySelector('.ds-chart-empty'), String(probe.clientHeight));
      probe.remove();
    })();
    showPanel('p-comp');
    ['c-hbar', 'c-pie', 'c-scatter'].forEach(function (id) {
      A.check(N + 'chart-host-height-350-' + id, document.getElementById(id).parentNode.clientHeight === 350, document.getElementById(id).parentNode.clientHeight);
    });
    var halfCards = ['c-bubble', 'c-sankey'].map(function (id) { return document.getElementById(id).closest('.ds-card'); });
    var compInner = $('.ds-side-main').clientWidth, halfW = (compInner - 24) / 2;
    A.check(N + 'big-charts-are-half-width-not-full-row', halfCards.every(function (c) {
      return near(c.getBoundingClientRect().width, halfW, 2) && !c.classList.contains('ds-card-wide');
    }), halfCards.map(function (c) { return c.getBoundingClientRect().width; }).join() + ' vs ' + halfW);
    A.check(N + 'big-charts-hosts-taller-than-350', ['bubble-host', 'sankey-host'].every(function (id) {
      var h = document.getElementById(id).clientHeight; return h >= 480 && h <= 520;
    }), document.getElementById('bubble-host').clientHeight + '/' + document.getElementById('sankey-host').clientHeight);
    // 气泡图半宽下：已画出的名字标签 fillText 实测两两 0 重叠，且至少画了 5 个
    (function () {
      var bcv = document.getElementById('c-bubble'), bch = bcv._dsChart, ctx = bch.ctx, f0 = ctx.fillText, rec = [];
      var nameSet = {};
      bch.data.datasets[0].data.forEach(function (p) { nameSet[p.name] = 1; nameSet[p.name.length > 12 ? p.name.substring(0, 12) + '..' : p.name] = 1; });
      ctx.fillText = function (t, x, y) {
        if (!nameSet[String(t)]) return f0.apply(ctx, arguments);
        var w = ctx.measureText(String(t)).width, m = /(\d+(?:\.\d+)?)px/.exec(ctx.font), hgt = m ? parseFloat(m[1]) : 10;
        rec.push({ l: x - w / 2, r: x + w / 2, t0: y - hgt / 2, b: y + hgt / 2 });
        return f0.apply(ctx, arguments);
      };
      try { bch.draw(); } finally { delete ctx.fillText; }
      var named = rec, pairs = 0;
      for (var i = 0; i < named.length; i++) for (var j = i + 1; j < named.length; j++) {
        if (named[i].l < named[j].r && named[i].r > named[j].l && named[i].t0 < named[j].b && named[i].b > named[j].t0) pairs++;
      }
      A.check(N + 'bubble-half-width-labels-zero-overlap', named.length >= 5 && pairs === 0,
        'labels=' + named.length + ' pairs=' + pairs + ' canvas=' + bcv.getBoundingClientRect().width + 'x' + bcv.getBoundingClientRect().height);
    })();
    // 桑基图半宽下：节点标签（fillText 实测位置与宽度）两两不重叠，且 20 个项目都画出来
    (function () {
      var skc = document.getElementById('c-sankey'), sk = skc._dsChart, ctx = sk.ctx, f0 = ctx.fillText, rec = [];
      ctx.fillText = function (t, x, y) {
        var tb = ctx.textBaseline, ta = ctx.textAlign, fn = ctx.font, w = ctx.measureText(String(t)).width;
        var m = /(\d+(?:\.\d+)?)px/.exec(fn), hgt = m ? parseFloat(m[1]) : 10;
        var l = ta === 'right' || ta === 'end' ? x - w : (ta === 'center' ? x - w / 2 : x);
        var tp = tb === 'middle' ? y - hgt / 2 : (tb === 'bottom' || tb === 'ideographic' ? y - hgt : y);
        rec.push({ t: String(t), l: l, r: l + w, t0: tp, b: tp + hgt });
        return f0.apply(ctx, arguments);
      };
      try { sk.draw(); } finally { delete ctx.fillText; }
      var pairs = 0;
      for (var i = 0; i < rec.length; i++) for (var j = i + 1; j < rec.length; j++) {
        if (rec[i].l < rec[j].r && rec[i].r > rec[j].l && rec[i].t0 < rec[j].b && rec[i].b > rec[j].t0) pairs++;
      }
      var pa = skc.getBoundingClientRect();
      A.check(N + 'sankey-half-width-labels-20-projects-zero-overlap', rec.length >= 24 && pairs === 0 &&
        rec.every(function (r) { return r.l >= -1 && r.r <= pa.width + 1 && r.t0 >= -1 && r.b <= pa.height + 1; }),
        'labels=' + rec.length + ' pairs=' + pairs + ' canvas=' + pa.width + 'x' + pa.height);
    })();
    showPanel('p-play');

    // ---------- 顶栏与页面背景取自 token（浅/深） ----------
    var nav = $('.ds-nav'), ncs = getComputedStyle(nav), title = $('.ds-nav-title'), tcs = getComputedStyle(title);
    A.check(N + 'nav-background-is-nav-bg-token-light', ncs.backgroundColor === resolved('background-color', 'var(--nav-bg)'), ncs.backgroundColor);
    A.check(N + 'nav-padding-and-sticky', ncs.position === 'sticky' && ncs.paddingLeft === '24px' && ncs.paddingRight === '24px', ncs.position + ' ' + ncs.padding);
    A.check(N + 'nav-title-15px-700-nav-text-token', tcs.fontSize === '15px' && tcs.fontWeight === '700' &&
      tcs.color === resolved('color', 'var(--nav-text)'), tcs.fontSize + ' ' + tcs.fontWeight + ' ' + tcs.color);
    var lightNav = ncs.backgroundColor;
    function bodyBg() { return getComputedStyle(document.body).backgroundImage; }
    var bgL = bodyBg();
    A.check(N + 'page-bg-is-gradient-from-three-tokens-light', /^linear-gradient\(135deg/.test(bgL) &&
      ['--page-bg-from', '--page-bg-mid', '--page-bg-to'].every(function (t) { return bgL.indexOf(resolved('color', 'var(' + t + ')')) !== -1; }), bgL);
    DS.theme.set('dark');
    var bgD = bodyBg();
    A.check(N + 'nav-and-page-bg-follow-theme-dark', getComputedStyle(nav).backgroundColor === resolved('background-color', 'var(--nav-bg)') &&
      getComputedStyle(nav).backgroundColor !== lightNav && bgD !== bgL &&
      bgD.indexOf(resolved('color', 'var(--page-bg-from)')) !== -1, getComputedStyle(nav).backgroundColor + ' | ' + bgD);
    DS.theme.set('light');
    // demo 顶栏不再放页签（改左侧菜单），库里"顶栏内页签取顶栏专用 token"的规则仍在，用探针顶栏验证
    var navProbe = document.createElement('div');
    navProbe.className = 'ds-nav';
    navProbe.style.cssText = 'position:absolute;left:-9999px;top:0';
    navProbe.innerHTML = '<div class="ds-tabs"><button type="button" class="ds-tab" aria-selected="true">甲</button><button type="button" class="ds-tab" aria-selected="false">乙</button></div>';
    document.body.appendChild(navProbe);
    var tabSel = navProbe.querySelector('.ds-tab[aria-selected="true"]'), tabOff = navProbe.querySelector('.ds-tab[aria-selected="false"]');
    A.check(N + 'nav-tabs-use-nav-tokens', getComputedStyle(tabSel).color === resolved('color', 'var(--nav-accent)') &&
      getComputedStyle(tabOff).color === resolved('color', 'var(--nav-text-secondary)'), getComputedStyle(tabSel).color + ' ' + getComputedStyle(tabOff).color);
    navProbe.remove();

    // ---------- 全屏：遮罩 + 居中面板 + 标题栏 ----------
    function fsOf(canvasId) {
      var cv = document.getElementById(canvasId), host = cv.parentNode, ch = cv._dsChart;
      return { cv: cv, host: host, chart: ch, card: host.closest('.ds-card'),
        full: function () { host.querySelector('[data-act="full"]').click(); },
        on: function () { return host.classList.contains('ds-chart-fullscreen'); } };
    }
    showPanel('p-play');
    var f = fsOf('c-bar');
    f.chart.resize();
    var cardTitle = f.card.querySelector('.ds-card-title').textContent.trim();
    var before = { w: f.chart.width, h: f.chart.height, hw: f.host.clientWidth, hh: f.host.clientHeight, cardW: f.card.clientWidth,
      cvStyleW: f.cv.style.width, cvStyleH: f.cv.style.height };
    A.check(N + 'fs-nonvacuous-before', before.w > 300 && before.h > 200 && !f.on() && fsBackdrops().length === 0 &&
      !f.host.querySelector('.ds-fs-head'), JSON.stringify(before));
    f.full();
    var bd = $('.ds-fs-backdrop'), bdr = bd && bd.getBoundingClientRect(), bcs = bd && getComputedStyle(bd);
    A.check(N + 'fs-backdrop-exists-fixed-covers-viewport', f.on() && fsBackdrops().length === 1 && bcs.position === 'fixed' &&
      near(bdr.width, W) && near(bdr.height, window.innerHeight) && bdr.left === 0 && bdr.top === 0, bd ? bdr.width + 'x' + bdr.height : 'no backdrop');
    A.check(N + 'fs-backdrop-color-is-overlay-token-and-blurs', bcs.backgroundColor === resolved('background-color', 'var(--color-overlay)') &&
      /blur\(4px\)/.test(bcs.backdropFilter || bcs.webkitBackdropFilter || ''), bcs.backgroundColor + ' | ' + bcs.backdropFilter);
    var hitPage = document.elementFromPoint(6, window.innerHeight - 6);
    A.check(N + 'fs-backdrop-covers-the-page-elementFromPoint', hitPage === bd, hitPage && hitPage.tagName + '.' + hitPage.className);
    var pr = f.host.getBoundingClientRect(), ph = window.innerHeight, pw = Math.min(0.95 * window.innerWidth, 1400);
    A.check(N + 'fs-panel-width-min-95vw-1400', near(pr.width, pw), pr.width + ' vs ' + pw);
    A.check(N + 'fs-panel-height-92vh', near(pr.height, 0.92 * ph), pr.height + ' vs ' + 0.92 * ph);
    A.check(N + 'fs-panel-centered', near(pr.left + pr.width / 2, W / 2) && near(pr.top, 0.04 * ph), 'left=' + pr.left + ' top=' + pr.top);
    var pcs = getComputedStyle(f.host);
    A.check(N + 'fs-panel-padding-24-and-shadow-xl-token', pcs.paddingLeft === '24px' && pcs.paddingBottom === '24px' &&
      pcs.boxShadow === resolved('box-shadow', 'var(--shadow-xl)') && +pcs.zIndex > +bcs.zIndex, pcs.padding + ' | ' + pcs.zIndex + '>' + bcs.zIndex);
    var head = f.host.querySelector('.ds-fs-head');
    A.check(N + 'fs-title-bar-text-equals-card-title', !!head && head.querySelector('.ds-fs-title').textContent === cardTitle,
      (head && head.querySelector('.ds-fs-title').textContent) + ' vs ' + cardTitle);
    A.check(N + 'fs-title-bar-has-close-x-and-toolbar-is-in-the-bar-row', !!head && head.querySelector('[data-act="fs-close"]').textContent === '×' &&
      near(f.host.querySelector('.ds-chart-toolbar').getBoundingClientRect().top + 11, head.getBoundingClientRect().top + 14, 6) &&
      f.host.querySelector('.ds-chart-toolbar').getBoundingClientRect().right <= head.querySelector('[data-act="fs-close"]').getBoundingClientRect().left + 0.5,
      '');
    var hr = head.getBoundingClientRect(), cvr = f.cv.getBoundingClientRect();
    A.check(N + 'fs-canvas-is-below-the-title-bar-and-fills-content-box', cvr.top >= hr.bottom - 0.5 &&
      near(f.chart.width, pr.width - 48 - 2, 3) && near(f.chart.height, pr.height - 64 - 24 - 2, 3), f.chart.width + 'x' + f.chart.height + ' panel=' + pr.width + 'x' + pr.height);
    // 滚轮：全屏中一律按 zoom 处理（图表本身是 ctrl-zoom 默认模式，无 ctrl 键）
    var modeBefore = f.chart.$ds.mode, optMode = f.chart.$ds.mode;
    function wheelIn(ctrl) {
      var ev = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true, ctrlKey: !!ctrl });
      f.cv.dispatchEvent(ev);
      return ev.defaultPrevented;
    }
    var hintFs = f.host.querySelector('.ds-chart-hint').textContent;
    var prevented = wheelIn(false), zoomedInFs = DS.charts.isZoomed(f.chart);
    A.check(N + 'fs-wheel-zooms-without-ctrl-in-fullscreen', prevented && zoomedInFs && hintFs === '滚轮缩放', 'prevented=' + prevented + ' zoomed=' + zoomedInFs + ' hint=' + hintFs);
    DS.charts.resetZoom(f.chart);
    // 点 × 退出
    head.querySelector('[data-act="fs-close"]').click();
    A.check(N + 'fs-exit-via-x-button', !f.on() && fsBackdrops().length === 0 && !f.host.querySelector('.ds-fs-head'), '');
    var after = { w: f.chart.width, h: f.chart.height, hw: f.host.clientWidth, hh: f.host.clientHeight, cardW: f.card.clientWidth,
      cvStyleW: f.cv.style.width, cvStyleH: f.cv.style.height };
    A.check(N + 'fs-roundtrip-restores-canvas-container-and-inline-size-exactly',
      JSON.stringify(after) === JSON.stringify(before), JSON.stringify(before) + ' -> ' + JSON.stringify(after));
    A.check(N + 'fs-wheel-mode-restored-after-exit', (function () {
      var p = wheelIn(false);
      return !p && !DS.charts.isZoomed(f.chart) && f.chart.$ds.mode === modeBefore && f.host.querySelector('.ds-chart-hint').textContent === 'Ctrl+滚轮缩放';
    })(), 'mode=' + f.chart.$ds.mode + ' hint=' + f.host.querySelector('.ds-chart-hint').textContent);
    // 四种退出方式
    f.full(); var okFull = f.on(); f.full();
    A.check(N + 'fs-exit-via-fullscreen-toolbar-button', okFull && !f.on() && fsBackdrops().length === 0, '');
    f.full(); keyEsc();
    A.check(N + 'fs-exit-via-escape', !f.on() && fsBackdrops().length === 0 && !f.host.querySelector('.ds-fs-head'), '');
    f.full(); $('.ds-fs-backdrop').click();
    A.check(N + 'fs-exit-via-backdrop-click', !f.on() && fsBackdrops().length === 0, '');
    f.full(); f.host.click(); // 点面板本身不退出
    A.check(N + 'fs-click-inside-panel-does-not-exit', f.on() && fsBackdrops().length === 1, '');
    keyEsc();
    f.full(); f.cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); var stays = f.on(); keyEsc();
    A.check(N + 'fs-other-keys-do-not-exit', stays && !f.on(), '');
    // 事件监听器不泄漏：退出后 Esc 再按不会报错也不影响（下一次进入后单次 Esc 即退出，已在上面验证）。
    // 不论图表本身的滚轮模式：page 模式下全屏也按 zoom，退出后回到 page
    DS.charts.setWheelMode('page');
    f.full();
    var pg = wheelIn(false) && DS.charts.isZoomed(f.chart);
    DS.charts.resetZoom(f.chart); keyEsc();
    var pg2 = wheelIn(false) || DS.charts.isZoomed(f.chart);
    A.check(N + 'fs-wheel-zoom-even-in-page-mode-and-page-mode-restored', pg === true && pg2 === false && f.chart.$ds.mode === 'page', 'pg=' + pg + ' pg2=' + pg2);
    DS.charts.setWheelMode('ctrl-zoom');
    // 只有一个全屏
    var f2 = fsOf('c-line');
    f.full(); DS.charts.fullscreen(f2.chart, true);
    A.check(N + 'fs-only-one-fullscreen-at-a-time', !f.on() && f2.on() && fsBackdrops().length === 1 &&
      document.querySelectorAll('.ds-fs-head').length === 1, '');
    DS.charts.fullscreen(f2.chart, false);
    // 销毁时在全屏中：遮罩与标题栏一并清掉，Esc 监听摘除（用一次性宿主，不动页面上的图表）
    (function () {
      var wrapD = document.createElement('div'); wrapD.style.width = '500px';
      var hostD = document.createElement('div'); hostD.className = 'ds-chart-host';
      var cvD = document.createElement('canvas'); hostD.appendChild(cvD); wrapD.appendChild(hostD); document.body.appendChild(wrapD);
      var cfgD = function () { return { type: 'bar', data: { labels: DS_MOCK.months().slice(0, 6), datasets: [{ label: '批次', data: DS_MOCK.series(6, 1) }] } }; };
      var cd = DS.charts.create(cvD, cfgD());
      DS.charts.fullscreen(cd, true);
      var wasOn = hostD.classList.contains('ds-chart-fullscreen') && fsBackdrops().length === 1;
      DS.charts.destroy(cd);
      A.check(N + 'fs-destroy-while-fullscreen-removes-backdrop-head-and-class', wasOn && !hostD.classList.contains('ds-chart-fullscreen') &&
        fsBackdrops().length === 0 && !hostD.querySelector('.ds-fs-head'), '');
      // 销毁后 Esc 不再有任何效果（监听已摘除）、重建的实例能正常进出全屏并精确恢复
      keyEsc();
      var rebuilt = DS.charts.create(cvD, cfgD());
      A.check(N + 'fs-rebuilt-chart-enters-and-exits-fullscreen-with-exact-restore', (function () {
        var w0 = rebuilt.width, h0 = rebuilt.height;
        hostD.querySelector('[data-act="full"]').click();
        var inFs = hostD.classList.contains('ds-chart-fullscreen') && rebuilt.width > w0;
        hostD.querySelector('[data-act="full"]').click();
        return w0 > 100 && inFs && rebuilt.width === w0 && rebuilt.height === h0 && fsBackdrops().length === 0;
      })(), '');
      DS.charts.destroy(rebuilt); wrapD.remove();
    })();
    // 宿主带 inline 宽高（或 #id 规则）时全屏面板尺寸不受影响
    (function () {
      var hostI = document.createElement('div'); hostI.className = 'ds-chart-host'; hostI.style.cssText = 'width:420px;height:210px';
      var cvI = document.createElement('canvas'); hostI.appendChild(cvI); document.body.appendChild(hostI);
      var ci = DS.charts.create(cvI, { type: 'bar', data: { labels: ['a', 'b'], datasets: [{ label: 'x', data: [1, 2] }] } });
      DS.charts.fullscreen(ci, true);
      var r = hostI.getBoundingClientRect();
      var ok = near(r.width, Math.min(0.95 * window.innerWidth, 1400)) && near(r.height, 0.92 * window.innerHeight);
      DS.charts.fullscreen(ci, false);
      A.check(N + 'fs-panel-size-ignores-inline-host-width-and-height', ok && hostI.clientWidth === 420 && hostI.clientHeight === 210, r.width + 'x' + r.height);
      DS.charts.destroy(ci); hostI.remove();
    })();
    // 无卡片的宿主：标题退回图表自己的 title 配置，再退回通用名
    (function () {
      var hostA = document.createElement('div'); hostA.className = 'ds-chart-host';
      var cvA = document.createElement('canvas'); hostA.appendChild(cvA); document.body.appendChild(hostA);
      var ca = DS.charts.create(cvA, { type: 'bar', data: { labels: ['a'], datasets: [{ label: 'x', data: [1] }] }, options: { plugins: { title: { display: false, text: '配置标题' } } } });
      DS.charts.fullscreen(ca, true);
      var t1 = hostA.querySelector('.ds-fs-title').textContent;
      DS.charts.fullscreen(ca, false); DS.charts.destroy(ca);
      var cb = DS.charts.create(cvA, { type: 'bar', data: { labels: ['a'], datasets: [{ label: 'x', data: [1] }] } });
      DS.charts.fullscreen(cb, true);
      var t2 = hostA.querySelector('.ds-fs-title').textContent;
      DS.charts.fullscreen(cb, false); DS.charts.destroy(cb); hostA.remove();
      A.check(N + 'fs-title-falls-back-to-chart-title-then-generic', t1 === '配置标题' && t2 === '图表', t1 + ' / ' + t2);
    })();

    // 桑基图、气泡图走同一形态：遮罩+面板+标题栏、往返精确恢复、数据表弹窗在最上层
    showPanel('p-comp');
    function g0(cid) { return document.getElementById(cid).closest('.ds-card').querySelector('.ds-card-title').textContent.trim(); }
    ['c-bubble', 'c-sankey', 'c-hbar'].forEach(function (cid) {
      var pair = [cid, g0(cid)];
      var g = fsOf(pair[0]);
      g.chart.resize();
      var b0 = { w: g.chart.width, h: g.chart.height, hw: g.host.clientWidth, hh: g.host.clientHeight, cw: g.card.clientWidth };
      g.full();
      var hd = g.host.querySelector('.ds-fs-head'), r = g.host.getBoundingClientRect();
      A.check(N + 'fs-' + pair[0] + '-new-form-backdrop-panel-title', g.on() && fsBackdrops().length === 1 && !!hd &&
        pair[1].length > 0 && hd.querySelector('.ds-fs-title').textContent === pair[1] && near(r.width, Math.min(0.95 * window.innerWidth, 1400)) &&
        near(r.height, 0.92 * window.innerHeight), (hd && hd.textContent) + ' ' + r.width + 'x' + r.height);
      A.check(N + 'fs-' + pair[0] + '-canvas-fills-panel-content-box', near(g.chart.width, r.width - 50, 4) && near(g.chart.height, r.height - 90, 4),
        g.chart.width + 'x' + g.chart.height + ' panel ' + r.width + 'x' + r.height);
      keyEsc();
      var b1 = { w: g.chart.width, h: g.chart.height, hw: g.host.clientWidth, hh: g.host.clientHeight, cw: g.card.clientWidth };
      A.check(N + 'fs-' + pair[0] + '-roundtrip-restores-exactly', !g.on() && JSON.stringify(b0) === JSON.stringify(b1), JSON.stringify(b0) + ' -> ' + JSON.stringify(b1));
    });
    (function () {
      var g = fsOf('c-bubble');
      g.full();
      g.host.querySelector('[data-act="table"]').click();
      var xBtn = g.host.querySelector('[data-act="fs-close"]').getBoundingClientRect();
      var hit1 = document.elementFromPoint(xBtn.left + xBtn.width / 2, xBtn.top + xBtn.height / 2);
      var hit2 = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      A.check(N + 'fs-table-modal-is-above-fullscreen-panel-incl-title-bar', !!hit1 && !!hit1.closest('.ds-modal-backdrop') &&
        !!hit2 && !!hit2.closest('.ds-modal-backdrop'), hit1 && hit1.className);
      keyEsc();  // 先关弹窗
      var stillFs = g.on() && fsBackdrops().length === 1;
      keyEsc();  // 再退全屏
      A.check(N + 'fs-escape-order-modal-first-then-fullscreen', stillFs && !g.on() && !document.querySelector('.ds-modal-backdrop:not([hidden])'), '');
    })();
    showPanel('p-play');
    chartOf('c-bar').resize();
  });

  /* ---------- 卡片标题：写图表/组件类型，演示的能力写进说明文字 ---------- */
  window.DS_SELFTEST_SUITES.push(function cardTitles(A) {
    var N = 'title-';
    // [锚点元素 id, 期望标题, 说明文字必须包含的词（可选）]
    var EXPECT = [
      ['c-bar', '柱状图', '单色'], ['c-line', '折线图', '40 周'], ['s-gantt', '甘特图', '截断'],
      ['s-heat', '热力图', '自适应'], ['t-detail', '表格', '右对齐'],
      ['t-btn', '按钮'], ['t-badge', '徽标'], ['dz', '上传区'], ['t-card', '卡片与模态'],
      ['t-banner-ok', '提示条', '状态'], ['c-hbar', '条形图', '截断'],
      ['c-pie', '环形图', '占比'], ['c-scatter', '散点图', '矩形'], ['c-combo', '双轴组合图', '量纲'],
      ['c-stacked', '堆叠柱状图', '堆叠'], ['c-area', '面积图', '半透明'],
      ['c-timeaxis', '折线图（按日期）', '日期'], ['c-bubble', '气泡图', '面积'], ['c-sankey', '桑基图', '流向'],
      ['c-waterfall', '瀑布图', '累计'], ['c-boxplot', '箱线图', '四分位']
    ];
    var dz = document.querySelector('.ds-dropzone'); if (dz) dz.id = dz.id || 'dz';
    var FORBIDDEN = /截断|空数据|空态|演示|功能|标签|填充|超长|自动/;
    var titles = Array.prototype.map.call(document.querySelectorAll('#app .ds-card-title'), function (t) { return t.textContent.trim(); });
    // 滚轮缩放方式是全页设置：在顶栏里（带「滚轮」标签），不再占一张卡片
    A.check(N + 'wheel-setting-lives-in-the-nav-not-in-a-card', !!document.querySelector('.ds-nav #wheel-seg.ds-seg') &&
      !document.querySelector('.ds-card #wheel-seg') && titles.indexOf('滚轮缩放方式') === -1 &&
      document.querySelector('.ds-nav #wheel-ctl-label').textContent === '滚轮', titles.join('|'));
    A.check(N + 'every-card-title-is-registered-in-the-rename-table', titles.length === EXPECT.length, titles.length + ' vs ' + EXPECT.length + ': ' + titles.join('|'));
    EXPECT.forEach(function (e) {
      var el = document.getElementById(e[0]);
      var card = el && el.closest('.ds-card');
      var t = card && card.querySelector('.ds-card-title');
      A.check(N + e[0] + '-is-' + e[1], !!t && t.textContent.trim() === e[1], t ? t.textContent : 'no card for #' + e[0]);
      if (e[2]) {
        var d = card && card.querySelector('.ds-card-desc');
        A.check(N + e[0] + '-desc-explains-the-capability', !!d && d.textContent.indexOf(e[2]) !== -1, d ? d.textContent : 'no desc');
      }
    });
    // 合并去重后：被并掉的那张卡片的独有能力必须写进保留下来的卡片说明里
    function descOf(id) { return document.getElementById(id).closest('.ds-card').querySelector('.ds-card-desc').textContent; }
    A.check(N + 'merged-bar-card-describes-the-long-label-truncation', /截断/.test(descOf('c-bar')) && /全称/.test(descOf('c-bar')), descOf('c-bar'));
    A.check(N + 'merged-line-card-describes-the-empty-state', /为空|空数据/.test(descOf('c-line')) && /占位/.test(descOf('c-line')), descOf('c-line'));
    A.check(N + 'merged-table-card-describes-percent-and-numeral-sorting', /百分比/.test(descOf('t-detail')) && /中文数字/.test(descOf('t-detail')), descOf('t-detail'));
    A.check(N + 'no-title-contains-a-capability-word', titles.every(function (t) { return !FORBIDDEN.test(t); }),
      titles.filter(function (t) { return FORBIDDEN.test(t); }).join('|'));
    A.check(N + 'every-chart-card-has-a-description', EXPECT.filter(function (e) { return /^c-|^s-/.test(e[0]); }).every(function (e) {
      var d = document.getElementById(e[0]).closest('.ds-card').querySelector('.ds-card-desc');
      return !!d && d.textContent.trim().length > 6;
    }), '');
  });

  /* ---------- 按类目着色（dsColorBy:'category'） ---------- */
  window.DS_SELFTEST_SUITES.push(function categoryColors(A) {
    var N = 'cby-';
    DS.theme.set('light');
    function tok(i) { return getComputedStyle(document.documentElement).getPropertyValue('--chart-s' + i).trim(); }
    function tokRgb(i) { return resolved('color', 'var(--chart-s' + i + ')'); }
    function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
    var made = [];
    function mk(cfg, w) {
      var host = document.createElement('div'); host.className = 'ds-chart-host'; host.style.cssText = 'width:' + (w || 600) + 'px;height:300px';
      var cv = document.createElement('canvas'); host.appendChild(cv); document.body.appendChild(host);
      var ch = DS.charts.create(cv, cfg);
      made.push([ch, host]);
      return ch;
    }
    function labels(n) { var o = []; for (var i = 0; i < n; i++) o.push('类' + (i + 1)); return o; }
    function vals(n) { var o = []; for (var i = 0; i < n; i++) o.push(10 + (i * 7) % 23); return o; }
    function bar(n, ds, cfgExtra, axis) {
      var cfg = { type: 'bar', data: { labels: labels(n), datasets: [Object.assign({ label: '值', data: vals(n) }, ds || {})] } };
      if (axis) cfg.options = { indexAxis: axis };
      return mk(Object.assign(cfg, cfgExtra || {}));
    }
    var seq6 = [1, 2, 3, 4, 5, 6].map(tok);

    var on6 = bar(6, { dsColorBy: 'category' });
    var d6 = on6.data.datasets[0];
    A.check(N + 'on-6-bars-take-tokens-s1-to-s6-in-order', Array.isArray(d6.backgroundColor) && d6.backgroundColor.join() === seq6.join(), JSON.stringify(d6.backgroundColor));
    A.check(N + 'on-6-bar-colors-pairwise-distinct', uniq(d6.backgroundColor).length === 6, '');
    A.check(N + 'on-border-is-the-same-color-per-bar', Array.isArray(d6.borderColor) && d6.borderColor.join() === d6.backgroundColor.join(), JSON.stringify(d6.borderColor));
    var on10 = bar(10, { dsColorBy: 'category' }).data.datasets[0];
    A.check(N + 'on-10-bars-use-all-ten-tokens-pairwise-distinct', uniq(on10.backgroundColor).length === 10 &&
      on10.backgroundColor.join() === [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(tok).join(), '');
    var on20 = bar(20, { dsColorBy: 'category' }).data.datasets[0];
    A.check(N + 'on-20-bars-cycle-the-ten-tokens', on20.backgroundColor.length === 20 && on20.backgroundColor[10] === tok(1) &&
      on20.backgroundColor[19] === tok(10) && uniq(on20.backgroundColor).length === 10, '');
    var offC = bar(6, {});
    var d0 = offC.data.datasets[0];
    A.check(N + 'off-is-one-single-series-color', typeof d0.backgroundColor === 'string' && d0.backgroundColor === tok(1) && d0.borderColor === tok(1),
      JSON.stringify(d0.backgroundColor));
    var offLegend = offC.legend && offC.legend.options.display !== false;
    var onLegend = on6.legend && on6.legend.options.display !== false;
    A.check(N + 'on-hides-the-misleading-single-swatch-legend-off-keeps-it', onLegend === false && offLegend === true, 'on=' + onLegend + ' off=' + offLegend);
    var keepLegend = bar(6, { dsColorBy: 'category' }, { options: { plugins: { legend: { display: true } } } });
    A.check(N + 'explicit-legend-display-is-respected', keepLegend.legend.options.display === true, '');
    var explicitBg = bar(6, { dsColorBy: 'category', backgroundColor: 'tomato' }).data.datasets[0];
    A.check(N + 'caller-explicit-background-is-not-overridden', explicitBg.backgroundColor === 'tomato' &&
      Array.isArray(explicitBg.borderColor) && explicitBg.borderColor[0] === tok(1), JSON.stringify(explicitBg.backgroundColor));
    var explicitBorder = bar(6, { dsColorBy: 'category', borderColor: 'tomato' }).data.datasets[0];
    A.check(N + 'caller-explicit-border-is-not-overridden', explicitBorder.borderColor === 'tomato' &&
      Array.isArray(explicitBorder.backgroundColor) && explicitBorder.backgroundColor.length === 6, JSON.stringify(explicitBorder.borderColor));
    var explicitArr = bar(3, { dsColorBy: 'category', backgroundColor: ['gold', 'plum', 'tan'] }).data.datasets[0];
    A.check(N + 'caller-explicit-color-array-is-not-overridden', explicitArr.backgroundColor.join() === 'gold,plum,tan', '');
    var multi = bar(4, { dsColorBy: 'category' });
    multi.destroy();
    var multiC = mk({ type: 'bar', data: { labels: labels(4), datasets: [
      { label: 'A', data: vals(4), dsColorBy: 'category' }, { label: 'B', data: vals(4).reverse() }] } });
    A.check(N + 'multi-series-bars-ignore-the-flag-series-colors-stay-per-series', multiC.data.datasets[0].backgroundColor === tok(1) &&
      multiC.data.datasets[1].backgroundColor === tok(2), JSON.stringify(multiC.data.datasets.map(function (x) { return x.backgroundColor; })));
    var cfgLevel = mk({ type: 'bar', dsColorBy: 'category', data: { labels: labels(5), datasets: [{ label: '值', data: vals(5) }] } });
    A.check(N + 'config-level-flag-works-like-dataset-level', Array.isArray(cfgLevel.data.datasets[0].backgroundColor) &&
      cfgLevel.data.datasets[0].backgroundColor.join() === [1, 2, 3, 4, 5].map(tok).join(), '');
    var cfgOverride = mk({ type: 'bar', dsColorBy: 'category', data: { labels: labels(3), datasets: [{ label: '值', data: vals(3), dsColorBy: 'none' }] } });
    A.check(N + 'dataset-level-flag-beats-config-level', cfgOverride.data.datasets[0].backgroundColor === tok(1), '');
    var horiz = bar(4, { dsColorBy: 'category' }, null, 'y');
    A.check(N + 'horizontal-bar-chart-is-colored-by-category-too', horiz.data.datasets[0].backgroundColor.join() === [1, 2, 3, 4].map(tok).join(), '');
    var lineC = mk({ type: 'line', data: { labels: labels(4), datasets: [{ label: '线', data: vals(4), dsColorBy: 'category' }] } });
    A.check(N + 'non-bar-types-ignore-the-flag', typeof lineC.data.datasets[0].borderColor === 'string' && lineC.data.datasets[0].borderColor === tok(1), '');

    // 真实像素：每根柱子画出来的颜色确实是对应 token（不是只验配置）
    function pixelAt(ch, i) {
      var meta = ch.getDatasetMeta(0), el = meta.data[i];
      var p = el.getProps(['x', 'y', 'base', 'width'], true);
      var sx = ch.canvas.width / ch.canvas.getBoundingClientRect().width;
      var x = Math.round(p.x * sx), y = Math.round(((p.y + p.base) / 2) * sx);
      var d = ch.canvas.getContext('2d').getImageData(x, y, 1, 1).data;
      return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')';
    }
    var px6 = [0, 1, 2, 3, 4, 5].map(function (i) { return pixelAt(on6, i); });
    A.check(N + 'rendered-pixels-of-each-bar-equal-its-token', px6.join('|') === [1, 2, 3, 4, 5, 6].map(tokRgb).join('|'), px6.join('|'));
    var pxOff = [0, 5].map(function (i) { return pixelAt(offC, i); });
    A.check(N + 'rendered-pixels-off-are-all-the-single-color', pxOff[0] === tokRgb(1) && pxOff[1] === tokRgb(1), pxOff.join('|'));

    // 主题切换跟随
    DS.theme.set('dark');
    var darkSeq = [1, 2, 3, 4, 5, 6].map(tok);
    var pxDark = [0, 1, 2, 3, 4, 5].map(function (i) { return pixelAt(on6, i); });
    A.check(N + 'theme-switch-recolors-bars-from-dark-tokens', d6.backgroundColor.join() === darkSeq.join() && darkSeq.join() !== seq6.join() &&
      d6.borderColor.join() === darkSeq.join() && pxDark.join('|') === [1, 2, 3, 4, 5, 6].map(tokRgb).join('|'), JSON.stringify(d6.backgroundColor) + ' ' + pxDark.join('|'));
    A.check(N + 'theme-switch-keeps-caller-explicit-color', explicitBg.backgroundColor === 'tomato' && explicitBorder.borderColor === 'tomato', '');
    DS.theme.set('light');
    A.check(N + 'theme-switch-back-restores-light-tokens', d6.backgroundColor.join() === seq6.join(), '');

    // demo 页：按"不同对象"的条形图开着，按月份的柱状图保持单色
    var hb = chartOf('c-hbar').data.datasets[0], bb = chartOf('c-bar').data.datasets[0];
    A.check(N + 'demo-hbar-by-instrument-has-three-distinct-token-colors', Array.isArray(hb.backgroundColor) &&
      hb.backgroundColor.join() === [1, 2, 3].map(tok).join(), JSON.stringify(hb.backgroundColor));
    A.check(N + 'demo-monthly-bar-stays-single-color', bb.backgroundColor === tok(1), '');
    made.forEach(function (m) { DS.charts.destroy(m[0]); m[1].remove(); });
  });

  /* ---------- 数量级切换（卡片标题栏的 3 / 10 / 20 分段按钮） ---------- */
  window.DS_SELFTEST_SUITES.push(function scaleSwitch(A) {
    var N = 'scale-';
    DS.theme.set('light');
    var errs = [];
    var origErr = console.error, origWarn = console.warn;
    console.error = function () { errs.push('error: ' + Array.prototype.join.call(arguments, ' ')); };
    console.warn = function () { errs.push('warn: ' + Array.prototype.join.call(arguments, ' ')); };
    function onWinErr(ev) { errs.push('window error: ' + ev.message); }
    window.addEventListener('error', onWinErr);

    function segOf(id) { return document.getElementById('seg-' + id); }
    function cardOf(id) { return segOf(id).closest('.ds-card'); }
    function btn(id, n) { return segOf(id).querySelector('[data-value="' + n + '"]'); }
    function pressed(id) {
      return Array.prototype.filter.call(segOf(id).querySelectorAll('.ds-seg-btn'), function (b) {
        return b.getAttribute('aria-pressed') === 'true';
      }).map(function (b) { return b.getAttribute('data-value'); }).join();
    }
    function inst(id) { var c = cardOf(id); return DS.charts.all().filter(function (ch) { return ch.canvas && c.contains(ch.canvas); }); }
    function cur(id) { return document.getElementById(id)._dsChart; }
    function distinctTo(ch) {
      var seen = {}; ch.data.datasets[0].data.forEach(function (f) { seen[f.to] = true; });
      return Object.keys(seen).length;
    }
    // [canvas id, 档位, 默认档, 取"数量"的函数, 期望数量函数(n)]
    var SPECS = [
      ['c-bar', [3, 6, 10, 20], 6, function (c) { return c.data.labels.length; }, function (n) { return n; }, 'p-play'],
      ['c-line', [2, 3, 10, 20], 2, function (c) { return c.data.datasets.length; }, function (n) { return n; }, 'p-play'],
      ['c-hbar', [3, 10, 20], 3, function (c) { return c.data.labels.length; }, function (n) { return n; }, 'p-comp'],
      ['c-pie', [3, 10, 20], 3, function (c) { return c.data.datasets[0].data.length; }, function (n) { return n; }, 'p-comp'],
      ['c-scatter', [3, 10, 20], 3, function (c) { return c.data.datasets.length; }, function (n) { return n; }, 'p-comp'],
      ['c-stacked', [3, 10, 20], 3, function (c) { return c.data.datasets.length; }, function (n) { return n; }, 'p-comp'],
      ['c-area', [3, 10, 20], 3, function (c) { return c.data.datasets.length; }, function (n) { return n; }, 'p-comp'],
      ['c-timeaxis', [3, 10, 20], 3, function (c) { return c.data.datasets.length; }, function (n) { return n; }, 'p-comp'],
      ['c-bubble', [3, 10, 20, 60], 60, function (c) { return c.data.datasets[0].data.length; }, function (n) { return Math.min(n, 50); }, 'p-comp'],
      ['c-sankey', [3, 10, 20, 25], 25, distinctTo, function (n) { return Math.min(n, 20); }, 'p-comp'],
      // 瀑布图：n = 增减项个数，柱数 = n + 3 个合计柱（起始、小计、期末）
      ['c-waterfall', [3, 6, 10, 20], 6, function (c) { return c.data.labels.length; }, function (n) { return n + 3; }, 'p-comp'],
      ['c-boxplot', [3, 4, 10, 20], 4, function (c) { return c.data.labels.length; }, function (n) { return n; }, 'p-comp']
    ];
    function snap(c) {   // 数据快照：标签 + 每个数据集的数据
      return JSON.stringify([c.data.labels || null, c.data.datasets.map(function (d) { return [d.label || null, d.data]; })]);
    }

    // 初始：每张适用图都有按钮组、默认档被选中
    SPECS.forEach(function (sp) {
      var id = sp[0];
      var labels = Array.prototype.map.call(segOf(id).querySelectorAll('.ds-seg-btn'), function (b) { return b.textContent; }).join();
      A.check(N + id + '-initial-has-seg-in-card-head-with-default-selected',
        !!segOf(id).closest('.ds-card-head') && segOf(id).classList.contains('ds-seg') && labels === sp[1].join() && pressed(id) === String(sp[2]) &&
          segOf(id).getAttribute('role') === 'group', labels + ' pressed=' + pressed(id));
      A.check(N + id + '-initial-count-is-the-default-scale', sp[3](cur(id)) === sp[4](sp[2]), sp[3](cur(id)) + ' vs ' + sp[4](sp[2]));
    });

    SPECS.forEach(function (sp) {
      var id = sp[0], levels = sp[1], def = sp[2], count = sp[3], expect = sp[4];
      showPanel(sp[5]);
      var snapDefault = snap(cur(id));
      var bars0 = cardOf(id).querySelectorAll('.ds-chart-toolbar').length;   // 饼图没有数据表时没有工具条
      var regBefore = DS.charts.all().length;
      var counts = [], singles = [], pressedOk = [], oldDead = [], regOk = [], bars = [], keep = [];
      levels.forEach(function (n) {
        var old = cur(id), wasPressed = pressed(id);
        // 点当前已选中的档：no-op，实例不变
        var same = btn(id, pressed(id));
        same.click();
        keep.push(cur(id) === old);
        btn(id, n).click();
        var nowC = cur(id);
        if (nowC && nowC.resize) nowC.resize();
        var c = nowC;
        counts.push(n + ':' + count(c) + '/' + expect(n));
        singles.push(inst(id).length === 1);
        pressedOk.push(pressed(id) === String(n));
        oldDead.push(String(n) === wasPressed ? old === c : (!!old && old !== c && old.canvas === null));
        regOk.push(DS.charts.all().length === regBefore);
        bars.push(cardOf(id).querySelectorAll('.ds-chart-toolbar').length);
      });
      A.check(N + id + '-each-level-gives-the-expected-count',
        levels.every(function (n, i) { return counts[i] === n + ':' + expect(n) + '/' + expect(n); }), counts.join(' '));
      A.check(N + id + '-after-each-switch-the-card-has-exactly-one-instance', singles.every(Boolean), singles.join());
      A.check(N + id + '-no-orphan-instances-registry-size-unchanged', regOk.every(Boolean), regOk.join());
      A.check(N + id + '-old-instance-destroyed-and-no-extra-toolbar', oldDead.every(Boolean) && bars.every(function (x) { return x === bars0; }) && bars0 <= 1, 'bars=' + bars.join() + ' initial=' + bars0);
      A.check(N + id + '-only-the-clicked-button-is-pressed', pressedOk.every(Boolean), pressedOk.join());
      A.check(N + id + '-clicking-the-selected-button-is-a-noop', keep.every(Boolean), keep.join());
      // 回到默认档：数据与初始快照逐字节一致
      btn(id, def).click();
      A.check(N + id + '-back-to-default-scale-restores-the-original-data', snap(cur(id)) === snapDefault && pressed(id) === String(def), '');
    });

    // 缩放/拖拽监听器只绑一次（不叠加）：重建后在同一块 canvas 上 Ctrl+滚轮只缩放"当前"实例
    (function () {
      showPanel('p-play');
      var cv = document.getElementById('c-bar');
      btn('c-bar', 10).click();
      var ch = cur('c-bar'); ch.resize();
      var ev = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
      cv.dispatchEvent(ev);
      A.check(N + 'rebuilt-chart-wheel-zoom-works-on-the-new-instance-only', DS.charts.isZoomed(ch) && ev.defaultPrevented && inst('c-bar').length === 1, '');
      btn('c-bar', 6).click();
    })();

    // 20 个类目/系列/扇区时：十色循环、图例换行不遮图、长标签截断
    showPanel('p-comp');
    btn('c-hbar', 20).click();
    var hb = cur('c-hbar'); hb.resize();
    var hbBg = hb.data.datasets[0].backgroundColor;
    var tick0 = hb.scales.y.ticks[0].label;
    A.check(N + 'c-hbar-20-ten-colors-cycle-and-long-label-truncated-with-ellipsis', hbBg.length === 20 && hbBg[10] === hbBg[0] && hbBg[19] === hbBg[9] &&
      hbBg.filter(function (x, i) { return hbBg.indexOf(x) === i; }).length === 10 && tick0.length <= 11 && tick0.slice(-1) === '…' && tick0.indexOf('全自动') === 0,
      'tick0=' + tick0);
    var fullLabel = hb.data.labels[0];
    A.check(N + 'c-hbar-20-full-label-kept-in-data-for-tooltip', fullLabel === '全自动处理仪零三号机台', fullLabel);
    btn('c-hbar', 3).click();

    function legendReport(id) {
      var c = cur(id); c.resize();
      var boxes = c.legend.legendHitBoxes || [];
      var rc = c.canvas.getBoundingClientRect(), tb = c.canvas.parentNode.querySelector('.ds-chart-toolbar');
      var tr = tb ? tb.getBoundingClientRect() : null;
      var tops = {}; boxes.forEach(function (b) { tops[Math.round(b.top)] = true; });
      var inside = boxes.every(function (b) { return b.left >= -0.5 && b.left + b.width <= c.width + 0.5 && b.top >= -0.5 && b.top + b.height <= c.height + 0.5; });
      var hitsToolbar = !!tr && boxes.some(function (b) {
        var l = rc.left + b.left, t = rc.top + b.top, r2 = l + b.width, b2 = t + b.height;
        return !(r2 <= tr.left || l >= tr.right || b2 <= tr.top || t >= tr.bottom);
      });
      return { n: boxes.length, rows: Object.keys(tops).length, inside: inside, hitsToolbar: hitsToolbar,
        legendBottom: c.legend.bottom, areaTop: c.chartArea.top, areaH: c.chartArea.bottom - c.chartArea.top, h: c.height };
    }
    [['c-line', 20, 'p-play'], ['c-area', 20, 'p-comp'], ['c-timeaxis', 20, 'p-comp'], ['c-scatter', 20, 'p-comp'], ['c-stacked', 20, 'p-comp'], ['c-pie', 20, 'p-comp']].forEach(function (t) {
      showPanel(t[2]);
      btn(t[0], t[1]).click();
      var r = legendReport(t[0]);
      A.check(N + t[0] + '-20-legend-lists-all-entries-wraps-and-never-covers-chart-or-toolbar',
        r.n === 20 && r.rows >= 2 && r.inside && !r.hitsToolbar && r.legendBottom <= r.areaTop + 1 && r.areaH > r.h * 0.4, JSON.stringify(r));
      var def = SPECS.filter(function (x) { return x[0] === t[0]; })[0][2];
      btn(t[0], def).click();
    });
    (function () {
      showPanel('p-comp');
      btn('c-pie', 20).click();
      var pc = cur('c-pie'), bg = pc.data.datasets[0].backgroundColor;
      var tokens = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return getComputedStyle(document.documentElement).getPropertyValue('--chart-s' + i).trim(); });
      A.check(N + 'c-pie-20-sector-colors-cycle-the-ten-tokens', bg.length === 20 && bg[10] === bg[0] && bg.slice(0, 10).join() === tokens.join(), JSON.stringify(bg.slice(0, 3)));
      btn('c-pie', 3).click();
    })();

    // 气泡图：数据表里的行数与气泡数一致（含 60 档的"过滤 + 取前 50"）
    (function () {
      showPanel('p-comp');
      var out = [];
      [3, 10, 20, 60].forEach(function (n) {
        btn('c-bubble', n).click();
        var c = cur('c-bubble'); c.resize();
        c.canvas.parentNode.querySelector('[data-act="table"]').click();
        out.push(n + ':' + document.querySelectorAll('#ds-chart-table tbody tr').length + '/' + c.data.datasets[0].data.length);
        DS.modal.close();
      });
      A.check(N + 'c-bubble-table-rows-equal-bubble-count-at-every-level', out.join() === '3:3/3,10:10/10,20:20/20,60:50/50', out.join());
      var m60 = DS_MOCK.bubbleItems(60), mAll = DS_MOCK.bubbleItems();
      A.check(N + 'c-bubble-60-is-the-original-60-items-and-each-small-level-has-only-qualifying-items',
        JSON.stringify(m60) === JSON.stringify(mAll) && mAll.length === 60 && [3, 10, 20].every(function (n) {
          var it = DS_MOCK.bubbleItems(n);
          return it.length === n && it.every(function (x) { return x.count >= 5; });
        }), '');
    })();

    // 桑基图：流入端下拉项数、Top-N 默认前 20 仍成立、勾选只看勾选
    (function () {
      showPanel('p-comp');
      var res = {};
      [3, 10, 20, 25].forEach(function (n) {
        btn('c-sankey', n).click();
        var items = document.querySelectorAll('#sankey-to-list .ds-sankey-drop-item:not(.all)').length;
        var cap = document.querySelector('#sankey-host .ds-sankey-caption').textContent;
        var flows = cur('c-sankey').data.datasets[0].data.length;
        res[n] = { items: items, to: distinctTo(cur('c-sankey')), flows: flows, topNote: cap.indexOf('流入端默认前 20') !== -1, flowsAll: DS_MOCK.sankeyFlows(n).length };
      });
      A.check(N + 'c-sankey-to-dropdown-lists-every-project-at-each-level', res[3].items === 3 && res[10].items === 10 && res[20].items === 20 && res[25].items === 25, JSON.stringify(res));
      A.check(N + 'c-sankey-topn-default-20-holds-at-20-and-25-projects', res[20].to === 20 && !res[20].topNote && res[25].to === 20 && res[25].topNote &&
        res[3].to === 3 && res[10].to === 10, JSON.stringify(res));
      A.check(N + 'c-sankey-visible-flows-at-small-levels-are-exactly-that-projects-flows', res[3].flows === res[3].flowsAll && res[10].flows === res[10].flowsAll &&
        res[20].flows === res[20].flowsAll, JSON.stringify(res));
      // 20 个项目时勾选一个流入端：只看勾选的那一个
      btn('c-sankey', 20).click();
      var first = document.querySelector('#sankey-to-list .ds-sankey-drop-item:not(.all) input');
      first.click();
      var only = distinctTo(cur('c-sankey')), picked = first.value;
      A.check(N + 'c-sankey-20-checking-one-target-shows-only-that-one', only === 1 && cur('c-sankey').data.datasets[0].data.every(function (f) { return f.to === picked; }) &&
        inst('c-sankey').length === 1, 'only=' + only);
      document.getElementById('sankey-clear-btn').click();
      btn('c-sankey', 25).click();
      A.check(N + 'c-sankey-25-is-the-original-universe-49-flows', DS_MOCK.sankeyFlows().length === 49 && DS_MOCK.sankeyFlows(25).length === 49 &&
        JSON.stringify(DS_MOCK.sankeyFlows(25)) === JSON.stringify(DS_MOCK.sankeyFlows()), '');
    })();

    // 堆叠柱：层数切换后"百分比堆叠"开关仍生效，且开关反过来保留层数
    (function () {
      showPanel('p-comp');
      var chk = document.getElementById('chk-stacked-percent');
      btn('c-stacked', 10).click();
      chk.checked = true; chk.dispatchEvent(new Event('change', { bubbles: true }));
      var c1 = cur('c-stacked');
      var sums = c1.data.labels.map(function (_, i) { return c1.data.datasets.reduce(function (a, d) { return a + d.data[i]; }, 0); });
      var keepLayers = c1.data.datasets.length;
      btn('c-stacked', 20).click();
      var c2 = cur('c-stacked');
      var sums2 = c2.data.labels.map(function (_, i) { return c2.data.datasets.reduce(function (a, d) { return a + d.data[i]; }, 0); });
      A.check(N + 'c-stacked-percent-toggle-and-layer-count-keep-each-other',
        keepLayers === 10 && c2.data.datasets.length === 20 && sums.every(function (x) { return Math.abs(x - 100) < 1; }) &&
          sums2.every(function (x) { return Math.abs(x - 100) < 2; }), keepLayers + ' ' + c2.data.datasets.length);
      chk.checked = false; chk.dispatchEvent(new Event('change', { bubbles: true }));
      btn('c-stacked', 3).click();
    })();

    // 全屏：重建后的图照常进出全屏、尺寸精确恢复
    (function () {
      showPanel('p-comp');
      btn('c-hbar', 10).click();
      var h = cur('c-hbar'); h.resize();
      var w0 = h.width, h0 = h.height, hostEl = h.canvas.parentNode;
      hostEl.querySelector('[data-act="full"]').click();
      var inFs = hostEl.classList.contains('ds-chart-fullscreen') && h.width > w0;
      keyEsc();
      A.check(N + 'rebuilt-chart-fullscreen-roundtrip-restores-exactly', w0 > 100 && inFs && h.width === w0 && h.height === h0 && !hostEl.classList.contains('ds-chart-fullscreen'), '');
      btn('c-hbar', 3).click();
    })();

    // DS.seg 通用组件
    (function () {
      var hostEl = document.createElement('div'); document.body.appendChild(hostEl);
      var got = [];
      var seg = DS.seg.mount(hostEl, { options: [1, { value: 2, label: '二', title: '两个' }, 3], value: 2, ariaLabel: '档位', onChange: function (v) { got.push(v); } });
      var bs = hostEl.querySelectorAll('.ds-seg-btn');
      A.check(N + 'seg-api-renders-group-buttons-and-initial-state', hostEl.classList.contains('ds-seg') && hostEl.getAttribute('role') === 'group' &&
        hostEl.getAttribute('aria-label') === '档位' && bs.length === 3 && bs[1].textContent === '二' && bs[1].title === '两个' && seg.get() === 2 &&
        bs[1].getAttribute('aria-pressed') === 'true' && bs[0].getAttribute('aria-pressed') === 'false', '');
      bs[2].click(); bs[2].click(); bs[1].click();
      A.check(N + 'seg-api-onchange-fires-only-on-a-real-change', got.join() === '3,2' && seg.get() === 2, got.join());
      seg.set(1);
      A.check(N + 'seg-api-set-updates-state-silently', seg.get() === 1 && bs[0].getAttribute('aria-pressed') === 'true' && got.join() === '3,2', got.join());
      var cs = getComputedStyle(bs[0]), cp = getComputedStyle(bs[0]);
      A.check(N + 'seg-style-pressed-uses-tint-and-ink-tokens-others-secondary', getComputedStyle(bs[0]).backgroundColor === resolved('background-color', 'var(--color-primary-tint)') &&
        getComputedStyle(bs[0]).color === resolved('color', 'var(--color-primary-ink)') && getComputedStyle(bs[2]).color === resolved('color', 'var(--color-text-secondary)'), '');
      seg.destroy(); bs[2].click();
      A.check(N + 'seg-api-destroy-removes-listener-and-markup', got.join() === '3,2' && hostEl.children.length === 0, '');
      hostEl.remove();
    })();

    // DS_MOCK 数量级生成器：确定性、前缀稳定（默认数据永远是更大规模数据的前缀）
    (function () {
      var M = DS_MOCK, j = JSON.stringify;
      A.check(N + 'mock-generators-are-deterministic', j(M.scatterSeries(20)) === j(M.scatterSeries(20)) && j(M.dailyBatches(92, 20)) === j(M.dailyBatches(92, 20)) &&
        j(M.bubbleItems(20)) === j(M.bubbleItems(20)) && j(M.sankeyFlows(10)) === j(M.sankeyFlows(10)) && j(M.stackLayers(20, 12)) === j(M.stackLayers(20, 12)) &&
        j(M.extraTrend(40, 5)) === j(M.extraTrend(40, 5)), '');
      var s3 = M.scatterSeries(3), s20 = M.scatterSeries(20);
      A.check(N + 'mock-scatter-first-three-series-identical-at-every-scale-and-default-is-three', j(s3) === j(M.scatterSeries()) && s3.length === 3 && s20.length === 20 &&
        j(s20.slice(0, 3)) === j(s3) && s20.every(function (x) { return x.data.length >= 30; }) && new Set(s20.map(function (x) { return x.label; })).size === 20, '');
      var d3 = M.dailyBatches(92), d20 = M.dailyBatches(92, 20);
      A.check(N + 'mock-daily-first-three-lines-identical-and-dates-aligned', d3.length === 3 && d20.length === 20 && j(d20.slice(0, 3)) === j(d3) &&
        d20.every(function (x) { return x.data.length === 92 && x.data[5].x === d3[0].data[5].x; }), '');
      var st3 = M.stackLayers(3, 12), st20 = M.stackLayers(20, 12);
      A.check(N + 'mock-stack-layers-prefix-stable-and-labels-distinct', j(st20.slice(0, 3)) === j(st3) && new Set(st20.map(function (x) { return x.label; })).size === 20, '');
      var f3 = M.sankeyFlows(3), fAll = M.sankeyFlows();
      A.check(N + 'mock-sankey-small-n-is-a-subset-of-the-full-flows-with-n-projects', f3.every(function (f) { return fAll.some(function (g) { return j(g) === j(f); }); }) &&
        new Set(f3.map(function (f) { return f.to; })).size === 3 && new Set(M.sankeyFlows(10).map(function (f) { return f.to; })).size === 10 && fAll.length === 49, '');
      A.check(N + 'mock-name-and-number-helpers', M.cnNum(11) === '十一' && M.cnNum(20) === '二十' && M.cnNum(15) === '十五' && M.sectorLabels(3).join() === '类别一,类别二,类别三' &&
        M.monthLabels(3).join() === '一月,二月,三月' && M.monthLabels(20)[19] === '第20月' && M.monthLabels(6).length === 6 && M.objectNames(5, ['a', 'b'], '仪器').join() === 'a,b,仪器03,仪器04,仪器05', '');
    })();

    A.check(N + 'no-console-errors-or-warnings-during-all-switching', errs.length === 0, errs.slice(0, 3).join(' | '));
    console.error = origErr; console.warn = origWarn;
    window.removeEventListener('error', onWinErr);
    showPanel('p-play');
  });
})();
