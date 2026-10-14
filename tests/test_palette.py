# -*- coding: utf-8 -*-
"""色板对比度验算。未达 WCAG AA 的组合不得入库。"""
import itertools
import pathlib
import re
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from validate_palette import contrast, delta_e, NORMAL_FLOOR, CVD_FLOOR  # noqa: E402

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
    """六条序列色两两之间必须用 ΔE(OKLab) 判断可辨识度，而非亮度对比度：
    对比度衡量前景/背景可读性，不是分类色的可辨识度——亮度相近但色相不同的两色
    （如蓝 #2563eb 与紫 #7c3aed，contrast 仅约 1.05）人眼完全可区分，用 contrast()
    卡这条线没有意义。改用 delta_e()：正常视觉 >= NORMAL_FLOOR，
    protan/deutan/tritan 三种色觉障碍模拟各自 >= CVD_FLOOR。"""
    assert len(set(series)) == 6, f'{theme_name} 序列色有重复'
    for i, j in itertools.combinations(range(len(series)), 2):
        n = delta_e(series[i], series[j])
        assert n >= NORMAL_FLOOR, (
            f'{theme_name} 序列色 s{i+1} 与 s{j+1} 正常视觉 ΔE={n:.2f}，低于 {NORMAL_FLOOR}'
        )
        for kind in CVD_KINDS:
            c = delta_e(series[i], series[j], kind)
            assert c >= CVD_FLOOR, (
                f'{theme_name} 序列色 s{i+1} 与 s{j+1} 在 {kind} 模拟下 ΔE={c:.2f}，低于 {CVD_FLOOR}'
            )


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
