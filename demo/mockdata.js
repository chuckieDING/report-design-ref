/* demo/mockdata.js —— 合成演示数据。全部为编造值，不含任何真实机构、客户、
   样本或仪器序列号信息。用固定 seed 的伪随机数生成器保证每次渲染结果一致，
   浏览器端自测断言才可判定（否则图表/表格每次刷新内容都不同，无法写出有
   鉴别力的断言）。注意：下面 rng() 里 `s * 1103515245` 在 s 较大时乘积会
   超过 2^53，JS 的双精度浮点在取模前已经发生截断——这已经不是教科书式
   精确的线性同余生成器，只是"碰巧长得像"。但这不影响这里的用途：同一个
   seed 下浮点运算本身是确定性的（同一引擎每次算出完全相同的截断结果），
   序列依旧可复现，断言该判的是"确定性"，不是"均匀分布质量"。 */
window.DS_MOCK = (function () {
  'use strict';

  function rng(seed) {
    var s = (seed == null ? 42 : seed) >>> 0;
    return function () {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }

  function series(n, seed) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) out.push(Math.round(20 + r() * 80));
    return out;
  }

  function months() {
    return ['一月', '二月', '三月', '四月', '五月', '六月',
             '七月', '八月', '九月', '十月', '十一月', '十二月'];
  }

  function instruments() {
    return ['一号仪器', '二号仪器', '三号仪器', '备用仪器'];
  }

  function weekdays() {
    return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  }

  // 0..1 的比率型合成数据，给双轴组合图的"率"系列用（量纲跟柱子的"量"不同）。
  function rates(n, seed) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) out.push(+(0.75 + r() * 0.24).toFixed(2));
    return out;
  }

  // 固定基准日期（UTC 2024-01-01）起连续 n 天的毫秒时间戳：时间轴 demo 用。
  // 用固定 seed 风格的确定性常量而不是 Date.now()——跟其余 mock 数据一样，
  // 必须每次渲染都产出同一组值，selftest 的断言才有鉴别力。全部按 UTC 生成，
  // 和 DS.charts.dateTicks() 里格式化时统一用的 getUTC* 方法对齐，不受渲染
  // 机器本地时区影响。
  function dates(n, startMs) {
    var start = startMs != null ? startMs : Date.UTC(2024, 0, 1);
    var out = [];
    for (var i = 0; i < n; i++) out.push(start + i * 86400000);
    return out;
  }

  // 桑基图演示数据：两层"仪器 → 项目"，形态与参照实现一致（左列仪器、右列
  // 项目，每条流向的 flow 是该仪器做该项目的工作量）。4 台仪器 × 25 个项目：
  // 项目名是通用占位名（项目01…项目25），不对应任何真实检测项目。
  // 项目数刻意 > 20，让库默认的"流入端默认只显示流量前 20、勾选后只看勾选项（含榜外）"
  // 在 demo 上真正看得出效果：前 20 个项目总量 400,386,…,134 线性递减，
  // 榜外 5 个是 60,50,40,30,20——两段之间有明显落差，前 20/榜外一眼可辨。
  // 多样性（固定 seed 49，确定性）：每个项目对应的仪器数在 1–4 之间都有
  // （下面 spread 表逐项写死，不是随机，断言能直接核对分布），大体上高流量
  // 项目多台分担、低流量项目专属一台，但刻意留了反例（项目09 流量 288 却只
  // 用 1 台、项目22 流量仅 50 却用 2 台、项目15 流量 204 却只用 1 台）。同一项目在各仪器上的份额不均：
  // 份额 ∝ (0.5 + 随机)^3 × 仪器权重，有主力机、有分担机；仪器权重一号 1.0、
  // 二号 0.7、三号 0.5、备用 0.18，同时也决定选哪几台，所以仪器总工作量有忙
  // 有闲、备用仪器明显偏少。项目01 固定用满 4 台，因此仪器的首次出现顺序仍是
  // 一号、二号、三号、备用（着色序号可预知）；每个项目内的流向按仪器序排列。
  // 每份至少 5、项目总量守恒（余数补给份额最大的那台）。
  function sankeyFlows(nProjects) {
    var inst = instruments();
    var r = rng(49);
    var spread = [4, 3, 3, 2, 4, 2, 3, 2, 1, 3, 2, 2, 1, 2, 1, 3, 1, 2, 1, 1, 1, 2, 1, 1, 1];
    var weight = [1.0, 0.7, 0.5, 0.18];
    var out = [];
    for (var i = 0; i < 25; i++) {
      var name = '项目' + (i < 9 ? '0' : '') + (i + 1);
      var total = i < 20 ? 400 - 14 * i : 60 - 10 * (i - 20);
      // 加权无放回抽样（Efraimidis–Spirakis）：key = r^(1/w)，取最大的 k 个
      var keys = [];
      for (var j = 0; j < 4; j++) keys.push({ j: j, key: Math.pow(r(), 1 / weight[j]) });
      keys.sort(function (a, b) { return b.key - a.key; });
      var chosen = [0, 1, 2, 3];
      if (i > 0) {
        chosen = keys.slice(0, spread[i]).map(function (k) { return k.j; })
          .sort(function (a, b) { return a - b; });
      }
      var raw = chosen.map(function (j) { var u = 0.5 + r(); return u * u * u * weight[j]; });
      var sum = raw.reduce(function (a, b) { return a + b; }, 0);
      var shares = raw.map(function (x) { return Math.max(5, Math.floor(total * x / sum + 0.5)); });
      var diff = total - shares.reduce(function (a, b) { return a + b; }, 0);
      shares[shares.indexOf(Math.max.apply(null, shares))] += diff;
      for (var m = 0; m < chosen.length; m++) {
        out.push({ from: inst[chosen[m]], to: name, flow: shares[m] });
      }
    }
    // 数量级切换（demo）：只保留前 n 个项目的流向。上面的随机序列按项目顺序消耗，
    // 所以前 n 个项目的流向与全量数据里的完全一致（不重新生成）。
    if (nProjects != null && nProjects < 25) {
      var keep = {};
      for (var q = 0; q < nProjects; q++) keep['项目' + (q < 9 ? '0' : '') + (q + 1)] = true;
      out = out.filter(function (f) { return keep[f.to]; });
    }
    return out;
  }


  // 趋势 + 周期 + 噪声的确定性序列（折线/面积/组合图用）：
  // value = base + slope*i + amp*sin(2π*i/period + phase) + 噪声(±noise)，取整、不小于 1。
  function trend(n, seed, o) {
    o = o || {};
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) {
      var v = (o.base || 0) + (o.slope || 0) * i +
        (o.amp || 0) * Math.sin(2 * Math.PI * i / (o.period || 7) + (o.phase || 0)) +
        (r() * 2 - 1) * (o.noise || 0);
      out.push(Math.max(1, Math.round(v)));
    }
    return out;
  }

  // 第1周…第n周：周度折线图的类目标签。
  function weeks(n) {
    var out = [];
    for (var i = 1; i <= n; i++) out.push('第' + i + '周');
    return out;
  }

  // 散点（多系列）：x=单批处理片数(8..100)，y=耗时(分钟)，每台仪器一个系列，
  // 共 200 点，固定 seed 61。三台仪器的分布特征刻意不同：
  //   一号仪器 70 点：集中——y ≈ 12 + 0.8x ± 窄噪声（±~8），相关性最强；
  //   二号仪器 70 点：明显偏慢——同样的斜率，但整体 +28 分钟；
  //   三号仪器 52 点：波动大——同样的斜率，噪声约 3 倍宽（±~26）；
  //   另有 8 个手写固定坐标的离群点分散在三个系列里（一号 2、二号 2、三号 4）。
  // 每个系列"主体"= 前 n 个按公式生成的点，后面追加属于它的离群点。
  function scatterSeries(nSeries) {
    var r = rng(61), i;
    function noise3() { return (r() + r() + r() - 1.5); }   // 近似钟形，±1.5
    var specs = [
      { label: '一号仪器', n: 70, off: 0, amp: 5.5, out: [[95, 18], [12, 62]] },
      { label: '二号仪器', n: 70, off: 28, amp: 8, out: [[60, 130], [42, 5]] },
      { label: '三号仪器', n: 52, off: 0, amp: 17, out: [[88, 12], [72, 125], [100, 40], [6, 100]] }
    ];
    // 数量级切换（demo）：第 4 个系列起按同一公式追加（四号仪器…），追加的系列在
    // 前三个之后生成，所以前三个系列与默认数据逐点一致。
    for (var k = 3; k < (nSeries || 3); k++) {
      specs.push({ label: cnNum(k + 1) + '号仪器', n: 36, off: (k * 7) % 41, amp: 5 + (k % 4) * 4, out: [] });
    }
    return specs.map(function (sp) {
      var data = [];
      for (i = 0; i < sp.n; i++) {
        var x = 8 + r() * 92;
        data.push({ x: +x.toFixed(1), y: +(12 + sp.off + 0.8 * x + noise3() * sp.amp).toFixed(1) });
      }
      sp.out.forEach(function (q) { data.push({ x: q[0], y: q[1] }); });
      return { label: sp.label, data: data, mainCount: sp.n };
    }).slice(0, nSeries || 3);
  }

  // 按仪器分的每日批次数（时间轴/日期折线 demo 用）：n 天 × 3 台仪器，
  // 日期完全对齐（同一组 dates、同样长度）。三台各有基线/斜率/周期差异。
  function dailyBatches(n, nSeries) {
    var d = dates(n);
    var specs = [
      { label: '一号仪器', seed: 51, o: { base: 60, slope: 0.25, amp: 14, period: 7, noise: 7 } },
      { label: '二号仪器', seed: 52, o: { base: 44, slope: 0.1, amp: 10, period: 7, phase: 1, noise: 6 } },
      { label: '三号仪器', seed: 53, o: { base: 28, slope: 0.18, amp: 7, period: 7, phase: 2, noise: 5 } }
    ];
    for (var k = 3; k < (nSeries || 3); k++) {   // 数量级切换（demo）：第 4 条线起按同一形态追加
      specs.push({ label: cnNum(k + 1) + '号仪器', seed: 51 + k, o: { base: 20 + (k * 11) % 55, slope: ((k * 3) % 7) / 20, amp: 5 + (k % 5) * 2, period: 7, phase: k * 0.7, noise: 4 } });
    }
    return specs.slice(0, nSeries || 3).map(function (sp) {
      var v = trend(n, sp.seed, sp.o);
      return { label: sp.label, data: d.map(function (t, i) { return { x: t, y: v[i] }; }) };
    });
  }

  // 气泡图演示数据：60 个条目 { name, count, value }（count = 数量，如样本数；
  // value = 平均时长，分钟），固定 seed 73，确定性。
  //   - 55 个"够量"条目（count >= 5）+ 5 个 count 在 1..4 的"量太小"条目：
  //     后者必须被库过滤掉；55 > 50，所以按数量降序取前 50 时最小的 5 个
  //     够量条目也会被截掉——"过滤"和"取前 50"两条规则在 demo 上各自可见。
  //   - 数量近似指数衰减（2300 起，约 ±10% 扰动，+6 保底）：头部气泡大、尾部很
  //     多条目的半径被钳在最小半径 5；约 14 个条目超过最大数量的 15%（会显示
  //     名字标签）。
  //   - 平均时长随数量对数增长（30 + 20*log10(count)，±7 噪声）——量越大整体
  //     越慢；另外手写 4 个离群点：量大但很快、量大且很慢（"量大且耗时长"，
  //     最值得盯的那类）、中等量很慢、小量很快。
  //   - 名字多数是 项目NN（NN 在 01..60 间打乱分配，名字顺序与数量顺序无关）；
  //     另有 3 个拉丁字母名（验证不区分大小写搜索）和 2 个长名（一个 16 字会被
  //     截断，一个恰好 12 字不截断），它们都落在大气泡上，标签阈值/截断规则都看得到。
  //   输入顺序做了确定性洗牌（库自己按数量排序，不依赖输入顺序）。
  function bubbleItems(nBubbles) {
    var r = rng(73), i, j;
    var special = {
      1: '超长名称演示项目编号甲乙丙丁戊己',      // 16 字，截断为前 12 字 + '..'
      2: '这个项目名称正好十二个字',              // 恰好 12 字，不截断
      4: 'Alpha Assay', 8: 'beta-Series', 12: 'GAMMA Panel'
    };
    var out = [], order = [];
    for (i = 1; i <= 60; i++) order.push(i);
    for (i = order.length - 1; i > 0; i--) {         // 打乱 项目NN 的编号分配
      j = Math.floor(r() * (i + 1));
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
    var outlierValue = { 2: 22, 6: 190, 25: 175, 40: 12 };
    var used = 0;
    for (var k = 1; k <= 55; k++) {
      var count = Math.round(2300 * Math.exp(-0.13 * (k - 1)) * (0.9 + 0.2 * r())) + 6;
      var value = 30 + 20 * Math.log(count) / Math.LN10 + (r() * 2 - 1) * 7;
      if (outlierValue[k] != null) value = outlierValue[k];
      var name = special[k];
      if (!name) { name = '项目' + (order[used] < 10 ? '0' : '') + order[used]; used++; }
      out.push({ name: name, count: count, value: +value.toFixed(1) });
    }
    for (k = 0; k < 5; k++) {                         // 量太小：count 1..4，必须被过滤
      var nm = '项目' + (order[used] < 10 ? '0' : '') + order[used]; used++;
      out.push({ name: nm, count: 1 + (k % 4), value: +(40 + r() * 80).toFixed(1) });
    }
    for (i = out.length - 1; i > 0; i--) {            // 确定性洗牌输入顺序
      j = Math.floor(r() * (i + 1));
      var u = out[i]; out[i] = out[j]; out[j] = u;
    }
    // 数量级切换（demo）：n < 60 时返回恰好 n 个"够量"条目（count >= 5），从 55 个够量条目
    // （按数量降序）里等距抽样，头部大气泡到尾部小气泡都有；n 省略或 >= 60 = 上面的完整
    // 60 条（含 5 条量太小的与超出前 50 的，用来演示过滤与取前 50）。
    if (nBubbles != null && nBubbles < 60) {
      var qual = out.filter(function (it) { return it.count >= 5; }).sort(function (a, b) { return b.count - a.count; });
      var pick = [];
      for (i = 0; i < nBubbles; i++) pick.push(qual[nBubbles === 1 ? 0 : Math.round(i * (qual.length - 1) / (nBubbles - 1))]);
      return pick;
    }
    return out;
  }

  // 瀑布图演示数据：上月工作量 → n 个增减项（正负都有，中间插一个小计）→ 本月工作量。
  // 前 6 个增减项是固定的通用事项（新增项目 +320、停用项目 −150、设备停机 −90、加班 +60、流程优化 +40、
  // 人员调休 −70），n < 6 取前 n 个，n > 6 在其后按固定 seed 追加 事项07… 正负交替出现。
  // 小计插在前 ceil(n/2) 个增减项之后（value 省略 = 取当时累计）；期末合计同样省略 value。
  function waterfallItems(n) {
    var lead = [['新增项目', 320], ['停用项目', -150], ['设备停机', -90], ['加班', 60], ['流程优化', 40], ['人员调休', -70]];
    var r = rng(97), deltas = lead.slice(0, n);
    for (var k = deltas.length + 1; k <= n; k++) {
      var mag = 20 + Math.round(r() * 160);
      deltas.push(['事项' + pad2(k), (k % 2 === 0 ? 1 : -1) * mag]);
    }
    var items = [{ label: '上月工作量', value: 1200, type: 'total' }];
    var cut = Math.ceil(n / 2);
    deltas.forEach(function (d, i) {
      items.push({ label: d[0], value: d[1] });
      if (i + 1 === cut) items.push({ label: '小计', type: 'total' });
    });
    items.push({ label: '本月工作量', type: 'total' });
    return items;
  }

  // 箱线图演示数据：各仪器单批处理时长（分钟）的原始样本，每台 30–80 个，固定 seed，确定性。
  // 前四台特征刻意不同：一号集中（均值 55、σ 4）、二号偏慢（均值 88）、三号方差大（σ 20）、
  // 备用仪器整体集中但有 4 个明显离群点（3 个特别慢、1 个特别快）。第 5 台起按同一公式追加（形态各异，
  // 每三台里有一台带离群点），所以前 n 台与更大规模里的前 n 台逐值一致。
  function boxGroups(nGroups) {
    var r = rng(83);
    function gauss() { return (r() + r() + r() + r() - 2) * Math.sqrt(3); }   // 近似 N(0,1)
    var specs = [
      { n: 60, mean: 55, sd: 4, out: [] },
      { n: 48, mean: 88, sd: 9, out: [] },
      { n: 72, mean: 62, sd: 20, out: [] },
      { n: 40, mean: 58, sd: 5, out: [105, 118, 126, 21] }
    ];
    for (var k = 4; k < nGroups; k++) {
      var sd = 4 + (k * 7) % 18, mean = 45 + (k * 17) % 50;
      specs.push({ n: 30 + (k * 13) % 51, mean: mean, sd: sd, out: k % 3 === 0 ? [Math.round(mean + 6 * sd), Math.round(mean + 7 * sd)] : [] });
    }
    var out = [];
    specs.slice(0, nGroups).forEach(function (sp, gi) {
      var vals = [];
      for (var i = 0; i < sp.n; i++) vals.push(+Math.max(5, sp.mean + gauss() * sp.sd).toFixed(1));
      sp.out.forEach(function (v) { vals.push(v); });
      out.push({ label: gi < 4 ? instruments()[gi] : cnNum(gi + 1) + '号仪器', values: vals });
    });
    return out;
  }

  // 1..99 的中文数字：一…十、十一…十九、二十、二十一…
  function cnNum(n) {
    var d = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return d[n];
    if (n < 20) return '十' + (n % 10 ? d[n % 10] : '');
    return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // ---- 数量级切换（demo 层）：按类目/扇区/系列/层数 n 生成合成数据 ----
  // 约定：前几项永远是默认数据（lead），n 更大时在其后追加，所以任何规模下前面的内容与
  // 默认规模一致；全部固定 seed、确定性。
  // 月份类目：n <= 12 取月份名，更多时用 第k月。
  function monthLabels(n) {
    if (n <= 12) return months().slice(0, n);
    var out = [];
    for (var i = 1; i <= n; i++) out.push('第' + i + '月');
    return out;
  }
  // lead 之后追加 前缀+两位序号 的类目名（仪器04、仪器05…）
  function objectNames(n, lead, prefix) {
    var out = lead.slice(0, n);
    for (var i = out.length + 1; i <= n; i++) out.push(prefix + pad2(i));
    return out;
  }
  // [lo, hi] 区间内的确定性整数序列
  function rangeSeries(n, seed, lo, hi) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) out.push(Math.round(lo + r() * (hi - lo)));
    return out;
  }
  // lead 数值之后追加 [lo,hi] 区间的值
  function leadValues(n, lead, seed, lo, hi) {
    return lead.slice(0, n).concat(rangeSeries(Math.max(0, n - lead.length), seed, lo, hi));
  }
  // 扇区名：类别一、类别二…
  function sectorLabels(n) {
    var out = [];
    for (var i = 1; i <= n; i++) out.push('类别' + cnNum(i));
    return out;
  }
  // 额外的趋势系列（折线/面积图在 lead 系列之后追加）：第 k 条的形态各不相同
  function extraTrend(nPts, k) {
    return trend(nPts, 100 + k, {
      base: 25 + (k * 17) % 70, slope: ((k * 3) % 7) / 10, amp: 5 + (k % 5) * 2,
      period: 7 + (k % 4) * 3, phase: k * 0.7, noise: 4
    });
  }
  // 堆叠柱的第 i 层：设备A、设备B…（series(12, 21+i)，前三层与默认一致）
  function stackLayers(n, nPts) {
    var out = [];
    for (var i = 0; i < n; i++) out.push({ label: '设备' + String.fromCharCode(65 + i), data: series(nPts, 21 + i) });
    return out;
  }

  function tableRows(n) {
    var r = rng(7), names = instruments(), out = [];
    var states = ['正常', '待机', '报警'];
    for (var i = 0; i < n; i++) {
      out.push({
        batch: 'B' + (1000 + i),
        instrument: names[i % names.length],
        slides: Math.round(10 + r() * 90),
        minutes: Math.round(30 + r() * 150),
        state: states[Math.floor(r() * 3)]
      });
    }
    return out;
  }

  // 甘特图演示数据：7 个资源行，时间单位为分钟（从当日 00:00 起算，>1440 即次日）。
  // 手写而不是随机生成——要刻意覆盖：跨夜条、超出时间窗被截断的条、溢出/额外两种状态、
  // 一个多槽道行、1 分钟短条，以及 value（= 时长）落进全部 7 个分档。
  // longLabel 是第一行的超长名称（演示行标签截断 + 悬停全称）。
  function ganttDemo(longLabel) {
    function bar(s, e, bd, flags) {
      var b = { start: s, end: e, value: e - s, breakdown: bd || null };
      if (flags) b.flags = flags;
      return b;
    }
    var rows = [
      { label: longLabel, bars: [bar(370, 470, { 'A类': 12, 'B类': 6 }), bar(490, 615, { 'A类': 8, 'C类': 9, 'D类': 3 }), bar(640, 700, { 'B类': 10 })] },
      { label: '产线B', bars: [bar(380, 560, { 'C类': 20, 'A类': 4 }), bar(600, 601, { 'D类': 1 }), bar(620, 760, { 'A类': 14 }), bar(800, 1010, { 'B类': 16, 'C类': 5 })] },
      { label: '产线C', bars: [bar(700, 890, { 'A类': 18 }), bar(1300, 1500, { 'B类': 9, 'D类': 7 }, { overflow: true })] },
      { label: '产线D', bars: [bar(400, 445, { 'C类': 6 }), bar(1080, 1230, { 'A类': 11, 'B类': 4 }, { extra: true })] },
      { label: '产线E', bars: [bar(520, 600, { 'D类': 5 }), bar(1450, 1700, { 'C类': 12, 'A类': 3 }, { overflow: true })] },
      { label: '工位-06', lanes: 6, bars: [] },
      { label: '工位-07', bars: [bar(520, 600, { 'A类': 7 }), bar(610, 700, { 'B类': 6, 'D类': 2 }), bar(720, 1020, { 'C类': 25, 'D类': 2 })] }
    ];
    // 多槽道行：6 个槽道，每个槽道两段，单件流式的细条（条内不写字，只能悬停看）
    for (var i = 0; i < 6; i++) {
      var s1 = 430 + i * 25, s2 = 900 + i * 15;
      var b1 = bar(s1, s1 + 70 + i * 10, { 'A类': 1 }), b2 = bar(s2, s2 + 40 + i * 12, { 'B类': 1 });
      b1.lane = i; b2.lane = i;
      rows[5].bars.push(b1, b2);
    }
    rows.forEach(function (r) {
      r.bars.forEach(function (b, j) { b.label = r.label === longLabel ? '第 ' + (j + 1) + ' 段' : r.label + ' 第 ' + (j + 1) + ' 段'; });
    });
    // 标记线：传入顺序即优先级——结果类在前、约束其次、理论值最后。
    // 06:10/07:25 两条靠左缘、00:10⁺¹/00:35⁺¹/01:00⁺¹ 三条挤在一起，用来触发翻边与堆叠。
    var markers = [
      { time: 370, label: '首个开始', style: 'dashed', color: 'var(--color-primary-ink)' },
      { time: 1450, label: '最后开始', style: 'dashed', color: 'var(--color-danger-ink)' },
      { time: 445, label: '首个完成', style: 'solid', color: 'var(--color-success-ink)' },
      { time: 1500, label: '最后完成', style: 'dashed', color: 'var(--color-success-ink)' },
      { time: 1140, label: '截止', style: 'dashed', color: 'var(--color-warning-ink)' },
      { time: 1475, label: '基准', style: 'dotted', color: 'var(--color-accent)' }
    ];
    return {
      rows: rows,
      markers: markers,
      window: { start: 360, end: 1620 },
      thresholds: [60, 90, 120, 150, 180, 240]
    };
  }

  return {
    series: series, months: months, instruments: instruments, tableRows: tableRows,
    weekdays: weekdays, rates: rates, dates: dates, sankeyFlows: sankeyFlows,
    trend: trend, weeks: weeks, scatterSeries: scatterSeries, dailyBatches: dailyBatches,
    bubbleItems: bubbleItems, waterfallItems: waterfallItems, boxGroups: boxGroups,
    cnNum: cnNum, monthLabels: monthLabels, objectNames: objectNames, rangeSeries: rangeSeries,
    leadValues: leadValues, sectorLabels: sectorLabels, extraTrend: extraTrend, stackLayers: stackLayers,
    ganttDemo: ganttDemo
  };
})();
