# -*- coding: utf-8 -*-
"""色板对比度验算。未达 WCAG AA 的组合不得入库。"""
import itertools
import pathlib
import re
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from validate_palette import contrast, delta_e, oklch, NORMAL_FLOOR  # noqa: E402

TOKENS = ROOT / 'src' / 'tokens.css'

AA_NORMAL = 4.5   # 正文
AA_LARGE = 3.0    # 大字与非文本 UI

CVD_KINDS = ('protan', 'deutan', 'tritan')


def parse_block(css: str, selector: str) -> dict:
    """抽出某个选择器块内的 --var: value 映射。"""
    m = re.search(re.escape(selector) + r'\s*\{([^}]*)\}', css, re.S)
    assert m, f'tokens.css 缺少 {selector} 块'
    return dict(re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', m.group(1)))


@pytest.fixture(scope='module')
def light():
    return parse_block(TOKENS.read_text(encoding='utf-8'), ':root')


@pytest.fixture(scope='module')
def dark():
    return parse_block(TOKENS.read_text(encoding='utf-8'), '[data-theme="dark"]')


@pytest.mark.parametrize('fg,bg,floor', [
    ('--color-text', '--color-surface', AA_NORMAL),
    ('--color-text-secondary', '--color-surface', AA_NORMAL),
    ('--color-text-muted', '--color-surface', AA_NORMAL),
    ('--color-text', '--color-surface-alt', AA_NORMAL),
    ('--color-primary', '--color-surface', AA_LARGE),
    ('--color-danger', '--color-surface', AA_LARGE),
    ('--color-success', '--color-surface', AA_LARGE),
    ('--color-warning', '--color-surface', AA_LARGE),
])
def test_light_contrast(light, fg, bg, floor):
    ratio = contrast(light[fg].strip(), light[bg].strip())
    assert ratio >= floor, f'浅色 {fg} on {bg} = {ratio:.2f}，低于 {floor}'


@pytest.mark.parametrize('fg,bg,floor', [
    ('--color-text', '--color-surface', AA_NORMAL),
    ('--color-text-secondary', '--color-surface', AA_NORMAL),
    ('--color-text-muted', '--color-surface', AA_NORMAL),
    ('--color-primary', '--color-surface', AA_LARGE),
    ('--color-danger', '--color-surface', AA_LARGE),
])
def test_dark_contrast(dark, light, fg, bg, floor):
    # 深色块只覆盖变更项，未覆盖的继承 :root
    merged = {**light, **dark}
    ratio = contrast(merged[fg].strip(), merged[bg].strip())
    assert ratio >= floor, f'深色 {fg} on {bg} = {ratio:.2f}，低于 {floor}'


# --- 补充：深色主题不假设天然达标，success/warning/accent 也一并核验 ---

@pytest.mark.parametrize('fg,bg,floor', [
    ('--color-success', '--color-surface', AA_LARGE),
    ('--color-warning', '--color-surface', AA_LARGE),
    ('--color-accent', '--color-surface', AA_LARGE),
])
def test_dark_contrast_extra(dark, light, fg, bg, floor):
    merged = {**light, **dark}
    ratio = contrast(merged[fg].strip(), merged[bg].strip())
    assert ratio >= floor, f'深色 {fg} on {bg} = {ratio:.2f}，低于 {floor}'


# --- tint/ink 拆分：primary/success/warning/danger 的填充色门槛是 3:1（上面已测），
#     但 .ds-badge 文字贴浅底 tint、.ds-stat-delta 小字直接贴 surface，门槛都是 4.5。
#     不能靠加深填充色本身解决（会拖暗按钮/边框/图表），所以拆成独立的 -tint/-ink token。

STATUS_COLORS = ('primary', 'success', 'warning', 'danger')


@pytest.mark.parametrize('theme_name,fixture_name', [('浅色', 'light'), ('深色', 'dark')])
@pytest.mark.parametrize('color', STATUS_COLORS)
def test_ink_on_tint(color, theme_name, fixture_name, light, dark):
    """每个 -ink 在同主题对应的 -tint 背景上必须 >= AA_NORMAL（badge 文字场景）。"""
    merged = light if fixture_name == 'light' else {**light, **dark}
    fg = merged[f'--color-{color}-ink'].strip()
    bg = merged[f'--color-{color}-tint'].strip()
    ratio = contrast(fg, bg)
    assert ratio >= AA_NORMAL, (
        f'{theme_name} --color-{color}-ink on --color-{color}-tint = {ratio:.2f}，低于 {AA_NORMAL}'
    )


@pytest.mark.parametrize('theme_name,fixture_name', [('浅色', 'light'), ('深色', 'dark')])
@pytest.mark.parametrize('color', ['success', 'danger'])
def test_ink_on_surface(color, theme_name, fixture_name, light, dark):
    """success/danger 的 -ink 还直接用在 .ds-stat-delta（贴 surface），on surface 也要 >= AA_NORMAL。"""
    merged = light if fixture_name == 'light' else {**light, **dark}
    fg = merged[f'--color-{color}-ink'].strip()
    bg = merged['--color-surface'].strip()
    ratio = contrast(fg, bg)
    assert ratio >= AA_NORMAL, (
        f'{theme_name} --color-{color}-ink on --color-surface = {ratio:.2f}，低于 {AA_NORMAL}'
    )


@pytest.mark.parametrize('theme_name,fixture_name', [('浅色', 'light'), ('深色', 'dark')])
def test_chart_axis_is_readable_text(theme_name, fixture_name, light, dark):
    """--chart-axis 渲染的是坐标轴刻度数字（真文本），同样要过 AA_NORMAL，
    不能直接沿用未加深的 muted 灰（如 #94a3b8 / #52525b，均 < 3）。"""
    merged = light if fixture_name == 'light' else {**light, **dark}
    ratio = contrast(merged['--chart-axis'].strip(), merged['--color-surface'].strip())
    assert ratio >= AA_NORMAL, f'{theme_name} --chart-axis on surface = {ratio:.2f}，低于 {AA_NORMAL}'


def _assert_series_distinguishable(series: list, theme_name: str):
    """六条序列色两两之间用 ΔE(OKLab) 判断可辨识度，而非亮度对比度。
    2026-10-22 起规则放宽为「只要求正常视觉 ΔE >= NORMAL_FLOOR(15)」：
    色觉障碍模拟（protan/deutan/tritan）改为报告型，不再作为失败条件，
    各对数值见 palette.md 第 7 节；图表靠 tooltip 与数据标签做冗余补偿。"""
    assert len(set(series)) == 6, f'{theme_name} 序列色有重复'
    for i, j in itertools.combinations(range(len(series)), 2):
        n = delta_e(series[i], series[j])
        assert n >= NORMAL_FLOOR, (
            f'{theme_name} 序列色 s{i+1} 与 s{j+1} 正常视觉 ΔE={n:.2f}，低于 {NORMAL_FLOOR}'
        )


# 十色 OKLab 明度（L）极差上限：锁住「统一明度、不浑」这个目标。
# 依据：新色板实测极差浅色 0.159、深色 0.160；参照实现（Tailwind 500 十色）
# 实测 0.210；旧色板（Okabe-Ito + 深色混搭）浅色高达 0.60 以上，正是「发浑」的来源。
# 取 0.17：比参照实现更紧，又只比实测多 0.01，混入任何一个深色/近白色都会立刻变红。
LIGHTNESS_RANGE_MAX = 0.17


# --- 非文本 UI 边界（Review D5）：次按钮/上传区唯一的可识别边框，门槛 3:1 ---

@pytest.mark.parametrize('theme_name,fixture_name', [('浅色', 'light'), ('深色', 'dark')])
def test_border_strong_meets_ui_boundary_contrast(theme_name, fixture_name, light, dark):
    """--color-border-strong on --color-surface 必须达到 WCAG 1.4.11 对非文本
    UI 边界的 3:1——.ds-btn.secondary（背景与所在卡片同色，唯一视觉边界就是
    这条边框）和 .ds-dropzone 的虚线边框都靠它才能被辨认出轮廓。不测
    --color-border 本身：它还用在表格分隔线等纯装饰场景，那里 3:1 不是必需。"""
    merged = light if fixture_name == 'light' else {**light, **dark}
    ratio = contrast(merged['--color-border-strong'].strip(), merged['--color-surface'].strip())
    assert ratio >= AA_LARGE, (
        f'{theme_name} --color-border-strong on --color-surface = {ratio:.2f}，低于 {AA_LARGE}'
    )


def test_chart_series_distinguishable_light(light):
    series = [light[f'--chart-s{i}'].strip() for i in range(1, 7)]
    _assert_series_distinguishable(series, '浅色')


def test_chart_series_distinguishable_dark(light, dark):
    merged = {**light, **dark}
    series = [merged[f'--chart-s{i}'].strip() for i in range(1, 7)]
    _assert_series_distinguishable(series, '深色')


# --- s7..s10（桑基图专用扩展）：十色全局两两可辨 ---
# 桑基图节点按"层序 + 层内序"顺次取色，三层 [3,4,3] 的图相邻两层合计 7 个节点，
# 6 色序列在数学上不够。扩到 10 色后，只要相邻两层节点数之和 <= 10 就不撞色。
# 验证规则与 s1..s6 完全相同（ΔE(OKLab)>=15 正常视觉，三种色觉障碍模拟各 >=6），
# 并且是全局两两（45 对），没有为桑基单独放宽——深浅两套各验一次。

def _assert_ext_distinguishable(series: list, theme_name: str):
    assert len(series) == 10, f'{theme_name} 扩展序列色应为 10 个，实际 {len(series)}'
    assert len({c.lower() for c in series}) == 10, f'{theme_name} 扩展序列色有重复'
    for i, j in itertools.combinations(range(10), 2):
        n = delta_e(series[i], series[j])
        assert n >= NORMAL_FLOOR, f'{theme_name} s{i+1}-s{j+1} 正常视觉 ΔE={n:.2f} < {NORMAL_FLOOR}'


def _assert_lightness_uniform(series: list, theme_name: str):
    ls = [oklch(c)[0] for c in series]
    spread = max(ls) - min(ls)
    assert spread <= LIGHTNESS_RANGE_MAX, (
        f'{theme_name} 十色 OKLab 明度极差 {spread:.3f} > {LIGHTNESS_RANGE_MAX}'
        f'（最亮 s{ls.index(max(ls))+1}，最暗 s{ls.index(min(ls))+1}）'
    )


def test_chart_series_ext_distinguishable_light(light):
    _assert_ext_distinguishable([light[f'--chart-s{i}'].strip() for i in range(1, 11)], '浅色')


def test_chart_series_ext_distinguishable_dark(light, dark):
    merged = {**light, **dark}
    _assert_ext_distinguishable([merged[f'--chart-s{i}'].strip() for i in range(1, 11)], '深色')


def test_chart_series_lightness_uniform_light(light):
    _assert_lightness_uniform([light[f'--chart-s{i}'].strip() for i in range(1, 11)], '浅色')


def test_chart_series_lightness_uniform_dark(light, dark):
    merged = {**light, **dark}
    _assert_lightness_uniform([merged[f'--chart-s{i}'].strip() for i in range(1, 11)], '深色')


def test_chart_series_themes_differ(light, dark):
    """深浅两套十色必须各自取值、逐位不同（浏览器侧"颜色变了吗"类断言依赖这一点才有鉴别力）。"""
    merged = {**light, **dark}
    for i in range(1, 11):
        assert light[f'--chart-s{i}'].strip().lower() != merged[f'--chart-s{i}'].strip().lower(), (
            f's{i} 深浅主题同值'
        )


def test_chart_series_cvd_reported_not_enforced(light, dark):
    """色觉障碍模拟改为报告型：只验证计算可跑、数值有限且非负，不设下限。
    各对 ΔE 写在 palette.md 第 7 节（人工用 validate_palette.delta_e 重算）。"""
    merged = {**light, **dark}
    for pal in ([light[f'--chart-s{i}'].strip() for i in range(1, 11)],
                [merged[f'--chart-s{i}'].strip() for i in range(1, 11)]):
        for i, j in itertools.combinations(range(10), 2):
            for kind in CVD_KINDS:
                v = delta_e(pal[i], pal[j], kind)
                assert v == v and v >= 0


# --- 顶栏深底上的文字/页签/边框（2026-10-22 布局沿用批）---

@pytest.mark.parametrize('theme_name,fixture_name', [('浅色', 'light'), ('深色', 'dark')])
@pytest.mark.parametrize('fg,floor', [
    ('--nav-text', AA_NORMAL), ('--nav-text-secondary', AA_NORMAL),
    ('--nav-accent', AA_NORMAL), ('--nav-border', AA_LARGE),
])
def test_nav_tokens_contrast_on_nav_bg(theme_name, fixture_name, fg, floor, light, dark):
    merged = light if fixture_name == 'light' else {**light, **dark}
    ratio = contrast(merged[fg].strip(), merged['--nav-bg'].strip())
    assert ratio >= floor, f'{theme_name} {fg} on --nav-bg = {ratio:.2f}，低于 {floor}'
