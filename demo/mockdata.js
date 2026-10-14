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

  return { series: series, months: months, instruments: instruments, tableRows: tableRows };
})();
