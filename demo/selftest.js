// demo/selftest.js —— 仅在 ?selftest=1 时运行的浏览器端断言套件。
(function () {
  'use strict';
  var results = [];

  var API = {
    check: function (name, cond, detail) {
      results.push([!!cond, name, detail || '']);
    },
    done: function () {
      var el = document.getElementById('selftest-result');
      el.textContent = results.map(function (r) {
        return (r[0] ? 'PASS\t' : 'FAIL\t') + r[1] + (r[0] ? '' : '\t' + r[2]);
      }).join('\n');
      el.setAttribute('data-done', '1');
    }
  };
  window.DS_SELFTEST = API;

  if (new URLSearchParams(location.search).get('selftest') !== '1') return;

  // 计算样式读取助手：返回元素某属性的计算值。
  // 元素不存在时返回哨兵字符串而不是 null —— null 对 `===` 型断言会正确失败，
  // 但对 `!==` 型断言（如「这个颜色不该是 xxx」）会让 "null !== xxx" 恒真，
  // 选择器写错或元素被删掉时断言会静默通过。哨兵字符串在两个方向都会正确失败。
  var MISSING = '<<MISSING>>';
  function css(sel, prop) {
    var el = document.querySelector(sel);
    if (!el) return MISSING;
    return getComputedStyle(el).getPropertyValue(prop).trim();
  }
  API.css = css;
  API.CSS_MISSING = MISSING;

  // 各模块的断言在自己的 registerTests 里注册，此处统一触发。
  // 延后两个宏任务，确保 demo.js 已完成首次渲染。
  // 注：原计划用双重 requestAnimationFrame，但 snap chromium 在
  // --headless --virtual-time-budget 模式下不产生合成帧，rAF 回调永不触发
  // （setTimeout 不受影响，已用 _render/t3.html 验证）。双重 setTimeout(fn, 0)
  // 效果等价（让出两轮事件循环），且不依赖合成器，故改用它。
  setTimeout(function () {
    setTimeout(function () {
      (window.DS_SELFTEST_SUITES || []).forEach(function (fn) {
        try { fn(API); } catch (e) { API.check('suite-threw:' + (fn.name || '?'), false, String(e)); }
      });
      API.done();
    }, 0);
  }, 0);
})();
