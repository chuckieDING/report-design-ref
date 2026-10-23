/* charts-svg.js —— Chart.js 画不了的特型图：热力（SVG），以及甘特（src/gantt.js，
   HTML 元素绘制，共用这里的 registry）。

   这两类图没有 Canvas/Chart.js 实例可言，颜色也不像 Chart.js 图表那样能在
   创建时"固化"再靠 retheme() 去改写 config ——这里每次主题切换都是把整块
   SVG 拆掉重画一遍，现读 DS.charts.themeColors() 现画，没有增量更新的概念。

   不使用 requestAnimationFrame：本机 headless chromium 的 rAF 回调永不
   触发（原因见 charts.js 顶部注释），这里完全同步绘制，不依赖它。 */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // { host: Element, redraw: Function }。按 host 去重而不是无脑 push——
  // 同一个 host 被重新渲染（调用方重建图）时旧条目要被替换掉，否则每次
  // 主题切换都会对着同一个 host 重复画 N 遍，其中 N-1 份还闭包着旧参数。
  var registry = [];

  function el(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    return n;
  }

  function colors() { return DS.charts.themeColors(); }

  // 复用 Chart.js 图表层同一份"长标签截断阈值"配置，不是另起一个魔法数字——
  // 热力图的行列标签截断规则要和 Task 5 的刻度截断观感一致（同一套 token/
  // 配置来源，不是巧合地凑出同一个数字）。
  function maxLabel() {
    var opts = (DS.charts && DS.charts.options) ? DS.charts.options() : null;
    return (opts && opts.maxLabel) || 10;
  }

  function truncateTo(raw, n) {
    raw = String(raw);
    return raw.length > n ? raw.slice(0, n) + '…' : raw;
  }

  function truncate(raw) {
    return truncateTo(raw, maxLabel());
  }

  // SVG 没有原生 tooltip 机制：全称一律塞进 <title> 子元素，鼠标悬停时
  // 由浏览器原生弹出。不区分"是否被截断"——所有标签都给，行为统一、
  // 不用在两条代码路径里分别记得维护这件事。
  // maxLen 可选：不传则用共享的 Chart.js 刻度截断阈值（maxLabel()）；
  // 甘特图的行标签按自己的列宽单独算阈值，见 src/gantt.js。
  function labelText(x, y, raw, fill, extraAttrs, maxLen) {
    var attrs = { x: x, y: y, fill: fill, 'font-size': 11 };
    Object.keys(extraAttrs || {}).forEach(function (k) { attrs[k] = extraAttrs[k]; });
    var t = el('text', attrs);
    t.textContent = maxLen != null ? truncateTo(raw, maxLen) : truncate(raw);
    var title = el('title', {});
    title.textContent = String(raw);
    t.appendChild(title);
    return t;
  }

  function unmount(host) {
    for (var i = registry.length - 1; i >= 0; i--) {
      // 同一个 host 的旧条目，或者 host 已经从文档里被整体移除（比如所在
      // 卡片被删除重建）的陈旧条目，都在这里一并摘掉。
      if (registry[i].host === host || !document.contains(registry[i].host)) {
        registry.splice(i, 1);
      }
    }
  }

  // after（可选）：每次插入后同步调用一次，给图一个"插进文档后再量一次"的机会——
  // 甘特图用它处理"画完内容变高 → 页面出现竖向滚动条 → 宿主变窄"的情形（见 gantt.js）。
  function mount(host, draw, after) {
    unmount(host);
    host.innerHTML = '';
    host.appendChild(draw());
    if (after) after();
    registry.push({
      host: host,
      redraw: function () {
        host.innerHTML = '';
        host.appendChild(draw());
        if (after) after();
      }
    });
  }

  DS.svg = {
    /* 内部工具：给排在本文件之后的分片（src/gantt.js）复用同一个 registry 与取色，
       不是对外 API（同 DS.charts._util 的做法）。 */
    _util: { mount: mount, colors: colors, truncateTo: truncateTo },

    /* 重画 root 内（元素或选择器；省略 = 整个文档）当前可见的 SVG 图。SVG 图在创建
       时按宿主宽度取样；宿主在隐藏面板里时取到的是 0，面板变可见后用它按真实宽度
       重画（DS.sidebar 切换面板时自动调用）。可重复调用，不新增监听器。 */
    redrawIn: function (root) {
      if (typeof root === 'string') root = document.querySelector(root);
      root = root || document;
      var n = 0;
      registry.slice().forEach(function (entry) {
        if (!document.contains(entry.host) || !root.contains(entry.host)) return;
        if (entry.host.clientWidth === 0) return;
        try { entry.redraw(); n++; } catch (e) { console.warn('DS.svg: 重绘失败', e); }
      });
      return n;
    },

    /* DS.svg.gantt / ganttLayoutMarkers / fmtClock 在 src/gantt.js（排在本文件之后，
       借下面的 _util 挂载进同一个 registry，主题切换/redrawIn 一并重画）。 */

    /* matrix: number[][]; opts.rows/cols: 可选的行/列标签字符串数组 */
    heatmap: function (host, matrix, opts) {
      opts = opts || {};
      matrix = matrix || [];
      var pad = 2;
      var rowLabels = opts.rows || null;
      var colLabels = opts.cols || null;
      var labelW = rowLabels ? 70 : 0;
      var labelH = colLabels ? 22 : 0;

      function draw() {
        var c = colors();
        var cols = (matrix[0] || []).length;
        // 格子大小随宿主实际宽度自适应，而不是写死 22px——固定值在真实卡片
        // 宽度下要么挤成一小块、要么（列数少时）大片留白。按宿主可用宽度
        // 均分给每一列，夹在 [28, 72] 之间：太小挤不下数字/悬停目标，太大
        // 稀疏矩阵会显得突兀。
        var w0 = host.clientWidth || 640;
        var cell = Math.max(28, Math.min(72, Math.floor((w0 - labelW) / Math.max(1, cols))));
        var w = labelW + cols * cell;
        var h = labelH + matrix.length * cell;
        var flat = matrix.reduce(function (a, r) { return a.concat(r); }, []);
        var max = Math.max.apply(null, flat.concat([1]));

        var svg = el('svg', {
          'class': 'ds-svg-chart', width: '100%', height: h,
          viewBox: '0 0 ' + w + ' ' + h
        });

        if (colLabels) {
          colLabels.forEach(function (label, ci) {
            svg.appendChild(labelText(
              labelW + ci * cell + cell / 2, labelH - 5, label, c.text,
              { 'text-anchor': 'middle', 'font-size': 11 }
            ));
          });
        }

        matrix.forEach(function (row, ri) {
          if (rowLabels && rowLabels[ri] != null) {
            svg.appendChild(labelText(
              0, labelH + ri * cell + cell / 2 + 4, rowLabels[ri], c.text, { 'font-size': 10 }
            ));
          }
          row.forEach(function (v, ci) {
            var ratio = max > 0 ? v / max : 0;
            var rect = el('rect', {
              x: labelW + ci * cell + pad / 2,
              y: labelH + ri * cell + pad / 2,
              width: cell - pad, height: cell - pad, rx: 2,
              fill: c.series[0],
              // 色阶用单一系列色配不同不透明度实现，最低档也必须可见——
              // 纯透明会把"数值是 0"和"这里压根没有数据"混为一谈。
              // 2026-10-14 审查（Review D4）：地板值曾是 0.08——#0072b2 以
              // 8% 不透明度叠在深色主题 --color-surface(#18181b) 上合成得
              // rgb(22,31,39)，跟背景 rgb(24,24,27) 肉眼基本无法区分，直接
              // 推翻了上面这条注释自述的设计意图。改成 0.22（实测：合成色
              // 与背景对比度浅色主题 1.37、深色主题 1.23，均明显高于原 0.08
              // 档位的 1.12/1.06——用于判定的 svg-heatmap-min-opacity-visible
              // 断言也同步改成直接核验这个合成对比度，而不是只判 opacity>0）。
              'fill-opacity': Math.max(0.22, ratio)
            });
            var title = el('title', {});
            title.textContent = String(v);
            rect.appendChild(title);
            svg.appendChild(rect);
          });
        });
        return svg;
      }

      mount(host, draw);
      return host.querySelector('svg');
    }
  };

  document.addEventListener('ds:themechange', function () {
    // 逐个隔离：dispatchEvent() 不会把监听器里的异常传给调用方（DS.theme.set()
    // 照常返回），一个 host 画炸了不能把 registry 里排在它后面的图都拖下水
    // ——这正是 charts.js 的 retheme() 踩过并修复过的同一个坑。
    for (var i = registry.length - 1; i >= 0; i--) {
      var entry = registry[i];
      if (!document.contains(entry.host)) { registry.splice(i, 1); continue; }
      try {
        entry.redraw();
      } catch (e) {
        console.warn('DS.svg: 重绘失败', e);
      }
    }
  });
})(window.DS);
