"""ゲームで使う文字だけを含むフォント（woff2）を game/fonts/ に作る。

Google Fonts を読み込まずに表示するため（アプリでの起動待ちと、通信なしでの字体の置き換わりを防ぐ）。
フォントはすべて SIL Open Font License 1.1。元のTTFは google/fonts リポジトリから取得してキャッシュする。

  python scripts/subset_fonts.py          # 作り直す（game/index.html・game/game.js の文字を拾う）
  python scripts/subset_fonts.py --check  # 作り直さずに、足りない文字がないかだけ調べる（足りなければ終了コード1）

ゲームの文章を変えたら、--check で確認し、足りなければ作り直す。
必要なもの：pip install fonttools brotli
"""
import os
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'game'
OUT = GAME / 'fonts'
CACHE = Path(os.environ.get('XMAS_FONT_CACHE') or Path.home() / '.cache' / 'xmas-fonts')
BASE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'

# 出力名: (元ファイル, 拾う文字の範囲)
#   'all'   = ゲーム中の全文字 / 'ascii' = 英数字と記号のみ（Chakra Petch は日本語を持たない）
FONTS = {
    'NotoSansJP.woff2':          ('notosansjp/NotoSansJP[wght].ttf', 'all'),
    'DelaGothicOne.woff2':       ('delagothicone/DelaGothicOne-Regular.ttf', 'all'),
    'ChakraPetch-Medium.woff2':  ('chakrapetch/ChakraPetch-Medium.ttf', 'ascii'),
    'ChakraPetch-SemiBold.woff2': ('chakrapetch/ChakraPetch-SemiBold.ttf', 'ascii'),
    'ChakraPetch-Bold.woff2':    ('chakrapetch/ChakraPetch-Bold.ttf', 'ascii'),
}
LICENSES = {
    'OFL-NotoSansJP.txt': 'notosansjp/OFL.txt',
    'OFL-DelaGothicOne.txt': 'delagothicone/OFL.txt',
    'OFL-ChakraPetch.txt': 'chakrapetch/OFL.txt',
}
# 画面に出る可能性があるのに、ソースに直接は書かれていない文字（数字・記号の予備）
EXTRA = ''.join(chr(c) for c in range(0x20, 0x7F)) + '０１２３４５６７８９％＋－×÷・…―─「」『』（）！？、。　'


def game_text():
    s = set(EXTRA)
    for f in (GAME / 'index.html', GAME / 'game.js'):
        s.update(f.read_text(encoding='utf-8'))
    return ''.join(sorted(c for c in s if c.isprintable() or c == '　'))


def fetch(rel):
    dst = CACHE / rel
    if not dst.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        print('download', rel)
        urllib.request.urlretrieve(BASE + urllib.parse.quote(rel), dst)
    return dst


def wanted(scope, text):
    return text if scope == 'all' else ''.join(c for c in text if ord(c) < 0x2000)


def check(text):
    missing = {}
    for name, (_, scope) in FONTS.items():
        p = OUT / name
        if not p.exists():
            missing[name] = 'ファイルが無い'
            continue
        cmap = TTFont(p).getBestCmap()
        src_cmap = None
        lack = []
        for c in wanted(scope, text):
            if ord(c) in cmap:
                continue
            # 元フォントにも無い文字（絵文字など）は、どのみち端末のフォントで出るので対象外
            if src_cmap is None:
                src_cmap = TTFont(fetch(FONTS[name][0])).getBestCmap()
            if ord(c) in src_cmap:
                lack.append(c)
        if lack:
            missing[name] = ''.join(lack)
    return missing


def build(text):
    OUT.mkdir(exist_ok=True)
    for name, (rel, scope) in FONTS.items():
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        font = subset.load_font(fetch(rel), opts)
        sub = subset.Subsetter(opts)
        sub.populate(text=wanted(scope, text))
        sub.subset(font)
        subset.save_font(font, OUT / name, opts)
        print(f'{name}: {(OUT / name).stat().st_size / 1024:.0f} KB')
    for name, rel in LICENSES.items():
        (OUT / name).write_bytes(fetch(rel).read_bytes())


if __name__ == '__main__':
    import urllib.parse  # noqa: F401  (fetch で使う)
    text = game_text()
    if '--check' in sys.argv:
        m = check(text)
        if m:
            for k, v in m.items():
                print(f'NG {k}: 足りない文字 {v}')
            print('python scripts/subset_fonts.py で作り直してください')
            sys.exit(1)
        print(f'OK: {len(text)} 文字すべて収録済み')
    else:
        build(text)
        m = check(text)
        print('check:', 'OK' if not m else m)
