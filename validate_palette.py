# -*- coding: utf-8 -*-
"""dataviz validate_palette.js 的 Python 孪生（本机无 node）。
阈值/矩阵/公式与 scripts/validate_palette.js 逐行对齐。
用法: python3 validate_palette.py "#aaa111,#bbb222" --mode light [--surface #fcfcfb] [--pairs all]
"""
import sys, math, itertools

BAND = {'light': (0.43, 0.77), 'dark': (0.48, 0.67)}
CHROMA_FLOOR = 0.10
CVD_TARGET, CVD_FLOOR = 8.0, 6.0
NORMAL_FLOOR = 15.0
CONTRAST_MIN = 3.0
DEFAULT_SURFACE = {'light': '#fcfcfb', 'dark': '#1a1a19'}

MACHADO = {
    'protan': [[0.152286, 1.052583, -0.204868],
               [0.114503, 0.786281, 0.099216],
               [-0.003882, -0.048116, 1.051998]],
    'deutan': [[0.367322, 0.860646, -0.227968],
               [0.280085, 0.672501, 0.047413],
               [-0.011820, 0.042940, 0.968881]],
    'tritan': [[1.255528, -0.076749, -0.178779],
               [-0.078411, 0.930809, 0.147602],
               [0.004733, 0.691367, 0.303900]],
}


def s2lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(h):
    h = h.strip().lstrip('#')
    return [s2lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]


def rel_lum(h):
    r, g, b = lin(h)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    hi, lo = sorted((rel_lum(a), rel_lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def oklab_from_lin(rgb):
    r, g, b = rgb
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def oklch(h):
    L, a, b = oklab_from_lin(lin(h))
    return L, math.hypot(a, b)


def simulate(h, kind):
    r, g, b = lin(h)
    M = MACHADO[kind]
    return [min(1, max(0, M[i][0] * r + M[i][1] * g + M[i][2] * b)) for i in range(3)]


def delta_e(h1, h2, kind=None):
    a = oklab_from_lin(simulate(h1, kind) if kind else lin(h1))
    b = oklab_from_lin(simulate(h2, kind) if kind else lin(h2))
    return 100 * math.dist(a, b)


def validate(pal, mode='light', surface=None, pairs='adjacent'):
    surface = surface or DEFAULT_SURFACE[mode]
    lo, hi = BAND[mode]
    fail = False
    print(f'--- mode={mode} surface={surface} pairs={pairs} ---')
    print(f'{"slot":<5}{"hex":<10}{"L":>7}{"C":>7}{"contrast":>10}  status')
    for i, h in enumerate(pal, 1):
        L, C = oklch(h)
        cr = contrast(h, surface)
        st = []
        if not (lo <= L <= hi):
            st.append('FAIL band'); fail = True
        if C < CHROMA_FLOOR:
            st.append('FAIL chroma'); fail = True
        if cr < CONTRAST_MIN:
            st.append('WARN contrast<3 (需直接标注/表格视图)')
        print(f'{i:<5}{h:<10}{L:7.3f}{C:7.3f}{cr:10.2f}  {"OK" if not st else "; ".join(st)}')

    plist = (list(itertools.combinations(range(len(pal)), 2)) if pairs == 'all'
             else [(i, i + 1) for i in range(len(pal) - 1)])
    print(f'\n{"pair":<14}{"normal":>8}{"protan":>8}{"deutan":>8}{"tritan":>8}  status')
    worst_n, worst_c = 999, 999
    for i, j in plist:
        n = delta_e(pal[i], pal[j])
        p = delta_e(pal[i], pal[j], 'protan')
        d = delta_e(pal[i], pal[j], 'deutan')
        t = delta_e(pal[i], pal[j], 'tritan')
        cvd = min(p, d)
        worst_n, worst_c = min(worst_n, n), min(worst_c, cvd)
        st = 'OK'
        if n < NORMAL_FLOOR:
            st = 'FAIL normal<15'; fail = True
        elif cvd < CVD_FLOOR:
            st = 'FAIL cvd<6'; fail = True
        elif cvd < CVD_TARGET:
            st = 'WARN cvd 6-8 (需二级编码)'
        print(f'{i+1}-{j+1:<12}{n:8.1f}{p:8.1f}{d:8.1f}{t:8.1f}  {st}')
    print(f'\nworst normal ΔE={worst_n:.1f} (>=15)   worst CVD ΔE={worst_c:.1f} (>=8 目标 / >=6 底线)')
    print('RESULT:', 'FAIL' if fail else 'PASS')
    return not fail


if __name__ == '__main__':
    args = sys.argv[1:]
    pal = [c.strip() for c in args[0].split(',') if c.strip()]
    def opt(name, dflt=None):
        return args[args.index(name) + 1] if name in args else dflt
    ok = validate(pal, opt('--mode', 'light'), opt('--surface'), opt('--pairs', 'adjacent'))
    sys.exit(0 if ok else 1)
