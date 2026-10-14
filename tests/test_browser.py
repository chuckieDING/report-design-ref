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
    下限按当前全部套件在 ?selftest=1 下的真实产出（157 条，2026-10-14
    修复中文数字排序/全屏 resize/双轴主题色三个 bug 时从 147 增至此数）
    设置，不留"静默丢几条也不报警"的安全余量——余量越大，这条护栏能防住
    的回归越小。新增断言只会让总数增加，不会无故减少，到时把这个数字也
    一并调大即可。"""
    res = selftest()
    assert len(res) >= 157, f'断言总数骤降到 {len(res)}，可能有套件中途抛错或静默少跑'


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
