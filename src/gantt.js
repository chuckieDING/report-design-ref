/* gantt.js —— 甘特图 DS.svg.gantt：整点时间轴 + 资源行 + 任务条 + 标记线 + 图例 + 悬浮框 + 明细表。
   依赖 charts-svg.js（DS.svg._util：同一个 registry / 取色）与 charts.js（themeColors），必须排在它们之后。

   为什么用 HTML 元素而不是 SVG：条内文字要按条宽裁切、行标签要在横向滚动时 sticky、
   标记线标签是带边框/光环的药丸——这些 CSS 一行就能做到，SVG 里要自己算。API 仍挂在
   DS.svg 下（历史命名：DS.svg = "Chart.js 画不了、手写的图"），主题切换与 redrawIn 照样
   整块重画。

   不用 requestAnimationFrame（headless chromium 中永不回调）：绘制完全同步；入场动画是
   纯 CSS animation，悬浮框的显隐直接改 opacity，不靠过渡。

   数据模型（全部可选字段向后兼容最简调用 {label, bars:[{start, end, series}]}）：
     rows = [{ label, lanes?, bars: [{ start, end, series?, category?, value?, label?, count?,
               breakdown?, flags?: {overflow, extra}, lane? }] }]
     时间单位是分钟（从当日 00:00 起算），可以 > 1440 表示跨日（1500 = 次日 01:00，显示 01:00⁺¹）。
   opts 见 README「甘特图」一节。 */
(function (DS) {
  'use strict';
  var U = DS.svg._util;

  var LABEL_W = 120;          // 行标签列宽（沿用旧版；横向滚动时 sticky）
  var LABEL_PAD = 12;         // 行标签左右内边距合计
  var FRAME = 2;              // .ds-gantt-scroll 左右边框合计：内容宽 = 宿主宽 − 2 时恰好不出横向滚动条
  var MIN_PLOT_W = 700;       // 绘图区最小宽度：再窄就横向滚动，不再压缩时间轴
  var ROW_H = 36;             // 普通行高；条 top 7、高 24
  var MIN_BAR_W = 8;          // 最小条宽：1 分钟的短条也要看得见、摸得着
  var TEXT_MIN_W = 28;        // 窄于这个宽度的条不写字（只留悬浮框），避免一截被裁掉的残字
  var AXIS_BASE = 30;         // 轴高 = 30 + 标记线标签行数 × 22
  var MARKER_ROW_H = 22;
  var MARKER_MAX_ROW = 4;     // 标签最多堆 5 行（0–4），之后强制放第 4 行
  var MARKER_LABEL_H = 20;    // 药丸高度（与 components.css 一致）；线从 2+row×22+24 开始
  var TICK_CLEAR = 10;        // 刻度距任一标记线 < 10px：只删数字、保留刻度线
  var TICK_MIN_GAP = 44;      // 相邻刻度至少相隔的像素（整点步长按此自动放大）
  var TIP_W = 260;

  function h(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    return n;
  }

  function num(v) { return v == null || v === '' ? NaN : Number(v); }

  /* ---------- 纯函数：时间格式 ---------- */
  var SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  // 'HH:MM'，跨日加上标天数（'01:30⁺¹'）。先把总分钟取整再拆时/分——
  // 先拆再分别取整会把 59.6 分钟显示成 "xx:60"。
  function fmtClock(min) {
    var t = Math.round(num(min));
    if (!isFinite(t)) return '';
    var day = Math.floor(t / 1440), m = ((t % 1440) + 1440) % 1440;
    var s = pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
    if (day !== 0) {
      s += (day > 0 ? '⁺' : '⁻') + String(Math.abs(day)).split('').map(function (d) { return SUP[+d]; }).join('');
    }
    return s;
  }

  // 时长：'2h28m' / '45m' / '3h'（等宽字体里比"2小时28分"短一半，条内放得下）
  function fmtDur(min) {
    var t = Math.max(0, Math.round(num(min)));
    if (!isFinite(t)) return '';
    var hh = Math.floor(t / 60), mm = t % 60;
    return (hh ? hh + 'h' : '') + (mm ? mm + 'm' : (hh ? '' : '0m'));
  }

  /* ---------- 纯函数：标记线标签避让 ----------
     标签宽度按字符估算（CJK 7.2px / 其它 5.6px，+26 留给边框、内边距与离线 10px 的偏移），
     夹在 [50, 130]。DOM 里药丸的宽度就用这个估算值（文字放不下时省略号 + title），
     所以布局算出来的区间就是药丸真实占据的区间，不会"算着不重叠、画出来重叠"。 */
  var CJK_RE = /[\u4e00-\u9fff]/;
  function estLabelW(txt) {
    txt = String(txt == null ? '' : txt);
    var w = 0;
    for (var i = 0; i < txt.length; i++) w += CJK_RE.test(txt.charAt(i)) ? 7.2 : 5.6;
    return Math.min(130, Math.max(50, Math.round(w + 26)));
  }

  var RANGE_GAP = 4;      // 同一行两个标签至少隔 4px，贴在一起读起来像一个
  var LOOKAHEAD = 100;    // 线左右各 100px 内已放下的标签数 = 该侧的拥挤度

  /* markers: [{x, label, priority?, w?}]，W = 绘图区宽度。
     返回与输入同序的 [{row, anchor, range:[l, r], w}]：
       anchor 'left'  = 标签在线的右侧（标签左缘贴线，区间 [x−10, x+w−10]）；
       anchor 'right' = 标签在线的左侧（区间 [x−w+10, x+10]）。
     处理顺序 = 优先级：都没给 priority 时按传入顺序；给了的按 priority 升序（小的先占位，
     没给的排在后面），同值保持传入顺序。先占位的拿到第 0 行与想要的一侧。
     规则：只有一侧放得进 [0, W] 就放那侧；两侧都行时选左右 100px 内已放标签更少的一侧，
     一样多就选空间更大的一侧；同行碰撞先试本行翻边，翻不了才下移一行；最多 5 行，
     第 5 行仍碰撞就强制叠在第 4 行。 */
  function layoutMarkers(markers, W) {
    markers = markers || [];
    W = num(W);
    var order = markers.map(function (m, i) { return i; });
    var hasPri = markers.some(function (m) { return m && isFinite(num(m.priority)); });
    if (hasPri) {
      var pri = function (i) { var p = num(markers[i] && markers[i].priority); return isFinite(p) ? p : Infinity; };
      order.sort(function (a, b) { return (pri(a) - pri(b)) || (a - b); });
    }
    var occupied = [];
    var out = new Array(markers.length);
    function overlap(a, b) { return !(a[1] + RANGE_GAP <= b[0] || b[1] + RANGE_GAP <= a[0]); }
    function touches(r, win) { return r[1] >= win[0] && r[0] <= win[1]; }

    order.forEach(function (i) {
      var m = markers[i] || {};
      var x = num(m.x);
      var w = isFinite(num(m.w)) ? num(m.w) : estLabelW(m.label);
      function rangeOf(a) { return a === 'right' ? [x - w + 10, x + 10] : [x - 10, x + w - 10]; }
      var fitsLeft = (x - w + 10) >= 0;     // anchor 'right' 放得下
      var fitsRight = (x + w - 10) <= W;    // anchor 'left' 放得下

      var placed = [];
      occupied.forEach(function (rowList) { placed = placed.concat(rowList); });
      var leftDensity = placed.filter(function (r) { return touches(r, [x - LOOKAHEAD, x]); }).length;
      var rightDensity = placed.filter(function (r) { return touches(r, [x, x + LOOKAHEAD]); }).length;

      var anchor;
      if (fitsRight && !fitsLeft) anchor = 'left';
      else if (fitsLeft && !fitsRight) anchor = 'right';
      else if (leftDensity > rightDensity && fitsRight) anchor = 'left';
      else if (rightDensity > leftDensity && fitsLeft) anchor = 'right';
      else anchor = (W - x >= x) ? 'left' : 'right';

      var range = rangeOf(anchor);
      var row = 0;
      for (;;) {
        if (!occupied[row]) occupied[row] = [];
        if (!occupied[row].some(function (r) { return overlap(range, r); })) break;
        var alt = anchor === 'right' ? 'left' : 'right';
        var altFits = alt === 'left' ? fitsRight : fitsLeft;
        if (altFits) {
          var altRange = rangeOf(alt);
          if (!occupied[row].some(function (r) { return overlap(altRange, r); })) {
            anchor = alt; range = altRange; break;
          }
        }
        row++;
        if (row > MARKER_MAX_ROW) { row = MARKER_MAX_ROW; break; }
      }
      occupied[row].push(range);
      out[i] = { row: row, anchor: anchor, range: range, w: w };
    });
    return out;
  }

  /* ---------- 颜色：token 解析与对比度 ---------- */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  // 调用方可传 'var(--chart-s3)' 或 '--chart-s3'（不允许颜色字面量进源码，色值只来自 token）
  function resolveColor(c) {
    if (c == null) return null;
    c = String(c).trim();
    var m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(c);
    if (m) return cssVar(m[1]) || null;
    if (/^--[\w-]+$/.test(c)) return cssVar(c) || null;
    return c;
  }
  function rgbOf(c) {
    c = String(c || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) {
      var hx = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
      return [parseInt(hx.substr(0, 2), 16), parseInt(hx.substr(2, 2), 16), parseInt(hx.substr(4, 2), 16)];
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function lum(rgb) {
    function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  }
  function contrast(a, b) {
    var ra = rgbOf(a), rb = rgbOf(b);
    if (!ra || !rb) return 0;
    var la = lum(ra), lb = lum(rb);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  // 条内字色：在 --gantt-ink-dark / --gantt-ink-light（黑/白）里取对比度更高的一个。
  // 纯黑/纯白在任何底色上至少有一个 ≥ 4.58（两者对比度的几何平均 = √21），
  // 所以"更高的那个"恒满足 WCAG AA 4.5。
  function inkFor(bg, inks) {
    return contrast(inks.dark, bg) >= contrast(inks.light, bg) ? inks.dark : inks.light;
  }

  /* ---------- 共享悬浮框：挂 document.body，position:fixed ----------
     挂 body 而不是挂在图里：任何祖先只要带 transform/filter/contain 就会成为 fixed 元素的
     包含块，悬浮框会跟着内部滚动区漂移。任意滚动/滚轮（capture 阶段，含内部滚动容器）
     立即隐藏——位置是按鼠标的视口坐标算的，内容一动就不准了。 */
  var tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = h('div', 'ds-gantt-tip', { role: 'tooltip' });
      tipEl.style.opacity = '0';
    }
    if (tipEl.parentNode !== document.body) document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTip(lines, e) {
    var t = tip();
    t.innerHTML = '';
    lines.forEach(function (ln) {
      var d = h('div', 'ds-gantt-tip-line');
      d.textContent = ln;
      t.appendChild(d);
    });
    t.style.left = Math.max(0, Math.min(e.clientX + 14, window.innerWidth - TIP_W)) + 'px';
    var top = e.clientY + 14;
    var th = t.offsetHeight;
    if (top + th > window.innerHeight - 4) top = Math.max(4, e.clientY - 14 - th);
    t.style.top = top + 'px';
    t.style.opacity = '1';
  }
  function hideTip() { if (tipEl) tipEl.style.opacity = '0'; }
  window.addEventListener('scroll', hideTip, { capture: true, passive: true });
  window.addEventListener('wheel', hideTip, { capture: true, passive: true });

  function bindTip(node, linesFn) {
    node.addEventListener('mousemove', function (e) { showTip(linesFn(), e); });
    node.addEventListener('mouseleave', hideTip);
  }

  /* ---------- 状态图标（内联 SVG，stroke=currentColor 跟随条内字色） ---------- */
  var ICONS = {
    // 溢出：月牙（超出常规时段）
    overflow: '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M8.6 8.9A4.4 4.4 0 0 1 4.1 1.6a4.4 4.4 0 1 0 6.3 5.6 4.4 4.4 0 0 1-1.8 1.7z" fill="currentColor"/></svg>',
    // 额外：时钟（计划外追加）
    extra: '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 3.4V6l1.8 1.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
  };
  var FLAG_KEYS = ['overflow', 'extra'];
  var FLAG_LABELS = { overflow: '溢出', extra: '额外' };
  var FLAG_NOTES = {
    overflow: '溢出：该段的结束时间超出了常规时段。\n条左端以月牙图标标注，底色仍按数值分档。',
    extra: '额外：计划之外追加的一段。\n条左端以时钟图标标注，底色仍按数值分档。'
  };
  function icon(flag) {
    var s = h('span', 'ds-gantt-icon', { 'data-flag': flag });
    s.innerHTML = ICONS[flag];
    return s;
  }

  // 构成：{A:3, B:2} / [{name, count}] / [[name, count]] → 按数量降序的 [{name, count}]
  function normBreakdown(bd) {
    var list = [];
    if (Array.isArray(bd)) {
      bd.forEach(function (it) {
        if (Array.isArray(it)) list.push({ name: String(it[0]), count: num(it[1]) });
        else if (it && typeof it === 'object') list.push({ name: String(it.name), count: num(it.count) });
      });
    } else if (bd && typeof bd === 'object') {
      Object.keys(bd).forEach(function (k) { list.push({ name: k, count: num(bd[k]) }); });
    }
    list = list.filter(function (it) { return isFinite(it.count); });
    return list.map(function (it, i) { return { name: it.name, count: it.count, i: i }; })
      .sort(function (a, b) { return (b.count - a.count) || (a.i - b.i); });
  }

  function fmtNum(v) {
    if (!isFinite(v)) return '';
    return Math.round(v) === v ? String(v) : String(Math.round(v * 10) / 10);
  }

  // 分档标签：thresholds [60, 90, 120] → ['≤60', '60–90', '90–120', '>120']
  function bandLabels(th, unit) {
    var u = unit || '';
    var out = [];
    for (var i = 0; i <= th.length; i++) {
      if (i === 0) out.push('≤' + fmtNum(th[0]) + u);
      else if (i === th.length) out.push('>' + fmtNum(th[i - 1]) + u);
      else out.push(fmtNum(th[i - 1]) + '–' + fmtNum(th[i]) + u);
    }
    return out;
  }

  var DEFAULT_MARKER_COLORS = ['--color-primary-ink', '--color-danger-ink', '--color-success-ink',
    '--color-warning-ink', '--color-accent', '--color-text-secondary'];
  var LINE_STYLES = { dashed: 1, solid: 1, dotted: 1 };
  var STYLE_NAMES = { dashed: '虚线', solid: '实线', dotted: '点线' };

  var detailsSeq = 0;

  /* 药丸宽度 = max(字符估算, 实测文字宽 + 内边距/边框)，上限 130。字符估算对中文偏小
     （10px 字号的汉字实际就是 10px 宽，估算按 7.2），只用估算会把中文多的标签裁出省略号；
     取两者较大值后，布局区间仍然就是药丸真实占据的区间。实测用 canvas measureText，
     字体与 .ds-gantt-marker-label 一致（600 10px 等宽）。 */
  var measureCtx = null;
  function pillW(text) {
    var est = estLabelW(text);
    try {
      if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = '600 10px ' + (cssVar('--font-mono') || 'monospace');
      var real = Math.ceil(measureCtx.measureText(text).width) + 14;   // 左右内边距 5+5、边框 1+1、余量 2
      return Math.min(130, Math.max(est, real));
    } catch (e) {
      return est;
    }
  }

  /* ---------- 主入口 ---------- */
  function gantt(host, rows, opts) {
    opts = opts || {};
    rows = rows || [];
    var animated = false;          // 入场动画只在第一次"真正可见"的绘制播放（隐藏面板里按 640 兜底画的不算）
    var detailsOpen = false;       // 明细表折叠状态跨重画保留（换主题不该把展开的表收起来）
    var detailsId = 'ds-gantt-details-' + (++detailsSeq);

    function draw(forceW) {
      var c = U.colors();
      var hostW = forceW || host.clientWidth || 640;
      var unit = opts.unit == null ? '' : String(opts.unit);
      var root = h('div', 'ds-gantt', { 'data-gantt': '', 'data-gantt-width': hostW });

      // 行标签只读一次（label 可能是 getter）
      var rowInfo = rows.map(function (r, i) {
        r = r || {};
        var label = r.label == null ? '' : String(r.label);
        var lanes = Math.floor(num(r.lanes));
        return { label: label, lanes: lanes >= 1 ? lanes : 0, bars: [], index: i };
      });
      var items = [];
      rows.forEach(function (r, i) {
        ((r && r.bars) || []).forEach(function (b, j) {
          if (!b) return;
          var s = num(b.start), e = num(b.end);
          if (!isFinite(s) || !isFinite(e)) return;
          if (e < s) { var t = s; s = e; e = t; }
          var bd = normBreakdown(b.breakdown);
          var count = isFinite(num(b.count)) ? num(b.count)
            : (bd.length ? bd.reduce(function (a, it) { return a + it.count; }, 0) : NaN);
          var it = { bar: b, row: i, idx: j, start: s, end: e, count: count, breakdown: bd,
            flags: FLAG_KEYS.filter(function (k) { return b.flags && b.flags[k]; }) };
          it.name = b.label != null ? String(b.label) : rowInfo[i].label + ' ' + fmtClock(s);
          items.push(it);
          rowInfo[i].bars.push(it);
        });
      });

      if (!items.length) {
        var empty = h('div', 'ds-gantt-empty');
        empty.textContent = opts.emptyText || '暂无数据';
        root.appendChild(empty);
        return root;
      }

      /* 时间窗：opts.window 优先；缺省按数据范围向外取整点 */
      var ws, we;
      var win = opts.window || {};
      if (isFinite(num(win.start)) && isFinite(num(win.end)) && num(win.end) > num(win.start)) {
        ws = num(win.start); we = num(win.end);
      } else {
        ws = Math.floor(Math.min.apply(null, items.map(function (it) { return it.start; })) / 60) * 60;
        we = Math.ceil(Math.max.apply(null, items.map(function (it) { return it.end; })) / 60) * 60;
        if (we <= ws) we = ws + 60;
      }
      var span = we - ws;
      var W = Math.max(MIN_PLOT_W, Math.floor(hostW - FRAME - LABEL_W));
      var k = W / span;
      function X(t) { return (t - ws) * k; }
      // 横向位置一律写成绘图区宽度的百分比：绘制之后宿主宽度再变（比如页面随后冒出竖向
      // 滚动条、窄了 15px），条/刻度/标记线跟着等比收放，不会多出一截横向滚动。像素 W 只用于
      // 绘制时的版面决策（标签避让、刻度数字取舍、条内写不写字）；大幅改变宽度后调
      // DS.svg.redrawIn() 按新宽度重新决策。
      function P(x) { return (x / W * 100).toFixed(4) + '%'; }

      /* 着色：数值分档 > 类目 > series（最简调用） */
      var cs = opts.colorScale || null;
      var th = cs && Array.isArray(cs.thresholds) ? cs.thresholds.map(num).filter(isFinite).sort(function (a, b) { return a - b; }) : null;
      if (th && !th.length) th = null;
      var palette = (cs && Array.isArray(cs.colors) && cs.colors.length ? cs.colors.map(resolveColor).filter(Boolean) : null) || c.seriesExt;
      var field = (cs && cs.field) || 'value';
      function fieldVal(it) { return field === 'duration' ? it.end - it.start : num(it.bar[field]); }
      var bandNames = th ? (Array.isArray(cs.labels) && cs.labels.length === th.length + 1 ? cs.labels.map(String) : bandLabels(th, cs.unit)) : null;
      var categories = [];
      items.forEach(function (it) {
        if (th) {
          var v = fieldVal(it);
          if (isFinite(v)) {
            var bi = 0;
            while (bi < th.length && v > th[bi]) bi++;
            it.band = bi;
            it.color = palette[bi % palette.length];
            return;
          }
        }
        if (it.bar.category != null) {
          var cat = String(it.bar.category);
          var ci = categories.indexOf(cat);
          if (ci < 0) { ci = categories.length; categories.push(cat); }
          it.category = cat;
          it.color = c.seriesExt[ci % c.seriesExt.length];
          return;
        }
        it.color = c.series[Math.abs(Math.floor(num(it.bar.series) || 0)) % c.series.length];
      });
      var inks = { dark: cssVar('--gantt-ink-dark'), light: cssVar('--gantt-ink-light') };

      /* 标记线：窗外的不出现；按优先级避让布局 */
      var markers = (opts.markers || []).map(function (m, i) {
        if (!m) return null;
        var t = num(m.time);
        if (!isFinite(t) || t < ws || t > we) return null;
        var name = m.label == null ? '' : String(m.label);
        var text = name + (name ? ' ' : '') + fmtClock(t);
        return {
          time: t, x: X(t), name: name, label: text, w: pillW(text),
          style: LINE_STYLES[m.style] ? m.style : 'dashed',
          // 颜色写进内联 style、由 CSS 解析：'var(--x)' 随主题自动换色；裸 token 名 '--x' 补成 var()
          color: m.color ? (/^--[\w-]+$/.test(String(m.color)) ? 'var(' + m.color + ')' : String(m.color))
            : 'var(' + DEFAULT_MARKER_COLORS[i % DEFAULT_MARKER_COLORS.length] + ')',
          priority: m.priority
        };
      }).filter(Boolean);
      var lay = layoutMarkers(markers, W);
      markers.forEach(function (m, i) { m.row = lay[i].row; m.anchor = lay[i].anchor; m.range = lay[i].range; m.w = lay[i].w; });
      var markerRows = markers.length ? Math.max.apply(null, markers.map(function (m) { return m.row; })) + 1 : 0;
      var axisH = AXIS_BASE + markerRows * MARKER_ROW_H;

      /* ---------- DOM ---------- */
      var scroller = h('div', 'ds-gantt-scroll');
      var inner = h('div', 'ds-gantt-inner');
      inner.style.minWidth = (LABEL_W + MIN_PLOT_W) + 'px';
      if (!animated && opts.animate !== false) root.classList.add('ds-gantt--anim');

      // 轴：左上角占位（sticky，横向滚动时盖住滚过去的刻度）+ 刻度
      var head = h('div', 'ds-gantt-head');
      head.style.height = axisH + 'px';
      var corner = h('div', 'ds-gantt-corner');
      corner.style.width = LABEL_W + 'px';
      if (opts.labelTitle) corner.textContent = String(opts.labelTitle);
      var axis = h('div', 'ds-gantt-axis');
      var step = 60;
      [60, 120, 180, 240, 360, 720, 1440].some(function (s) { step = s; return s * k >= TICK_MIN_GAP; });
      var ticks = [];
      for (var t = Math.ceil(ws / step) * step; t <= we; t += step) {
        var tx = X(t), txt = fmtClock(t), tw = txt.length * 6 + 8;
        // 两端的刻度数字往里收，不探出绘图区（探出去会凭空多出一截横向滚动）
        var edge = tx < tw / 2 ? 'is-start' : (W - tx < tw / 2 ? 'is-end' : '');
        var box = edge === 'is-start' ? [tx, tx + tw] : edge === 'is-end' ? [tx - tw, tx] : [tx - tw / 2, tx + tw / 2];
        ticks.push({ t: t, x: tx, text: txt, edge: edge, box: box,
          // 刻度距任一标记线 < 10px：只删数字（线会从数字中间穿过去），刻度线保留
          show: !markers.some(function (m) { return Math.abs(m.x - tx) < TICK_CLEAR; }) });
      }
      // 相邻两个数字挤在一起（右端收进来的那个最容易撞上前一个）：删前一个，保住两端
      var lastShown = null;
      ticks.forEach(function (tk) {
        if (!tk.show) return;
        if (lastShown && tk.box[0] < lastShown.box[1] + 4) {
          if (tk.edge === 'is-end') lastShown.show = false; else { tk.show = false; return; }
        }
        lastShown = tk;
      });
      ticks.forEach(function (tk) {
        var tick = h('div', 'ds-gantt-tick', { 'data-gantt-tick': '', 'data-time': tk.t });
        tick.style.left = P(tk.x);
        if (tk.show) {
          var tt = h('span', 'ds-gantt-tick-text' + (tk.edge ? ' ' + tk.edge : ''), { 'data-gantt-tick-text': '' });
          tt.textContent = tk.text;
          tick.appendChild(tt);
        }
        axis.appendChild(tick);
      });
      head.appendChild(corner);
      head.appendChild(axis);
      inner.appendChild(head);

      // 资源行
      var body = h('div', 'ds-gantt-body');
      var labelMax = Math.max(1, Math.floor((LABEL_W - LABEL_PAD - 11) / 11));
      rowInfo.forEach(function (ri) {
        var laneH = 0, rowH = ROW_H;
        if (ri.lanes) {
          laneH = ri.lanes <= 6 ? 7 : ri.lanes <= 12 ? 5 : ri.lanes <= 20 ? 4 : 3;
          rowH = ri.lanes * laneH + 6;
        }
        var row = h('div', 'ds-gantt-row' + (ri.lanes ? ' is-lanes' : ''), { 'data-gantt-row': ri.index });
        row.style.height = rowH + 'px';
        var lab = h('div', 'ds-gantt-label', { 'data-gantt-label': '', title: ri.label });
        lab.style.width = LABEL_W + 'px';
        lab.textContent = U.truncateTo(ri.label, labelMax);
        var track = h('div', 'ds-gantt-track');
        ri.bars.forEach(function (it) {
          var truncR = it.end > we, truncL = it.start < ws;
          var x0 = Math.max(0, Math.min(X(it.start), W - MIN_BAR_W));
          var x1 = Math.min(W, X(it.end));
          var w = Math.max(MIN_BAR_W, x1 - x0);
          if (x0 + w > W) x0 = W - w;
          it.truncated = truncR;
          var attrs = {
            'data-gantt-bar': '', 'data-start': it.start, 'data-end': it.end, 'data-row': ri.index,
            'data-band': it.band != null ? it.band : null,
            'data-truncated': truncR ? '1' : null
          };
          var lane = 0;
          if (ri.lanes) {
            lane = Math.max(0, Math.min(ri.lanes - 1, Math.floor(num(it.bar.lane) || 0)));
            attrs['data-lane'] = lane;
            it.lane = lane;
          }
          var bar = h('div', 'ds-gantt-bar' + (ri.lanes ? ' is-lane' : '') + (truncR ? ' is-trunc' : '') + (w < TEXT_MIN_W ? ' is-narrow' : '') +
            (truncL ? ' is-trunc-start' : ''), attrs);
          bar.style.left = P(x0);
          bar.style.width = 'max(' + MIN_BAR_W + 'px, ' + P(x1 - x0) + ')';
          bar.style.backgroundColor = it.color;
          bar.style.color = inkFor(it.color, inks);
          if (ri.lanes) {
            bar.style.top = (lane * laneH + 3) + 'px';
            bar.style.height = (laneH - 1) + 'px';
          } else if (w >= TEXT_MIN_W) {
            it.flags.forEach(function (f) { bar.appendChild(icon(f)); });
            var main = isFinite(it.count) ? fmtNum(it.count) + unit : '';
            if (main) bar.appendChild(document.createTextNode(main));
            var sm = h('small');
            sm.textContent = fmtDur(it.end - it.start);
            bar.appendChild(sm);
            if (truncR) {
              var tr = h('span', 'ds-gantt-trunc');
              tr.textContent = '▶';
              bar.appendChild(tr);
            }
          }
          bindTip(bar, function () { return barTipLines(it, ri); });
          track.appendChild(bar);
        });
        row.appendChild(lab);
        row.appendChild(track);
        body.appendChild(row);
      });
      inner.appendChild(body);

      // 标记线：叠在轴与所有资源行之上；线只从自己的标签下方开始，一直贯穿到最后一行底部
      var overlay = h('div', 'ds-gantt-markers');
      overlay.style.left = LABEL_W + 'px';
      markers.forEach(function (m) {
        var mk = h('div', 'ds-gantt-marker', { 'data-gantt-marker': '', 'data-row': m.row, 'data-anchor': m.anchor, 'data-time': m.time, 'data-style': m.style });
        mk.style.left = P(m.x);
        mk.style.color = m.color;
        var pill = h('span', 'ds-gantt-marker-label', { 'data-gantt-marker-label': '', title: m.label });
        pill.textContent = m.label;
        pill.style.top = (2 + m.row * MARKER_ROW_H) + 'px';
        pill.style.width = m.w + 'px';
        if (m.anchor === 'right') pill.style.right = '-10px';
        else pill.style.left = '-10px';
        var line = h('i', 'ds-gantt-marker-line', { 'data-gantt-marker-line': '' });
        line.style.top = (2 + m.row * MARKER_ROW_H + MARKER_LABEL_H + 4) + 'px';
        line.style.borderLeftStyle = m.style;
        mk.appendChild(line);
        mk.appendChild(pill);
        overlay.appendChild(mk);
      });
      inner.appendChild(overlay);
      scroller.appendChild(inner);
      root.appendChild(scroller);

      function barTipLines(it, ri) {
        if (typeof opts.tooltip === 'function') {
          var custom = opts.tooltip(it.bar, rows[ri.index], {
            start: it.start, end: it.end, duration: it.end - it.start, count: it.count,
            band: it.band, truncated: it.truncated, rowLabel: ri.label
          });
          if (custom != null) return Array.isArray(custom) ? custom.map(String) : String(custom).split('\n');
        }
        var l1 = [it.name];
        if (isFinite(it.count)) l1.push(fmtNum(it.count) + unit);
        l1.push(fmtDur(it.end - it.start));
        var l2 = fmtClock(it.start) + ' → ' + fmtClock(it.end);
        it.flags.forEach(function (f) { l2 += ' [' + flagLabel(f) + ']'; });
        if (it.lane != null) l2 += ' · 槽道 ' + (it.lane + 1);
        if (it.truncated) l2 += ' ▶';
        var l3 = it.breakdown.length
          ? it.breakdown.map(function (b) { return b.name + '×' + fmtNum(b.count); }).join(', ')
          : ri.label;
        return [l1.join(' · '), l2, l3];
      }
      function flagLabel(f) { return (opts.flagLabels && opts.flagLabels[f]) || FLAG_LABELS[f]; }

      /* ---------- 图例：颜色档 / 状态 / 每条标记线 ---------- */
      if (opts.legend !== false) {
        var legend = h('div', 'ds-gantt-legend', { 'data-gantt-legend': '' });
        if (th) {
          bandNames.forEach(function (name, bi) {
            var chip = legendChip('band', name);
            chip.setAttribute('data-band', bi);
            var sw = h('i', 'ds-gantt-swatch');
            sw.style.backgroundColor = palette[bi % palette.length];
            chip.insertBefore(sw, chip.firstChild);
            bindTip(chip, function () {
              var mem = items.filter(function (it) { return it.band === bi; })
                .sort(function (a, b) { return (a.start - b.start) || (a.row - b.row); });
              if (!mem.length) return [name + ' · 此区间内无项目'];
              var lines = [name + ' · 共 ' + mem.length + ' 项'];
              mem.slice(0, 30).forEach(function (it) {
                lines.push('• ' + it.name + '（' + fmtDur(it.end - it.start) + (isFinite(it.count) ? '，' + fmtNum(it.count) + unit : '') + '）');
              });
              if (mem.length > 30) lines.push('…还有 ' + (mem.length - 30) + ' 个');
              return lines;
            });
            legend.appendChild(chip);
          });
        }
        categories.forEach(function (cat, ci) {
          var chip = legendChip('band', cat);
          var sw = h('i', 'ds-gantt-swatch');
          sw.style.backgroundColor = c.seriesExt[ci % c.seriesExt.length];
          chip.insertBefore(sw, chip.firstChild);
          bindTip(chip, function () {
            var n = items.filter(function (it) { return it.category === cat; }).length;
            return [cat + ' · 共 ' + n + ' 项'];
          });
          legend.appendChild(chip);
        });
        FLAG_KEYS.forEach(function (f) {
          if (!items.some(function (it) { return it.flags.indexOf(f) >= 0; })) return;
          var chip = legendChip('flag', flagLabel(f));
          chip.setAttribute('data-flag', f);
          chip.insertBefore(icon(f), chip.firstChild);
          bindTip(chip, function () {
            var note = (opts.flagNotes && opts.flagNotes[f]) || FLAG_NOTES[f];
            var n = items.filter(function (it) { return it.flags.indexOf(f) >= 0; }).length;
            return String(note).split('\n').concat(['当前共 ' + n + ' 段']);
          });
          legend.appendChild(chip);
        });
        markers.forEach(function (m) {
          var chip = legendChip('marker', m.name || fmtClock(m.time));
          chip.setAttribute('data-time', m.time);
          chip.style.color = m.color;
          var sw = h('i', 'ds-gantt-swatch-line');
          sw.style.borderLeftStyle = m.style;
          chip.insertBefore(sw, chip.firstChild);
          bindTip(chip, function () { return [m.label, '标记线（' + STYLE_NAMES[m.style] + '）']; });
          legend.appendChild(chip);
        });
        if (legend.childNodes.length) root.appendChild(legend);
      }
      function legendChip(kind, text) {
        var chip = h('span', 'ds-gantt-legend-item', { 'data-gantt-legend-item': '', 'data-kind': kind });
        var s = h('span', 'ds-gantt-legend-text');
        s.textContent = text;
        chip.appendChild(s);
        return chip;
      }

      /* ---------- 明细表（可折叠，默认收起） ---------- */
      if (opts.details) {
        var det = h('details', 'ds-gantt-details', { 'data-gantt-details': '' });
        if (detailsOpen) det.open = true;
        det.addEventListener('toggle', function () { detailsOpen = det.open; });
        var sum = h('summary');
        sum.textContent = (typeof opts.details === 'object' && opts.details.title) || '明细';
        det.appendChild(sum);
        var wrap = h('div', 'ds-gantt-details-body');
        var table = h('table', 'ds-table', { id: detailsId });
        var thead = h('thead'), trh = h('tr');
        ['资源', '名称', '开始', '结束', '时长(分)', '数量', '状态'].forEach(function (name, ci) {
          var thEl = h('th', ci === 4 || ci === 5 ? 'num' : '');
          thEl.textContent = name;
          trh.appendChild(thEl);
        });
        thead.appendChild(trh);
        table.appendChild(thead);
        var tb = h('tbody');
        items.slice().sort(function (a, b) { return (a.row - b.row) || (a.start - b.start); }).forEach(function (it) {
          var tr = h('tr');
          var status = it.flags.map(flagLabel);
          if (it.truncated) status.push('超出时间窗 ▶');
          [rowInfo[it.row].label, it.name, fmtClock(it.start), fmtClock(it.end), fmtNum(Math.round(it.end - it.start)),
            isFinite(it.count) ? fmtNum(it.count) : '', status.join('、')].forEach(function (v, ci) {
            var td = h('td', ci === 4 || ci === 5 ? 'num' : '');
            td.textContent = v;
            tr.appendChild(td);
          });
          tb.appendChild(tr);
        });
        table.appendChild(tb);
        wrap.appendChild(table);
        det.appendChild(wrap);
        root.appendChild(det);
        // 排序要等表进了文档才能按选择器找到：draw() 返回后由 mount 插入，下一个宏任务再挂
        setTimeout(function () {
          if (DS.tables && document.getElementById(detailsId) === table) DS.tables.sortable('#' + detailsId);
        }, 0);
      }
      return root;
    }

    // 插进文档后再量一次宿主宽度：重画前宿主先被清空，页面可能短到没有竖向滚动条，量到的宽度
    // 比内容插回去之后（滚动条又出现）宽约 15px。插回去之后量到的才是真实宽度，按它补画一次——
    // 补画时直接把这个宽度传进去，不再去量一个又被清空的宿主（否则会原样再错一遍）。
    // 不用 ResizeObserver：它在 headless 下不保证回调，且异步重画会让持有旧节点的调用方扑空；
    // 之后的尺寸变化交给 DS.svg.redrawIn()（DS.sidebar 切换面板时自动调用）。
    function settle() {
      var r = host.querySelector('[data-gantt]');
      var w = host.clientWidth;
      if (r && w && String(w) !== r.getAttribute('data-gantt-width')) {
        host.innerHTML = '';
        host.appendChild(draw(w));
      }
      if (w) animated = true;
    }

    U.mount(host, draw, settle);
    return host.querySelector('[data-gantt]');
  }

  DS.svg.gantt = gantt;
  DS.svg.ganttLayoutMarkers = layoutMarkers;
  DS.svg.fmtClock = fmtClock;
})(window.DS);
