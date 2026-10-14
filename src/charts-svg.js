/* charts-svg.js —— Chart.js 画不了的特型图：甘特、热力。

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
  // 甘特图的机台名称截断规则要和 Task 5 的刻度截断观感一致（同一套 token/
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
  // 甘特图的行标签需要按自己的可用像素宽度单独算一个更短的阈值，见 gantt()。
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

  function mount(host, draw) {
    unmount(host);
    host.innerHTML = '';
    host.appendChild(draw());
    registry.push({
      host: host,
      redraw: function () {
        host.innerHTML = '';
        host.appendChild(draw());
      }
    });
  }

  DS.svg = {
    /* rows: Array<{label: string, bars: Array<{start, end, series?}>}> */
    gantt: function (host, rows, opts) {
      opts = opts || {};
      rows = rows || [];
      var rowH = 22, pad = 6, labelW = 120;
      // 行标签不能按共享的 maxLabel()（10 字）截断：那是给 Chart.js 刻度
      // 用的通用阈值，没考虑甘特图自己的 labelW。10 字中文在 11px 字号下
      // 实测宽度已经跟绘图区起点（labelW=120）只剩 4-6px 间隙，视觉上贴着
      // 条形。留一道 14px 的呼吸间隙（labelGutter），再按"每字约 11px"
      // 倒推允许的字数——绘图区起点仍然是 labelW，不挪动条形，只是让标签
      // 自己截得更短，给自己让出这道间隙。
      var labelGutter = 14;
      var rowLabelMaxLen = Math.max(1, Math.floor((labelW - labelGutter) / 11));

      function draw() {
        var c = colors();
        var h = opts.height || (rows.length * rowH + pad * 2);
        var w = host.clientWidth || 640;
        var plotW = Math.max(40, w - labelW - pad);

        var maxEnd = 1;
        rows.forEach(function (r) {
          (r.bars || []).forEach(function (b) { if (b.end > maxEnd) maxEnd = b.end; });
        });

        var svg = el('svg', {
          'class': 'ds-svg-chart', width: '100%', height: h,
          viewBox: '0 0 ' + w + ' ' + h
        });

        rows.forEach(function (r, i) {
          var y = pad + i * rowH;
          svg.appendChild(labelText(0, y + rowH * 0.7, r.label, c.text, null, rowLabelMaxLen));
          svg.appendChild(el('line', {
            x1: labelW, y1: y + rowH - 1, x2: w - pad, y2: y + rowH - 1,
            stroke: c.grid, 'stroke-width': 1
          }));
          (r.bars || []).forEach(function (b) {
            var bar = el('rect', {
              x: labelW + (b.start / maxEnd) * plotW,
              y: y + 3,
              width: Math.max(2, ((b.end - b.start) / maxEnd) * plotW),
              height: rowH - 8,
              rx: 3,
              fill: c.series[(b.series || 0) % c.series.length]
            });
            var title = el('title', {});
            title.textContent = r.label + '：' + b.start + '–' + b.end;
            bar.appendChild(title);
            svg.appendChild(bar);
          });
        });
        return svg;
      }

      mount(host, draw);
      return host.querySelector('svg');
    },

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
