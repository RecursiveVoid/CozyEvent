"""Generates the README pixel art in this folder (palette matches the cherry-blossom banner).

Run from the repo root:  python3 assets/generate.py   (needs Pillow)
Chart numbers are copied from benchmark/reports (results.md / size.md); update them there first.
Not part of the npm package (package.json "files" only ships dist/).
"""

from pathlib import Path
from PIL import Image

OUT = Path(__file__).parent

# Cozy palette
C = {
    # matches the cherry-blossom banner (https://i.imgur.com/lU4VqXb.png)
    'bg': (246, 198, 184),  # salmon pink
    'bg2': (250, 214, 202),
    'k': (120, 24, 40),  # dark red outline
    'o': (238, 122, 90),
    'l': (178, 40, 52),  # value text
    'w': (255, 246, 240),  # cream
    'p': (255, 120, 150),  # blossom pink
    'r': (222, 40, 52),  # banner red
    'y': (222, 40, 52),  # highlight = banner red
    't': (240, 150, 160),  # soft pink bars
    'm': (170, 100, 105),  # muted text
    'x': (205, 170, 165),  # grey bar
    'T': (120, 24, 40),  # title text
    '*': (255, 246, 240),
}

# 3x5 font
F3 = {
    'A': ['010', '101', '111', '101', '101'], 'B': ['110', '101', '110', '101', '110'],
    'C': ['011', '100', '100', '100', '011'], 'D': ['110', '101', '101', '101', '110'],
    'E': ['111', '100', '110', '100', '111'], 'F': ['111', '100', '110', '100', '100'],
    'G': ['011', '100', '101', '101', '011'], 'H': ['101', '101', '111', '101', '101'],
    'I': ['111', '010', '010', '010', '111'], 'J': ['001', '001', '001', '101', '010'],
    'K': ['101', '101', '110', '101', '101'], 'L': ['100', '100', '100', '100', '111'],
    'M': ['101', '111', '111', '101', '101'], 'N': ['110', '101', '101', '101', '101'],
    'O': ['010', '101', '101', '101', '010'], 'P': ['110', '101', '110', '100', '100'],
    'Q': ['010', '101', '101', '110', '011'], 'R': ['110', '101', '110', '101', '101'],
    'S': ['011', '100', '010', '001', '110'], 'T': ['111', '010', '010', '010', '010'],
    'U': ['101', '101', '101', '101', '111'], 'V': ['101', '101', '101', '101', '010'],
    'W': ['101', '101', '111', '111', '101'], 'X': ['101', '101', '010', '101', '101'],
    'Y': ['101', '101', '010', '010', '010'], 'Z': ['111', '001', '010', '100', '111'],
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
    '2': ['110', '001', '010', '100', '111'], '3': ['110', '001', '010', '001', '110'],
    '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '110', '001', '110'],
    '6': ['011', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '110'],
    ' ': ['000'] * 5, '.': ['0', '0', '0', '0', '1'], ',': ['00', '00', '00', '01', '10'],
    ':': ['0', '1', '0', '1', '0'], '-': ['000', '000', '111', '000', '000'],
    '/': ['001', '001', '010', '100', '100'], '(': ['01', '10', '10', '10', '01'],
    ')': ['10', '01', '01', '01', '10'], '@': ['111', '101', '111', '100', '011'],
    '+': ['000', '010', '111', '010', '000'], '*': ['101', '010', '101', '000', '000'],
    'x': ['000', '101', '010', '101', '000'], '!': ['1', '1', '1', '0', '1'],
    '#': ['101', '111', '101', '111', '101'],
}

# 5x7 font for the title
F5 = {
    'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'V': ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
    'N': ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
}


class Canvas:
    def __init__(self, w, h, bg='bg'):
        self.w, self.h = w, h
        self.px = [[C[bg] if bg else None for _ in range(w)] for _ in range(h)]

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h and c:
            self.px[y][x] = C[c] if isinstance(c, str) else c

    def rect(self, x, y, w, h, c):
        for j in range(h):
            for i in range(w):
                self.set(x + i, y + j, c)

    def sprite(self, x, y, rows):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch != '.':
                    self.set(x + i, y + j, ch)

    def text(self, x, y, s, c, font=F3, shadow=None):
        for ch in s.upper() if font is F3 else s:
            g = font.get(ch, font.get(' ', ['000'] * 5))
            for j, row in enumerate(g):
                for i, b in enumerate(row):
                    if b == '1':
                        if shadow:
                            self.set(x + i + 1, y + j + 1, shadow)
                        self.set(x + i, y + j, c)
            x += len(g[0]) + 1
        return x

    def frame(self, c='k', corner=True):
        """Pixel rounded border."""
        for i in range(self.w):
            self.set(i, 0, c), self.set(i, self.h - 1, c)
        for j in range(self.h):
            self.set(0, j, c), self.set(self.w - 1, j, c)
        if corner:
            for (x, y) in [(0, 0), (self.w - 1, 0), (0, self.h - 1), (self.w - 1, self.h - 1)]:
                self.px[y][x] = (0, 0, 0, 0)

    def save(self, name, scale):
        img = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for y in range(self.h):
            for x in range(self.w):
                p = self.px[y][x]
                if p is not None:
                    img.putpixel((x, y), p if len(p) == 4 else p + (255,))
        img = img.resize((self.w * scale, self.h * scale), Image.NEAREST)
        img.save(OUT / name, optimize=True)


def text_w(s, font=F3):
    return sum(len(font.get(ch, font[' '])[0]) + 1 for ch in (s.upper() if font is F3 else s)) - 1


CAT = [
    '..k.......k.........',
    '.kok.....kok........',
    '.kpok...kopk........',
    '.koookkkooook.......',
    'kooooooooooook..kk..',
    'koekoooookeoook.kok.',
    'kooooopoooooook..kok',
    'kooowwkwwooooook.kok',
    'kooowwwwwoooooookkok',
    '.koolooooloooolooook',
    '.kooloooooloooolokk.',
    '..kkkkkkkkkkkkkkkk..',
]

MUG = [
    '..s...s..',
    '.s...s...',
    '..s...s..',
    '.s...s...',
    'kkkkkkk..',
    'kwwwwwkkk',
    'kwrrrwk.k',
    'kwrrrwk.k',
    'kwrrrwkkk',
    'kwwwwwk..',
    '.kkkkk...',
]

BOLT = [
    '....kkkk',
    '...kyyk.',
    '..kyyk..',
    '.kyyykkk',
    'kyyyyyyk',
    'kkkyyyk.',
    '..kyyk..',
    '.kyyk...',
    '.kyk....',
    'kkk.....',
]

STAR = ['.*.', '***', '.*.']


def banner():
    c = Canvas(200, 64)
    # stars
    for (x, y) in [(8, 6), (30, 12), (52, 5), (150, 8), (176, 14), (190, 5), (120, 4), (96, 10)]:
        c.sprite(x, y, STAR)
    # window glow line + floor
    c.rect(0, 52, 200, 12, 'floor')
    for x in range(0, 200, 8):
        c.rect(x, 52, 4, 1, 'floor2')
        c.rect(x + 4, 57, 4, 1, 'floor2')
    # rug
    c.rect(18, 50, 44, 3, 'r')
    c.rect(20, 50, 40, 1, 'p')
    c.sprite(26, 39, CAT)
    c.sprite(50, 41, MUG)
    # title
    title = 'COZYEVENT'
    x0 = 72
    x = x0
    for ch in title:
        g = F5[ch]
        for j, row in enumerate(g):
            for i, b in enumerate(row):
                if b == '1':
                    c.rect(x + i * 2 + 1, 14 + j * 2 + 1, 2, 2, 'k')
                    c.rect(x + i * 2, 14 + j * 2, 2, 2, 'w' if ch not in 'EVENT' else 'y')
        x += 12
    c.sprite(x + 2, 12, BOLT)
    tag = 'TINY  .  FAST  .  TYPED'
    c.text(x0 + (x - x0 - text_w(tag)) // 2, 34, tag, 'l', shadow='k')
    c.frame('k')
    c.save('banner.png', 4)


ICONS = {
    'tiny': [  # feather
        '................',
        '...........kkk..',
        '.........kkwwwk.',
        '........kwwwwwk.',
        '.......kwwwmwk..',
        '......kwwwmwwk..',
        '.....kwwwmwwk...',
        '....kwwwmwwk....',
        '....kwwmwwk.....',
        '...kwwmwwk......',
        '...kwmwkk.......',
        '..kwmkk.........',
        '..kmk...........',
        '.km.............',
        'km..............',
        '................',
    ],
    'fast': [
        '................',
        '.......kkkkk....',
        '......kyyyyk....',
        '.....kyyyyk.....',
        '....kyyyyk......',
        '...kyyyyykkkk...',
        '..kyyyyyyyyyk...',
        '..kkkkyyyyyk....',
        '.....kyyyyk.....',
        '....kyyyyk......',
        '....kyyyk.......',
        '...kyyyk........',
        '...kyyk.........',
        '..kyyk..........',
        '..kkk...........',
        '................',
    ],
    'typed': [  # shield with check
        '................',
        '...kkkkkkkkkk...',
        '..kttttttttttk..',
        '..kttttttttwtk..',
        '..ktttttttwwtk..',
        '..kttttttwwttk..',
        '..ktwtttwwtttk..',
        '..ktwwtwwttttk..',
        '..kttwwwtttttk..',
        '...kttwtttttk...',
        '...ktttttttttk..',
        '....kttttttk....',
        '.....kttttk.....',
        '......kttk......',
        '.......kk.......',
        '................',
    ],
    'safe': [  # padlock
        '................',
        '.....kkkkkk.....',
        '....kmmmmmmk....',
        '...kmk....kmk...',
        '...kmk....kmk...',
        '...kmk....kmk...',
        '..kkkkkkkkkkkk..',
        '..kyyyyyyyyyyk..',
        '..kyyyykkyyyyk..',
        '..kyyyykkyyyyk..',
        '..kyyyyykyyyyk..',
        '..kyyyyykyyyyk..',
        '..kyyyyyyyyyyk..',
        '..kkkkkkkkkkkk..',
        '................',
        '................',
    ],
    'react': [  # atom
        '................',
        '......rrrr......',
        '....rr....rr....',
        '...r.rr..rr.r...',
        '..r...rrrr...r..',
        '..r..r....r..r..',
        '.r..r..pp..r..r.',
        '.r.r..pppp..r.r.',
        '.r.r..pppp..r.r.',
        '.r..r..pp..r..r.',
        '..r..r....r..r..',
        '..r...rrrr...r..',
        '...r.rr..rr.r...',
        '....rr....rr....',
        '......rrrr......',
        '................',
    ],
}


def icons():
    for name, rows in ICONS.items():
        c = Canvas(20, 20, 'bg2')
        c.sprite(2, 2, rows)
        c.frame('k')
        c.save(f'icon-{name}.png', 5)


def bar_chart(name, title, subtitle, rows, unit, max_v=None):
    """rows: (label, value, color, note)"""
    fmt = lambda v: (f'{v:.1f}' if isinstance(v, float) else str(v)) + unit
    label_w = max(text_w(r[0]) for r in rows) + 6
    width = 200
    tail = max(text_w(fmt(r[1])) + (text_w(r[3]) + 3 if r[3] else 0) for r in rows) + 6
    bar_area = width - label_w - tail
    h = 20 + len(rows) * 9 + 10
    c = Canvas(width, h)
    c.text(4, 4, title, 'T')
    c.text(4, 11, subtitle, 'm')
    max_v = max_v or max(r[1] for r in rows)
    y = 20
    for label, v, col, note in rows:
        c.text(label_w - text_w(label) - 3, y + 1, label, 'T' if col != 'x' else 'm')
        bw = max(1, round(bar_area * v / max_v))
        c.rect(label_w + 1, y + 1, bw, 6, 'k')
        c.rect(label_w, y, bw, 6, col)
        c.rect(label_w, y, bw, 1, 'w')
        vx = c.text(label_w + bw + 3, y + 1, fmt(v), 'l')
        if note:
            c.text(vx + 2, y + 1, note, 'm')
        y += 9
    c.frame('k')
    c.save(name, 4)


def charts():
    # benchmark/reports/results.md, emit with 10 distinct listeners, M ops/s
    bar_chart(
        'chart-speed.png',
        'EMIT, 10 DIFFERENT LISTENERS',
        'MILLION OPS/S, HIGHER IS BETTER',
        [
            ('COZYEVENT V2', 82.2, 'y', ''),
            ('TSEEP CSP-SAFE', 21.0, 't', ''),
            ('NANOEVENTS', 20.5, 't', ''),
            ('EMITIX', 19.7, 't', ''),
            ('@BRAINTREE', 18.6, 't', ''),
            ('EVENTEMITTER3', 17.8, 't', ''),
            ('NODE:EVENTS', 15.3, 't', ''),
            ('COZYEVENT V1', 11.2, 'o', ''),
            ('TSEEP (EVAL)', 96.5, 'x', 'NOT CSP-SAFE'),
        ],
        '',
    )
    # benchmark/reports/size.md, libraries that have once
    bar_chart(
        'chart-size.png',
        'BUNDLE SIZE, LIBRARIES WITH ONCE',
        'GZIP BYTES, SMALLER IS BETTER',
        [
            ('COZYEVENT V2', 456, 'y', ''),
            ('EMITIX', 951, 't', ''),
            ('EVENTEMITTER3', 1112, 't', ''),
            ('EVENT-EMITTER', 1920, 't', ''),
            ('TSEEP', 3514, 't', ''),
            ('EVENTEMITTER2', 5691, 't', ''),
            ('COZYEVENT V1', 269, 'o', 'HAS BUGS'),
        ],
        'B',
    )


def divider():
    c = Canvas(200, 7)
    for x in range(2, 198, 12):
        c.sprite(x, 2, STAR)
    c.rect(0, 0, 200, 1, 'k')
    c.rect(0, 6, 200, 1, 'k')
    c.save('divider.png', 4)


if __name__ == '__main__':
    icons()
    charts()
    print('written to', OUT)
