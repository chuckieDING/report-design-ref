/* sankey.js —— DS 桑基图组件：把"两个筛选下拉 + 全选 + 计数 + 徽标 + 清除 +
   基线高亮联动 + 销毁重建 + 全屏"整套下沉到库里。别的项目只需要
       var s = DS.sankey.mount(hostEl, flows, { id: 'sankey' });
   不用再抄 demo 代码。图表本体（着色、点击高亮、全屏工具条）仍由
   DS.charts 负责，这里只管"数据怎么筛、控件怎么摆"。

   筛选语义（N 层通用，参照实现是两层图，这里是它的自然推广）：
   - 「流出端」下拉只列首层节点（没有入流的），「流入端」下拉只列末层节点
     （没有出流的）；中间层节点不进下拉，自动保留。
   - 源端：勾了就只看勾选的，没勾就是全部首层节点。
   - 目标端：和源端一致——勾了任何项就**只显示勾选的**（榜外的也能勾进来）；
     一项都没勾才默认显示流量前 N（topN，默认 20）的末层节点；下拉最多列流量
     前 40 项（maxToItems）。（早期照搬参照实现的"Top-N ∪ 勾选"追加语义已废除：
     勾选榜内项目数据完全不变，用户看到的就是"筛选没反应"。）
   - 最终保留"从所选源端出发、能到达所选目标端的所有路径上的流向"（可达性），
     所以三层图勾选一个源节点后能看到它的完整去向。

   不使用 requestAnimationFrame（本机 headless chromium 的 rAF 永不回调）。 */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  var DEFAULT_TOP_N = 20;
  var DEFAULT_MAX_TO_ITEMS = 40;

  function sumBy(flows, field) { return DS.charts.sankeyGroupTotals(flows, field); }

  function rankedKeys(totals, keys) {
    return keys.slice().sort(function (a, b) {
      return (totals[b] || 0) - (totals[a] || 0) || (a < b ? -1 : a > b ? 1 : 0);
    });
  }

  // 首层/末层节点。数据里有环导致没有任何首层（或末层）节点时退回"全部
  // from（或全部 to）"，保证下拉不会是空的。
  function endpoints(flows) {
    var hasIn = {}, hasOut = {}, froms = {}, tos = {};
    (flows || []).forEach(function (f) {
      if (!f) return;
      hasOut[f.from] = true; hasIn[f.to] = true; froms[f.from] = true; tos[f.to] = true;
    });
    var sources = Object.keys(froms).filter(function (k) { return !hasIn[k]; });
    var sinks = Object.keys(tos).filter(function (k) { return !hasOut[k]; });
    if (!sources.length) sources = Object.keys(froms);
    if (!sinks.length) sinks = Object.keys(tos);
    return { sources: sources, sinks: sinks };
  }

  function reach(flows, seeds, forward) {
    var seen = {}, queue = [];
    seeds.forEach(function (k) { if (!seen[k]) { seen[k] = true; queue.push(k); } });
    while (queue.length) {
      var cur = queue.pop();
      for (var i = 0; i < flows.length; i++) {
        var f = flows[i];
        if (!f) continue;
        var a = forward ? f.from : f.to, b = forward ? f.to : f.from;
        if (a === cur && !seen[b]) { seen[b] = true; queue.push(b); }
      }
    }
    return seen;
  }

  /* 纯函数：按选择算出要画的流向。
     sel = { from: [首层节点键], to: [末层节点键] }，opts.topN 默认 20。
     返回 { flows, sources, sinks, shownSinks }。 */
  function filterFlows(flows, sel, opts) {
    flows = (flows || []).filter(Boolean);
    sel = sel || {};
    var topN = opts && opts.topN != null ? opts.topN : DEFAULT_TOP_N;
    var ep = endpoints(flows);
    var inflow = sumBy(flows, 'to');
    var selFrom = (sel.from || []).filter(function (k) { return ep.sources.indexOf(k) !== -1; });
    var selTo = (sel.to || []).filter(function (k) { return ep.sinks.indexOf(k) !== -1; });
    var useSrc = selFrom.length ? selFrom : ep.sources;
    // 勾选了目标端 -> 只看勾选的；没勾 -> 默认流量前 N
    var shownSinks = selTo.length ? selTo.slice() : rankedKeys(inflow, ep.sinks).slice(0, Math.max(0, topN));
    var fwd = reach(flows, useSrc, true);
    var bwd = reach(flows, shownSinks, false);
    var kept = flows.filter(function (f) { return fwd[f.from] && bwd[f.to]; });
    return { flows: kept, sources: ep.sources, sinks: ep.sinks, shownSinks: shownSinks };
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // 通用多选下拉列表：items 是 {key,count}，勾选变化回调 onChange。
  function buildDropList(listEl, items, onChange) {
    listEl.innerHTML = '';
    var allRow = el('label', 'ds-sankey-drop-item all');
    var allCb = document.createElement('input');
    allCb.type = 'checkbox';
    allRow.appendChild(allCb);
    allRow.appendChild(el('span', null, '全选'));
    listEl.appendChild(allRow);
    var cbs = items.map(function (it) {
      var row = el('label', 'ds-sankey-drop-item');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = it.key;
      row.appendChild(cb);
      row.appendChild(el('span', null, it.key));
      row.appendChild(el('span', 'ds-sankey-drop-count', it.count.toLocaleString()));
      listEl.appendChild(row);
      return cb;
    });
    function syncAll() { allCb.checked = cbs.length > 0 && cbs.every(function (c) { return c.checked; }); }
    allCb.addEventListener('change', function () {
      cbs.forEach(function (cb) { cb.checked = allCb.checked; });
      onChange();
    });
    cbs.forEach(function (cb) {
      cb.addEventListener('change', function () { syncAll(); onChange(); });
    });
    return {
      getChecked: function () { return cbs.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); },
      setChecked: function (keys) {
        cbs.forEach(function (c) { c.checked = keys.indexOf(c.value) !== -1; });
        syncAll();
      },
      clear: function () { allCb.checked = false; cbs.forEach(function (c) { c.checked = false; }); }
    };
  }

  function setBadge(badge, n) {
    if (n > 0) { badge.textContent = '(' + n + ')'; badge.hidden = false; }
    else { badge.hidden = true; badge.textContent = ''; }
  }

  /* DS.sankey.mount(hostEl, flows, opts) -> 控制器
     在 hostEl 里生成筛选条 + 图表宿主，并画出桑基图。
     opts.id          元素 id 前缀，默认 'sankey'：生成 #<id>-from-btn / -from-list /
                      -from-badge / -to-btn / -to-list / -to-badge / -clear-btn /
                      -host（图表宿主）以及 canvas #c-<id>
     opts.topN        目标端默认显示的流量前 N 个节点，默认 20
     opts.maxToItems  「流入端」下拉最多列出多少项（按流量降序取前 M），默认 40
     opts.datasetLabel / fromLabel / toLabel / clearLabel  文案
     opts.chartOptions 合并进 Chart.js options
     opts.onChart(chart)  每次（重）建出非空图表后回调
     控制器：chart() / getSelection() / setSelection({from,to}) / setFlows(flows)
             / visibleFlows() / clear() / destroy() */
  function mount(hostEl, flows, opts) {
    opts = opts || {};
    var id = opts.id || 'sankey';
    var topN = opts.topN != null ? opts.topN : DEFAULT_TOP_N;
    var maxToItems = opts.maxToItems != null ? opts.maxToItems : DEFAULT_MAX_TO_ITEMS;
    var universe = (flows || []).filter(Boolean);
    var chart = null, visible = [];
    var fromCtl, toCtl;

    hostEl.innerHTML = '';
    var bar = el('div', 'ds-sankey-filters');
    function dropdown(side, label) {
      var wrap = el('div', 'ds-sankey-dropdown');
      var btn = el('button', 'ds-btn secondary', label);
      btn.type = 'button';
      btn.id = id + '-' + side + '-btn';
      var badge = el('span', 'ds-sankey-drop-badge');
      badge.id = id + '-' + side + '-badge';
      badge.hidden = true;
      btn.appendChild(document.createTextNode(' '));
      btn.appendChild(badge);
      var list = el('div', 'ds-sankey-drop-list');
      list.id = id + '-' + side + '-list';
      list.hidden = true;
      wrap.appendChild(btn);
      wrap.appendChild(list);
      bar.appendChild(wrap);
      return { btn: btn, badge: badge, list: list };
    }
    var fromUi = dropdown('from', opts.fromLabel || '流出端筛选');
    var toUi = dropdown('to', opts.toLabel || '流入端筛选');
    var clearBtn = el('button', 'ds-btn secondary', opts.clearLabel || '清除筛选');
    clearBtn.type = 'button';
    clearBtn.id = id + '-clear-btn';
    bar.appendChild(clearBtn);
    var chartHost = el('div', 'ds-chart-host');
    chartHost.id = id + '-host';
    hostEl.appendChild(bar);
    hostEl.appendChild(chartHost);

    function buildLists() {
      var ep = endpoints(universe);
      var outTotals = sumBy(universe, 'from'), inTotals = sumBy(universe, 'to');
      fromCtl = buildDropList(fromUi.list,
        rankedKeys(outTotals, ep.sources).map(function (k) { return { key: k, count: outTotals[k] || 0 }; }), rebuild);
      toCtl = buildDropList(toUi.list,
        rankedKeys(inTotals, ep.sinks).slice(0, Math.max(0, maxToItems)).map(function (k) { return { key: k, count: inTotals[k] || 0 }; }), rebuild);
    }

    function toggle(list, other) {
      var willOpen = list.hidden;
      other.hidden = true;
      list.hidden = !willOpen;
    }
    fromUi.btn.addEventListener('click', function (ev) { ev.stopPropagation(); toggle(fromUi.list, toUi.list); });
    toUi.btn.addEventListener('click', function (ev) { ev.stopPropagation(); toggle(toUi.list, fromUi.list); });
    function onDocClick(ev) {
      if (!fromUi.list.contains(ev.target) && ev.target !== fromUi.btn) fromUi.list.hidden = true;
      if (!toUi.list.contains(ev.target) && ev.target !== toUi.btn) toUi.list.hidden = true;
    }
    document.addEventListener('click', onDocClick);

    function rebuild() {
      var selFrom = fromCtl.getChecked(), selTo = toCtl.getChecked();
      setBadge(fromUi.badge, selFrom.length);
      setBadge(toUi.badge, selTo.length);
      var res = filterFlows(universe, { from: selFrom, to: selTo }, { topN: topN });
      visible = res.flows;
      // 连 canvas 一起换新：canvas._dsChart / _dsSankeyBound 等标记都挂在元素
      // 本身上，新元素天然不带残留状态。
      if (chart) { DS.charts.destroy(chart); chart = null; }
      chartHost.innerHTML = '';
      var caption = el('div', 'ds-sankey-caption',
        '显示 ' + visible.length + ' / ' + universe.length + ' 条流向数据' +
        (!selTo.length && res.sinks.length > topN ? '（流入端默认前 ' + topN + '，勾选后只看勾选项）' : ''));
      chartHost.appendChild(caption);
      var canvas = document.createElement('canvas');
      canvas.id = 'c-' + id;
      chartHost.appendChild(canvas);
      var o = { layout: { padding: { top: 18 } } };
      var co = opts.chartOptions || {};
      Object.keys(co).forEach(function (k) { o[k] = co[k]; });
      chart = DS.charts.create(canvas, {
        type: 'sankey',
        data: { datasets: [{
          label: opts.datasetLabel || '流向',
          data: visible,
          // 用全量数据的顺序固定节点颜色：筛选前后同一个节点颜色不变
          nodeOrder: DS.charts._sankeyNodeOrder(universe)
        }] },
        options: o
      });
      if (chart) {
        // 勾选的节点构成"基线高亮"：没有点击覆盖态时，点击空白/再点同一节点
        // 回落到它；没勾选时基线为 null，即完全不高亮。
        DS.charts.sankeySetBaseline(chart, (selFrom.length || selTo.length) ? selFrom.concat(selTo) : null);
        if (opts.onChart) opts.onChart(chart);
      }
    }

    clearBtn.addEventListener('click', function () {
      fromCtl.clear(); toCtl.clear(); rebuild();
    });

    buildLists();
    rebuild();

    return {
      chart: function () { return chart; },
      visibleFlows: function () { return visible.slice(); },
      getSelection: function () { return { from: fromCtl.getChecked(), to: toCtl.getChecked() }; },
      setSelection: function (sel) {
        sel = sel || {};
        fromCtl.setChecked(sel.from || []);
        toCtl.setChecked(sel.to || []);
        rebuild();
      },
      setFlows: function (next) {
        var keep = { from: fromCtl.getChecked(), to: toCtl.getChecked() };
        universe = (next || []).filter(Boolean);
        buildLists();
        fromCtl.setChecked(keep.from);
        toCtl.setChecked(keep.to);
        rebuild();
      },
      clear: function () { fromCtl.clear(); toCtl.clear(); rebuild(); },
      destroy: function () {
        document.removeEventListener('click', onDocClick);
        if (chart) { DS.charts.destroy(chart); chart = null; }
        hostEl.innerHTML = '';
      }
    };
  }

  DS.sankey = { mount: mount, filterFlows: filterFlows, endpoints: endpoints };
})(window.DS);
