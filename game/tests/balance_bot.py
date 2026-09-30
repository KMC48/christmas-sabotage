# -*- coding: utf-8 -*-
"""
制限時間と得点の目安を測るボット。

実ブラウザでゲームを開き、スティック入力だけで「いちばん近い未工作のイルミへ向かい、工作する」を
繰り返してステージをクリアする。警備員の視線は無視する（発見ゲージを毎フレーム0に戻す）ので、
人間より速い「上手な人の上限」に近い値になる。

    python game/tests/balance_bot.py

出力：ステージごとのクリア時間（ゲーム内時間）、制限時間、時間延長の合計、得点、最大コンボ。
"""
import json
import os

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
URL = 'file:///' + os.path.abspath(os.path.join(HERE, '..', 'index.html')).replace(os.sep, '/')

BOT = r"""(idx) => {
  XMAS.setAuto(false);
  XMAS.beginPlay(idx);
  const G = XMAS.G, c = XMAS.ctl, dt = 1 / 60;
  let target = null, lastD = 1e9, stuckT = 0, sideT = 0, sideDir = 1, frames = 0;
  c.stick.id = 1;
  const steer = (vx, vy) => { const m = Math.hypot(vx, vy) || 1; c.stick.vx = vx / m; c.stick.vy = vy / m; c.stick.ox = c.stick.vx * 40; c.stick.oy = c.stick.vy * 40; };
  while (G.state === 'playing' && frames < 60 * 400) {
    frames++;
    G.detect = 0;                                     // 視線は無視（上手な人の上限を測る）
    if (!G.action) {
      const p = G.player;
      if (!target || target.done) {
        let best = null, bd = 1e9;
        for (const t of G.targets) {
          if (t.done) continue;
          const d = Math.hypot(t.x - p.x, t.y - p.y) + (t.y > p.y + 40 ? 250 : 0);   // 後戻りは少し嫌う
          if (d < bd) { bd = d; best = t; }
        }
        target = best; lastD = 1e9; stuckT = 0;
      }
      if (G.candidate && (G.candidate === target || Math.hypot(G.candidate.x - p.x, G.candidate.y - p.y) < 100)) {
        c.stick.vx = c.stick.vy = 0; c.stick.ox = c.stick.oy = 0;
        p.face = Math.atan2(G.candidate.y - p.y, G.candidate.x - p.x);
        XMAS.startAction();
      } else if (target) {
        const an = XMAS.anchorOf(target, p.x, p.y);
        let vx = an.x - p.x, vy = an.y - p.y;
        const d = Math.hypot(vx, vy);
        if (d < lastD - 0.5) { lastD = d; stuckT = 0; } else stuckT += dt;
        if (stuckT > 0.6 && sideT <= 0) { sideT = 0.7; sideDir = -sideDir; stuckT = 0; lastD = 1e9; }
        if (sideT > 0) { sideT -= dt; const tx = -vy * sideDir, ty = vx * sideDir; vx = tx; vy = ty; }
        steer(vx, vy);
      }
    }
    XMAS.step(dt);
  }
  c.stick.id = null;
  const st = G.stage;
  return { stage: st.special ? 'SP' : st.id, state: G.state, used: +G.time.toFixed(1), limit: st.time,
           bonus: G.bonusCount * XMAS.CFG.bonusSec, targets: G.targets.length,
           left: +G.left.toFixed(1), score: G.result ? G.result.total : null, maxCombo: G.maxCombo,
           rank: G.result ? G.result.rank : null };
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 400, 'height': 800})
    pg.goto(URL)
    pg.wait_for_function('() => !!window.XMAS')
    n = pg.evaluate('() => XMAS.STAGES.length')
    for i in range(n):
        print(json.dumps(pg.evaluate(BOT, i), ensure_ascii=False))
    b.close()
