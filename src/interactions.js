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

  // Bug 1（用户报的）：中文数字按拼音排序——"一号仪器/二号仪器/三号仪器/
  // 备用仪器"这类机台/产线/车间命名在报表里极其常见，此前整列落到
  // localeCompare(zh-Hans-CN) 的拼音序，"一"（yi）排到了"二"（er）、
  // "三"（san）后面。这里识别单元格*开头*的中文数字（0~99：〇/零、
  // 一~十、十一~十九、二十~九十九这类组合），按数值而不是拼音排序。
  //
  // 覆盖"两"吗？不覆盖。"两"在计数语境里确实等同"二"（两号机），但报表
  // 标签几乎总写"二号/二楼/二车间"，不写"两号/两楼"；反而"两难/两极/
  // 两性/两栖/两者/两全"这类常见词比对应的"二 + 字"组合常见得多，纳入
  // "两"会把误伤面扩大却换不来真实收益。真遇到"两号机"这类用法，再把
  // "两"加进 CN_DIGIT 并给对应的习语补黑名单。
  //
  // 不误伤"一次性""十字路口""百分之一"这类词，走两层规则：
  //   1）数字集合只到"十"，不含百/千/万——"百分之一"开头的"百"本来就不
  //      在识别范围内，第一步就不匹配，不需要额外规则。
  //   2）识别到的数字后面如果紧跟着一个把数字"虚化"成功能词/习语的字
  //      （十字、一次性、一下、十分……，见 CN_NUM_SUFFIX_BLACKLIST），
  //      整条放弃提取、退回原字符串处理。这张表不追求穷举——漏判（该提
  //      取的没提取）只是退回拼音序，不是错误；误判（不该提取的提取了）
  //      才会把本该当文本处理的列错误地当数字列处理，危害更大，所以只
  //      收录已知会出问题的高频用字，新发现误伤按需追加。
  // 数字可以是前缀（"一号仪器"）也可以独立成词（单元格整体就是"三"）：
  // 独立成词时没有"后面紧跟的字"，天然不会命中黑名单。
  var CN_DIGIT = {
    '〇': 0, '零': 0,                                   // 〇 零
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9           // 一二三四五六七八九
  };
  var CN_NUM_RE = /^(?:([二三四五六七八九]?)十([一二三四五六七八九]?)|([〇零一二三四五六七八九]))/;
  var CN_NUM_SUFFIX_BLACKLIST = {
    '次': 1, '字': 1, '分': 1, '些': 1, '般': 1, '起': 1, '直': 1, '定': 1,
    '切': 1, '半': 1, '样': 1, '下': 1, '共': 1, '向': 1, '概': 1, '律': 1,
    '旦': 1, '致': 1, '心': 1, '面': 1, '并': 1
  };

  function parseLeadingChineseNumeral(raw) {
    var m = CN_NUM_RE.exec(raw);
    if (!m) return NaN;
    var value;
    if (m[3] !== undefined) {
      value = CN_DIGIT[m[3]];
    } else {
      var tens = m[1] ? CN_DIGIT[m[1]] : 1;   // "十"前面没写数字按一十算（十 == 一十）
      var ones = m[2] ? CN_DIGIT[m[2]] : 0;
      value = tens * 10 + ones;
    }
    var rest = raw.slice(m[0].length);
    if (rest !== '' && CN_NUM_SUFFIX_BLACKLIST.hasOwnProperty(rest.charAt(0))) return NaN;
    return value;
  }

  /* 用户报的 bug：数字列的 <td class="num"> 右对齐，但同一列的 <th> 没有
     任何机制跟着右对齐（components.css 里 `.ds-table th` 固定左对齐），
     视觉上整列错位将近一个列宽——标题"时长(分)"正下方显示的其实是"切片数"
     那一列的数字。用户点"时长"表头排序，排序确实执行了，但他盯着标题
     下方看到的是切片数在变，于是报成"排序没生效"。

     判定"这是不是数字列"不复用下面点击排序时的 parseSortableNumber 数值
     解析——那套解析是"内容长得像不像数字"，跟页面作者有没有把 td 标成
     class="num"（从而让它实际右对齐）是两件事：一列 ID 编号内容全是数字
     但作者故意不想让它右对齐（没加 td.num）的话，按内容解析会误判成数字
     列、反过来把表头错误地改成右对齐，制造一个新的、方向相反的错位。
     这里改成直接扫描这一列的 <td> 是不是全都已经带着 class="num"（页面
     作者自己已经声明过的、真实生效的对齐方式）——按列统一判定，跟下面
     判断数字列用的 columnIsNumeric 是同一种"扫描整列、要求全部一致"的
     思路，只是判定谓词换成"已经右对齐"而不是"内容能转数字"，这样自动
     加上去的 th.num 永远跟它对应的 td 实际对齐方式一致，不会凭空引入新的
     错位。 */
  function syncNumericHeaderAlignment(table) {
    var headRow = table.tHead && table.tHead.rows[0];
    var tbody = table.tBodies[0];
    if (!headRow || !tbody) return;
    var rows = Array.prototype.slice.call(tbody.rows);
    Array.prototype.forEach.call(headRow.cells, function (th, index) {
      var columnIsRightAligned = rows.length > 0 && rows.every(function (r) {
        var cell = r.cells[index];
        return !cell || cell.classList.contains('num');
      });
      var weAddedIt = th.dataset.dsAutoNum === '1';
      if (columnIsRightAligned) {
        if (!th.classList.contains('num')) {
          th.classList.add('num');
          th.dataset.dsAutoNum = '1';
        }
        // 已经带 num 类：不管是页面作者手写的还是我们上次自动加的，原样
        // 保留，不重复处理。
      } else if (weAddedIt) {
        // 列不再整列右对齐了（重渲染换了新数据）——撤回我们自己加的类，
        // 跟着新数据重新判定。使用者自己手写在 th 上的 num 类从来不会
        // 走到这个分支（weAddedIt 只在我们自己加过的 th 上为真），他的
        // 显式选择不受影响。
        th.classList.remove('num');
        delete th.dataset.dsAutoNum;
      }
    });
  }

  DS.tables = {
    sortable: function (tableSelector) {
      var table = document.querySelector(tableSelector);
      if (!table) return;

      /* 每次调用都重新判定一遍表头对齐——不像下面的点击监听器只在首次
         调用时绑定。消费者按标准做法重渲染表格后再调一次 sortable()，
         这时某一列完全可能从数字列变成文本列（或反过来），表头对齐要
         跟着变，不能只在第一次调用时生效一次就不再更新。 */
      syncNumericHeaderAlignment(table);

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

        /* Bug 1：中文数字前缀列（"一号仪器"/"三车间"）优先级低于上面的阿拉伯
           数字判定——列里只要全部单元格都能走阿拉伯数字路径就不会走到这里，
           跟此前的行为完全一致，不会搅动千分位/百分号/时长这些既有列。只有
           在阿拉伯数字判定失败、且列里*至少有一个*单元格能识别出中文数字
           前缀时，才按中文数字主键排序；一个中文数字前缀都识别不出的纯文本
           列（含被黑名单挡下的"十字路口"这类词、以及真正的纯文本列）原样
           退回下面的 localeCompare 分支，不受影响。 */
        var columnHasChineseNumeral = !columnIsNumeric && rows.some(function (r) {
          return !isNaN(parseLeadingChineseNumeral(cellText(r)));
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
          if (columnHasChineseNumeral) {
            var xv = parseLeadingChineseNumeral(x), yv = parseLeadingChineseNumeral(y);
            var xHas = !isNaN(xv), yHas = !isNaN(yv);
            // 识别不出中文数字前缀的单元格（含空单元格）无条件排在末尾，
            // 升/降序都一样——跟上面阿拉伯数字列"空单元格无条件最后"的
            // 既有约定保持一致。
            if (!xHas && !yHas) {
              var cmpBoth = x.localeCompare(y, 'zh-Hans-CN');
              return asc ? cmpBoth : -cmpBoth;
            }
            if (!xHas) return 1;
            if (!yHas) return -1;
            if (xv !== yv) {
              var cmpCn = xv - yv;
              return asc ? cmpCn : -cmpCn;
            }
            var cmpTie = x.localeCompare(y, 'zh-Hans-CN');  // 同数值退回拼音序
            return asc ? cmpTie : -cmpTie;
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
