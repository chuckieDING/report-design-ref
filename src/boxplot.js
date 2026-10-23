/* boxplot.js —— 箱线图：全部基于 Chart.js，不手写 SVG、不引入外部插件。
   实现拆成三块：
     1. 箱体 = bar 数据集的悬浮柱 [Q1, Q3]（半透明填充 + 不透明描边，按类目着色走 --chart-s1…s10）；
     2. 离群点 = 一个真实的 scatter 数据集（点位置由 Chart.js 布局，悬停/命中/缩放裁剪都是原生的，
        悬浮框能直接拿到"该点的值"）；
     3. 本文件内的插件在 afterDatasetsDraw 画中位线、上下须线与端帽（这些不是数据点，Chart.js 没有对应元素）。
   为了让 index 模式不被 scatter 数据集的下标串台（两个数据集的下标含义不同），悬浮/交互用本文件
   注册的 Chart.js 交互模式 'dsBoxplot'：指针压在离群点上 → 只命中该点；否则 → 命中指针所在类目的箱体
   （整列都响应，须线上也能出悬浮框）。
   依赖 charts.js，必须排在它之后。

   统计规则（写进 README）：
     - Q1/中位数/Q3：线性插值分位数，h = (n-1)·p，取 x[floor(h)] 与 x[ceil(h)] 的线性插值
       （即 R 的 type 7 = NumPy 默认 linear = Excel QUARTILE.INC / PERCENTILE.INC）；
     - 须线延伸到 [Q1 − 1.5·IQR, Q3 + 1.5·IQR] 范围内的最远实际数据点；范围外的点是离群点。 */
(function (DS) {
  'use strict';
  var U = DS.charts._util;

  // 线性插值分位数（R type 7）。sorted 是升序数组，p 在 [0,1]。
  function quantile(sorted, p) {
    var n = sorted.length;
    if (n === 1) return sorted[0];
    var h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
  }

  // 一组原始数值 → 统计量；没有有限数值返回 null。min/max 是须线两端（不是数据最小/最大值）。
  function boxStats(values) {
    var xs = (values || []).filter(function (v) { return v != null && v !== '' && isFinite(Number(v)); })
      .map(Number).sort(function (a, b) { return a - b; });
    if (!xs.length) return null;
    var q1 = quantile(xs, 0.25), med = quantile(xs, 0.5), q3 = quantile(xs, 0.75);
    var iqr = q3 - q1, lowFence = q1 - 1.5 * iqr, highFence = q3 + 1.5 * iqr;
    var inside = xs.filter(function (v) { return v >= lowFence && v <= highFence; });
    return {
      n: xs.length, min: inside[0], q1: q1, median: med, q3: q3, max: inside[inside.length - 1],
      outliers: xs.filter(function (v) { return v < lowFence || v > highFence; })
    };
  }

  // groups: [{label, values:[…]}] 或已算好的 [{label, stats:{min,q1,median,q3,max,n?,outliers?}}]。
  // 没有有效数据的组被丢弃（不占类目位）。返回 { labels, stats }。
  function boxplotData(groups) {
    var out = { labels: [], stats: [] };
    (groups || []).forEach(function (g) {
      if (!g) return;
      var st = null;
      if (g.stats) {
        var s = g.stats;
        if ([s.min, s.q1, s.median, s.q3, s.max].every(function (v) { return v != null && isFinite(Number(v)); })) {
          st = { n: s.n != null ? s.n : null, min: +s.min, q1: +s.q1, median: +s.median, q3: +s.q3, max: +s.max,
                 outliers: (s.outliers || []).map(Number) };
        }
      } else {
        st = boxStats(g.values);
      }
      if (!st) return;
      out.labels.push(String(g.label));
      out.stats.push(st);
    });
    return out;
  }

  function fmtNum(v) { return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

  // 交互模式（见文件头）：离群点优先，其次类目整列。
  var OUTLIER_HIT = 4;   // 在点半径之外再放宽的命中像素
  if (typeof Chart !== 'undefined' && Chart.Interaction && Chart.Interaction.modes) {
    Chart.Interaction.modes.dsBoxplot = function (chart, e) {
      var pos = Chart.helpers.getRelativePosition(e, chart);
      var boxDi = -1, outDi = -1;
      chart.data.datasets.forEach(function (d, i) {
        if (d.dsBox && boxDi < 0) boxDi = i;
        if (d.dsOutliers && outDi < 0) outDi = i;
      });
      if (boxDi < 0) return [];
      if (outDi >= 0 && chart.isDatasetVisible(outDi)) {
        var om = chart.getDatasetMeta(outDi), best = null, bd = Infinity;
        om.data.forEach(function (el, i) {
          var dx = pos.x - el.x, dy = pos.y - el.y, d = Math.sqrt(dx * dx + dy * dy);
          var r = (el.options && el.options.radius != null ? el.options.radius : 3) + OUTLIER_HIT;
          if (d <= r && d < bd) { bd = d; best = { element: el, datasetIndex: outDi, index: i }; }
        });
        if (best) return [best];
      }
      if (!chart.chartArea || !chart.isPointInArea(pos)) return [];
      var horiz = chart.options.indexAxis === 'y';
      var cat = horiz ? chart.scales.y : chart.scales.x;
      var idx = Math.round(cat.getValueForPixel(horiz ? pos.y : pos.x));
      var bm = chart.getDatasetMeta(boxDi);
      var el2 = bm.data[idx];
      if (!el2 || el2.skip) return [];
      return [{ element: el2, datasetIndex: boxDi, index: idx }];
    };
  }

  // 中位线、须线与端帽。位置全部由 scale 换算，每次绘制现读 token（主题切换后跟随）。
  // 中位线用文本色（--color-text）：箱体填充与描边都是类目色，同色的中位线会被吃掉；须线/端帽用类目色。
  // 箱体填充透明度：与面积图同一量级（0.34 论证见 charts.js AREA_FILL_ALPHA：深浅主题下十色合成后都高于可见性下限），
  // 描边不透明；取 0.35 让半透明箱体下的网格线隐约可见。
  var BOX_FILL_ALPHA = 0.35;
  var CAP_RATIO = 0.5;       // 端帽宽度 = 箱宽 × 0.5
  var MEDIAN_WIDTH = 2.5, WHISKER_WIDTH = 1.5;
  var BOX_PLUGIN = {
    id: 'dsBoxplot',
    afterDatasetsDraw: function (chart) {
      var di = -1;
      chart.data.datasets.forEach(function (d, i) { if (di < 0 && d.dsBox) di = i; });
      if (di < 0 || !chart.isDatasetVisible(di) || !chart.chartArea) return;
      var st = chart.data.datasets[di].dsBox.stats;
      var meta = chart.getDatasetMeta(di);
      var horiz = chart.options.indexAxis === 'y';
      var vScale = horiz ? chart.scales.x : chart.scales.y;
      var a = chart.chartArea, ctx = chart.ctx;
      var tc = DS.charts.themeColors(), textColor = U.cssVar('--color-text');
      function seg(i1, v1, i2, v2) {   // 沿"类目方向"位置 i1→i2、数值 v1→v2 的线段
        ctx.beginPath();
        if (horiz) { ctx.moveTo(vScale.getPixelForValue(v1), i1); ctx.lineTo(vScale.getPixelForValue(v2), i2); }
        else { ctx.moveTo(i1, vScale.getPixelForValue(v1)); ctx.lineTo(i2, vScale.getPixelForValue(v2)); }
        ctx.stroke();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top);
      ctx.clip();
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      meta.data.forEach(function (el, i) {
        var s = st[i];
        if (!s || el.skip) return;
        var p = el.getProps(['x', 'y', 'width', 'height'], true);
        var c = horiz ? p.y : p.x, half = (horiz ? p.height : p.width) / 2, cap = half * CAP_RATIO;
        var col = tc.seriesExt[i % tc.seriesExt.length];
        ctx.strokeStyle = col;
        ctx.lineWidth = WHISKER_WIDTH;
        seg(c, s.q3, c, s.max);          // 上须
        seg(c, s.q1, c, s.min);          // 下须
        seg(c - cap, s.max, c + cap, s.max);   // 上端帽
        seg(c - cap, s.min, c + cap, s.min);   // 下端帽
        ctx.strokeStyle = textColor;
        ctx.lineWidth = MEDIAN_WIDTH;
        seg(c - half, s.median, c + half, s.median);   // 中位线
      });
      ctx.restore();
    }
  };

  /* 一步建箱线图。opts：
       indexAxis   'x'（默认，纵向）| 'y'（横向）
       valueTitle  数值轴标题
       label       箱体数据集名（默认 '分布'）
     返回 Chart.js 实例（没有有效数据返回 null，走空态）。 */
  DS.charts.boxplot = function (canvas, groups, opts) {
    opts = opts || {};
    var prep = boxplotData(groups);
    var horiz = opts.indexAxis === 'y';
    var valueAxis = horiz ? 'x' : 'y';
    var lo = Infinity, hi = -Infinity, outPts = [];
    prep.stats.forEach(function (s, g) {
      lo = Math.min(lo, s.min); hi = Math.max(hi, s.max);
      s.outliers.forEach(function (v) {
        lo = Math.min(lo, v); hi = Math.max(hi, v);
        // 类目轴上的点用类目名定位（category scale 把数字当"标签文字"解析，不是下标，直接写下标会错位）
        outPts.push(horiz ? { x: v, y: prep.labels[g], g: g } : { x: prep.labels[g], y: v, g: g });
      });
    });
    var vScale = {
      beginAtZero: false,
      grace: '6%',
      ticks: { callback: function (v) { return fmtNum(v); } },
      title: { display: !!opts.valueTitle, text: opts.valueTitle || '' }
    };
    // 须线两端与离群点不是 bar 的数据（箱体只有 Q1..Q3），量程要显式把它们纳进来
    if (isFinite(lo) && isFinite(hi)) { vScale.suggestedMin = lo; vScale.suggestedMax = hi; }
    var scales = {};
    scales[valueAxis] = vScale;
    var config = {
      type: 'bar',
      data: {
        labels: prep.labels,
        datasets: [
          {
            type: 'bar', label: opts.label || '分布',
            data: prep.stats.map(function (s) { return [s.q1, s.q3]; }),
            dsBox: { stats: prep.stats }, $dsOwned: true,
            borderWidth: 2, borderSkipped: false, barPercentage: 0.6, categoryPercentage: 0.8, maxBarThickness: 72
          },
          {
            type: 'scatter', label: '离群点', data: outPts, indexAxis: 'x',
            dsOutliers: true, $dsOwned: true,
            pointRadius: 3, pointHoverRadius: 5, borderWidth: 1.5, showLine: false
          }
        ]
      },
      plugins: [BOX_PLUGIN],
      options: {
        indexAxis: horiz ? 'y' : 'x',
        interaction: { mode: 'dsBoxplot', intersect: false },
        scales: scales,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'dsBoxplot', intersect: false,
            callbacks: {
              title: function (items) {
                var it = items && items[0];
                if (!it) return '';
                if (it.dataset.dsOutliers && it.raw && it.raw.g != null) return it.chart.data.labels[it.raw.g];
                return it.chart.data.labels[it.dataIndex];
              },
              label: function (ctx) {
                if (ctx.dataset.dsOutliers) {
                  var v = ctx.chart.options.indexAxis === 'y' ? ctx.raw.x : ctx.raw.y;
                  return '离群点 ' + fmtNum(v);
                }
                var s = ctx.dataset.dsBox.stats[ctx.dataIndex];
                return [
                  '最大值（须线上端） ' + fmtNum(s.max),
                  'Q3 ' + fmtNum(s.q3),
                  '中位数 ' + fmtNum(s.median),
                  'Q1 ' + fmtNum(s.q1),
                  '最小值（须线下端） ' + fmtNum(s.min),
                  '样本数 ' + (s.n != null ? U.fmtInt(s.n) : '—'),
                  '离群点个数 ' + s.outliers.length
                ];
              }
            }
          }
        }
      },
      $dsPainters: [function (c, cfg) {
        var box = cfg.data.datasets[0], out = cfg.data.datasets[1];
        var n = box.data.length, cols = [], fills = [];
        for (var i = 0; i < n; i++) {
          var col = c.seriesExt[i % c.seriesExt.length];
          cols.push(col);
          fills.push(U.hexToRgba(col, BOX_FILL_ALPHA));
        }
        box.backgroundColor = fills;
        box.borderColor = cols;
        var pc = out.data.map(function (pt) { return cols[pt.g]; });
        out.backgroundColor = pc;
        out.borderColor = pc.slice();
      }]
    };
    return DS.charts.create(canvas, config);
  };
  DS.charts.boxplotData = boxplotData;
  DS.charts.boxStats = boxStats;
})(window.DS);
