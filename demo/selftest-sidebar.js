/* demo/selftest-sidebar.js —— DS.sidebar（库组件）的断言套件，前缀 sb-。只在 ?selftest=1 下注册。
   全部在临时搭的侧栏（挂 <body> 末尾、挪到可视区外但保留布局）上测，不依赖 demo 页自己的侧栏；
   demo 页集成（分组/去重/hash/重绘）见 demo.js 里 pageSidebar 套件（前缀 pg-）。
   预言值由测试自己从 token / 视口算出，颜色一律通过"探针元素的计算色"与 token 比对。 */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('selftest') !== '1') return;
  window.DS_SELFTEST_SUITES = window.DS_SELFTEST_SUITES || [];

  function resolved(prop, value) {
    var p = document.createElement('div');
    p.style.cssText = 'position:absolute;left:-9999px;top:0;' + prop + ':' + value;
    document.body.appendChild(p);
    var out = getComputedStyle(p).getPropertyValue(prop);
    p.remove();
    return out;
  }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1 : tol); }
  function storageOk() { try { window.localStorage.getItem('x'); return true; } catch (e) { return false; } }

  window.DS_SELFTEST_SUITES.push(function sidebarLib(A) {
    var N = 'sb-';
    DS.theme.set('light');
    var KEY = 'ds-sb-selftest';
    // 样式里的 transition 会让"点击后立刻读计算样式"读到过渡起点：测试期间关掉侧栏子树的过渡，
    // 断言的是最终状态（过渡本身只是观感）。
    var noTrans = document.createElement('style');
    noTrans.textContent = '.sb-probe, .sb-probe * { transition: none !important; animation: none !important; }';
    document.head.appendChild(noTrans);

    var made = [], uid = 0;
    var ICON = '<svg class="ds-side-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle></svg>';
    function mk(opts) {
      opts = opts || {};
      var u = ++uid, pre = 'sbp' + u + '-';
      var box = document.createElement('div');
      box.className = 'sb-probe';
      box.style.cssText = 'position:absolute;left:-9999px;top:0;width:1000px';
      var html =
        '<div class="ds-layout">' +
        '<nav class="ds-sidebar" aria-label="测试">' +
        '<div class="ds-side-group">组一</div>' +
        '<button type="button" class="ds-side-item" data-panel="sbp-a">' + ICON + '<span class="ds-side-label">甲类</span></button>' +
        '<button type="button" class="ds-side-item" data-panel="sbp-b">' + ICON + '<span class="ds-side-label">乙类</span></button>' +
        '<button type="button" class="ds-side-item" data-panel="sbp-c">' + ICON + '<span class="ds-side-label">丙类</span></button>' +
        '</nav><div class="ds-side-main">' +
        '<section class="ds-side-panel" id="sbp-a"><p>A</p></section>' +
        '<section class="ds-side-panel" id="sbp-b"><div class="ds-chart-host"><canvas id="sbp-cv"></canvas></div><div class="ds-chart-host" id="sbp-heat"></div></section>' +
        '<section class="ds-side-panel" id="sbp-c"><p>C</p></section>' +
        '</div></div>';
      box.innerHTML = html.replace(/sbp-/g, pre);
      document.body.appendChild(box);
      // 面板初始状态由 init 决定，不预先写 hidden（init 必须自己把未选中的收起来）
      var calls = [];
      var ctl = DS.sidebar.init(box.querySelector('.ds-sidebar'), Object.assign({
        storageKey: KEY, onChange: function (id, panel, info) { calls.push([id, panel, info]); }
      }, opts));
      var o = { box: box, side: box.querySelector('.ds-sidebar'), ctl: ctl, calls: calls,
        id: function (k) { return pre + k; },
        q: function (k) { return box.querySelector('#' + pre + k); },
        item: function (k) { return box.querySelector('[data-panel="' + pre + k + '"].ds-side-item'); },
        panel: function (k) { return box.querySelector('#' + pre + k); },
        visible: function () { return ['a', 'b', 'c'].filter(function (k) { return !box.querySelector('#' + pre + k).hidden; }).join(''); },
        current: function () { return ['a', 'b', 'c'].filter(function (k) { return box.querySelector('[data-panel="' + pre + k + '"].ds-side-item').getAttribute('aria-current') === 'true'; }).join(''); } };
      made.push(o);
      return o;
    }
    function clearStore() { try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
    function tipEl() { return document.querySelector('.ds-side-tip'); }
    function fire(el, type, extra) { el.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true }, extra || {}))); }
    clearStore();

    // ---------- 初始化 / 选中 / 切换 ----------
    var s = mk();
    A.check(N + 'init-returns-controller', !!s.ctl && ['select', 'showAll', 'current', 'collapse', 'toggle', 'isCollapsed', 'destroy'].every(function (k) { return typeof s.ctl[k] === 'function'; }), '');
    A.check(N + 'init-is-idempotent-same-controller', DS.sidebar.init(s.side) === s.ctl, '');
    A.check(N + 'init-on-missing-root-returns-null', DS.sidebar.init('#no-such-sidebar-root') === null, '');
    A.check(N + 'default-selects-first-item-only', s.current() === 'a' && s.visible() === 'a', s.current() + '/' + s.visible());
    A.check(N + 'initial-onchange-fires-once-with-panel-and-initial-flag', s.calls.length === 1 && s.calls[0][0] === s.id('a') && s.calls[0][1] === s.panel('a') && s.calls[0][2].initial === true, JSON.stringify(s.calls.map(function (c) { return c[0]; })));
    s.item('b').click();
    A.check(N + 'click-shows-only-that-panel', s.visible() === 'b' && s.current() === 'b', s.visible() + '/' + s.current());
    A.check(N + 'click-fires-onchange-once-with-id-and-panel', s.calls.length === 2 && s.calls[1][0] === s.id('b') && s.calls[1][1] === s.panel('b') && s.calls[1][2].all === false, s.calls.length);
    s.item('b').click();
    A.check(N + 'clicking-the-current-item-again-does-not-refire', s.calls.length === 2, s.calls.length);
    s.item('c').click();
    A.check(N + 'switching-away-hides-the-previous-panel', s.visible() === 'c' && s.panel('b').hidden === true && s.panel('a').hidden === true, s.visible());
    A.check(N + 'select-api-switches-and-reports-success', s.ctl.select(s.id('a')) === true && s.visible() === 'a' && s.ctl.current() === s.id('a'), s.visible());
    A.check(N + 'select-unknown-id-returns-false-and-changes-nothing', s.ctl.select('nope') === false && s.visible() === 'a' && s.calls.length === 4, s.visible());
    var s2 = mk({ value: 'sbp' + (uid + 1) + '-c' });
    A.check(N + 'value-option-picks-initial-item', s2.current() === 'c' && s2.visible() === 'c', s2.current());
    var s3 = mk({ value: 'bogus' });
    A.check(N + 'bad-value-option-falls-back-to-first-item', s3.current() === 'a' && s3.visible() === 'a', s3.current());

    // ---------- 选中态外观：左侧 3px 主色条 + 图标主色（颜色走 token） ----------
    var primary = resolved('color', 'var(--color-primary)');
    var selCs = getComputedStyle(s.item('a'));
    var idleCs = getComputedStyle(s.item('b'));
    A.check(N + 'selected-has-3px-primary-left-bar', selCs.borderLeftWidth === '3px' && selCs.borderLeftColor === primary, selCs.borderLeftWidth + ' ' + selCs.borderLeftColor + ' vs ' + primary);
    A.check(N + 'unselected-left-bar-is-transparent', idleCs.borderLeftWidth === '3px' && idleCs.borderLeftColor !== primary, idleCs.borderLeftColor);
    A.check(N + 'selected-icon-is-primary-and-fully-opaque', getComputedStyle(s.item('a').querySelector('.ds-side-icon')).color === primary && getComputedStyle(s.item('a').querySelector('.ds-side-icon')).opacity === '1', getComputedStyle(s.item('a').querySelector('.ds-side-icon')).color);
    A.check(N + 'unselected-icon-is-dimmed', getComputedStyle(s.item('b').querySelector('.ds-side-icon')).opacity === '0.7', getComputedStyle(s.item('b').querySelector('.ds-side-icon')).opacity);
    A.check(N + 'selected-background-is-primary-tint-token', selCs.backgroundColor === resolved('background-color', 'var(--color-primary-tint)') && idleCs.backgroundColor !== selCs.backgroundColor, selCs.backgroundColor);
    A.check(N + 'icon-is-18px', near(parseFloat(getComputedStyle(s.item('a').querySelector('.ds-side-icon')).width), 18, 0.5), '');
    DS.theme.set('dark');
    A.check(N + 'selected-bar-follows-dark-theme-token', getComputedStyle(s.item('a')).borderLeftColor === resolved('color', 'var(--color-primary)') && getComputedStyle(s.item('a')).borderLeftColor !== primary, getComputedStyle(s.item('a')).borderLeftColor);
    DS.theme.set('light');

    // ---------- 键盘可达 ----------
    A.check(N + 'items-are-buttons-so-enter-and-space-work-natively', s.box.querySelectorAll('.ds-side-item').length === 3 && Array.prototype.every.call(s.box.querySelectorAll('.ds-side-item'), function (b) { return b.tagName === 'BUTTON' && b.type === 'button' && b.tabIndex === 0; }), '');
    s.item('a').focus();
    s.item('a').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    var f1 = document.activeElement === s.item('b');
    s.item('b').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    var f2 = document.activeElement === s.item('c');
    s.item('c').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    var f3 = document.activeElement === s.item('c');
    s.item('c').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    var f4 = document.activeElement === s.item('b');
    s.item('b').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    A.check(N + 'arrow-home-end-move-focus-between-items', f1 && f2 && f3 && f4 && document.activeElement === s.item('a'), [f1, f2, f3, f4].join());
    A.check(N + 'arrow-keys-move-focus-only-selection-unchanged', s.current() === 'a', s.current());
    A.check(N + 'toggle-button-is-a-button-with-aria-expanded', s.side.querySelector('.ds-side-toggle').tagName === 'BUTTON' && s.side.querySelector('.ds-side-toggle').getAttribute('aria-expanded') === 'true', '');
    A.check(N + 'toggle-is-the-first-child-and-says-collapse', s.side.firstElementChild.classList.contains('ds-side-toggle') && s.side.querySelector('.ds-side-toggle .ds-side-label').textContent === '折叠' && s.side.querySelector('.ds-side-toggle-icon').textContent === '«', '');

    // ---------- 折叠 / 展开 ----------
    var wOpen = s.side.getBoundingClientRect().width;
    A.check(N + 'expanded-width-is-230', near(wOpen, 230, 0.5), wOpen);
    var labelsShown = getComputedStyle(s.item('a').querySelector('.ds-side-label')).display !== 'none';
    s.side.querySelector('.ds-side-toggle').click();
    A.check(N + 'toggle-click-collapses', s.ctl.isCollapsed() === true && s.side.classList.contains('ds-collapsed'), '');
    A.check(N + 'collapsed-width-is-52', near(s.side.getBoundingClientRect().width, 52, 0.5), s.side.getBoundingClientRect().width);
    A.check(N + 'collapsed-hides-labels-but-keeps-icons', labelsShown && getComputedStyle(s.item('a').querySelector('.ds-side-label')).display === 'none' && s.item('a').querySelector('.ds-side-icon').getBoundingClientRect().width > 17, '');
    A.check(N + 'collapsed-item-is-at-least-44px-tall-and-centered', s.item('a').getBoundingClientRect().height >= 44 && getComputedStyle(s.item('a')).justifyContent === 'center', s.item('a').getBoundingClientRect().height);
    A.check(N + 'collapsed-keeps-the-selected-bar', getComputedStyle(s.item('a')).borderLeftColor === primary, '');
    A.check(N + 'collapsed-group-heading-text-is-hidden', s.side.querySelector('.ds-side-group').getBoundingClientRect().height < 2, s.side.querySelector('.ds-side-group').getBoundingClientRect().height);
    A.check(N + 'collapsed-toggle-shows-expand-arrow-and-aria', s.side.querySelector('.ds-side-toggle-icon').textContent === '»' && s.side.querySelector('.ds-side-toggle').getAttribute('aria-expanded') === 'false' && !!s.side.querySelector('.ds-side-toggle').getAttribute('aria-label'), '');
    A.check(N + 'collapsed-items-get-aria-label-from-their-text', s.item('a').getAttribute('aria-label') === '甲类' && s.item('c').getAttribute('aria-label') === '丙类', s.item('a').getAttribute('aria-label'));
    A.check(N + 'collapsed-main-area-takes-the-freed-width', near(s.box.querySelector('.ds-side-main').getBoundingClientRect().width, 1000 - 52 - 24, 1), s.box.querySelector('.ds-side-main').getBoundingClientRect().width);
    // 折叠时悬停出文字提示
    A.check(N + 'no-tooltip-before-hover', !tipEl() || tipEl().hidden, '');
    fire(s.item('b'), 'mouseover');
    var tp = tipEl(), ir = s.item('b').getBoundingClientRect();
    A.check(N + 'collapsed-hover-shows-tooltip-with-label-text', !!tp && !tp.hidden && tp.textContent === '乙类', tp ? tp.textContent : 'no tip');
    A.check(N + 'tooltip-sits-right-of-the-item-and-vertically-centered', !!tp && near(tp.getBoundingClientRect().left, ir.right + 8, 1.5) && near(tp.getBoundingClientRect().top + tp.getBoundingClientRect().height / 2, ir.top + ir.height / 2, 1.5), tp ? JSON.stringify(tp.getBoundingClientRect()) : '');
    A.check(N + 'tooltip-is-fixed-and-ignores-pointer', !!tp && getComputedStyle(tp).position === 'fixed' && getComputedStyle(tp).pointerEvents === 'none', '');
    A.check(N + 'tooltip-colors-are-text-on-surface-tokens', !!tp && getComputedStyle(tp).backgroundColor === resolved('background-color', 'var(--color-text)') && getComputedStyle(tp).color === resolved('color', 'var(--color-surface)'), '');
    fire(s.item('b'), 'mouseout', { relatedTarget: document.body });
    A.check(N + 'mouseout-hides-tooltip', tipEl().hidden === true, '');
    s.item('c').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    A.check(N + 'keyboard-focus-also-shows-tooltip', !tipEl().hidden && tipEl().textContent === '丙类', tipEl().textContent);
    s.item('c').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    A.check(N + 'blur-hides-tooltip', tipEl().hidden === true, '');
    fire(s.side.querySelector('.ds-side-toggle'), 'mouseover');
    A.check(N + 'collapsed-toggle-also-gets-a-tooltip', !tipEl().hidden && !!tipEl().textContent, tipEl().textContent);
    fire(s.side.querySelector('.ds-side-toggle'), 'mouseout', { relatedTarget: document.body });
    // 展开
    s.ctl.toggle();
    A.check(N + 'second-toggle-expands-again', s.ctl.isCollapsed() === false && near(s.side.getBoundingClientRect().width, 230, 0.5) && getComputedStyle(s.item('a').querySelector('.ds-side-label')).display !== 'none', '');
    A.check(N + 'expanded-items-drop-the-aria-label', s.item('a').getAttribute('aria-label') === null && s.side.querySelector('.ds-side-toggle-icon').textContent === '«', '');
    fire(s.item('b'), 'mouseover');
    A.check(N + 'expanded-hover-shows-no-tooltip', tipEl().hidden === true, '');
    fire(s.item('b'), 'mouseout', { relatedTarget: document.body });
    s.ctl.collapse(true);
    fire(s.item('b'), 'mouseover');
    var shownBeforeExpand = !tipEl().hidden;
    s.ctl.collapse(false);
    A.check(N + 'expanding-while-tooltip-is-up-hides-it', shownBeforeExpand && tipEl().hidden === true, '');
    fire(s.item('b'), 'mouseout', { relatedTarget: document.body });
    A.check(N + 'collapse-api-is-explicit-not-a-toggle', (s.ctl.collapse(true), s.ctl.collapse(true), s.ctl.isCollapsed()) === true && (s.ctl.collapse(false), s.ctl.collapse(false), s.ctl.isCollapsed()) === false, '');

    // ---------- 折叠状态持久化；存储不可用时静默降级 ----------
    clearStore();
    var p1 = mk();
    A.check(N + 'default-is-expanded-when-nothing-stored', p1.ctl.isCollapsed() === false, '');
    p1.ctl.collapse(true);
    var p2 = mk();
    if (storageOk()) {
      A.check(N + 'collapsed-state-is-written-to-localstorage', window.localStorage.getItem(KEY) === '1', String(window.localStorage.getItem(KEY)));
      A.check(N + 'collapsed-state-survives-a-fresh-init-simulated-reload', p2.ctl.isCollapsed() === true && p2.side.classList.contains('ds-collapsed') && near(p2.side.getBoundingClientRect().width, 52, 0.5), '');
      p2.ctl.collapse(false);
      A.check(N + 'expanded-state-is-written-too', window.localStorage.getItem(KEY) === '0' && mk().ctl.isCollapsed() === false, String(window.localStorage.getItem(KEY)));
      window.localStorage.setItem(KEY, 'garbage');
      A.check(N + 'unrecognised-stored-value-falls-back-to-collapsed-option', mk({ collapsed: true }).ctl.isCollapsed() === true && mk().ctl.isCollapsed() === false, '');
      window.localStorage.setItem(KEY, '0');
      A.check(N + 'stored-value-wins-over-collapsed-option', mk({ collapsed: true }).ctl.isCollapsed() === false, '');
    } else {
      A.check(N + 'storage-denied-run-still-collapses-in-memory', p1.ctl.isCollapsed() === true && p1.side.classList.contains('ds-collapsed'), '');
      A.check(N + 'storage-denied-run-starts-expanded-on-fresh-init', p2.ctl.isCollapsed() === false, '');
    }
    clearStore();
    // 模拟存储被禁用（getter 抛 SecurityError）：init / 折叠 / 展开都不得抛
    var d0 = Object.getOwnPropertyDescriptor(window, 'localStorage');
    var threw = null, q1 = null;
    Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { throw new DOMException('denied', 'SecurityError'); } });
    try {
      q1 = mk({ collapsed: true });
      q1.ctl.collapse(false);
      q1.ctl.toggle();
      q1.side.querySelector('.ds-side-toggle').click();
    } catch (e) { threw = e; }
    if (d0) Object.defineProperty(window, 'localStorage', d0); else delete window.localStorage;
    A.check(N + 'storage-throwing-never-crashes-init-or-toggle', threw === null && !!q1, String(threw));
    A.check(N + 'storage-throwing-state-still-works-in-memory', !!q1 && q1.ctl.isCollapsed() === false && q1.ctl.toggle() === undefined && q1.ctl.isCollapsed() === true, '');
    A.check(N + 'storage-throwing-collapsed-option-is-honoured', q1 && (function () { var d = Object.getOwnPropertyDescriptor(window, 'localStorage'); Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { throw new DOMException('denied', 'SecurityError'); } }); var x; try { x = mk({ collapsed: true }).ctl.isCollapsed(); } finally { if (d) Object.defineProperty(window, 'localStorage', d); else delete window.localStorage; } return x; })() === true, '');

    // ---------- 淡入：纯 CSS 动画，可见面板上有、隐藏面板 display:none ----------
    var fadeCs = getComputedStyle(s.panel('a'));
    // noTrans 样式把动画关了；读规则文本核对真实样式表里的声明
    var ruleCss = [];
    Array.prototype.forEach.call(document.styleSheets, function (ss) {
      Array.prototype.forEach.call(ss.cssRules, function (r) { if (r.type === CSSRule.KEYFRAMES_RULE && r.name === 'ds-side-fade') ruleCss.push(r.cssText); });
    });
    A.check(N + 'fade-in-is-a-css-keyframes-animation', ruleCss.length === 1 && /opacity:\s*0/.test(ruleCss[0]) && /opacity:\s*1/.test(ruleCss[0]), ruleCss.join('|'));
    var decl = '';
    Array.prototype.forEach.call(document.styleSheets, function (ss) {
      Array.prototype.forEach.call(ss.cssRules, function (r) { if (r.selectorText === '.ds-side-panel') decl = r.style.animation || r.style.animationName; });
    });
    A.check(N + 'panel-rule-uses-300ms-fade', /ds-side-fade/.test(decl) && /0\.3s|300ms/.test(decl), decl);
    A.check(N + 'hidden-panel-is-display-none', fadeCs.display !== 'none' && getComputedStyle(s.panel('c')).display === 'none', fadeCs.display);

    // ---------- showAll（兼容/打印用）：全部面板可见、无选中项 ----------
    var n0 = s.calls.length;
    s.ctl.showAll();
    A.check(N + 'showall-shows-every-panel-and-clears-selection', s.visible() === 'abc' && s.current() === '' && s.ctl.current() === null, s.visible() + '/' + s.current());
    A.check(N + 'showall-fires-onchange-null-with-all-flag', s.calls.length === n0 + 1 && s.calls[n0][0] === null && s.calls[n0][2].all === true, JSON.stringify(s.calls[n0]));
    s.item('a').click();
    A.check(N + 'click-after-showall-narrows-to-that-panel-again', s.visible() === 'a' && s.current() === 'a' && s.calls.length === n0 + 2, s.visible());
    s.ctl.showAll();
    s.item('b').click();
    A.check(N + 'click-after-showall-works-for-a-different-item-too', s.visible() === 'b', s.visible());

    // ---------- 隐藏面板里的图表 / SVG：切回来必须按真实尺寸重算，不新增实例 ----------
    var hostW = s.panel('b').querySelector('.ds-chart-host');
    var cv = s.box.querySelector('#' + s.id('cv'));
    s.ctl.select(s.id('a'));                      // 让 b 隐藏（0x0）后再建图
    var ch = DS.charts.create(cv, { type: 'bar', data: { labels: ['x', 'y', 'z'], datasets: [{ label: 's', data: [3, 5, 4] }] } });
    DS.svg.gantt(s.box.querySelector('#' + s.id('heat')), [{ label: '甲', bars: [{ start: 0, end: 3, series: 0 }] }]);
    // 甘特图（2026-10-23 起为 HTML 元素绘制）把绘制时取样的宿主宽度写在根元素的 data-gantt-width 上
    function ganttW() { var r = s.box.querySelector('#' + s.id('heat') + ' [data-gantt]'); return r ? r.getAttribute('data-gantt-width') : 'none'; }
    var hiddenW = ch.width, hiddenVb = ganttW();
    var regBefore = DS.charts.all().length;
    A.check(N + 'precondition-chart-in-hidden-panel-is-zero-sized', hiddenW === 0 && hostW.clientWidth === 0, hiddenW + '/' + hostW.clientWidth);
    A.check(N + 'precondition-hidden-svg-was-drawn-with-the-640-fallback', hiddenVb === '640', hiddenVb);
    s.ctl.select(s.id('b'));
    A.check(N + 'select-resizes-chart-to-the-real-host-width', ch.width > 100 && ch.width === hostW.clientWidth && hostW.clientWidth > 100, ch.width + ' vs ' + hostW.clientWidth);
    A.check(N + 'select-resizes-chart-height-to-the-host', near(ch.height, hostW.clientHeight, 1) && ch.height > 100, ch.height + ' vs ' + hostW.clientHeight);
    A.check(N + 'select-redraws-svg-at-the-real-host-width', ganttW() === String(s.box.querySelector('#' + s.id('heat')).clientWidth) && s.box.querySelector('#' + s.id('heat')).clientWidth !== 640, ganttW() + ' host ' + s.box.querySelector('#' + s.id('heat')).clientWidth);
    for (var i = 0; i < 6; i++) { s.ctl.select([s.id('a'), s.id('b'), s.id('c')][i % 3]); }
    s.ctl.select(s.id('b'));
    A.check(N + 'many-switches-do-not-grow-the-instance-registry', DS.charts.all().length === regBefore && DS.charts.all().indexOf(ch) !== -1, DS.charts.all().length + ' vs ' + regBefore);
    A.check(N + 'many-switches-keep-exactly-one-svg-per-host', s.box.querySelectorAll('#' + s.id('heat') + ' [data-gantt]').length === 1 && s.box.querySelectorAll('#' + s.id('heat') + ' [data-gantt-bar]').length === 1, '');
    A.check(N + 'chart-still-matches-host-after-many-switches', ch.width === hostW.clientWidth && ch.height === hostW.clientHeight, ch.width + 'x' + ch.height);
    s.ctl.select(s.id('a'));
    A.check(N + 'resizein-skips-hidden-panels-and-counts-visible-ones', DS.charts.resizeIn(s.panel('b')) === 0 && DS.svg.redrawIn(s.panel('b')) === 0, '');
    s.ctl.select(s.id('b'));
    A.check(N + 'resizein-reports-the-visible-instance-count', DS.charts.resizeIn(s.panel('b')) === 1 && DS.svg.redrawIn(s.panel('b')) === 1 && DS.charts.resizeIn('#' + s.id('b')) === 1, '');
    // 折叠/展开改变内容区宽度：可见面板里的图表跟着按新宽度重算（不靠 ResizeObserver）
    var wOpenChart = ch.width;
    s.ctl.collapse(true);
    A.check(N + 'collapse-resizes-the-visible-chart-to-the-wider-area', ch.width > wOpenChart + 100 && near(ch.width, hostW.clientWidth, 1), wOpenChart + ' -> ' + ch.width + ' host ' + hostW.clientWidth);
    s.ctl.collapse(false);
    A.check(N + 'expand-resizes-the-visible-chart-back', near(ch.width, wOpenChart, 1) && near(ch.width, hostW.clientWidth, 1), ch.width + ' host ' + hostW.clientWidth);
    DS.charts.destroy(ch);

    // ---------- 窄屏（<=760px）变顶部横排：同源 iframe 设宽度，媒体查询看到的就是 iframe 宽 ----------
    function probeAt(width, collapsed) {
      var ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:absolute;left:-99999px;top:0;border:0;height:700px;width:' + width + 'px';
      document.body.appendChild(ifr);
      var css = [].map.call(document.querySelectorAll('style'), function (x) { return x.textContent; }).join('\n');
      var d = ifr.contentDocument;
      d.open();
      d.write('<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>' + css + '</style></head><body>' +
        '<div class="ds-layout"><nav class="ds-sidebar' + (collapsed ? ' ds-collapsed' : '') + '">' +
        '<button type="button" class="ds-side-toggle"><span class="ds-side-toggle-icon">«</span><span class="ds-side-label">折叠</span></button>' +
        '<div class="ds-side-group">组</div>' +
        '<button type="button" class="ds-side-item" data-panel="p1" aria-current="true">' + ICON + '<span class="ds-side-label">甲类</span></button>' +
        '<button type="button" class="ds-side-item" data-panel="p2">' + ICON + '<span class="ds-side-label">乙类</span></button>' +
        '<button type="button" class="ds-side-item" data-panel="p3">' + ICON + '<span class="ds-side-label">丙类</span></button>' +
        '</nav><div class="ds-side-main"><section class="ds-side-panel">内容</section></div></div></body></html>');
      d.close();
      var sd = d.querySelector('.ds-sidebar'), items = d.querySelectorAll('.ds-side-item');
      var scs = d.defaultView.getComputedStyle(sd);
      var out = { width: width, docW: d.documentElement.clientWidth, sideW: sd.getBoundingClientRect().width, sideTop: sd.getBoundingClientRect().top,
        position: scs.position, dir: scs.flexDirection, wrap: scs.flexWrap,
        layoutDir: d.defaultView.getComputedStyle(d.querySelector('.ds-layout')).flexDirection,
        toggle: d.defaultView.getComputedStyle(d.querySelector('.ds-side-toggle')).display,
        group: d.defaultView.getComputedStyle(d.querySelector('.ds-side-group')).display,
        itemTops: [].map.call(items, function (b) { return Math.round(b.getBoundingClientRect().top); }),
        itemLefts: [].map.call(items, function (b) { return Math.round(b.getBoundingClientRect().left); }),
        label: d.defaultView.getComputedStyle(items[0].querySelector('.ds-side-label')).display,
        mainTop: d.querySelector('.ds-side-main').getBoundingClientRect().top,
        sideBottom: sd.getBoundingClientRect().bottom,
        barBottom: d.defaultView.getComputedStyle(items[0]).borderBottomColor, barLeft: d.defaultView.getComputedStyle(items[0]).borderLeftWidth };
      ifr.remove();
      return out;
    }
    var wide = probeAt(1000, false), narrow = probeAt(700, false), narrowC = probeAt(700, true), edge = probeAt(761, false), edge760 = probeAt(760, false);
    A.check(N + 'wide-is-a-left-column-230px-sticky', wide.layoutDir === 'row' && near(wide.sideW, 230, 0.5) && wide.position === 'sticky' && wide.dir === 'column' && wide.toggle !== 'none', JSON.stringify(wide));
    A.check(N + 'wide-items-stack-vertically', wide.itemTops[0] < wide.itemTops[1] && wide.itemTops[1] < wide.itemTops[2] && wide.itemLefts[0] === wide.itemLefts[1], JSON.stringify(wide.itemTops));
    A.check(N + 'narrow-700-layout-stacks-sidebar-above-content', narrow.layoutDir === 'column' && narrow.position === 'static' && narrow.mainTop >= narrow.sideBottom - 1, JSON.stringify(narrow));
    A.check(N + 'narrow-700-sidebar-spans-the-full-width', near(narrow.sideW, narrow.docW, 1.5), narrow.sideW + ' vs ' + narrow.docW);
    A.check(N + 'narrow-700-menu-is-a-horizontal-row', narrow.dir === 'row' && narrow.wrap === 'wrap' && narrow.itemTops[0] === narrow.itemTops[1] && narrow.itemTops[1] === narrow.itemTops[2] && narrow.itemLefts[0] < narrow.itemLefts[1] && narrow.itemLefts[1] < narrow.itemLefts[2], JSON.stringify(narrow));
    A.check(N + 'narrow-700-hides-toggle-and-group-heading-keeps-labels', narrow.toggle === 'none' && narrow.group === 'none' && narrow.label !== 'none', JSON.stringify(narrow));
    A.check(N + 'narrow-700-selected-mark-moves-to-the-bottom-edge', narrow.barLeft === '0px' && narrow.barBottom === primary, narrow.barLeft + ' ' + narrow.barBottom);
    A.check(N + 'narrow-ignores-a-persisted-collapsed-state', narrowC.dir === 'row' && narrowC.label !== 'none' && near(narrowC.sideW, narrow.sideW, 1), JSON.stringify(narrowC));
    A.check(N + 'breakpoint-761-still-wide-760-already-narrow', edge.layoutDir === 'row' && edge760.layoutDir === 'column', edge.layoutDir + '/' + edge760.layoutDir);
    // ---------- 中等宽度自动收成图标栏（autoCollapseBelow，默认 1100） ----------
    // 自动收起看的是窗口视口（matchMedia），主页面固定 1440 宽测不到：在同源 iframe 里放一份真实的库脚本
    // （页面上除测试脚本外的全部内联脚本：Chart.js + interactions/sidebar + charts…）+ 一个两列卡片网格，
    // 改 iframe 宽度 = 改它的视口。改宽后手动派发 resize（headless 下浏览器自己的 resize 派发时机不可控，
    // 库的处理函数幂等，真实浏览器里多派发一次无害）。iframe 的 localStorage 与主页面同源共享，用独立的键。
    var AKEY = 'ds-sb-auto-selftest';
    var LIB_JS = [].filter.call(document.querySelectorAll('script'), function (sc) {
      return !sc.src && sc.textContent.indexOf('DS_SELFTEST') === -1 && !/get\('nostorage'\)/.test(sc.textContent);
    }).map(function (sc) { return sc.textContent; });
    var PAGE_CSS = [].map.call(document.querySelectorAll('style'), function (x) { return x.textContent; }).join('\n');
    var frames = [];
    function autoFrame(width, extra, stored) {
      var ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:absolute;left:-99999px;top:0;border:0;height:1400px;width:' + width + 'px';
      document.body.appendChild(ifr);
      var w = ifr.contentWindow, d = ifr.contentDocument;
      d.open();
      d.write('<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>' + PAGE_CSS + '</style>' +
        '<style>*, *::before, *::after { transition: none !important; animation: none !important; }</style></head><body>' +
        '<div class="ds-wrap"><div class="ds-layout"><nav class="ds-sidebar" id="as" aria-label="测试">' +
        '<button type="button" class="ds-side-item" data-panel="ap-a">' + ICON + '<span class="ds-side-label">甲类</span></button>' +
        '<button type="button" class="ds-side-item" data-panel="ap-b">' + ICON + '<span class="ds-side-label">乙类</span></button>' +
        '</nav><div class="ds-side-main"><section class="ds-side-panel" id="ap-a"><div class="ds-grid ds-charts-grid">' +
        '<div class="ds-card"><div class="ds-chart-host"><canvas id="ac1"></canvas></div></div>' +
        '<div class="ds-card"><div class="ds-chart-host"><canvas id="ac2"></canvas></div></div>' +
        '</div></section><section class="ds-side-panel" id="ap-b"><p>乙</p></section></div></div></div></body></html>');
      d.close();
      LIB_JS.forEach(function (t) { var sc = d.createElement('script'); sc.text = t; d.body.appendChild(sc); });
      try { if (stored == null) w.localStorage.removeItem(AKEY); else w.localStorage.setItem(AKEY, stored); } catch (e) { /* ignore */ }
      w.DS.charts.init({ wheel: 'ctrl-zoom' });
      var ctl = w.DS.sidebar.init(d.getElementById('as'), Object.assign({ storageKey: AKEY }, extra || {}));
      var cfg = function () { return { type: 'bar', data: { labels: ['甲', '乙', '丙'], datasets: [{ label: '量', data: [3, 5, 4] }] } }; };
      var f = { ifr: ifr, w: w, d: d, ctl: ctl, charts: [w.DS.charts.create(d.getElementById('ac1'), cfg()), w.DS.charts.create(d.getElementById('ac2'), cfg())] };
      frames.push(f);
      return f;
    }
    function resizeTo(f, width) {
      f.ifr.style.width = width + 'px';
      void f.ifr.offsetWidth; void f.d.documentElement.clientWidth;   // 先把新宽度排版进 iframe 视口
      f.w.dispatchEvent(new f.w.Event('resize'));
    }
    function stored() { try { return frames[0].w.localStorage.getItem(AKEY); } catch (e) { return 'denied'; } }
    function measure(f) {
      var d = f.d, side = d.getElementById('as'), cards = [].slice.call(d.querySelectorAll('.ds-card'));
      var hosts = cards.map(function (c) { return c.querySelector('.ds-chart-host'); });
      return { vw: d.documentElement.clientWidth, collapsed: f.ctl.isCollapsed(), auto: f.ctl.isAuto(),
        sideW: Math.round(side.getBoundingClientRect().width * 10) / 10,
        layoutDir: f.w.getComputedStyle(d.querySelector('.ds-layout')).flexDirection,
        labels: f.w.getComputedStyle(side.querySelector('.ds-side-label')).display,
        cardW: cards.map(function (c) { return Math.round(c.getBoundingClientRect().width * 10) / 10; }),
        cardTop: cards.map(function (c) { return Math.round(c.getBoundingClientRect().top); }),
        hostW: hosts.map(function (h) { return h.clientWidth; }), cardInner: cards.map(function (c) { return c.clientWidth - 48; }),
        chartW: f.charts.map(function (c) { return c.width; }), docOverflow: d.documentElement.scrollWidth - d.documentElement.clientWidth,
        stored: stored() };
    }
    // 两列卡片的期望宽度：内容区 = 视口 - .ds-wrap 左右 32 - 侧栏 - gap 24；两列再扣一个 gap 24
    function expectCard(m) { return (m.vw - 64 - m.sideW - 24 - 24) / 2; }
    // 图表画布宽 = 宿主宽 = 卡片内宽（卡片 padding 24×2），且都是真实尺寸（防 0×0 恒真）
    function chartsMatch(m) { return m.chartW.every(function (cw, i) { return cw > 100 && near(cw, m.hostW[i], 1) && near(m.hostW[i], m.cardInner[i], 1); }); }
    var CARD_FLOOR = 360;   // 761–1099 区间实测：900 → 368、1000 → 418、1099 → 467.5（不自动收起时 900 只有 279）
    var fresh = {};
    [900, 1000, 1099, 1100, 1440, 700].forEach(function (vw) { fresh[vw] = measure(autoFrame(vw, null, '0')); });
    A.check(N + 'auto-precondition-frames-are-real-viewports', [900, 1000, 1099, 1100, 1440, 700].every(function (vw) { return fresh[vw].vw === vw && fresh[vw].cardW[0] > 100; }), JSON.stringify([900, 1000, 1099, 1100, 1440, 700].map(function (vw) { return fresh[vw].vw + ':' + fresh[vw].cardW[0]; })));
    [900, 1000, 1099].forEach(function (vw) {
      var m = fresh[vw];
      A.check(N + 'auto-' + vw + '-loads-collapsed-to-the-52px-icon-bar', m.collapsed && m.auto && m.sideW === 52 && m.labels === 'none' && m.layoutDir === 'row', JSON.stringify(m));
      A.check(N + 'auto-' + vw + '-two-card-columns-each-at-least-' + CARD_FLOOR, m.cardTop[0] === m.cardTop[1] && m.cardW.every(function (w) { return w >= CARD_FLOOR && near(w, expectCard(m), 1); }), JSON.stringify(m.cardW) + ' expect ' + expectCard(m));
      A.check(N + 'auto-' + vw + '-charts-match-their-cards', chartsMatch(m), JSON.stringify(m));
      A.check(N + 'auto-' + vw + '-does-not-touch-the-stored-preference', m.stored === '0', m.stored);
    });
    [1100, 1440].forEach(function (vw) {
      var m = fresh[vw];
      A.check(N + 'auto-' + vw + '-loads-expanded-per-the-stored-preference', !m.collapsed && !m.auto && m.sideW === 230 && m.labels !== 'none' && near(m.cardW[0], expectCard(m), 1) && chartsMatch(m), JSON.stringify(m));
    });
    A.check(N + 'auto-700-stays-the-narrow-top-row-one-column', fresh[700].layoutDir === 'column' && !fresh[700].auto && fresh[700].labels !== 'none' &&
      fresh[700].cardTop[0] < fresh[700].cardTop[1] && near(fresh[700].cardW[0], 700 - 64, 1) && chartsMatch(fresh[700]), JSON.stringify(fresh[700]));
    A.check(N + 'auto-no-horizontal-overflow-at-any-width', [900, 1000, 1099, 1100, 1440, 700].every(function (vw) { return fresh[vw].docOverflow <= 0; }), '');
    var f1440c = measure(autoFrame(1440, null, '1'));
    A.check(N + 'auto-1440-honours-a-stored-collapsed-preference', f1440c.collapsed && !f1440c.auto && f1440c.sideW === 52, JSON.stringify(f1440c));

    // 跨断点实时切换：同一个 iframe 依次改宽
    var lv = autoFrame(1440, null, '0');
    var steps = {};
    function step(name, width) { resizeTo(lv, width); steps[name] = measure(lv); return steps[name]; }
    var m0 = measure(lv);
    var m1 = step('to1099', 1099);
    A.check(N + 'live-1440-to-1099-auto-collapses', !m0.collapsed && m1.collapsed && m1.auto && m1.sideW === 52, JSON.stringify(m1));
    A.check(N + 'live-1440-to-1099-charts-remeasure-to-the-new-card-width', chartsMatch(m1) && near(m1.cardW[0], expectCard(m1), 1) && Math.abs(m1.chartW[0] - m0.chartW[0]) > 30, m0.chartW + ' -> ' + m1.chartW + ' ' + JSON.stringify(m1));
    A.check(N + 'live-auto-collapse-leaves-storage-alone', m1.stored === '0', m1.stored);
    var m2 = step('to1100', 1100);
    A.check(N + 'live-1099-to-1100-restores-the-expanded-preference', !m2.collapsed && !m2.auto && m2.sideW === 230 && chartsMatch(m2) && near(m2.cardW[0], expectCard(m2), 1) && m2.stored === '0', JSON.stringify(m2));
    var m3 = step('to1000', 1000);
    A.check(N + 'live-1100-to-1000-collapses-again', m3.collapsed && m3.auto && chartsMatch(m3), JSON.stringify(m3));
    lv.d.querySelector('.ds-side-toggle').click();
    var m4 = measure(lv);
    A.check(N + 'live-manual-expand-inside-the-auto-range-is-allowed', !m4.collapsed && m4.auto && m4.sideW === 230 && chartsMatch(m4), JSON.stringify(m4));
    A.check(N + 'live-manual-expand-inside-the-auto-range-is-not-persisted', m4.stored === '0' && (lv.ctl.collapse(true), lv.ctl.collapse(false), stored()) === '0', stored());
    var m5 = step('to900', 900);
    // 同一区间内改宽不动状态、也不由侧栏重量图表（段内宽度变化交给 Chart.js 自己的 ResizeObserver，headless 下不触发），只验状态
    A.check(N + 'live-resize-within-the-auto-range-keeps-the-temporary-expand', !m5.collapsed && m5.auto && m5.sideW === 230 && m5.stored === '0', JSON.stringify(m5));
    var m6 = step('to1440', 1440);
    A.check(N + 'live-back-to-1440-restores-the-user-preference', !m6.collapsed && !m6.auto && chartsMatch(m6) && near(m6.chartW[0], m0.chartW[0], 1), JSON.stringify(m6));
    var m7 = step('to1000b', 1000);
    A.check(N + 'live-re-entering-the-auto-range-collapses-afresh', m7.collapsed && m7.auto, JSON.stringify(m7));
    var m8 = step('to700', 700);
    A.check(N + 'live-1000-to-700-becomes-the-narrow-top-row', m8.layoutDir === 'column' && !m8.auto && m8.labels !== 'none' && chartsMatch(m8) && near(m8.cardW[0], 700 - 64, 1), JSON.stringify(m8));
    var m9 = step('to1440b', 1440);
    A.check(N + 'live-700-to-1440-is-the-expanded-left-column-again', !m9.collapsed && m9.sideW === 230 && m9.layoutDir === 'row' && chartsMatch(m9) && m9.stored === '0', JSON.stringify(m9));
    lv.ctl.toggle();
    A.check(N + 'live-wide-toggle-after-an-auto-episode-still-persists', stored() === '1' && lv.ctl.isCollapsed(), stored());
    // 用户偏好是"折叠"：自动区间里临时展开，回到宽屏恢复折叠，存储全程仍是 '1'
    resizeTo(lv, 1000);
    lv.d.querySelector('.ds-side-toggle').click();
    var tmpOpen = !lv.ctl.isCollapsed() && lv.ctl.isAuto();
    resizeTo(lv, 1440);
    A.check(N + 'live-collapsed-preference-survives-a-temporary-expand', tmpOpen && lv.ctl.isCollapsed() && !lv.ctl.isAuto() && stored() === '1', tmpOpen + ' ' + lv.ctl.isCollapsed() + ' ' + stored());
    // 选项：0 关闭；自定义断点；默认值可读
    var off = autoFrame(900, { autoCollapseBelow: 0 }, '0');
    A.check(N + 'option-autocollapsebelow-0-disables-it', !off.ctl.isCollapsed() && !off.ctl.isAuto() && off.ctl.autoCollapseBelow() === 0 && (resizeTo(off, 1000), !off.ctl.isCollapsed()), JSON.stringify(measure(off)));
    var cust = autoFrame(1200, { autoCollapseBelow: 1300 }, '0');
    A.check(N + 'option-custom-breakpoint-1300-collapses-at-1200', cust.ctl.isCollapsed() && cust.ctl.isAuto() && cust.ctl.autoCollapseBelow() === 1300 && (resizeTo(cust, 1300), !cust.ctl.isCollapsed()), '');
    A.check(N + 'option-default-breakpoint-is-1100', lv.ctl.autoCollapseBelow() === 1100 && s.ctl.autoCollapseBelow() === 1100 && typeof s.ctl.isAuto === 'function', '');
    // destroy 摘掉 resize 监听：之后跨断点不再动作
    var dd = autoFrame(1440, null, '0');
    dd.ctl.destroy();
    resizeTo(dd, 1000);
    A.check(N + 'destroy-detaches-the-resize-listener', !dd.d.getElementById('as').classList.contains('ds-collapsed'), '');
    frames.forEach(function (f) { f.charts.forEach(function (c) { try { f.w.DS.charts.destroy(c); } catch (e) { /* ignore */ } }); f.ifr.remove(); });
    try { window.localStorage.removeItem(AKEY); } catch (e) { /* ignore */ }

    // ---------- 销毁 ----------
    var dz = mk();
    var before = dz.calls.length;
    dz.ctl.destroy();
    dz.item('b').click();
    A.check(N + 'destroy-detaches-click-handling', dz.calls.length === before && dz.side._dsSidebar === undefined, '');
    var dz2 = DS.sidebar.init(dz.side, { storageKey: KEY });
    A.check(N + 'reinit-after-destroy-gives-a-fresh-working-controller', !!dz2 && dz2 !== dz.ctl, '');
    dz2.select(dz.id('c'));
    A.check(N + 'reinit-after-destroy-switches-panels', dz.visible() === 'c', dz.visible());

    // ---------- 收尾 ----------
    made.forEach(function (o) { try { o.ctl.destroy(); } catch (e) { /* ignore */ } o.box.remove(); });
    var tipLeft = tipEl(); if (tipLeft) tipLeft.hidden = true;
    noTrans.remove();
    clearStore();
    A.check(N + 'cleanup-left-no-stray-probes', document.querySelectorAll('.sb-probe').length === 0, '');
  });
})();

/* ---------- demo 页集成：六个分组 / 去重 / 切换后图表重算 / hash / 折叠 / 窄屏 / 兼容层 / 顶栏滚轮控件（前缀 pg-） ---------- */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('selftest') !== '1') return;
  window.DS_SELFTEST_SUITES = window.DS_SELFTEST_SUITES || [];

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1 : tol); }
  function resolved(prop, value) {
    var p = document.createElement('div');
    p.style.cssText = 'position:absolute;left:-9999px;top:0;' + prop + ':' + value;
    document.body.appendChild(p);
    var out = getComputedStyle(p).getPropertyValue(prop);
    p.remove();
    return out;
  }
  function storageOk() { try { window.localStorage.getItem('x'); return true; } catch (e) { return false; } }

  // 预言表：测试自己写死（不从 demo.js 读），菜单文字 / hash 短名 / 分组内的卡片标题 / 分组内的 canvas 与 SVG 宿主 id
  var GROUPS = [
    { id: 'g-base', hash: 'base', text: '基础组件', titles: ['按钮', '徽标', '上传区', '卡片与模态', '提示条', '表格'], charts: [] },
    { id: 'g-compare', hash: 'compare', text: '对比', titles: ['柱状图', '条形图', '堆叠柱状图', '双轴组合图', '瀑布图'], charts: ['c-bar', 'c-hbar', 'c-stacked', 'c-combo', 'c-waterfall'] },
    { id: 'g-trend', hash: 'trend', text: '趋势', titles: ['折线图', '折线图（按日期）', '面积图'], charts: ['c-line', 'c-timeaxis', 'c-area'] },
    { id: 'g-compose', hash: 'compose', text: '构成', titles: ['环形图', '桑基图'], charts: ['c-pie', 'c-sankey'] },
    { id: 'g-dist', hash: 'dist', text: '分布', titles: ['散点图', '气泡图', '箱线图', '热力图'], charts: ['c-scatter', 'c-bubble', 'c-boxplot'], svg: ['s-heat'] },
    { id: 'g-progress', hash: 'progress', text: '进度', titles: ['甘特图'], charts: [], svg: ['s-gantt'] }
  ];

  window.DS_SELFTEST_SUITES.push(function pageSidebar(A) {
    var N = 'pg-';
    DS.theme.set('light');
    var st = window.DS_SELFTEST_STATE || {};
    var q = new URLSearchParams(location.search);
    var side = $('#side'), ctl = side._dsSidebar;
    function item(g) { return $('#side [data-panel="' + g.id + '"]'); }
    function visiblePanels() { return $$('.ds-side-panel').filter(function (p) { return !p.hidden; }).map(function (p) { return p.id; }); }
    function titlesIn(g) { return $$('#' + g.id + ' .ds-card-title').map(function (t) { return t.textContent.trim(); }); }
    var noTrans = document.createElement('style');
    noTrans.textContent = '.pg-probe, .pg-probe * { transition: none !important; animation: none !important; }';
    document.head.appendChild(noTrans);
    side.classList.add('pg-probe');
    var collapsedAtStart = ctl.isCollapsed();
    ctl.collapse(false);

    // ---------- 加载时的状态（由 demo.js 的测试钩子在初始化那一刻记下） ----------
    var hashAtLoad = String(st.initialHash || '').replace(/^#/, '');
    var known = GROUPS.filter(function (g) { return g.hash === hashAtLoad; })[0];
    A.check(N + 'load-opens-the-hash-group-or-defaults-to-compare', st.initialGroup === (known ? known.id : 'g-compare'),
      'hash=' + hashAtLoad + ' group=' + st.initialGroup);
    A.check(N + 'load-hash-recognised-as-' + (known ? known.hash : 'none'), !known || st.initialGroup === known.id, hashAtLoad);
    if (q.get('sbexpect')) {
      A.check(N + 'collapsed-state-restored-after-a-real-reload', st.collapsedAtLoad === (q.get('sbexpect') === 'collapsed'), String(st.collapsedAtLoad));
    }

    // ---------- 菜单：6 项、文字、图标、顺序（原「交互设置」挪进顶栏，不再是菜单项） ----------
    var items = $$('#side .ds-side-item');
    A.check(N + 'six-menu-items-in-the-agreed-order', items.length === 6 && items.map(function (b) { return b.textContent.trim(); }).join() === GROUPS.map(function (g) { return g.text; }).join(), items.map(function (b) { return b.textContent.trim(); }).join());
    A.check(N + 'each-item-is-an-18px-stroke-icon-plus-label', items.every(function (b) {
      var svg = b.querySelector('svg.ds-side-icon'), l = b.querySelector('.ds-side-label');
      return !!svg && !!l && svg.getAttribute('stroke') === 'currentColor' && near(svg.getBoundingClientRect().width, 18, 0.5) && near(svg.getBoundingClientRect().height, 18, 0.5) && svg.getElementsByTagName('*').length >= 2;
    }), '');
    A.check(N + 'icons-are-pairwise-different-shapes', (function () {
      var seen = {}; items.forEach(function (b) { seen[b.querySelector('svg').innerHTML] = 1; });
      return Object.keys(seen).length === 6;
    })(), '');
    A.check(N + 'icons-carry-no-color-literal', items.every(function (b) { return !/#[0-9a-fA-F]{3,8}\b|rgb/.test(b.querySelector('svg').outerHTML); }), '');
    A.check(N + 'every-item-points-at-an-existing-panel-and-vice-versa', items.every(function (b) { return !!document.getElementById(b.getAttribute('data-panel')); }) &&
      $$('.ds-side-panel').length === 6 && $$('.ds-side-panel').every(function (p) { return !!$('#side [data-panel="' + p.id + '"]'); }), '');
    A.check(N + 'nav-has-no-tabs-any-more', !$('.ds-nav .ds-tab') && !$('[data-panel="p-play"].ds-tab'), '');

    // ---------- 分组与内容对应（逐组：标题序列、canvas/SVG 归属、卡片总数） ----------
    GROUPS.forEach(function (g) {
      A.check(N + 'group-' + g.hash + '-has-exactly-its-cards-in-order', titlesIn(g).join('|') === g.titles.join('|'), titlesIn(g).join('|'));
      A.check(N + 'group-' + g.hash + '-owns-its-charts', g.charts.concat(g.svg || []).every(function (id) { return !!$('#' + g.id + ' #' + id); }), '');
    });
    A.check(N + 'group-base-has-four-stat-tiles-and-four-banners', $$('#g-base .ds-stat').length === 4 && $$('#g-base .ds-banner').length === 4 && !!$('#g-base #t-banner-ok'), '');
    A.check(N + 'no-interact-group-left-in-menu-or-panels', !document.getElementById('g-interact') && !$('#side [data-panel="g-interact"]') &&
      items.every(function (b) { return b.textContent.trim() !== '交互设置'; }) && $$('input[name=wheel]').length === 0, '');
    A.check(N + 'every-card-lives-in-exactly-one-group', $$('.ds-card').length === 21 && $$('.ds-side-panel .ds-card').length === 21 &&
      $$('.ds-card').every(function (c) { return !!c.closest('.ds-side-panel'); }), $$('.ds-card').length + '');
    A.check(N + 'every-chart-canvas-is-inside-a-group-panel', $$('canvas').filter(function (c) { return !c.closest('.ds-side-panel') && !c.closest('#selftest-scaffold') && !c.closest('.sb-probe'); }).length === 0, '');

    // ---------- 去重：被合并的柱状图/折线图/表格各只剩一张 ----------
    var allTitles = $$('#app .ds-card-title').map(function (t) { return t.textContent.trim(); });
    function count(t) { return allTitles.filter(function (x) { return x === t; }).length; }
    A.check(N + 'dedup-bar-chart-title-appears-once', count('柱状图') === 1, count('柱状图'));
    A.check(N + 'dedup-line-chart-title-appears-once-and-by-date-is-another-card', count('折线图') === 1 && count('折线图（按日期）') === 1, count('折线图') + '/' + count('折线图（按日期）'));
    A.check(N + 'dedup-table-title-appears-once', count('表格') === 1, count('表格'));
    A.check(N + 'dedup-every-card-title-on-the-page-is-unique', allTitles.length === 21 && allTitles.filter(function (t, i) { return allTitles.indexOf(t) === i; }).length === 21, allTitles.join('|'));
    A.check(N + 'dedup-removed-cards-are-gone', !document.getElementById('c-long') && !document.getElementById('c-empty') && !document.getElementById('t-table'), '');
    // 甘特图卡片里的明细表（[data-gantt-details] 内的 .ds-table，2026-10-23 新增）不算独立的表格卡片
    A.check(N + 'dedup-only-one-table-and-it-is-the-richer-one', $$('#app table.ds-table').filter(function (t) { return !t.closest('[data-gantt-details]'); }).length === 1 && $$('#app [data-gantt-details] table.ds-table').length === 1 && $$('#t-detail thead th').length === 6 && $$('#t-detail tbody tr').length === 8, '');
    A.check(N + 'dedup-merged-capabilities-have-their-switches', !!$('#chk-bar-long') && !!$('#chk-line-empty') && !!$('#seg-c-bar .ds-seg-btn') && !!$('#seg-c-line .ds-seg-btn'), '');

    // ---------- 点击切换：只显示对应分组、选中态、hash、图表尺寸 ----------
    var regSet = DS.charts.all().slice();
    function chartsReport(g) {
      var bad = [];
      g.charts.forEach(function (id) {
        var cv = document.getElementById(id), ch = cv._dsChart, host = cv.parentNode, card = host.closest('.ds-card');
        var inner = card.clientWidth - 48;
        if (!ch) { bad.push(id + ':no-instance'); return; }
        if (!(host.clientWidth > 100 && host.clientHeight > 100)) { bad.push(id + ':host-zero ' + host.clientWidth + 'x' + host.clientHeight); return; }
        if (!(ch.width > 100 && ch.height > 100)) bad.push(id + ':chart-zero ' + ch.width + 'x' + ch.height);
        if (!near(ch.width, host.clientWidth, 1) || ch.height !== host.clientHeight) bad.push(id + ':chart ' + ch.width + 'x' + ch.height + ' host ' + host.clientWidth + 'x' + host.clientHeight);
        if (!near(host.clientWidth, inner, 1)) bad.push(id + ':host ' + host.clientWidth + ' card-inner ' + inner);
      });
      (g.svg || []).forEach(function (id) {
        // 甘特图是 HTML 元素绘制（根元素 [data-gantt]，取样宽度在 data-gantt-width），热力图仍是 SVG
        var isGantt = id === 's-gantt';
        var host = document.getElementById(id), svg = host.querySelector(isGantt ? ':scope > [data-gantt]' : 'svg');
        if (!svg || host.clientWidth < 100) { bad.push(id + ':svg-missing-or-zero'); return; }
        // 取样宽度 = 当前宿主宽度（重画时宿主先被清空、页面一度没有竖向滚动条，库会按插回后的宽度补画），
        // 且宽宿主下绘图区不得多出横向滚动
        if (isGantt && svg.getAttribute('data-gantt-width') !== String(host.clientWidth)) bad.push(id + ':drawn-at ' + svg.getAttribute('data-gantt-width') + ' host ' + host.clientWidth);
        if (isGantt && host.clientWidth >= 830 && svg.querySelector('.ds-gantt-scroll').scrollWidth > svg.querySelector('.ds-gantt-scroll').clientWidth) bad.push(id + ':h-overflow');
        if (isGantt && !(svg.getBoundingClientRect().width > 100 && near(svg.getBoundingClientRect().width, host.clientWidth, 1))) bad.push(id + ':gantt-width ' + svg.getBoundingClientRect().width);
        if (id === 's-heat' && !(+svg.getBoundingClientRect().width > 100)) bad.push(id + ':heat-zero');
        if (host.querySelectorAll(isGantt ? '[data-gantt]' : 'svg').length !== 1) bad.push(id + ':svg-count ' + host.querySelectorAll(isGantt ? '[data-gantt]' : 'svg').length);
      });
      return bad.join('; ');
    }
    var primary = resolved('color', 'var(--color-primary)');
    GROUPS.forEach(function (g) {
      item(g).click();
      A.check(N + 'click-' + g.hash + '-shows-only-that-group', visiblePanels().join() === g.id, visiblePanels().join());
      A.check(N + 'click-' + g.hash + '-marks-the-item-selected-with-bar-and-icon', item(g).getAttribute('aria-current') === 'true' &&
        $$('#side [aria-current="true"]').length === 1 && getComputedStyle(item(g)).borderLeftColor === primary && getComputedStyle(item(g)).borderLeftWidth === '3px' &&
        getComputedStyle(item(g).querySelector('svg')).color === primary, getComputedStyle(item(g)).borderLeftColor);
      A.check(N + 'click-' + g.hash + '-updates-the-url-hash', location.hash === '#' + g.hash, location.hash);
      var shownTitles = $$('.ds-card').filter(function (c) { return c.offsetParent !== null; }).map(function (c) { return c.querySelector('.ds-card-title').textContent.trim(); });
      A.check(N + 'click-' + g.hash + '-makes-exactly-that-groups-cards-visible', shownTitles.join('|') === g.titles.join('|'), shownTitles.join('|'));
      if (g.charts.length || (g.svg || []).length) {
        var rep = chartsReport(g);
        A.check(N + 'click-' + g.hash + '-charts-have-real-nonzero-size-matching-their-card', rep === '', rep);
      }
    });
    A.check(N + 'cycling-all-groups-does-not-grow-or-replace-instances', DS.charts.all().length === regSet.length &&
      DS.charts.all().every(function (c, i) { return c === regSet[i]; }), DS.charts.all().length + ' vs ' + regSet.length);
    // 多轮来回切换后再量一次（防止"只有第一次切到才对"）
    for (var r = 0; r < 3; r++) GROUPS.forEach(function (g) { item(g).click(); });
    A.check(N + 'three-more-rounds-still-no-growth', DS.charts.all().length === regSet.length && DS.charts.all().every(function (c, i) { return c === regSet[i]; }), '');
    var allRep = GROUPS.map(function (g) { item(g).click(); return chartsReport(g); }).filter(Boolean);
    A.check(N + 'after-three-rounds-every-group-still-renders-at-real-size', allRep.length === 0, allRep.join(' || '));
    A.check(N + 'no-duplicate-toolbars-after-switching', $$('.ds-chart-toolbar').length === regSet.filter(function (c) { return !!c.canvas.parentNode.querySelector('.ds-chart-toolbar'); }).length &&
      regSet.every(function (c) { return c.canvas.parentNode.querySelectorAll('.ds-chart-toolbar').length <= 1; }), '');
    // 切换动作自己不创建监听器：对 #side 数一次 click 触发回调次数（用 hash 写入次数代理）
    var rsCalls = 0, origRS = history.replaceState;
    history.replaceState = function () { rsCalls++; return origRS.apply(history, arguments); };
    item(GROUPS[3]).click();
    history.replaceState = origRS;
    A.check(N + 'one-click-writes-the-hash-exactly-once-no-duplicate-listeners', rsCalls === 1, rsCalls);

    // ---------- hash：地址栏变化跟着切；无效 hash 不动 ----------
    history.replaceState(null, '', '#dist');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    A.check(N + 'hashchange-to-a-known-group-selects-it', visiblePanels().join() === 'g-dist' && ctl.current() === 'g-dist', visiblePanels().join());
    history.replaceState(null, '', '#no-such-group');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    A.check(N + 'hashchange-to-an-unknown-hash-leaves-the-current-group', visiblePanels().join() === 'g-dist', visiblePanels().join());
    // 原「交互设置」分组的 #interact 现在就是一个未知 hash
    history.replaceState(null, '', '#interact');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    A.check(N + 'hashchange-to-the-removed-interact-hash-is-unknown-too', visiblePanels().join() === 'g-dist' && ctl.current() === 'g-dist', visiblePanels().join());
    history.replaceState(null, '', '#base');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    A.check(N + 'hashchange-works-in-both-directions', visiblePanels().join() === 'g-base' && item(GROUPS[0]).getAttribute('aria-current') === 'true', '');
    var histLen = history.length;
    item(GROUPS[2]).click(); item(GROUPS[4]).click();
    A.check(N + 'switching-does-not-spam-the-history-stack', history.length === histLen, histLen + ' vs ' + history.length);

    // ---------- 折叠：真实页面上的侧栏 ----------
    ctl.collapse(false);
    A.check(N + 'expanded-sidebar-is-230px-and-sticky-below-the-nav', near(side.getBoundingClientRect().width, 230, 0.5) && getComputedStyle(side).position === 'sticky' && near(parseFloat(getComputedStyle(side).top), 66, 0.5), side.getBoundingClientRect().width);
    var mainWExpanded = $('.ds-side-main').getBoundingClientRect().width;
    side.querySelector('.ds-side-toggle').click();
    A.check(N + 'collapsed-sidebar-is-52px-icons-only', near(side.getBoundingClientRect().width, 52, 0.5) && items.every(function (b) { return getComputedStyle(b.querySelector('.ds-side-label')).display === 'none' && b.querySelector('svg').getBoundingClientRect().width > 17; }), side.getBoundingClientRect().width);
    A.check(N + 'collapsing-widens-the-content-area-by-178px', near($('.ds-side-main').getBoundingClientRect().width - mainWExpanded, 178, 1), $('.ds-side-main').getBoundingClientRect().width + ' vs ' + mainWExpanded);
    items[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    A.check(N + 'collapsed-hover-shows-the-menu-text-as-a-tooltip', !!$('.ds-side-tip') && !$('.ds-side-tip').hidden && $('.ds-side-tip').textContent === '趋势', $('.ds-side-tip') ? $('.ds-side-tip').textContent : 'none');
    items[2].dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    A.check(N + 'collapsed-keeps-the-selected-bar-and-switching-still-works', (function () { items[4].click(); return visiblePanels().join() === 'g-dist' && getComputedStyle(items[4]).borderLeftColor === primary; })(), '');
    A.check(N + 'collapsed-charts-in-the-wider-area-still-match-their-cards', chartsReport(GROUPS[4]) === '', chartsReport(GROUPS[4]));
    if (storageOk()) A.check(N + 'collapsed-state-is-persisted-for-the-next-load', window.localStorage.getItem('ds-sidebar-collapsed') === '1', String(window.localStorage.getItem('ds-sidebar-collapsed')));
    side.querySelector('.ds-side-toggle').click();
    A.check(N + 'expand-restores-230px-and-charts-follow', near(side.getBoundingClientRect().width, 230, 0.5) && chartsReport(GROUPS[4]) === '', chartsReport(GROUPS[4]));
    if (storageOk()) A.check(N + 'expanded-state-is-persisted-too', window.localStorage.getItem('ds-sidebar-collapsed') === '0', String(window.localStorage.getItem('ds-sidebar-collapsed')));

    // ---------- 窄屏：同源 iframe 里放真实布局的克隆，宽度 700 ----------
    // collapsed：给克隆的侧栏加 ds-collapsed（模拟 761–1099 自动收起后的样子；克隆里没有脚本）
    function probeAt(width, collapsed) {
      var ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:absolute;left:-99999px;top:0;border:0;height:900px;width:' + width + 'px';
      document.body.appendChild(ifr);
      var css = [].map.call(document.querySelectorAll('style'), function (x) { return x.textContent; }).join('\n');
      var lay = $('.ds-layout').cloneNode(true);
      lay.querySelector('.ds-sidebar').classList.remove('pg-probe');
      lay.querySelector('.ds-sidebar').classList.toggle('ds-collapsed', !!collapsed);
      var d = ifr.contentDocument;
      d.open();
      d.write('<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>' + css + '</style>' +
        '<style>*, *::before, *::after { transition: none !important; animation: none !important; }</style></head><body>' +
        '<div class="ds-wrap">' + lay.outerHTML + '</div></body></html>');
      d.close();
      var w = d.defaultView, sd = d.querySelector('#side'), its = [].slice.call(d.querySelectorAll('#side .ds-side-item'));
      var vis = d.querySelector('.ds-side-panel:not([hidden])');
      var grid = vis.querySelector('.ds-charts-grid');
      var out = { layoutDir: w.getComputedStyle(d.querySelector('.ds-layout')).flexDirection, dir: w.getComputedStyle(sd).flexDirection,
        pos: w.getComputedStyle(sd).position, sideW: sd.getBoundingClientRect().width, docW: d.documentElement.clientWidth,
        tops: its.map(function (b) { return Math.round(b.getBoundingClientRect().top); }), toggle: w.getComputedStyle(sd.querySelector('.ds-side-toggle')).display,
        cols: w.getComputedStyle(grid).gridTemplateColumns.split(' ').length, mainW: d.querySelector('.ds-side-main').getBoundingClientRect().width,
        sideBottom: sd.getBoundingClientRect().bottom, mainTop: d.querySelector('.ds-side-main').getBoundingClientRect().top,
        labelsShown: its.every(function (b) { return w.getComputedStyle(b.querySelector('.ds-side-label')).display !== 'none'; }),
        cardW: [].slice.call(grid.children).map(function (c) { return Math.round(c.getBoundingClientRect().width * 10) / 10; }) };
      ifr.remove();
      return out;
    }
    // 顶栏单独放进 iframe（克隆的图表画布带着 1440 宽时的 inline 宽度，会把页面撑宽，混在一起量不出顶栏本身）：
    // 页面与顶栏自身都不得横向溢出；每个子元素（含分段按钮的每一个按钮）都完整落在顶栏内
    function navProbe(width) {
      var ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:absolute;left:-99999px;top:0;border:0;height:400px;width:' + width + 'px';
      document.body.appendChild(ifr);
      var css = [].map.call(document.querySelectorAll('style'), function (x) { return x.textContent; }).join('\n');
      var d = ifr.contentDocument;
      d.open();
      d.write('<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + $('.ds-nav').outerHTML + '</body></html>');
      d.close();
      var nav = d.querySelector('.ds-nav'), nr = nav.getBoundingClientRect();
      var navKids = [].slice.call(nav.children).filter(function (c) { return c.getBoundingClientRect().width > 0; });
      var segBtns = [].slice.call(nav.querySelectorAll('#wheel-seg .ds-seg-btn'));
      var out = { docW: d.documentElement.clientWidth, docOverflow: d.documentElement.scrollWidth - d.documentElement.clientWidth, navOverflow: nav.scrollWidth - nav.clientWidth,
        navW: Math.round(nr.width), navH: Math.round(nr.height),
        navKidsInside: navKids.concat(segBtns).every(function (c) { var r = c.getBoundingClientRect(); return r.left >= nr.left - 0.5 && r.right <= nr.right + 0.5 && r.width > 0; }),
        segBtnW: segBtns.map(function (b) { return Math.round(b.getBoundingClientRect().width); }),
        // 行数：标题 / 滚轮控件 / 深浅按钮按垂直中心去重（占位的空 span 不算）
        navRows: navKids.filter(function (c) { return c.tagName !== 'SPAN' || c.className; }).map(function (c) { return Math.round(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2); })
          .filter(function (t, i, a) { return a.indexOf(t) === i; }).length };
      ifr.remove();
      return out;
    }
    item(GROUPS[1]).click();
    var n700 = probeAt(700), n1440 = probeAt(1440);
    A.check(N + 'narrow-700-menu-becomes-a-top-row-above-the-content', n700.layoutDir === 'column' && n700.dir === 'row' && n700.pos === 'static' && near(n700.sideW, n700.docW - 64, 1.5) && n700.mainTop >= n700.sideBottom - 1 && n700.toggle === 'none' && n700.labelsShown, JSON.stringify(n700));
    A.check(N + 'narrow-700-all-items-share-rows-not-a-vertical-column', n700.tops.filter(function (t, i) { return n700.tops.indexOf(t) === i; }).length < 6, n700.tops.join());
    A.check(N + 'narrow-700-chart-grid-is-one-column-and-fills-the-width', n700.cols === 1 && near(n700.mainW, n700.docW - 64, 1.5), JSON.stringify(n700));
    // 761–1099：页面侧栏由库自动收成图标栏（库行为见 sb-auto-*/sb-live-*），这里核对 demo 自己的初始化没关掉它，
    // 并用真实页面布局的克隆量收起后两列卡片的宽度
    A.check(N + 'page-sidebar-auto-collapses-below-1100', ctl.autoCollapseBelow() === 1100 && ctl.isAuto() === false, ctl.autoCollapseBelow() + '/' + ctl.isAuto());
    var c900 = probeAt(900, true), c1099 = probeAt(1099, true), e900 = probeAt(900, false);
    // 实测（克隆页面高于 iframe，带 15px 竖向滚动条）：900 收起 360.5 / 不收起 271.5；1099 收起 460
    A.check(N + 'collapsed-900-real-layout-two-cards-each-at-least-355', c900.layoutDir === 'row' && near(c900.sideW, 52, 0.5) && c900.cols === 2 &&
      c900.cardW.length >= 2 && c900.cardW.every(function (w) { return w >= 355; }) && e900.cardW.every(function (w) { return w < 300; }), JSON.stringify(c900.cardW) + ' expanded ' + JSON.stringify(e900.cardW));
    A.check(N + 'collapsed-1099-real-layout-two-cards-each-at-least-455', c1099.cols === 2 && c1099.cardW.every(function (w) { return w >= 455; }), JSON.stringify(c1099.cardW));
    // 顶栏：窄屏换行不溢出，宽屏一行
    var navAt = {};
    [700, 360, 900, 1440].forEach(function (vw) {
      var o = navAt[vw] = navProbe(vw);
      A.check(N + 'nav-' + vw + '-has-no-horizontal-overflow', o.docW === vw && o.navW === vw && o.docOverflow <= 0 && o.navOverflow <= 0 && o.navKidsInside && o.segBtnW.length === 4 && o.segBtnW.every(function (w) { return w >= 24; }),
        JSON.stringify(o));
    });
    var n360 = navAt[360];
    n1440 = Object.assign({}, n1440, { navRows: navAt[1440].navRows, navH: navAt[1440].navH });
    A.check(N + 'nav-1440-is-a-single-row', n1440.navRows === 1 && n1440.navH <= 56, n1440.navRows + ' rows, h=' + n1440.navH);
    A.check(N + 'nav-360-wraps-instead-of-overflowing', n360.navRows >= 2, n360.navRows + ' rows, h=' + n360.navH);
    A.check(N + 'wide-1440-sidebar-is-a-left-column-and-grid-is-two-columns', n1440.layoutDir === 'row' && near(n1440.sideW, 230, 0.5) && n1440.cols === 2 && n1440.tops.filter(function (t, i) { return n1440.tops.indexOf(t) === i; }).length === 6, JSON.stringify(n1440));

    // ---------- 兼容层：旧选择器仍可点，效果 = 显示全部分组并完成尺寸重算 ----------
    var pPlay = $('[data-panel="p-play"]'), pComp = $('[data-panel="p-comp"]');
    A.check(N + 'compat-selectors-exist-and-are-invisible-and-unfocusable', !!pPlay && !!pComp && pPlay.offsetParent === null && pComp.offsetParent === null && pPlay.tabIndex === -1 && pComp.tabIndex === -1 && !pPlay.closest('#side'), '');
    item(GROUPS[2]).click();
    var hashBeforeCompat = location.hash;
    pComp.click();
    A.check(N + 'compat-p-comp-shows-every-group', visiblePanels().length === 6 && $$('#side [aria-current="true"]').length === 0, visiblePanels().join());
    var compatBad = GROUPS.map(function (g) { return chartsReport(g); }).filter(Boolean);
    A.check(N + 'compat-p-comp-leaves-every-chart-at-real-size', compatBad.length === 0, compatBad.join(' || '));
    A.check(N + 'compat-does-not-touch-the-url-hash', location.hash === hashBeforeCompat, location.hash);
    item(GROUPS[3]).click();
    pPlay.click();
    A.check(N + 'compat-p-play-also-shows-every-group', visiblePanels().length === 6 && GROUPS.map(function (g) { return chartsReport(g); }).filter(Boolean).length === 0, '');
    item(GROUPS[1]).click();
    A.check(N + 'menu-works-again-after-compat-show-all', visiblePanels().join() === GROUPS[1].id && item(GROUPS[1]).getAttribute('aria-current') === 'true', visiblePanels().join());

    // ---------- 顶栏的滚轮缩放方式（原侧栏「交互设置」分组）：紧挨「深 / 浅」按钮，切换即时改变图表的滚轮行为 ----------
    var wctl = $('.ds-nav #wheel-ctl'), seg = $('.ds-nav #wheel-seg');
    function wbtn(m) { return $('.ds-nav #wheel-seg .ds-seg-btn[data-value="' + m + '"]'); }
    A.check(N + 'nav-wheel-control-sits-right-before-the-theme-button', !!wctl && wctl.nextElementSibling === $('#btn-theme') && wctl.parentNode === $('.ds-nav') &&
      wctl.querySelector('.ds-nav-ctl-label').textContent === '滚轮' && seg.getAttribute('role') === 'group' && seg.getAttribute('aria-label') === '滚轮缩放方式', '');
    A.check(N + 'nav-wheel-buttons-keep-the-four-mode-names-and-explain-them-in-title', $$('.ds-nav #wheel-seg .ds-seg-btn').map(function (b) { return b.textContent; }).join() === 'ctrl-zoom,page,zoom,smart' &&
      $$('.ds-nav #wheel-seg .ds-seg-btn').every(function (b) { return b.title.length > 8; }) && /Ctrl/.test(wbtn('ctrl-zoom').title), '');
    A.check(N + 'nav-wheel-pressed-button-uses-nav-tokens', getComputedStyle(wbtn('ctrl-zoom')).backgroundColor === resolved('background-color', 'var(--nav-accent)') &&
      getComputedStyle(wbtn('ctrl-zoom')).color === resolved('color', 'var(--nav-bg)') && getComputedStyle(wbtn('page')).color === resolved('color', 'var(--nav-text-secondary)'),
      getComputedStyle(wbtn('ctrl-zoom')).backgroundColor + ' ' + getComputedStyle(wbtn('ctrl-zoom')).color);
    item(GROUPS[1]).click();
    var bar = document.getElementById('c-bar')._dsChart;
    function wheel(ctrlKey) { var e = new WheelEvent('wheel', { deltaY: -100, ctrlKey: ctrlKey, cancelable: true, bubbles: true, clientX: bar.canvas.getBoundingClientRect().left + bar.width / 2, clientY: bar.canvas.getBoundingClientRect().top + bar.height / 2 }); bar.canvas.dispatchEvent(e); DS.charts.resetZoom(bar); return e.defaultPrevented; }
    var toasts0 = $$('.ds-toast').length;
    var w0 = { plain: wheel(false), ctrl: wheel(true) };
    wbtn('zoom').click();
    var wz = { plain: wheel(false), ctrl: wheel(true), pressed: wbtn('zoom').getAttribute('aria-pressed'), mode: DS.charts.options().wheel };
    var toastText = ($$('.ds-toast').pop() || {}).textContent;
    wbtn('page').click();
    var wp = { plain: wheel(false), ctrl: wheel(true), pressed: wbtn('page').getAttribute('aria-pressed') };
    wbtn('ctrl-zoom').click();
    var wc = { plain: wheel(false), ctrl: wheel(true) };
    A.check(N + 'nav-wheel-default-ctrl-zoom-only-zooms-with-ctrl', w0.plain === false && w0.ctrl === true, JSON.stringify(w0));
    A.check(N + 'nav-wheel-zoom-makes-a-plain-wheel-zoom-the-chart', wz.plain === true && wz.pressed === 'true' && wz.mode === 'zoom' && $$('.ds-nav #wheel-seg [aria-pressed="true"]').length === 1, JSON.stringify(wz));
    A.check(N + 'nav-wheel-page-lets-even-ctrl-wheel-scroll-the-page', wp.plain === false && wp.ctrl === false && wp.pressed === 'true', JSON.stringify(wp));
    A.check(N + 'nav-wheel-back-to-ctrl-zoom-restores-the-default-behaviour', wc.plain === false && wc.ctrl === true && DS.charts.options().wheel === 'ctrl-zoom', JSON.stringify(wc));
    A.check(N + 'nav-wheel-switch-shows-the-same-toast-as-before', $$('.ds-toast').length >= toasts0 + 1 && toastText === '滚轮模式：zoom', String(toastText));
    var toastsBefore = $$('.ds-toast').length;
    wbtn('ctrl-zoom').click();
    A.check(N + 'nav-wheel-clicking-the-pressed-button-is-a-no-op', $$('.ds-toast').length === toastsBefore && DS.charts.options().wheel === 'ctrl-zoom', '');

    // ---------- 收尾：回到默认分组、恢复进入时的折叠状态 ----------
    item(GROUPS[1]).click();
    ctl.collapse(collapsedAtStart);
    if (!storageOk()) { /* nothing persisted */ }
    side.classList.remove('pg-probe');
    noTrans.remove();
    var tipE = $('.ds-side-tip'); if (tipE) tipE.hidden = true;
  });
})();
