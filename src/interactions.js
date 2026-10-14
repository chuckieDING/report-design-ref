/* interactions.js —— DS 交互层：主题、标签页、表格排序、模态、toast。
   注意：本机 headless chromium 的 requestAnimationFrame 回调永不触发
   （该渲染模式不产生合成帧），本文件一律不使用 rAF 做任何延迟/动画驱动。 */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  var STORAGE_KEY = 'ds-theme';

  /* localStorage 在隐私模式、部分浏览器的 file:// 协议下会抛 SecurityError
     （本仓库用 ?nostorage=1 测试钩子在 demo 页模拟这一行为，见 demo/index.html）。
     整个主题模块必须在无持久化的情况下照常工作，只是记不住选择。 */
  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  DS.theme = {
    get: function () {
      return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    },
    set: function (mode) {
      var next = mode === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      storageSet(STORAGE_KEY, next);
      document.dispatchEvent(new CustomEvent('ds:themechange', { detail: { mode: next } }));
    },
    toggle: function () { DS.theme.set(DS.theme.get() === 'dark' ? 'light' : 'dark'); },
    init: function () {
      var saved = storageGet(STORAGE_KEY);
      if (saved !== 'dark' && saved !== 'light') {
        saved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
          ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', saved);
    }
  };

  DS.tabs = {
    init: function (rootSelector) {
      var root = document.querySelector(rootSelector);
      if (!root) return;
      /* 幂等保护防的是"对同一个 root 元素重复挂监听器"，不是"这组 tabs
         一辈子只能绑一次"。监听器挂在事件委托的容器（root 本身）上，
         root.innerHTML = 新内容 不会移除挂在 root 自身上的监听器，重渲染
         之后不需要、也不会因为这条保护被拒绝而失效。 */
      if (root.dataset.dsTabsBound === '1') return;
      root.dataset.dsTabsBound = '1';
      root.addEventListener('click', function (ev) {
        var tab = ev.target.closest('.ds-tab');
        if (!tab || !root.contains(tab)) return;
        var target = tab.getAttribute('data-panel');
        root.querySelectorAll('.ds-tab').forEach(function (t) {
          t.setAttribute('aria-selected', String(t === tab));
        });
        /* 面板查询收敛到"这组 tabs 自己声明过的" data-panel 目标，不是
           document.querySelectorAll('.ds-panel') 的全文档扫描——否则页面上
           并存第二组独立 tabs 时，点 g2 的某个 tab 会把 g1 当前显示的面板
           也隐藏掉（Review B2）。面板通常是 root 的兄弟节点、不在 root
           内部，所以这里从 root 内所有 .ds-tab[data-panel] 收集这组 tabs
           自己名下的面板 id 全集，再按 id 去文档里找。每次点击都重新收集，
           不缓存成闭包变量——tabs 被重渲染、动态增删标签页之后也能跟着变
           （与 DS.tables.sortable 的委托思路一致，Review B1）。 */
        var panelIds = Array.prototype.map.call(
          root.querySelectorAll('.ds-tab[data-panel]'),
          function (t) { return t.getAttribute('data-panel'); }
        );
        panelIds.forEach(function (id) {
          var p = document.getElementById(id);
          if (p) p.hidden = (id !== target);
        });
      });
    }
  };

  // Review D3：报表里常见的"数值但不是裸数字字面量"的格式——千分位逗号
  // （1,234）、百分号（5%）、常见时长单位（3.5h / 12h，min/s 同理）、
  // hh:mm 或 m:ss 式的时长（02:14）。原来整列判定走 isFinite()，这些格式
  // 全部被判成非数字，整列退化成字典序，且是静默的（无报错、无警告），
  // 与 README 明确承诺的"数字列按数值"相悖。这里保守剥离这几种——不做
  // 通用单位剥离（任意后缀都摘掉风险太高，容易把本来就是文本的列，比如
  // 型号"3.5mm"，误判成数字列）。
  var TIME_COLON_RE = /^(\d{1,3}):([0-5]\d)$/;

  function parseSortableNumber(raw) {
    var t = TIME_COLON_RE.exec(raw);
    if (t) return parseInt(t[1], 10) * 60 + parseInt(t[2], 10);
    var stripped = raw.replace(/,/g, '').replace(/%$/, '').replace(/(h|min|s)$/i, '');
    return stripped !== '' && isFinite(stripped) ? parseFloat(stripped) : NaN;
  }

  DS.tables = {
    sortable: function (tableSelector) {
      var table = document.querySelector(tableSelector);
      if (!table) return;
      /* 幂等保护防的是"对同一张 <table> 重复挂监听器"（重复会叠加监听器，
         导致一次点击触发两次排序回调，"升序点击"实际落到降序结果），不是
         "这张表一辈子只能排一次序"。此前的实现把监听器逐个挂在每个 <th>
         上，table.innerHTML = 新 thead+tbody 会把这些 <th> 连同监听器一起
         扔掉，新 <th> 上什么都没挂——消费者重渲染表格后再调一次 sortable()
         会被这条幂等保护直接拒绝，点击新表头毫无反应、无报错（Review
         B1）。改成委托在 table 本身（不会被 innerHTML 替换掉）上监听
         click，th/tbody 都在点击时动态查找当前 DOM，而不是绑定时捕获的
         闭包，往后无论表格重渲染多少次都不需要特殊处理。 */
      if (table.dataset.dsSortableBound === '1') return;
      table.dataset.dsSortableBound = '1';
      table.addEventListener('click', function (ev) {
        var th = ev.target.closest('th');
        if (!th || !table.contains(th)) return;
        var tbody = table.tBodies[0];
        if (!tbody) return;
        var index = Array.prototype.indexOf.call(th.parentNode.children, th);

        var asc = th.getAttribute('aria-sort') !== 'ascending';
        table.querySelectorAll('th').forEach(function (o) { o.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');

        var rows = Array.prototype.slice.call(tbody.rows);
        function cellText(r) { return r.cells[index].textContent.trim(); }

        /* 按列统一判定，不逐对判定：Array.prototype.sort 的比较器必须满足传递律。
           逐对判断"这一对是不是都能转数字"在混了文本/空值的列上不满足传递性
           （例如 5 / '' / 北京 三者两两比较的"both"结果互不一致），排序结果在
           规范上是未定义的。当且仅当该列全部非空单元格都能解析为数字时，整列
           才按数值排序；否则整列按字符串排序。 */
        var columnIsNumeric = rows.every(function (r) {
          var t = cellText(r);
          return t === '' || !isNaN(parseSortableNumber(t));
        });

        rows.sort(function (a, b) {
          var x = cellText(a), y = cellText(b);
          if (columnIsNumeric) {
            var xEmpty = x === '', yEmpty = y === '';
            if (xEmpty && yEmpty) return 0;
            if (xEmpty) return 1;   // 空单元格无条件排在末尾，升/降序都一样
            if (yEmpty) return -1;
            var cmp = parseSortableNumber(x) - parseSortableNumber(y);
            return asc ? cmp : -cmp;
          }
          var cmp2 = x.localeCompare(y, 'zh-Hans-CN');
          return asc ? cmp2 : -cmp2;
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    }
  };

  // Esc 监听器挂在 document 上，必须只注册一次，且不能跟 backdrop 的存续
  // 绑在一起判断：document 是永不被替换的稳定对象，"backdrop 不存在就加
  // 一个"这条判据在宿主应用整体重渲染 body、把 backdrop 删掉之后会重新
  // 为真，下次 open() 就会再加一个，且没有上限——close() 本身幂等所以
  // 当前不会有可见症状（Esc 一次触发多次 close() 看不出区别），但监听器
  // 会在 document 上无限累积，是真实的内存泄漏（Review B3）。改用独立的
  // 一次性标志，跟 backdrop 的生命周期彻底解耦。
  var modalEscBound = false;

  DS.modal = {
    open: function (innerHTML) {
      var back = document.querySelector('.ds-modal-backdrop');
      if (!back) {
        back = document.createElement('div');
        back.className = 'ds-modal-backdrop';
        back.innerHTML = '<div class="ds-modal"></div>';
        document.body.appendChild(back);
        back.addEventListener('click', function (ev) {
          if (ev.target === back) DS.modal.close();
        });
      }
      if (!modalEscBound) {
        modalEscBound = true;
        document.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape') DS.modal.close();
        });
      }
      back.querySelector('.ds-modal').innerHTML = innerHTML;
      back.hidden = false;
    },
    close: function () {
      var back = document.querySelector('.ds-modal-backdrop');
      if (back) back.hidden = true;
    }
  };

  DS.toast = {
    show: function (msg, ms) {
      var host = document.querySelector('.ds-toast-host');
      if (!host) {
        host = document.createElement('div');
        host.className = 'ds-toast-host';
        document.body.appendChild(host);
      }
      var el = document.createElement('div');
      el.className = 'ds-toast';
      el.textContent = msg;
      host.appendChild(el);
      setTimeout(function () { el.remove(); }, ms || 3000);
    }
  };
})(window.DS);
