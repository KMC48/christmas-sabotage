"""game/assets/icon_1024.png から Android のランチャーアイコン一式を作る。

- ic_launcher.png / ic_launcher_round.png：旧形式（48dp）
- ic_launcher_foreground.png：アダプティブアイコンの前景（108dp。端末が中央の約2/3を表示する）
背景色は res/values/ic_launcher_background.xml で指定する。
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'game' / 'assets' / 'icon_1024.png'
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

src = Image.open(SRC).convert('RGBA')
for name, k in DENS.items():
    d = RES / f'mipmap-{name}'
    d.mkdir(parents=True, exist_ok=True)
    s = round(48 * k)
    sq = src.resize((s, s), Image.LANCZOS)
    sq.save(d / 'ic_launcher.png')
    mask = Image.new('L', (s * 4, s * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s * 4 - 1, s * 4 - 1), fill=255)
    rnd = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    rnd.paste(sq, (0, 0), mask.resize((s, s), Image.LANCZOS))
    rnd.save(d / 'ic_launcher_round.png')
    f = round(108 * k)
    src.resize((f, f), Image.LANCZOS).save(d / 'ic_launcher_foreground.png')
print('icons written to', RES)
