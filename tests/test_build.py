# -*- coding: utf-8 -*-
import pathlib
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import build as build_mod  # noqa: E402


def test_build_writes_single_file():
    out = build_mod.build('demo')
    assert out.exists()
    assert out.suffix == '.html'


def test_no_placeholder_survives():
    out = build_mod.build('demo')
    text = out.read_text(encoding='utf-8')
    for ph in ('__TOKENS__', '__COMPONENTS__', '__VENDOR__',
               '__INTERACTIONS__', '__CHARTS__', '__CHARTS_SVG__',
               '__PAGE_JS__'):
        assert ph not in text, f'占位符未被替换: {ph}'


def test_missing_placeholder_raises(tmp_path, monkeypatch):
    bad = tmp_path / 'bad.html'
    bad.write_text('<html><style>/*__TOKENS__*/</style></html>', encoding='utf-8')
    with pytest.raises(AssertionError):
        build_mod.inline(bad.read_text(encoding='utf-8'),
                         {'/*__TOKENS__*/': 'x', '/*__CHARTS__*/': 'y'})


# 2026-10-14 审查（Review D6）：这里原有一条 test_no_external_resources，
# 只查 3 个子串（src="http / src="// / @import url(http），不查 link/base/
# img/iframe/script 的 href、不区分大小写/单引号/属性顺序，比 guard() 本身
# 弱得多。guard() 已经在 build() 内部无条件跑过一遍（build() 若放行了外部
# 资源，guard() 自己就会先抛异常，根本不会走到"读产物再查子串"这一步），
# 且 guard() 的检测逻辑本身已经被 test_guard_blocks_link_href_external /
# test_guard_allows_anchor_href_external 直接、更严格地核验过——那条弱化版
# 对真实产物的子串扫描不提供任何增量覆盖，只会在 guard() 已经出错的前提下
# 重复确认一遍"确实出错了"。删掉而不是强化：强化它等于把 guard() 的检测
# 逻辑在这里重新实现一遍，两处维护、容易漂移不一致。


def test_default_denylist_has_no_hits_in_demo_build():
    """去标识化守卫：默认占位词表在真实构建产物上跑一遍不应误报
    （占位词本来就不该出现在任何正常内容里）。"""
    out = build_mod.build('demo')
    text = out.read_text(encoding='utf-8')
    for term in build_mod.DEFAULT_DENYLIST:
        assert term not in text, f'默认占位词竟出现在构建产物里: {term}'


def test_guard_blocks_default_denylist_term():
    """机制：默认词表里的词出现在产物中必须被 guard() 拦截。"""
    term = build_mod.DEFAULT_DENYLIST[0]
    with pytest.raises(AssertionError):
        build_mod.guard(f'<html>{term}</html>')


def test_load_denylist_appends_local_file(tmp_path, monkeypatch):
    """机制核心：存在 .denylist.local 时，其中的词追加到默认词表上，
    guard() 同样会拦截这些本地补充词。"""
    local = tmp_path / '.denylist.local'
    local.write_text('客户A保密代号\n', encoding='utf-8')
    monkeypatch.setattr(build_mod, 'DENYLIST_LOCAL_PATH', local)

    words = build_mod.load_denylist()
    assert words[:len(build_mod.DEFAULT_DENYLIST)] == build_mod.DEFAULT_DENYLIST
    assert '客户A保密代号' in words

    with pytest.raises(AssertionError):
        build_mod.guard('<html>客户A保密代号</html>')


def test_load_denylist_ignores_comments_and_blank_lines(tmp_path, monkeypatch):
    """本地词表文件支持 `#` 注释行与空行，二者都应被忽略。"""
    local = tmp_path / '.denylist.local'
    local.write_text('\n# 这是注释\nWORD-ONE\n   \n# 另一条注释\nWORD-TWO\n',
                      encoding='utf-8')
    monkeypatch.setattr(build_mod, 'DENYLIST_LOCAL_PATH', local)

    words = build_mod.load_denylist()
    assert 'WORD-ONE' in words
    assert 'WORD-TWO' in words
    assert not any(w.startswith('#') for w in words)
    assert '' not in words


def test_load_denylist_missing_file_is_silent(tmp_path, monkeypatch):
    """.denylist.local 不存在是正常情况：静默跳过，只返回默认词表，
    不报错、不打印警告。"""
    monkeypatch.setattr(build_mod, 'DENYLIST_LOCAL_PATH', tmp_path / 'does-not-exist')
    assert build_mod.load_denylist() == build_mod.DEFAULT_DENYLIST


def test_guard_blocks_link_href_external():
    """<link href="https://...">（以及 base/img/iframe/script 的 src/href）会真正发起网络请求，必须拦截。"""
    bad_html = '<html><head><link rel="stylesheet" href="https://cdn.example.com/x.css"></head></html>'
    with pytest.raises(AssertionError):
        build_mod.guard(bad_html)


def test_guard_allows_anchor_href_external():
    """<a href="https://...">是普通超链接，不发起资源请求，必须放行。"""
    ok_html = '<html><body><a href="https://github.com/chuckieDING/report-design-ref">repo</a></body></html>'
    build_mod.guard(ok_html)  # 不应抛出


def test_vendor_sourcemap_comment_stripped():
    """vendor 文件常带 //# sourceMappingURL=... 的相对路径注释；内联产物里没有
    对应的 .map 文件，留着会在 DevTools 控制台留一条必然 404 的红色报错。
    build.py 统一在注入阶段剥除，不依赖手改 vendor 源文件。"""
    assert build_mod.strip_sourcemap('a\n//# sourceMappingURL=x.js.map\nb') == 'a\nb'
    out = build_mod.build('demo')
    text = out.read_text(encoding='utf-8')
    assert 'sourceMappingURL' not in text


def test_starter_builds():
    out = build_mod.build('starter')
    text = out.read_text(encoding='utf-8')
    assert '--color-primary' in text, 'starter 未内联 tokens'
    assert 'DS.charts' in text, 'starter 未内联 charts.js'
    assert 'src="http' not in text


def test_starter_carries_no_demo_content():
    """starter 是空壳，不得夹带 demo 的演示内容。"""
    text = build_mod.build('starter').read_text(encoding='utf-8')
    for leaked in ('演练场', '组件全览', 'DS_MOCK'):
        assert leaked not in text, f'starter 夹带了 demo 内容: {leaked}'


def test_index_html_is_tracked_and_matches_demo_build():
    """GitHub Pages 只会 serve 固定文件名 index.html，不认 demo.html——仓库
    根目录的 index.html 是发布入口，必须：

    1) 存在，且被 git 跟踪（不同于 demo.html/starter.html 这类被 .gitignore
       排除的中间产物）；
    2) 内容与当前 build('demo') 的产物逐字节一致。

    第 2 条是关键：一个和源码不同步的发布入口，比没有入口更糟——会让
    Pages 上线一份过期甚至带 bug 的旧版本，而所有本地测试、评审都在看
    新版源码，没人会发现线上其实是旧的。"""
    index_path = build_mod.ROOT / 'index.html'
    assert index_path.exists(), 'index.html 不存在，GitHub Pages 没有可用入口'

    tracked = subprocess.run(
        ['git', 'ls-files', '--error-unmatch', 'index.html'],
        cwd=build_mod.ROOT, capture_output=True, text=True,
    )
    assert tracked.returncode == 0, (
        f'index.html 未被 git 跟踪（必须纳入版本控制，Pages 要靠它）: {tracked.stderr}'
    )

    # 注意：build_mod.build('demo') 本身就会把 index.html 原地重写为最新产物
    # （见 build.py 里的同步逻辑），所以必须在调用它之前先把磁盘上现有内容
    # 读出来存着，再跟构建后的新内容比较——否则这条断言会变成「构建后和
    # 刚构建完的自己比」，恒为真，测不出任何陈旧情况（典型的断言恒真陷阱）。
    before = index_path.read_bytes()
    out = build_mod.build('demo')
    after = out.read_bytes()
    assert before == after, (
        "index.html 与 build('demo') 产物不一致，发布入口已经陈旧，"
        '请重新运行 `python3 build.py demo`'
    )
