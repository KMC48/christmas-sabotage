# -*- coding: utf-8 -*-
"""
スプライトの外接矩形（透過部分を除いた範囲）を計測して trim.json を作り直す。

    python game/tools/measure_trim.py

game/assets/ の透過PNGを走査し、game/tools/trim.json を更新したうえで、
game.js の TRIM に貼れる形のスニペットを表示する。

余白なしで納品された素材は TRIM に載せなくても画像全体が使われるため、
このスクリプトが必要になるのは「余白のある素材を差し替えたとき」だけ。

注意: cv2 は日本語パスの読み書きに失敗するため、imdecode/imencode 経由で扱う。
"""
import json
import os

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.abspath(os.path.join(HERE, '..', 'assets'))
OUT = os.path.join(HERE, 'trim.json')

ALPHA_THRESHOLD = 12   # これ以下の不透明度は「余白」とみなす


def imread(path):
    buf = np.frombuffer(open(path, 'rb').read(), dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_UNCHANGED)


def main():
    trim = {}
    skipped = []
    for name in sorted(os.listdir(ASSETS)):
        if not name.lower().endswith('.png'):
            continue
        key = os.path.splitext(name)[0]
        im = imread(os.path.join(ASSETS, name))
        if im is None:
            skipped.append((key, '読み込めません'))
            continue
        if im.ndim != 3 or im.shape[2] != 4:
            skipped.append((key, '透過なし'))
            continue
        h, w = im.shape[:2]
        ys, xs = np.where(im[:, :, 3] > ALPHA_THRESHOLD)
        if not len(xs):
            skipped.append((key, '全面透明'))
            continue
        x0, y0 = int(xs.min()), int(ys.min())
        bw, bh = int(xs.max() - x0 + 1), int(ys.max() - y0 + 1)
        trim[key] = [x0, y0, bw, bh, w, h]
        tight = (bw == w and bh == h)
        print('%-22s %4dx%-4d bbox=(%d,%d,%d,%d)%s'
              % (key, w, h, x0, y0, bw, bh, '  余白なし' if tight else ''))

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(trim, f, ensure_ascii=False, indent=1)
    print('\n%s を更新しました（%d件）' % (OUT, len(trim)))
    for key, why in skipped:
        print('  スキップ: %s（%s）' % (key, why))

    print('\n--- game.js の TRIM に貼る形 ---')
    for key in sorted(trim):
        v = trim[key]
        print('    %s: [%d, %d, %d, %d],' % (key, v[0], v[1], v[2], v[3]))
    print('\n余白なしの素材は TRIM に載せなくても画像全体が使われます。')


if __name__ == '__main__':
    main()
