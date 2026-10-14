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
  function dates(n) {
    var start = Date.UTC(2024, 0, 1);
    var out = [];
    for (var i = 0; i < n; i++) out.push(start + i * 86400000);
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

  return {
    series: series, months: months, instruments: instruments, tableRows: tableRows,
    weekdays: weekdays, rates: rates, dates: dates
  };
})();
