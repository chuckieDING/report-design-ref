/* waterfall.js —— 瀑布图：Chart.js 原生悬浮柱（bar 的 data 写成 [start, end]），不引入插件。
   依赖 charts.js（DS.charts.create / paint 的 $dsPainters 钩子 / _util），必须排在它之后。

   数据模型：items = [{label, value, type}]
     - type 省略 = 增减项：从上一个累计值画到「累计 + value」；value >= 0 算"增加"（0 也算），< 0 算"减少"。
     - type:'total' = 合计柱：从 0 画到当前累计值。value 缺省 → 取当前累计（小计/期末合计）；
       value 给了 → 以它作为新的累计基线（起始柱「上月工作量」就是这样写的）。
     - value 不是有限数的增减项会被忽略（不占柱位）。
   库负责累计与 [start, end]。 */
(function (DS) {
  'use strict';
  var U = DS.charts._util;

  var MINUS = '−';   // 真正的减号，不是连字符
  function fmtSigned(v) { return (v < 0 ? MINUS : '+') + U.fmtInt(Math.abs(v)); }
  function fmtPlain(v) { return (v < 0 ? MINUS : '') + U.fmtInt(Math.abs(v)); }

  // 纯函数：条目 → { labels, ranges:[[start,end]], cum, deltas, kinds }
  // kinds 取 'up' | 'down' | 'total'；deltas[i] 对合计柱为 null。
  function waterfallData(items) {
    var running = 0;
    var out = { labels: [], ranges: [], cum: [], deltas: [], kinds: [] };
    (items || []).forEach(function (it) {
      if (!it) return;
      var hasValue = it.value != null && it.value !== '' && isFinite(Number(it.value));
      var v = hasValue ? Number(it.value) : NaN;
      if (it.type === 'total') {
        if (hasValue) running = v;
        out.ranges.push([0, running]);
        out.deltas.push(null);
        out.kinds.push('total');
      } else {
        if (!hasValue) return;
        var start = running;
        running = running + v;
        out.ranges.push([start, running]);
        out.deltas.push(v);
        out.kinds.push(v < 0 ? 'down' : 'up');
      }
      out.labels.push(String(it.label));
      out.cum.push(running);
    });
    return out;
  }

  // 颜色：增加 --color-success、减少 --color-danger、合计 --color-primary，直接用这三个基色实心填充。
  // 理由：tokens.css 头部明确这三个基色的用途就是"填充/边框/图表"（tint 是浅底、ink 是文字色，
  // 拿来填柱子对比度不够）；深色主题里它们本身就被换成了更亮的版本，实心柱仍然清楚。
  var KIND_TOKEN = { up: '--color-success', down: '--color-danger', total: '--color-primary' };
  function kindColor(kind) { return U.cssVar(KIND_TOKEN[kind]); }

  // 连接线：从前一柱终点水平（横向图是垂直）连到后一柱起点。连接的"水平"= 前一柱的累计值；
  // 后一柱是增减项时它正是该柱起点，是合计柱时它正是该柱的顶（合计 = 当前累计）。
  var CONNECTOR_PLUGIN = {
    id: 'dsWaterfallConnector',
    afterDatasetsDraw: function (chart) {
      var cfg = chart.options && chart.options.dsWaterfall;
      if (!cfg || cfg.connector === false || !chart.chartArea) return;
      var di = -1;
      chart.data.datasets.forEach(function (d, i) { if (di < 0 && d.dsWaterfall) di = i; });
      if (di < 0 || !chart.isDatasetVisible(di)) return;
      var meta = chart.getDatasetMeta(di), wf = chart.data.datasets[di].dsWaterfall;
      var horiz = chart.options.indexAxis === 'y';
      var vScale = horiz ? chart.scales.x : chart.scales.y;
      var a = chart.chartArea, ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top);
      ctx.clip();
      ctx.strokeStyle = U.cssVar('--chart-axis');
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (var i = 0; i < meta.data.length - 1; i++) {
        var p = meta.data[i].getProps(['x', 'y', 'width', 'height'], true);
        var q = meta.data[i + 1].getProps(['x', 'y', 'width', 'height'], true);
        var lv = vScale.getPixelForValue(wf.cum[i]);
        ctx.beginPath();
        if (horiz) {
          ctx.moveTo(lv, p.y + p.height / 2);
          ctx.lineTo(lv, q.y - q.height / 2);
        } else {
          ctx.moveTo(p.x + p.width / 2, lv);
          ctx.lineTo(q.x - q.width / 2, lv);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  /* 一步建瀑布图。opts：
       indexAxis  'x'（默认，纵向）| 'y'（横向）
       connector  false 关闭连接线（默认 true）
       label      数据集名（默认 '数值'）
       valueTitle 数值轴标题（默认无）
     返回 Chart.js 实例（条目为空时返回 null，走空态）。 */
  DS.charts.waterfall = function (canvas, items, opts) {
    opts = opts || {};
    var prep = waterfallData(items);
    var horiz = opts.indexAxis === 'y';
    var valueAxis = horiz ? 'x' : 'y';
    var scales = {};
    scales[valueAxis] = {
      ticks: { callback: function (v) { return fmtPlain(v); } },
      title: { display: !!opts.valueTitle, text: opts.valueTitle || '' }
    };
    var config = {
      type: 'bar',
      data: {
        labels: prep.labels,
        datasets: [{
          label: opts.label || '数值',
          data: prep.ranges,
          dsWaterfall: { cum: prep.cum, deltas: prep.deltas, kinds: prep.kinds },
          $dsOwned: true,
          borderWidth: 1,
          borderSkipped: false,
          barPercentage: 0.8,
          maxBarThickness: 72
        }]
      },
      plugins: [CONNECTOR_PLUGIN],
      options: {
        indexAxis: horiz ? 'y' : 'x',
        dsWaterfall: { connector: opts.connector !== false },
        scales: scales,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var wf = ctx.dataset.dsWaterfall, i = ctx.dataIndex;
                if (!wf) return '';
                if (wf.kinds[i] === 'total') return ['合计 ' + fmtPlain(wf.cum[i])];
                return ['本项 ' + fmtSigned(wf.deltas[i]), '累计 ' + fmtPlain(wf.cum[i])];
              }
            }
          }
        }
      },
      $dsPainters: [function (c, cfg) {
        var d = cfg.data.datasets[0], wf = d.dsWaterfall;
        var cols = wf.kinds.map(kindColor);
        d.backgroundColor = cols;
        d.borderColor = cols.slice();
      }]
    };
    return DS.charts.create(canvas, config);
  };
  DS.charts.waterfallData = waterfallData;
})(window.DS);
