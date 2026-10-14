# -*- coding: utf-8 -*-
"""把 src/ 分片 + 页面脚本组装成单文件离线 HTML。

分片写、构建时注入 —— 避免编辑巨型单文件。
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'

# 去标识化守卫的默认词表：纯占位词，不对应任何真实机构/客户。
# 使用者发布前请把这份词表换成/追加成自己的禁用词——见下面 load_denylist()
# 的本地补充机制，或者直接改这个元组。
DEFAULT_DENYLIST = ('ACME', 'ExampleCorp', '客户名', '示例医院')

# 可选的本地补充文件（不提交，已加入 .gitignore）；仓库根目录放一份
# .denylist.local，每行一个词，支持 `#` 开头注释行和空行，会被追加到
# DEFAULT_DENYLIST 上。见 .denylist.local.example。
DENYLIST_LOCAL_PATH = ROOT / '.denylist.local'


def load_denylist() -> tuple:
    """返回本次构建实际生效的去标识化词表 = 默认占位词 + 本地补充词。

    .denylist.local 不存在是正常情况（本仓库默认不附带任何真实客户词），
    静默跳过，不警告、不报错。"""
    words = list(DEFAULT_DENYLIST)
    if DENYLIST_LOCAL_PATH.exists():
        for line in DENYLIST_LOCAL_PATH.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            words.append(line)
    return tuple(words)

PAGES = {
    'demo': (ROOT / 'demo' / 'index.html', ROOT / 'demo', ROOT / 'demo.html'),
    'starter': (ROOT / 'starter' / 'index.html', ROOT / 'starter', ROOT / 'starter.html'),
}

# GitHub Pages 的入口文件：仓库根目录的 index.html。它不是一个独立模板，
# 而是 demo.html 构建产物的逐字节拷贝——Pages 只会 serve 固定文件名
# index.html，不认 demo.html。放在这里而不是让使用者手动复制，是为了让
# `python3 build.py demo` 一条命令就能同时更新两者，不给"忘记同步"留机会。
INDEX_PATH = ROOT / 'index.html'

# demo 页需要把三个脚本都拼进 PAGE_JS；starter 只有 app.js
PAGE_JS_FILES = {
    'demo': ['mockdata.js', 'demo.js', 'selftest.js'],
    'starter': ['app.js'],
}


def read(p: pathlib.Path) -> str:
    return p.read_text(encoding='utf-8') if p.exists() else ''


def strip_modules(js: str) -> str:
    """单文件内联后没有模块解析器：去掉 export / 本地 import。"""
    js = re.sub(r'^export\s+', '', js, flags=re.M)
    js = re.sub(r"^import\s*\{[\s\S]*?\}\s*from\s*'\./[^']+';\s*$", '', js, flags=re.M)
    return js


def strip_sourcemap(js: str) -> str:
    """第三方 vendor 文件常带 `//# sourceMappingURL=...` 的相对路径注释；内联
    产物里没有对应的 .map 文件可用，这行指针必然 404，交付对象（会开 DevTools
    的开发者）打开控制台就会看到一条红色报错。不违反零外链守卫（这只是注释，
    不是会被请求的标签属性），但留着没意义。行首锚定整行删除，这样只在 build
    阶段处理一次，换 vendor 版本也不用记得手改源文件。"""
    return re.sub(r'^//# sourceMappingURL=.*$\n?', '', js, flags=re.M)


def inline(html: str, parts: dict) -> str:
    """逐个替换占位符；缺任何一个都是构建失败。"""
    for placeholder, payload in parts.items():
        assert placeholder in html, f'缺少占位符 {placeholder}'
        html = html.replace(placeholder, payload, 1)
    return html


# 只有这些标签的 src/href 会真正发起网络请求；<a href="https://...">
# 是普通超链接（README/页脚需要指向 GitHub），必须放行。
_EXTERNAL_RESOURCE_TAGS = ('link', 'base', 'img', 'iframe', 'script')
_EXTERNAL_RESOURCE_RE = re.compile(
    r'<(?:' + '|'.join(_EXTERNAL_RESOURCE_TAGS) + r')\b[^>]*?\b(?:src|href)\s*=\s*'
    r'(["\']?)(?:https?:|//)',
    re.I,
)


def guard(html: str) -> None:
    """守卫：零外链 + 去标识化。违反即构建失败。"""
    m = _EXTERNAL_RESOURCE_RE.search(html)
    assert m is None, f'产物含外部资源: {m.group(0)}'
    assert '@import url(http' not in html, '产物含外部资源: @import url(http'
    for term in load_denylist():
        assert term not in html, f'产物含需去除的标识: {term}'


def build(page: str = 'demo') -> pathlib.Path:
    template_path, page_dir, out_path = PAGES[page]
    html = read(template_path)

    page_js = '\n;\n'.join(
        strip_modules(read(page_dir / name)) for name in PAGE_JS_FILES[page]
    )

    html = inline(html, {
        '/*__TOKENS__*/': read(SRC / 'tokens.css'),
        '/*__COMPONENTS__*/': read(SRC / 'components.css'),
        '/*__VENDOR__*/': strip_sourcemap(read(SRC / 'vendor' / 'chart.umd.js')),
        '/*__INTERACTIONS__*/': strip_modules(read(SRC / 'interactions.js')),
        '/*__CHARTS__*/': strip_modules(read(SRC / 'charts.js')),
        '/*__CHARTS_SVG__*/': strip_modules(read(SRC / 'charts-svg.js')),
        '/*__PAGE_JS__*/': page_js,
    })

    guard(html)
    out_path.write_text(html, encoding='utf-8')
    if page == 'demo':
        # GitHub Pages 入口与 demo.html 必须逐字节一致，在同一次构建里一并
        # 写出，避免出现"index.html 还是上一版"的陈旧发布入口。
        INDEX_PATH.write_text(html, encoding='utf-8')
    return out_path


if __name__ == '__main__':
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else 'demo'
    p = build(target)
    print(f'WROTE {p.name}  {p.stat().st_size / 1024:.0f} KB')
