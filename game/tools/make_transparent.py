# -*- coding: utf-8 -*-
"""
ChatGPTが透過PNGを出せなかったとき用の背景抜きスクリプト。

使い方:
    python make_transparent.py <assetsフォルダ または 画像ファイル>

背景色 #0A0E1C（紺に寄せた黒）に近い画素をアルファ0にする。
元画像は同じフォルダに "<名前>_orig.png" として残す。

注意: cv2 は日本語パスの読み書きに失敗するため、
      必ず np.frombuffer + imdecode / imencode 経由で扱うこと。
"""
import os
import sys
import numpy as np
import cv2

BG = (0x0A, 0x0E, 0x1C)   # R, G, B
TOL = 42                  # 背景とみなす距離のしきい値
FEATHER = 2               # 境界のぼかし幅（px）


def imread_u(path):
    buf = np.frombuffer(open(path, "rb").read(), dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_UNCHANGED)


def imwrite_u(path, img):
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise RuntimeError("エンコード失敗: " + path)
    with open(path, "wb") as f:
        f.write(buf.tobytes())


def cutout(path):
    img = imread_u(path)
    if img is None:
        print("  読み込めません:", path)
        return False
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    if img.shape[2] == 4:
        # すでに透過済みなら何もしない
        if (img[:, :, 3] < 250).any():
            print("  透過済みのためスキップ:", os.path.basename(path))
            return False
        img = img[:, :, :3]

    bgr = np.array([BG[2], BG[1], BG[0]], dtype=np.float32)
    diff = np.linalg.norm(img.astype(np.float32) - bgr, axis=2)

    alpha = np.clip((diff - TOL) / max(FEATHER * 8, 1) * 255.0, 0, 255).astype(np.uint8)

    # 外周から繋がっている背景だけを抜く（キャラ内部の暗部を残すため）
    mask = (alpha == 0).astype(np.uint8)
    h, w = mask.shape
    ff = np.zeros((h + 2, w + 2), np.uint8)
    outside = mask.copy()
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if mask[seed[1], seed[0]]:
            cv2.floodFill(outside, ff, seed, 2)
    alpha[outside != 2] = 255

    out = np.dstack([img, alpha])

    base, ext = os.path.splitext(path)
    orig = base + "_orig.png"
    if not os.path.exists(orig):
        os.replace(path, orig)
    imwrite_u(base + ".png", out)
    print("  透過化:", os.path.basename(base + ".png"))
    return True


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    target = sys.argv[1]
    files = []
    if os.path.isdir(target):
        for n in sorted(os.listdir(target)):
            if n.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) and not n.endswith("_orig.png"):
                files.append(os.path.join(target, n))
    else:
        files = [target]

    print("対象 %d 件" % len(files))
    done = 0
    for f in files:
        if cutout(f):
            done += 1
    print("完了: %d 件を透過化しました" % done)


if __name__ == "__main__":
    main()
