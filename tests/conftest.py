# -*- coding: utf-8 -*-
"""浏览器端断言的 pytest 桥接：build → headless 渲染 → 解析结果。"""
import html as html_mod
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import build as build_mod  # noqa: E402

# 可通过环境变量覆盖，默认回退到本机实测可用的 snap chromium 路径。
# 找不到可执行文件时在首次使用处给出清晰报错（而不是让 subprocess 抛一条
# 难懂的 FileNotFoundError），说明如何通过 DS_TEST_CHROMIUM 指定别的路径。
CHROMIUM = os.environ.get('DS_TEST_CHROMIUM', '/snap/bin/chromium')
# snap chromium 读不到 /tmp，渲染中间产物必须留在 home 下
RENDER_DIR = ROOT / '_render'
# 渲染视口：桌面宽屏。headless 默认窗口只有约 780x440，对"全屏面板 92vh"这类
# 视口相关的行为太小（全屏面板反而比平时的卡片还矮）；页面布局沿用铺满宽度的
# 参照实现，断言也按 1440 宽写（卡片宽 > 640 等）。可用 DS_TEST_VIEWPORT=宽x高 覆盖。
VIEWPORT = tuple(int(x) for x in os.environ.get('DS_TEST_VIEWPORT', '1440x900').split('x'))

RESULT_RE = re.compile(
    r'<pre[^>]*id="selftest-result"[^>]*>(.*?)</pre>', re.S)


def _dump_dom(url: str, timeout: int = 90, profile_dir=None) -> str:
    RENDER_DIR.mkdir(exist_ok=True)
    if not pathlib.Path(CHROMIUM).exists() and not shutil.which(CHROMIUM):
        raise RuntimeError(
            f'找不到 chromium 可执行文件: {CHROMIUM!r}。'
            '设置环境变量 DS_TEST_CHROMIUM 指向本机的 chromium/chrome 可执行文件，'
            '例如: DS_TEST_CHROMIUM=/usr/bin/chromium-browser python3 -m pytest tests/'
        )
    # 每次渲染用一次性 user-data-dir，用完即弃：固定复用同一个 profile 会让
    # demo 页写进 localStorage 的主题选择（比如开发者手动打开 demo.html 点了
    # 一下深浅切换按钮）跨次渲染持久化，污染后续所有依赖"默认浅色主题"的
    # 断言——源码和断言本身都没问题，表现却和真实样式回归一模一样（Critical，
    # 已实测复现：同一 profile 下跑一次 DS.theme.set('dark')，10 条 comp-* 断言
    # 全部报出深色 token 值；删掉 profile 立刻恢复）。
    # profile_dir 只给"真实刷新后的持久化"这类需要跨两次加载共用同一份 localStorage 的测试用
    # （调用方负责清理）；其余一律一次性 profile。
    own_profile = profile_dir is None
    if own_profile:
        profile_dir = tempfile.mkdtemp(dir=RENDER_DIR, prefix='profile-')
    try:
        cmd = [
            CHROMIUM, '--headless', '--disable-gpu', '--no-sandbox',
            '--virtual-time-budget=8000',
            f'--window-size={VIEWPORT[0]},{VIEWPORT[1]}',
            f'--user-data-dir={profile_dir}',
            '--dump-dom', url,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if not proc.stdout.strip():
            raise RuntimeError(f'chromium 无输出。stderr: {proc.stderr[-800:]}')
        return proc.stdout
    finally:
        if own_profile:
            shutil.rmtree(profile_dir, ignore_errors=True)


def _parse(dom: str) -> dict:
    m = RESULT_RE.search(dom)
    if not m:
        raise AssertionError('DOM 中找不到 #selftest-result，页面可能抛错未渲染')
    raw = html_mod.unescape(m.group(1)).strip()
    if raw == 'PENDING' or not raw:
        raise AssertionError('自测套件未运行完（结果仍为 PENDING），检查 JS 是否抛错')
    out = {}
    for line in raw.splitlines():
        parts = line.split('\t')
        status, name = parts[0], parts[1]
        detail = parts[2] if len(parts) > 2 else ''
        out[name] = (status == 'PASS', detail)
    return out


@pytest.fixture(scope='session')
def built():
    return build_mod.build('demo')


@pytest.fixture
def selftest(built):
    """用法: res = selftest(); assert res['card-bg'][0]"""
    def run(query: str = ''):
        q = 'selftest=1' + ('&' + query if query else '')
        return _parse(_dump_dom(f'file://{built}?{q}'))
    return run


def assert_all_pass(res: dict, prefix: str = ''):
    """断言全部（或某前缀下全部）通过，失败时打印具体哪条。

    Critical 修复：某个套件中途抛错时，selftest.js 只登记一条
    `suite-threw:<套件名>`，不匹配任何 `ch-`/`wh-`/... 前缀过滤器——调用方若
    只按前缀筛选，该套件后半段"静默消失"的断言不会被发现（pytest 照样全绿）。
    这里不管调用方传的是什么前缀，一律先无条件检查有没有任何套件抛错。"""
    threw = sorted(k for k in res if k.startswith('suite-threw:'))
    assert not threw, '套件中途抛错，其后的断言未跑完:\n' + '\n'.join(
        f'{k}: {res[k][1]}' for k in threw)
    failed = [f'{k}: {v[1]}' for k, v in res.items()
              if k.startswith(prefix) and not v[0]]
    assert not failed, '浏览器端断言失败:\n' + '\n'.join(failed)
