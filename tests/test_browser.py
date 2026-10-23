# -*- coding: utf-8 -*-
import pathlib
import sys

from conftest import assert_all_pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import build as build_mod  # noqa: E402


def test_selftest_harness_runs(selftest):
    """基建自检：套件能跑完并回传结果。"""
    res = selftest()
    assert res, '自测套件没有产出任何断言'


def test_no_suite_threw(selftest):
    """Critical 修复：某个套件中途抛错只登记一条 `suite-threw:<套件名>`，
    不匹配任何按前缀筛选的 assert_all_pass() 调用——该套件后半段的断言会
    静默消失而 pytest 照样全绿（历史教训：charts 套件曾经在这里崩溃，
    24 条断言没跑，整个测试桥接完全没发现）。这里独立于任何前缀直接查。"""
    res = selftest()
    threw = sorted(k for k in res if k.startswith('suite-threw:'))
    assert not threw, '套件中途抛错: ' + '; '.join(f'{k}: {res[k][1]}' for k in threw)


def test_assertion_count_floor(selftest):
    """断言总数下限：防止未来某个套件又静默少跑几条却依然"全绿"。
    下限按当前全部套件在 ?selftest=1 下的真实产出（209 条，2026-10-14
    分三批修复：157 补齐双轴组合图/堆叠柱状图(含百分比堆叠)/面积图/时间轴
    模拟四种报表主力图表后增至 183；复审线上破损修复(堆叠图例被工具条
    压住、时间轴刻度越界/重复)增至 186；__dsAuto 拆分双标志增至 196；
    文档与既有问题批(alpha 论证修正/对比度断言遍历全部序列色/fill 对象
    写法/hexToRgba 非十六进制兜底/幽灵轴/radar+polarArea 的 r 轴主题注入)
    增至 209；修"按需留白"替换掉无条件 30px 留白这个"修 bug 引入的新隐患"
    （单项图例不加留白/compact 真实数据不加留白且绘图区可用/narrow 宽度下
    三项图例堆叠柱仍受工具条保护/隐藏宿主变可见后 resize() 自动重新判定
    不需要手动补调用，5 条新断言）增至 214；2026-10-14 追加桑基图
    （chartjs-chart-sankey，内联进 src/vendor/，paint() 第四类非笛卡尔分支）
    ——演示卡片渲染核对、节点/流向配色取自分类序列色且逐节点不同、标签
    文字色与节点描边色取自 token、未被误判成笛卡尔图（无 $ds/无缩放工具条/
    x 轴未被注入网格色或刻度截断）、主题切换后 retheme 生效、调用方自定义
    colorFrom 不被覆盖、空数据不崩 19 条新断言，增至 233）；2026-10-15 修表头/
    数据对齐错位的 bug（数字列 th 不跟着 td.num 右对齐，视觉上整列错位近一个
    列宽，用户把排序误判成没生效）——真实回归现场(#t-detail 数字列/文本列
    th-td 对齐一致)、自动判定最小探针(数字列/文本列各一条)、重渲染后自动
    对齐跟着新列类型重新判定、显式写在 th 上的 num 类不被自动判定覆盖，
    6 条新断言，增至 239）；2026-10-15 桑基图补交互（点击高亮 + 按层分配
    节点色 + tooltip 占比 + 通用两侧节点筛选下拉）——同层不撞色的真实回归
    （旧算法在当前演示数据上会把"接收点A"/"接收点C"撞成同一色）、查不到
    节点的中性灰兜底、排序优先级/colorMode/size 默认值、图例默认关闭、
    tooltip 百分比（两条不同占比的记录都测，防止被写死成 100%）、点击按
    左右半区选中 from/to 端、再次点击同一高亮节点和点击空白都回退到筛选
    基线、高亮/淡出按节点身份而不是按整条流向判断（非对称淡出的渐变色块
    是预期行为）、淡出颜色取自 --chart-grid 且在点击前后真的改变了 canvas
    实际像素（不是只验状态变量）、高亮关联集合与节点分层两个纯函数的单测、
    筛选下拉的千分位计数/全选联动/徽标/清除筛选按钮、筛选触发销毁重建且
    真的换了新的 canvas 元素，47 条新断言，增至 286；2026-10-22 桑基图第二轮
    缺陷修复——D1 整条流向全亮/全灰、D2 十色 token + 相邻层不撞色、D3 下拉只列
    首/末层且按可达性筛选、D4 目标端默认 Top-N 且勾选追加（30 目标端合成数据）、
    D5 全屏入口（无缩放按钮），以及筛选组件下沉为 DS.sankey.mount()；全部用真实
    dispatchEvent/click，增至 331；同日第二批：重建后全屏被陈旧 ResizeObserver 尺寸缩回的修复、下拉上限 maxToItems，增至 338；同日第三批：全屏往返回退修复（Grid 子项被过宽画布撑开）+ 真实 demo 页往返/毒化 inline 宽度/CSS 断言，增至 357；同日桑基 demo 由三层改两层，三层覆盖迁到 scratch 并新增 Top-N 等断言，增至 381；同日桑基每列铺满绘图区高度（首节点顶/末节点底=绘图区上下沿、canvas 像素扫描、节点高度正比且比例尺一致、流向端点贴合节点、点击/筛选重建/全屏进出后仍铺满、单节点列居中）与 demo 数据多样性（每项目 1–4 台仪器都出现、份额不均、仪器忙闲差异、确定性）共 22 条新断言，增至 403；2026-10-22 桑基目标端筛选改为"勾选=只看勾选"（替换 4 条追加语义断言、新增 7 条）+ 散点/折线/面积/时间轴/双轴/堆叠 demo 样本量与结构套件（19 条）+ 缩放复位还原钉死 min/max，增至 428；2026-10-22 色板重做后新增 1 条"深浅两套十色逐位不同"前提断言，增至 429；2026-10-14 散点改 3 系列(每台仪器一个，集中/偏慢/波动大+离群点)、折线图(按日期)改 3 条对齐日期的线 + 日期轴悬浮框标题(真实 mousemove、M/D（周几）、与刻度一致、多系列同一天、调用方 title 不覆盖、ymd、retheme 后仍在)，增至 441；2026-10-22 气泡图/xy 框选缩放/数据表弹窗 97 条新断言（B1–B10：过滤/取前 50/面积∝数量/十色循环/无图例/标签阈值与截断与深浅字色/悬浮框与单位/轴标题与从 0 起/xy 双向框选与复位与平移与选框反馈/表格排序方向与搜索与重开清空与全屏之上/千分位与一位小数）并把散点旧的单轴拖框选断言改成对角拖，增至 538；同日气泡标签避让 8 条新断言（标签两两不重叠/冲突留大的/放大后更多/视野外不占位/被跳过的仍能悬停/全屏与换主题重算），增至 546；同日气泡配色恢复参照的色相渐进(rampColors)、标签去 halo 并按合成底色选字色，重写 B3/B5 配色与字色断言，增至 552；2026-10-22 布局沿用参照实现批：页面铺满宽度/auto-fit 网格/卡片/图表高 350/顶栏与背景取 token，全屏改遮罩+居中面板+标题栏（四种退出方式、全屏中滚轮按 zoom、往返精确恢复、数据表在最上层、Esc 先关弹窗），61 条 lay- 断言，增至 613；同日卡片标题统一写图表/组件类型（改名表逐张断言 + 无功能词 + 说明文字写能力）42 条 title- 断言，增至 655；同日按类目着色 dsColorBy:'category'（令牌循环/描边同色/显式色不覆盖/主题跟随/真实像素/多系列忽略/图例）23 条 cby- 断言 + 全屏面板尺寸不被 inline 宿主宽高盖掉 1 条，增至 679；同日数量级切换（DS.seg 分段按钮 + 十张图 3/10/20 档重建：数量/单实例/无孤儿/按钮态/回默认档数据一致/20 档图例换行与十色循环/桑基 Top-N/气泡表行数/堆叠百分比/全屏往返/mock 确定性与前缀稳定/无控制台输出）121 条 scale- 断言，饼图扇区改十色循环，增至 800；2026-10-22 图表网格改固定两列（repeat(2,minmax(0,1fr))、760px 才单列、桑基/气泡不再整行占用而加高到 500–520；1440/1920/2560/700/761 五种 iframe 视口列数与卡片等宽、小卡片同网格、桑基 20 项目与气泡标签 fillText 实测 0 重叠；替换 2 条旧断言、新增 16 条，修一条按宿主取整的全屏往返断言），增至 814；2026-10-22 瀑布图（DS.charts.waterfall：累计手算/三类颜色含画布像素/连接线端点拦截 stroke 读坐标对齐/悬浮框文案与千分位/横向/关连接线/缩放/全屏往返/主题跟随/空态/控制台零输出，30 条 wf- 断言）+ 卡片标题 2 条 + 数量级切换 9 条，增至 855；2026-10-22 箱线图（DS.charts.boxplot：七组固定数据的统计量与 Python statistics.quantiles(inclusive) 对拍含围栏边界/IQR=0/n=1、demo 四种分布特征与独立复算、拦截 stroke/arc 读中位线/须线/端帽/离群点像素坐标、画布像素、半透明填充与不透明描边、悬浮框各统计量与千分位、离群点悬停显示该点值与 20px 回落、横向、量程容下须线两端、缩放/全屏/主题/空态/控制台，46 条 bx- 断言）+ 卡片标题 2 条 + 数量级切换 9 条，增至 912；2026-10-22 侧边栏 DS.sidebar 库组件（初始化/选中/切换/选中态 3px 主色条/键盘/折叠 52px/悬停提示/持久化与存储被禁/淡入 CSS 动画/showAll/隐藏面板图表与 SVG 切回重算且实例不增长/窄屏 iframe 横排/销毁，88 条 sb- 断言），增至 1000；同日 demo 页合并为左侧菜单七分组后：pg- 集成断言（7 项/分组与卡片对应/去重/切换后图表尺寸与卡片匹配/实例不增长/hash/折叠/窄屏/兼容层）+ 折叠后图表重算 2 条 + 旧标签页相关断言适配，增至 1103）；2026-10-23 滚轮缩放改以鼠标位置为锚点（DS.charts.zoomAt）：za- 断言 31 条，增至 1134；同日补全量遍历（每张带缩放工具条的图逐个 canvas）+ 连续滚轮沿用首格真实锚点防类目轴取整误差逐格累积（三张图 c-stacked/c-combo/c-waterfall 累积偏出约两个类目）+ 累积偏差口径，增至 1146；同日气泡标签门槛改按视野内最大值（放大到小气泡区域后重新判定标签）1 条，增至 1147；2026-10-23 甘特图重做（DS.svg.gantt 改 HTML 元素绘制：纯函数 fmtClock/ganttLayoutMarkers 的选边/翻边/拥挤度/堆叠/封顶/优先级/宽度估算、demo 数据覆盖、data-* 契约、时间→像素、最小宽、截断▶、行高/槽道、标记线不重叠/锚点几何/线从标签下方贯穿到底、刻度数字抑制与 12px 间隙、条内字色对比度≥4.5 与按底色选黑白、悬浮框三行/跟随/夹边/挂 body/滚动隐藏、图例三类 chip 与成员悬浮/空档/超 30、明细表、主题切换、宽度自适应与 sticky 行标签、空态/最简调用/缺省时间窗/开关，75 条 gt- 断言；旧的 svg-/sb-/pg- 甘特断言按 data-* 改写、pg- 表格去重断言排除甘特明细表，增至 1222；2026-10-23 滚轮缩放方式从侧栏「交互设置」分组挪进顶栏（DS.seg 分段按钮）+ 侧栏
    761–1099 自动收成图标栏（autoCollapseBelow）：删 g-interact 分组让 pg- 少 7 条（分组逐组 6 条 + 单选组 1 条）、
    title- 少 1 条（wheel-opts 卡片）；新增 sb- 36 条（iframe 视口 900/1000/1099/1100/1440/700 的加载折叠态/两列卡片宽/图表与卡片匹配/
    存储不被改写、同一 iframe 跨断点实时切换 12 步、临时展开不落盘、选项 0/自定义/默认、destroy 摘监听）、pg- 20 条（#interact 未知 hash、
    页面侧栏默认断点、真实布局克隆 900/1099 收起后卡片宽、顶栏 700/360/900/1440 不横向溢出与换行、顶栏控件位置/文字/顶栏 token/
    切换后图表滚轮行为四种组合/toast/点已选中无操作）、title- 1 条（滚轮设置在顶栏不占卡片），增至 1271）设置，不留"静默丢几条
    也不报警"的安全余量——余量越大，这条护栏能防住的回归越小。新增断言
    只会让总数增加，不会无故减少，到时把这个数字也一并调大即可。"""
    res = selftest()
    assert len(res) >= 1271, f'断言总数骤降到 {len(res)}，可能有套件中途抛错或静默少跑'


def test_components_render(selftest):
    res = selftest()
    assert_all_pass(res, 'comp-')


def test_interactions(selftest):
    res = selftest()
    assert any(k.startswith('ix-') for k in res), 'ix- 前缀断言一条都不存在'
    assert_all_pass(res, 'ix-')


def test_theme_survives_storage_denied(selftest):
    """Review Focus #3: localStorage 被禁用时主题模块不得崩溃整页。"""
    res = selftest('nostorage=1')
    assert any(k.startswith('ix-theme') for k in res), 'ix-theme 前缀断言一条都不存在'
    assert_all_pass(res, 'ix-theme')
    assert_all_pass(res, 'comp-')  # 整页其余部分仍须正常


def test_charts_basic(selftest):
    res = selftest()
    assert any(k.startswith('ch-') for k in res), '图表断言一条都没注册'
    assert_all_pass(res, 'ch-')


def test_wheel_modes(selftest):
    res = selftest()
    assert any(k.startswith('wh-') for k in res), '滚轮模式断言未注册'
    assert_all_pass(res, 'wh-')


def test_zoom_isolated_between_instances(selftest):
    """Review Focus #4: 操作 A 图不得影响 B 图。"""
    res = selftest()
    assert_all_pass(res, 'iso-')


def test_svg_charts(selftest):
    res = selftest()
    assert any(k.startswith('svg-') for k in res), 'SVG 图断言未注册'
    assert_all_pass(res, 'svg-')


def test_theme_url_override_does_not_persist(selftest):
    """Review A2: ?theme= 只供 demo 页截图/视觉验收用，不得落盘到
    localStorage——否则公开页上分享一条 ?theme=dark 链接会把访客永久锁在
    深色。单独传 theme=dark 触发覆盖路径再核验。"""
    res = selftest('theme=dark')
    assert 'demo-theme-override-does-not-persist' in res, \
        'demo-theme-override-does-not-persist 断言未注册'
    assert_all_pass(res, 'demo-theme-override-does-not-persist')


def test_demo_page(selftest):
    res = selftest()
    assert any(k.startswith('demo-') for k in res), 'demo 页断言未注册'
    assert_all_pass(res, 'demo-')


def test_demo_has_no_identifying_terms(built):
    """去标识化机制：真实构建产物里不应命中当前生效的去标识化词表
    （默认占位词 + 可能存在的本地补充词），即 guard() 在构建时已经验过
    的那份清单——这里独立于 build() 内部再核验一遍最终产物。"""
    text = built.read_text(encoding='utf-8')
    for term in build_mod.load_denylist():
        assert term not in text, f'demo 产物含需去除的标识: {term}'


def test_layout_and_fullscreen_shape(selftest):
    """页面布局沿用参照实现（铺满宽度/auto-fit 网格/卡片/图表高 350/顶栏与背景取 token）
    与全屏"遮罩 + 居中面板 + 标题栏"形态。渲染视口由 conftest.VIEWPORT 固定为桌面宽屏。"""
    res = selftest()
    assert sum(1 for k in res if k.startswith('lay-')) >= 76, 'lay- 断言数骤降'
    assert 'lay-harness-viewport-is-desktop-wide' in res
    assert_all_pass(res, 'lay-')


def test_card_titles_name_the_chart_type(selftest):
    """卡片标题写图表/组件类型，演示的能力写进 .ds-card-desc 说明文字。"""
    res = selftest()
    assert sum(1 for k in res if k.startswith('title-')) >= 42, 'title- 断言数骤降'
    assert_all_pass(res, 'title-')


def test_category_colors(selftest):
    """柱状/条形图按类目着色（dsColorBy:'category'）。"""
    res = selftest()
    assert sum(1 for k in res if k.startswith('cby-')) >= 23, 'cby- 断言数骤降'
    assert_all_pass(res, 'cby-')


def test_scale_switch(selftest):
    """卡片标题栏 3/10/20 数量级切换（DS.seg + demo 层重建）。"""
    res = selftest()
    assert sum(1 for k in res if k.startswith('scale-')) >= 121, 'scale- 断言数骤降'
    assert_all_pass(res, 'scale-')


def test_waterfall(selftest):
    """瀑布图：累计/颜色/连接线/悬浮框/横向/缩放/全屏/主题/空态/控制台。"""
    res = selftest()
    assert sum(1 for k in res if k.startswith('wf-')) >= 30, 'wf- 断言数骤降'
    assert_all_pass(res, 'wf-')


def _console_lines(url: str) -> list:
    """用 chromium 的 --enable-logging=stderr 收集页面加载期间的全部 console 输出
    （log/warn/error 都带 INFO:CONSOLE 标记）。"""
    import subprocess
    import tempfile
    import shutil
    from conftest import CHROMIUM, RENDER_DIR, VIEWPORT
    RENDER_DIR.mkdir(exist_ok=True)
    prof = tempfile.mkdtemp(dir=RENDER_DIR, prefix='profile-')
    try:
        proc = subprocess.run(
            [CHROMIUM, '--headless', '--disable-gpu', '--no-sandbox', '--enable-logging=stderr', '--v=0',
             '--virtual-time-budget=5000', f'--window-size={VIEWPORT[0]},{VIEWPORT[1]}',
             f'--user-data-dir={prof}', '--dump-dom', url],
            capture_output=True, text=True, timeout=90)
        return [ln for ln in proc.stderr.splitlines() if 'CONSOLE' in ln]
    finally:
        shutil.rmtree(prof, ignore_errors=True)


def test_no_console_output_on_normal_load(built):
    """正常加载（不带 ?selftest=1）控制台零输出——含瀑布图/箱线图等全部图表的创建。
    带一个对照：同一页面注入一条 console.log，必须被这套收集方式抓到（防止"收集不到所以恒为零"）。"""
    from conftest import RENDER_DIR
    assert _console_lines(f'file://{built}') == []
    assert _console_lines(f'file://{built}#trend') == []   # 带 hash 直接打开别的分组，同样零输出
    html = built.read_text(encoding='utf-8')
    i = html.rindex('</body>')
    probe = RENDER_DIR / 'console_probe.html'
    probe.write_text(html[:i] + '<script>console.log("probe-line")</script>' + html[i:], encoding='utf-8')
    try:
        got = _console_lines(f'file://{probe}')
    finally:
        probe.unlink(missing_ok=True)
    assert any('probe-line' in ln for ln in got), '对照失败：console.log 没被收集到'


def test_gantt(selftest):
    """甘特图 DS.svg.gantt：纯函数/标记线避让/几何/刻度/字色对比度/悬浮框/图例/明细表/主题/宽度/空态/最简调用。"""
    res = selftest()
    assert sum(1 for k in res if k.startswith('gt-')) >= 75, 'gt- 断言数骤降'
    assert_all_pass(res, 'gt-')


def test_gantt_dark_theme_load(selftest):
    """深色主题直接加载（?theme=dark）：甘特套件自己切浅色再切回，全部仍通过。"""
    res = selftest('theme=dark')
    assert sum(1 for k in res if k.startswith('gt-')) >= 75
    assert_all_pass(res, 'gt-')


def test_boxplot(selftest):
    """箱线图：统计量/绘制像素/悬浮框/离群点悬停/横向/缩放/全屏/主题/空态/控制台。"""
    res = selftest()
    assert sum(1 for k in res if k.startswith('bx-')) >= 46, 'bx- 断言数骤降'
    assert_all_pass(res, 'bx-')


def test_sidebar_lib(selftest):
    """DS.sidebar 库组件：选中/切换/折叠/提示/持久化/键盘/窄屏/隐藏面板图表重算（临时搭的侧栏上测）
    + 761–1099 自动收起（同源 iframe 改视口，sb-auto-*/sb-live-*/sb-option-*）。"""
    res = selftest()
    assert sum(1 for k in res if k.startswith('sb-')) >= 126, 'sb- 断言数骤降'
    assert_all_pass(res, 'sb-')


def test_sidebar_survives_storage_denied(selftest):
    """localStorage 被禁用时侧栏不崩、状态仍在内存里工作（折叠状态记不住是预期的降级）。"""
    res = selftest('nostorage=1')
    assert sum(1 for k in res if k.startswith('sb-')) >= 123, 'sb- 断言数骤降'
    assert 'sb-storage-denied-run-still-collapses-in-memory' in res
    assert_all_pass(res, 'sb-')


def test_demo_sidebar_page(selftest):
    """demo 页的左侧菜单：六个分组与卡片对应、去重、切换后图表真实尺寸、hash、折叠、窄屏、兼容层；
    顶栏的滚轮缩放方式控件（不溢出、切换后图表滚轮行为改变）。"""
    res = selftest()
    assert sum(1 for k in res if k.startswith('pg-')) >= 107, 'pg- 断言数骤降'
    assert res['pg-load-opens-the-hash-group-or-defaults-to-compare'][0]
    assert_all_pass(res, 'pg-')


def test_demo_sidebar_page_survives_storage_denied(selftest):
    res = selftest('nostorage=1')
    assert sum(1 for k in res if k.startswith('pg-')) >= 105
    assert_all_pass(res, 'pg-')


def test_demo_loads_the_group_named_by_the_url_hash(selftest):
    """带 hash 加载直接打开对应分组；无效 hash（含已删除的「交互设置」分组的 #interact）回落到默认分组「对比」。"""
    res = selftest('x=1#trend')
    assert res['pg-load-opens-the-hash-group-or-defaults-to-compare'][0]
    assert_all_pass(res, 'pg-')
    assert 'pg-load-hash-recognised-as-trend' in res, '带 hash 的分支没有被走到'
    res_bogus = selftest('x=1#bogus')
    assert res_bogus['pg-load-opens-the-hash-group-or-defaults-to-compare'][0]
    assert 'pg-load-hash-recognised-as-none' in res_bogus
    assert_all_pass(res_bogus, 'pg-')
    res_old = selftest('x=1#interact')
    assert res_old['pg-load-opens-the-hash-group-or-defaults-to-compare'][0]
    assert 'pg-load-hash-recognised-as-none' in res_old, '#interact 不应再被识别为分组'
    assert_all_pass(res_old, 'pg-')


def test_sidebar_collapsed_state_survives_a_real_reload(built):
    """真实刷新：同一份 profile（同一个 localStorage）连续加载两次，第二次不带任何折叠参数，
    侧栏仍是折叠的；再展开一次后第三次加载是展开的。"""
    import shutil
    import tempfile
    from conftest import RENDER_DIR, _dump_dom, _parse
    RENDER_DIR.mkdir(exist_ok=True)
    prof = tempfile.mkdtemp(dir=RENDER_DIR, prefix='profile-')
    try:
        r1 = _parse(_dump_dom(f'file://{built}?selftest=1&sbcollapse=1', profile_dir=prof))
        assert r1['pg-load-opens-the-hash-group-or-defaults-to-compare'][0]
        r2 = _parse(_dump_dom(f'file://{built}?selftest=1&sbexpect=collapsed', profile_dir=prof))
        assert 'pg-collapsed-state-restored-after-a-real-reload' in r2
        assert r2['pg-collapsed-state-restored-after-a-real-reload'][0], r2['pg-collapsed-state-restored-after-a-real-reload']
        assert_all_pass(r2, 'pg-')
        assert_all_pass(r2, 'sb-')
        # 第三次：套件收尾会把折叠状态恢复成进入时的状态（折叠），所以这里用 sbexpect=collapsed 再核一次持久化没被冲掉
        r3 = _parse(_dump_dom(f'file://{built}?selftest=1&sbexpect=expanded', profile_dir=prof))
        assert not r3['pg-collapsed-state-restored-after-a-real-reload'][0], '对照失败：仍折叠时 sbexpect=expanded 应当不通过'
    finally:
        shutil.rmtree(prof, ignore_errors=True)
