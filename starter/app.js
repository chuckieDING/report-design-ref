/* 新项目从这里开始。替换 render() 里的内容、接上真实数据即可。 */
(function () {
  'use strict';

  document.getElementById('app').innerHTML = [
    '<div class="ds-nav">',
    '  <span class="ds-nav-title">报表标题</span>',
    '  <span style="flex:1"></span>',
    '  <button class="ds-btn secondary" id="btn-theme">深 / 浅</button>',
    '</div>',
    '<div class="ds-wrap">',
    '  <div class="ds-card"><div class="ds-card-title">第一张图</div>',
    '    <div class="ds-chart-host"><canvas id="c1"></canvas></div></div>',
    '</div>'
  ].join('');

  // 顺序要紧：主题必须先于图表初始化，否则图表首帧会读到旧的 CSS token
  // （颜色/字体等在切换前就已经定下来，画面要等下一次重绘才会更新）。
  DS.theme.init();

  // wheel 四种取值（建项目时选一种写死，不对终端用户暴露）：
  //   page      — 滚轮永远翻页，缩放只能用工具条 / 拖框选
  //   zoom      — 滚轮直接缩放
  //   ctrl-zoom — 按住 Ctrl 滚轮缩放，否则翻页（出厂默认）
  //   smart     — 未到缩放极限时滚轮先缩放，到底后翻页（容易让用户觉得页面抽风，不建议默认）
  DS.charts.init({ wheel: 'ctrl-zoom' });

  document.getElementById('btn-theme').addEventListener('click', DS.theme.toggle);

  DS.charts.create(document.getElementById('c1'), {
    type: 'bar',
    data: { labels: ['甲', '乙', '丙'], datasets: [{ label: '示例', data: [3, 7, 5] }] }
  });
})();
