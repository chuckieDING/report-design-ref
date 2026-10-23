/* sidebar.js —— DS 侧边栏导航：左侧菜单 + 右侧按菜单切换的内容面板。
   形态沿用参照实现：菜单项 = 图标 + 文字，选中项左侧 3px 色条；顶部有折叠按钮，
   折叠后只剩图标（悬停浮出文字提示）；窄屏（<=760px，与图表网格断点一致）变成顶部横排。
   中等宽度（761px ~ autoCollapseBelow-1，默认 761–1099）自动收成图标栏，给两列卡片让出宽度：
   这是"视口决定的临时状态"，不写 localStorage；用户保存的折叠偏好原样保留，回到宽屏即恢复。

   标记由使用者书写（见 README「侧边栏」一节）：
     <div class="ds-layout">
       <nav class="ds-sidebar" id="x" aria-label="分类">
         <div class="ds-side-group">组名（可选）</div>
         <button type="button" class="ds-side-item" data-panel="p1">
           <svg class="ds-side-icon" ...></svg><span class="ds-side-label">文字</span></button>
       </nav>
       <div class="ds-side-main"><section class="ds-side-panel" id="p1" hidden>…</section></div>
     </div>
   折叠按钮由本模块在 nav 最前面插入（已有 .ds-side-toggle 则沿用）。

   不使用 requestAnimationFrame（本机 headless chromium 里它的回调永不触发）：
   面板淡入是纯 CSS 动画（components.css 的 ds-side-fade），本文件不驱动任何动画；
   视口跨断点靠 resize 事件 + matchMedia 的 change 事件（两者都同步重判，幂等），切换后同步重量图表，
   宽度过渡结束后再由 transitionend 补量一次；不用定时器（tests/test_build.py 守着）。
   localStorage 不可用（隐私模式 / file:// 被禁）时静默降级为"记不住折叠状态"，
   与 DS.theme 同一做法。 */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  var DEFAULT_KEY = 'ds-sidebar-collapsed';
  var NARROW = '(max-width: 760px)';
  var DEFAULT_AUTO_BELOW = 1100;   // 视口 < 1100 且 > 760 时自动收成图标栏；传 0 关闭

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function isNarrow() {
    return !!(window.matchMedia && window.matchMedia(NARROW).matches);
  }

  /* 折叠时悬停提示：全页只一个元素，按需创建，挂在 <body>（position:fixed，
     不会被侧栏的 overflow 裁掉）。 */
  var tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'ds-side-tip';
      tipEl.setAttribute('role', 'tooltip');
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }
  function showTip(item) {
    var t = tip();
    var label = item.querySelector('.ds-side-label');
    t.textContent = label ? label.textContent : (item.getAttribute('aria-label') || '');
    t.hidden = false;
    var r = item.getBoundingClientRect();
    t.style.left = Math.round(r.right + 8) + 'px';
    t.style.top = Math.round(r.top + r.height / 2 - t.offsetHeight / 2) + 'px';
  }

  var SVG_ARROW_OPEN = '«';
  var SVG_ARROW_CLOSED = '»';

  DS.sidebar = {
    /* root：.ds-sidebar 元素或其选择器。opts：
         onChange(id, panelEl, info) —— 选中项变化后回调（id 为 null 表示 showAll）
         value      —— 初始选中项（data-panel 值），默认第一个菜单项
         storageKey —— 折叠状态的 localStorage 键，默认 'ds-sidebar-collapsed'
         collapsed  —— 存储里没有记录时的初始折叠状态，默认 false
         autoCollapseBelow —— 视口宽 761 ~ 该值-1 时自动收成图标栏，默认 1100；0 = 关闭。
                      自动收起期间点折叠按钮（或调 collapse/toggle）只是临时展开/收起，不写存储；
                      跨回 >= 该值时恢复用户保存的状态，再进入该区间时重新自动收起。
       返回控制器 { select(id), showAll(), current(), collapse(bool), toggle(),
                   isCollapsed(), isAuto(), autoCollapseBelow(), destroy() }；
       对同一 root 重复 init 返回同一个控制器。 */
    init: function (root, opts) {
      if (typeof root === 'string') root = document.querySelector(root);
      if (!root) return null;
      if (root._dsSidebar) return root._dsSidebar;
      opts = opts || {};
      var storageKey = opts.storageKey || DEFAULT_KEY;
      var current = null;
      // 自动收起断点：未传 = 1100；0 / 负数 / 非数 = 关闭
      var autoBelow = opts.autoCollapseBelow == null ? DEFAULT_AUTO_BELOW : (+opts.autoCollapseBelow > 761 ? Math.round(+opts.autoCollapseBelow) : 0);
      var autoMq = autoBelow && window.matchMedia
        ? window.matchMedia('(min-width: 761px) and (max-width: ' + (autoBelow - 1) + 'px)') : null;
      var userCollapsed = false;   // 用户偏好（存储里的 / 宽屏下手动切换的），自动收起不改它
      var autoOn = false;          // 视口此刻是否落在自动收起区间
      var zone = null;             // 'narrow'（<=760 顶部横排）/ 'auto'（自动收起区间）/ 'wide'
      function zoneNow() { return isNarrow() ? 'narrow' : (autoMq && autoMq.matches) ? 'auto' : 'wide'; }

      function items() { return Array.prototype.slice.call(root.querySelectorAll('.ds-side-item[data-panel]')); }
      function panelOf(item) { return document.getElementById(item.getAttribute('data-panel')); }
      function labelOf(item) {
        var l = item.querySelector('.ds-side-label');
        return l ? l.textContent.trim() : '';
      }

      // 折叠按钮
      var toggleBtn = root.querySelector('.ds-side-toggle');
      if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'ds-side-toggle';
        toggleBtn.innerHTML = '<span class="ds-side-toggle-icon" aria-hidden="true"></span>' +
          '<span class="ds-side-label">折叠</span>';
        root.insertBefore(toggleBtn, root.firstChild);
      }
      var toggleIcon = toggleBtn.querySelector('.ds-side-toggle-icon');
      var toggleLabel = toggleBtn.querySelector('.ds-side-label');

      function applyCollapsedA11y(on) {
        // 折叠后文字被 display:none，按钮失去可访问名称：补上 aria-label，展开时摘掉
        items().forEach(function (it) {
          if (on) it.setAttribute('aria-label', labelOf(it)); else it.removeAttribute('aria-label');
        });
        if (on) toggleBtn.setAttribute('aria-label', '展开侧边栏'); else toggleBtn.removeAttribute('aria-label');
        toggleBtn.setAttribute('aria-expanded', String(!on));
        if (toggleIcon) toggleIcon.textContent = on ? SVG_ARROW_CLOSED : SVG_ARROW_OPEN;
        if (toggleLabel) toggleLabel.textContent = on ? '展开' : '折叠';
      }

      function setCollapsed(on, persist) {
        on = !!on;
        var changed = on !== root.classList.contains('ds-collapsed');
        root.classList.toggle('ds-collapsed', on);
        applyCollapsedA11y(on);
        hideTip();
        if (persist) storageSet(storageKey, on ? '1' : '0');
        // 折叠/展开改变了内容区宽度：可见面板里的图表跟着按新宽度重算
        if (changed) refreshSettled();
        return changed;
      }

      // 用户意图（折叠按钮 / collapse() / toggle()）：自动收起区间内只是临时展开/收起、不落盘
      // （临时状态就是 ds-collapsed 类本身，离开区间时被用户偏好覆盖）；区间外才是真正的偏好，写存储
      function userSet(on) {
        on = !!on;
        if (autoOn) { setCollapsed(on, false); return; }
        userCollapsed = on;
        setCollapsed(on, true);
      }

      // 视口变化：只在跨断点（窄屏 / 自动收起区间 / 宽屏 三段之间）那一刻动作，同一段内的反复 resize
      // 什么都不做（也就不会冲掉用户的临时展开；段内的宽度变化交给 Chart.js 自己的响应式）。
      // 进入自动收起区间 = 收起并清掉临时展开；离开 = 恢复用户偏好。
      function syncAuto() {
        var z = zoneNow();
        if (z === zone) return;
        zone = z;
        var on = z === 'auto';
        var changed = false;
        if (on !== autoOn) {
          autoOn = on;
          changed = setCollapsed(on ? true : userCollapsed, false);
        }
        // 跨断点后内容区宽度大变：即使折叠态没变（如 760 两侧、或临时展开后回到宽屏）也重量可见图表
        // （折叠态变了的话 setCollapsed 已经量过）；有宽度过渡时 transitionend 会按最终宽度再量一次。
        if (!changed) refreshSettled();
      }

      function refreshVisible() {
        items().forEach(function (it) {
          var p = panelOf(it);
          if (p && !p.hidden) afterShow(p);
        });
      }
      // 内容区宽度大变（折叠/展开、跨断点）后量两遍：第一遍时其余图表的画布还是旧宽度，变窄时会把页面
      // 短暂撑出滚动条、让先量的那张偏窄半个滚动条宽；第二遍在全部收窄后的最终布局上量。
      function refreshSettled() { refreshVisible(); refreshVisible(); }

      function applySelected(id) {
        items().forEach(function (it) {
          var on = it.getAttribute('data-panel') === id;
          if (on) it.setAttribute('aria-current', 'true'); else it.removeAttribute('aria-current');
          var p = panelOf(it);
          if (p) p.hidden = !on;
        });
      }

      function afterShow(scope) {
        // 隐藏面板里的图表是 0x0：面板变可见后按真实尺寸重算（Chart.js 自带的
        // ResizeObserver 在浏览器里也会触发，这里显式再做一遍，不依赖它）。
        if (DS.charts && DS.charts.resizeIn) DS.charts.resizeIn(scope);
        if (DS.svg && DS.svg.redrawIn) DS.svg.redrawIn(scope);
      }

      function select(id) {
        var it = items().filter(function (x) { return x.getAttribute('data-panel') === id; })[0];
        if (!it) return false;
        var changed = current !== id;
        current = id;
        applySelected(id);
        var panel = panelOf(it);
        if (changed || (panel && !panel.hidden)) afterShow(panel);
        if (changed && opts.onChange) opts.onChange(id, panel, { all: false });
        return true;
      }

      function showAll() {
        current = null;
        items().forEach(function (it) {
          it.removeAttribute('aria-current');
          var p = panelOf(it);
          if (p) p.hidden = false;
        });
        afterShow(document);
        if (opts.onChange) opts.onChange(null, null, { all: true });
      }

      function onClick(ev) {
        var it = ev.target.closest('.ds-side-item[data-panel]');
        if (it && root.contains(it)) {
          // 已选中项再点：不重复回调；但 showAll 之后点回某一项必须生效
          if (current === it.getAttribute('data-panel') && it.getAttribute('aria-current') === 'true') return;
          select(it.getAttribute('data-panel'));
          return;
        }
        var t = ev.target.closest('.ds-side-toggle');
        if (t && root.contains(t)) userSet(!root.classList.contains('ds-collapsed'));
      }
      function onOver(ev) {
        if (!root.classList.contains('ds-collapsed') || isNarrow()) return;
        var it = ev.target.closest('.ds-side-item, .ds-side-toggle');
        if (it && root.contains(it)) showTip(it);
      }
      function onOut(ev) {
        var it = ev.target.closest('.ds-side-item, .ds-side-toggle');
        if (it && !(ev.relatedTarget && it.contains(ev.relatedTarget))) hideTip();
      }
      function onKey(ev) {
        // 菜单项本身是 <button>，Enter / Space 原生可触发；这里只补上下方向键 / Home / End 的焦点移动
        var k = ev.key;
        if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
        var list = items();
        var i = list.indexOf(document.activeElement);
        if (i < 0) return;
        var n = k === 'ArrowDown' ? Math.min(list.length - 1, i + 1)
          : k === 'ArrowUp' ? Math.max(0, i - 1) : k === 'Home' ? 0 : list.length - 1;
        ev.preventDefault();
        list[n].focus();
      }

      root.addEventListener('click', onClick);
      root.addEventListener('mouseover', onOver);
      root.addEventListener('mouseout', onOut);
      root.addEventListener('focusin', onOver);
      root.addEventListener('focusout', onOut);
      root.addEventListener('keydown', onKey);
      // 宽度有 CSS 过渡：过渡期间内容区宽度逐帧变化（浏览器里 ResizeObserver 会跟着走），
      // 过渡结束时再按最终宽度量一次，不依赖 ResizeObserver 是否触发
      function onTransitionEnd(ev) { if (ev.target === root && ev.propertyName === 'width') refreshVisible(); }
      root.addEventListener('transitionend', onTransitionEnd);

      var saved = storageGet(storageKey);
      userCollapsed = saved === '1' ? true : saved === '0' ? false : !!opts.collapsed;
      zone = zoneNow();
      autoOn = zone === 'auto';
      setCollapsed(autoOn || userCollapsed, false);
      // resize 与 matchMedia change 都接上：前者所有浏览器都有，后者在某些嵌入环境里更及时；syncAuto 幂等。
      // autoCollapseBelow 为 0 时也照样监听：跨 760 断点（横排 <-> 左侧栏）同样需要重量图表。
      var mqs = [autoMq, window.matchMedia ? window.matchMedia(NARROW) : null].filter(Boolean);
      function onMqChange() { syncAuto(); }
      window.addEventListener('resize', syncAuto);
      mqs.forEach(function (mq) {
        if (mq.addEventListener) mq.addEventListener('change', onMqChange);
        else if (mq.addListener) mq.addListener(onMqChange);
      });

      var ctl = {
        select: select,
        showAll: showAll,
        current: function () { return current; },
        collapse: function (on) { userSet(on); },
        toggle: function () { userSet(!root.classList.contains('ds-collapsed')); },
        isCollapsed: function () { return root.classList.contains('ds-collapsed'); },
        isAuto: function () { return autoOn; },
        autoCollapseBelow: function () { return autoBelow; },
        destroy: function () {
          root.removeEventListener('click', onClick);
          root.removeEventListener('mouseover', onOver);
          root.removeEventListener('mouseout', onOut);
          root.removeEventListener('focusin', onOver);
          root.removeEventListener('focusout', onOut);
          root.removeEventListener('keydown', onKey);
          root.removeEventListener('transitionend', onTransitionEnd);
          window.removeEventListener('resize', syncAuto);
          mqs.forEach(function (mq) {
            if (mq.removeEventListener) mq.removeEventListener('change', onMqChange);
            else if (mq.removeListener) mq.removeListener(onMqChange);
          });
          hideTip();
          delete root._dsSidebar;
        }
      };
      root._dsSidebar = ctl;

      var first = items()[0];
      var start = (opts.value && items().some(function (x) { return x.getAttribute('data-panel') === opts.value; }))
        ? opts.value : (first && first.getAttribute('data-panel'));
      if (start) {
        current = start;
        applySelected(start);
        if (opts.onChange) opts.onChange(start, document.getElementById(start), { all: false, initial: true });
      }
      return ctl;
    }
  };
})(window.DS);
