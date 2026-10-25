# -*- coding: utf-8 -*-
"""
『クリスマス粉砕大作戦』受入テスト（v4：V01〜V10 ＋ v3のA01〜A18 ＋ v2 からの回帰確認）

実ブラウザ（Playwright/Chromium）で index.html を開き、window.XMAS の固定dtで
ゲーム内時間を進めて検証する。setTimeout の実時間待ちに依存しないので結果は再現する。

    python game/tests/run_tests.py

見た目（顔や足先が切れていないか等）と実機のタッチ操作は、このスクリプトでは確認できない。
確認できる範囲だけを PASS として報告する。
"""
import functools
import http.server
import json
import os
import sys
import threading

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
GAME_DIR = os.path.abspath(os.path.join(HERE, '..'))


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


# 同梱フォント（@font-face）は file:// では読めないため、公開時と同じく HTTP で開く
_server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(_QuietHandler, directory=GAME_DIR))
threading.Thread(target=_server.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % _server.server_port

results = []


def check(tid, name, ok, detail=''):
    results.append((tid, name, bool(ok), detail))
    print('  [%s] %s %s%s' % ('PASS' if ok else 'FAIL', tid, name, ('  -> ' + str(detail)) if detail else ''))
    return ok


def fresh(page, save=None, query=''):
    """保存データを入れ替えて読み直し、自動ループを止める"""
    page.evaluate("""(s) => { try { localStorage.clear(); if (s) localStorage.setItem('xmas-funsai-v1', s); } catch (e) {} }""",
                  json.dumps(save) if save is not None else None)
    page.goto(URL + query)
    page.wait_for_function("() => !!window.XMAS")
    page.evaluate("() => XMAS.setAuto(false)")


def js(page, src, arg=None):
    return page.evaluate(src, arg)


def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None)
        page = b.new_page(viewport={'width': 400, 'height': 800})
        errors = []
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append(
            'console.' + m.type + ': ' + m.text + ' @ ' + ((m.location or {}).get('url') or ''))
            if m.type == 'error' else None)
        page.goto(URL)
        page.wait_for_function("() => !!window.XMAS")

        # ================================================================ A01
        print('\nA01 起動前／受付前／ジャスト中の工作')
        fresh(page)
        r = js(page, """() => {
          const out = {};
          const go = (evT) => {
            XMAS.beginPlay(0);
            const G = XMAS.G, ev = G.events[0], t = ev.target;
            if (evT !== null) XMAS.setEvT(ev, evT);
            const s0 = G.score;
            XMAS.sabotage(t);
            return { outcome: ev.outcome, mood: ev.couple.mood, bonus: G.score - s0 - t.def.score * G.combo,
                     just: G.just, phase: ev.phase };
          };
          out.pre = go(null); out.normal = go(1.0); out.just = go(3.0);
          return out;
        }""")
        check('A01a', '起動前の工作 → 先回り成功（落胆）・ジャストなし',
              r['pre']['outcome'] == 'pre' and r['pre']['mood'] == 'dejected' and r['pre']['bonus'] == 0, r['pre'])
        check('A01b', '受付前の工作 → 通常成功（落胆）・ジャストなし',
              r['normal']['outcome'] == 'normal' and r['normal']['mood'] == 'dejected' and r['normal']['bonus'] == 0, r['normal'])
        check('A01c', 'ジャスト中の工作 → 悲嘆・+500を1回',
              r['just']['outcome'] == 'just' and r['just']['mood'] == 'heartbroken' and r['just']['bonus'] == 500
              and r['just']['just'] == 1, r['just'])
        check('A01d', '結末は確定したまま（resolved）', all(r[k]['phase'] == 'resolved' for k in r))

        # ================================================================ A02
        print('\nA02 境界（完了時刻で判定・FPSに依存しない）')
        r = js(page, """() => {
          const at = (x) => {
            XMAS.beginPlay(0);
            const G = XMAS.G, ev = G.events[0];
            XMAS.setEvT(ev, x);
            XMAS.sabotage(ev.target);
            return ev.outcome;
          };
          return { o199: at(1.99), o200: at(2.0), o400: at(4.0), o401: at(4.01) };
        }""")
        check('A02a', 't=2.0 ちょうどはジャスト（直前1.99は通常）', r['o200'] == 'just' and r['o199'] == 'normal', r)
        check('A02b', 't=4.0 ちょうどはジャスト（直後4.01は期限切れ）', r['o400'] == 'just' and r['o401'] == 'missed', r)
        r = js(page, """() => {
          /* 同じ操作を 20fps と 144fps で行い、完了時刻（押下 + 吸着0.22 + 工作0.60）で結果が一致するか */
          const trial = (dt, pressAt) => {
            XMAS.beginPlay(0);
            const G = XMAS.G, ev = G.events[0], t = ev.target;
            G.player.x = t.x + 60; G.player.y = t.y + 40; G.player.face = Math.atan2(-40, -60);
            ev.phase = 'windup'; ev.startAt = G.time; ev.t = 0;
            while (G.time - ev.startAt < pressAt - 1e-9) XMAS.step(Math.min(dt, pressAt - (G.time - ev.startAt)));
            XMAS.step(1e-4);
            XMAS.startAction();
            if (!G.action) return 'no-action';
            for (let i = 0; i < 400 && !t.done && G.state === 'playing'; i++) XMAS.step(dt);
            return ev.outcome;
          };
          return {
            in20: trial(1/20, 3.10), in144: trial(1/144, 3.10),     // 完了 ≈ 3.92 → ジャスト
            late20: trial(1/20, 3.25), late144: trial(1/144, 3.25), // 完了 ≈ 4.07 → 期限切れ
          };
        }""")
        check('A02c', '期限内の完了は 20fps / 144fps どちらもジャスト', r['in20'] == 'just' and r['in144'] == 'just', r)
        check('A02d', '期限を過ぎた完了は 20fps / 144fps どちらも期限切れ',
              r['late20'] == 'missed' and r['late144'] == 'missed', r)

        # ================================================================ A03
        print('\nA03 期限切れの後に同じ灯を消す')
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          XMAS.setEvT(ev, 3.9);
          XMAS.run(0.3, 1/60);
          const missed = { outcome: ev.outcome, mood: ev.couple.mood };
          const s0 = G.score, m0 = G.mood;
          XMAS.sabotage(t);
          const lines = G.lines.map(l => l.text);
          return { missed, after: { outcome: ev.outcome, mood: ev.couple.mood },
                   gained: G.score - s0, base: t.def.score * G.combo, moodDrop: m0 - G.mood, tMood: t.mood,
                   just: G.just, lines };
        }""")
        check('A03a', '期限を過ぎると親密化で確定', r['missed']['outcome'] == 'missed' and r['missed']['mood'] == 'lovey', r['missed'])
        check('A03b', '期限後の消灯でも親密なまま（巻き戻さない）', r['after']['outcome'] == 'missed' and r['after']['mood'] == 'lovey')
        check('A03c', '期限後の消灯は通常点・通常のムード減少だけ（+500なし）',
              r['gained'] == r['base'] and abs(r['moodDrop'] - r['tMood']) < 1e-6 and r['just'] == 0, r)
        check('A03d', '主人公の一言は「……手遅れか」', '「……手遅れか」' in r['lines'], r['lines'])
        r = js(page, """() => {
          XMAS.beginPlay(0);                      // STAGE1 はデートのカップルとオーラのカップルが同じ
          const G = XMAS.G, ev = G.events[0], a = G.auras[0];
          XMAS.setEvT(ev, 3.9); XMAS.run(0.3, 1/60);
          XMAS.sabotage(a.source);
          return { aura: a.on, mood: ev.couple.mood };
        }""")
        check('A03e', '親密化したカップルでも電源を落とせばオーラは消える（親密ポーズは維持）',
              r['aura'] is False and r['mood'] == 'lovey', r)

        # ================================================================ A04
        print('\nA04 中断・再接近・リトライ')
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          G.player.x = t.x + 60; G.player.y = t.y + 40;
          XMAS.setEvT(ev, 1.0);
          XMAS.step(1/60); XMAS.startAction();
          XMAS.run(0.3, 1/60);
          const tBefore = ev.t;
          XMAS.input.keys.l = 1; XMAS.step(1/60); XMAS.input.keys.l = 0;   // 新しい移動入力で中断
          const cancelled = !G.action;
          XMAS.run(0.2, 1/60);
          const s0 = G.score;
          XMAS.sabotage(t); XMAS.sabotage(t);
          return { cancelled, advanced: ev.t > tBefore, doneOnce: G.doneCount, justCount: G.just, score: G.score - s0 };
        }""")
        check('A04a', '中断ではイベントの時計を巻き戻さない', r['cancelled'] and r['advanced'], r)
        check('A04b', '同じ対象を2回呼んでも確定は1回', r['doneOnce'] == 1, r)
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0];
          XMAS.setEvT(ev, 3.0); XMAS.sabotage(ev.target);
          const pendingBefore = G.lines.length;
          XMAS.beginPlay(0);                       // リトライ
          const G2 = XMAS.G;
          return { pendingBefore, lines: G2.lines.length, just: G2.just, phase: G2.events[0].phase,
                   mood: G2.couples[0].mood, aura: G2.auras[0].on, card: document.getElementById('reactCard').classList.contains('on') };
        }""")
        check('A04c', 'リトライで前のプレイの一言・反応・結末を持ち越さない',
              r['pendingBefore'] > 0 and r['lines'] == 0 and r['just'] == 0 and r['phase'] == 'idle'
              and r['mood'] is None and r['aura'] is True and r['card'] is False, r)

        # ================================================================ A05
        print('\nA05 オーラの電源対応')
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, a = G.auras[0];
          const other = G.targets.find(t => t !== a.source && !t.evt);
          XMAS.sabotage(other);
          const afterOther = a.on;
          /* 電源へ工作を始めて中断 */
          const s = a.source;
          const an = XMAS.anchorOf(s, s.x - 60, s.y + 60);
          G.player.x = an.x - 10; G.player.y = an.y + 10;
          XMAS.step(1/60); XMAS.startAction(); XMAS.run(0.15, 1/60);
          const started = !!G.action;
          XMAS.input.keys.r = 1; XMAS.step(1/60); XMAS.input.keys.r = 0;
          const afterCancel = a.on;
          /* 完了した同じ更新で通れる */
          G.player.x = a.x; G.player.y = a.y + a.r + 40;
          XMAS.sabotage(s);
          const offNow = a.on;
          XMAS.movePlayer(0, -(a.r + 40) * 2);
          return { afterOther, started, afterCancel, offNow, crossed: G.player.y < a.y - a.r };
        }""")
        check('A05a', '別の照明では消えない', r['afterOther'] is True)
        check('A05b', '電源への工作を中断しても消えない', r['started'] and r['afterCancel'] is True, r)
        check('A05c', '電源の工作完了と同じ更新で衝突が消え、そのまま通り抜けられる',
              r['offNow'] is False and r['crossed'] is True, r)

        # ================================================================ A06
        print('\nA06 見える輪と当たり判定')
        r = js(page, """() => {
          const C = XMAS.CFG.aura;
          XMAS.beginPlay(0);
          const G = XMAS.G, a = G.auras[0];
          /* 描画サイズ = 512×R/176 のとき、画像上の芯（176px）が画面上で R になる */
          const drawnCore = (C.ringImg * a.r / C.ringCore) * (C.ringCore / C.ringImg);
          /* 低FPS相当：1回で 400px 動かしても貫通しない */
          const rr = a.r + C.playerR;
          G.player.x = a.x; G.player.y = a.y + rr + 60;
          XMAS.movePlayer(0, -400);
          const d1 = Math.hypot(G.player.x - a.x, G.player.y - a.y);
          const below = G.player.y > a.y;
          /* 斜めに押し込むと接線方向へ滑る */
          G.player.x = a.x + 10; G.player.y = a.y + rr + 2;
          const x0 = G.player.x;
          for (let i = 0; i < 30; i++) XMAS.movePlayer(0.3, -3);
          const d2 = Math.hypot(G.player.x - a.x, G.player.y - a.y);
          return { drawnCore, r: a.r, d1, below, rr, slid: G.player.x - x0, d2 };
        }""")
        check('A06a', '輪の芯の描画半径 = 衝突半径', abs(r['drawnCore'] - r['r']) < 1e-9, r)
        check('A06b', '1回の大きな移動でも輪を貫通しない', r['d1'] >= r['rr'] - 0.01 and r['below'], r)
        check('A06c', '押し込むと円周に沿って滑る（中へは入らない）', r['slid'] > 5 and r['d2'] >= r['rr'] - 0.01, r)

        # ================================================================ A07
        print('\nA07 吸着と配置（外から電源に届く・行き詰まりがない）')
        r = js(page, """() => {
          const C = XMAS.CFG.aura, out = [];
          for (let i = 0; i < XMAS.STAGES.length; i++) {
            XMAS.beginPlay(i);
            const G = XMAS.G, rr = (a) => a.r + C.playerR;
            const inside = (x, y) => G.auras.some(a => a.on && Math.hypot(x - a.x, y - a.y) < rr(a));
            /* どの対象にも、全オーラが点いた状態で輪の外に工作位置が少なくとも1方向ある */
            let stuck = [];
            G.targets.forEach((t, k) => {
              let ok = false;
              for (let j = 0; j < 36 && !ok; j++) {
                const ang = j / 36 * Math.PI * 2;
                const an = { x: t.x + Math.cos(ang) * 42, y: t.y + Math.sin(ang) * 42 };
                if (!inside(an.x, an.y)) ok = true;
              }
              if (!ok) stuck.push(k);
            });
            /* 電源が別のオーラの内側にない（循環依存なし）・スタート地点が輪の外 */
            const srcInside = G.auras.filter(a => G.auras.some(b => b !== a && Math.hypot(a.source.x - b.x, a.source.y - b.y) < rr(b))).length;
            out.push({ stage: G.stage.special ? 'SP' : i + 1, auras: G.auras.length, stuck, srcInside, startOut: !inside(G.player.x, G.player.y),
                       minSrcGap: Math.min(...G.auras.map(a => Math.hypot(a.source.x - a.x, a.source.y - a.y) - rr(a) - 42)) });
          }
          return out;
        }""")
        check('A07a', '全ステージ：すべての対象に輪の外の工作位置がある', all(len(x['stuck']) == 0 for x in r),
              [(x['stage'], x['stuck']) for x in r])
        check('A07b', '全ステージ：電源は他のオーラの内側にない（循環依存なし）', all(x['srcInside'] == 0 for x in r))
        check('A07c', '全ステージ：開始地点が輪の外', all(x['startOut'] for x in r))
        check('A07d', '全ステージ：電源の工作位置は、どの方向から来ても自分の輪の外', all(x['minSrcGap'] > 0 for x in r),
              [round(x['minSrcGap'], 1) for x in r])
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, a = G.auras[0], t = G.targets[0];
          /* 主人公と対象の間にオーラを置く：ロックしない・案内を出す */
          G.player.x = t.x; G.player.y = t.y - 120; G.player.face = Math.PI / 2;
          a.x = t.x; a.y = t.y - 60 + 2;
          const blocked = XMAS.pickTarget();
          const hint = XMAS.G.blocked === t;
          a.on = false;
          const freed = XMAS.pickTarget();
          return { blocked: blocked ? blocked.i : null, hint, freed: freed ? freed.i : null };
        }""")
        check('A07e', 'オーラ越しの対象はロックしない（吸着で貫通しない）→ 消えればロックできる',
              r['blocked'] is None and r['hint'] and r['freed'] == 0, r)

        # ================================================================ A08
        print('\nA08 最後の工作でクリア')
        fresh(page)
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          XMAS.leaveOnly(t); G.left = 0.05;
          XMAS.setEvT(ev, 3.0);
          XMAS.sabotage(t);
          XMAS.step(1/60);
          const st1 = G.state, res = G.result;
          XMAS.run(2.2, 1/60);
          return { st1, st2: G.state, just: G.just, mood: ev.couple.mood, total: res.total,
                   best: XMAS.bests()[1].score, left: G.left };
        }""")
        check('A08a', '最後のジャストも加点・反応が入る', r['just'] == 1 and r['mood'] == 'heartbroken', r)
        check('A08b', '結果の保存は1回（最終点と一致）', r['best'] == r['total'], r)
        check('A08c', '演出中に時間切れへ反転しない', r['st1'] == 'finishing' and r['st2'] == 'result', r)

        # ================================================================ A09
        print('\nA09 発見／時間切れの敗北')
        r = js(page, """() => {
          const out = {};
          for (const kind of ['time', 'seen']) {
            XMAS.beginPlay(1);
            const G = XMAS.G;
            if (kind === 'time') G.left = 0.005;
            else { G.detect = 99.99; G.guards.forEach(g => { g.range = 9999; g.fov = 3.2; g.x = G.player.x; g.y = G.player.y - 20; }); }
            XMAS.step(1/60);
            const s1 = G.state;
            const early = XMAS.skipFinish();
            XMAS.run(0.3, 1/60);
            const late = XMAS.skipFinish();
            out[kind] = { s1, early, late, s2: G.state, reason: document.getElementById('failReason').textContent,
                          sub: document.getElementById('failSub').textContent,
                          art: document.getElementById('failArt').getAttribute('src') };
          }
          XMAS.beginPlay(1);
          out.retry = XMAS.G.state;
          return out;
        }""")
        check('A09a', '敗北でゲーム時計が止まり、悔し顔の演出へ', r['time']['s1'] == 'failing' and r['seen']['s1'] == 'failing', r)
        check('A09b', '0.25秒前はスキップしない／以降は失敗画面へ', not r['time']['early'] and r['time']['late'] and r['time']['s2'] == 'fail')
        check('A09c', '失敗画面は親密な結果絵と理由', 'result_mission_failure' in (r['time']['art'] or '')
              and r['time']['reason'] == '時間切れ' and r['time']['sub'] == '聖夜は、まだ終わらない'
              and r['seen']['reason'] == '発見された' and r['seen']['sub'] == '「……設備点検です」', r)
        check('A09d', 'すぐ再挑戦できる', r['retry'] == 'playing')

        # ================================================================ A10
        print('\nA10 全ステージ制覇')
        fresh(page, {'unlocked': 5, 'best4': {'1': {'score': 1, 'time': 9, 'rank': 'C'}, '2': {'score': 1, 'time': 9, 'rank': 'C'},
                                              '3': {'score': 1, 'time': 9, 'rank': 'C'}, '4': {'score': 1, 'time': 9, 'rank': 'C'}}})
        r = js(page, """() => {
          const before = XMAS.save.allClearEndingUnlocked;
          XMAS.beginPlay(4);
          const G = XMAS.G; XMAS.leaveOnly(G.targets[0]);
          XMAS.sabotage(G.targets[0]); XMAS.step(1/60);
          return { before, after: XMAS.save.allClearEndingUnlocked, state: G.state, ending: !!G.ending,
                   firstAll: G.result.firstAll };
        }""")
        check('A10a', '最終ステージ解放だけでは解放されない', r['before'] is False, r)
        check('A10b', '5ステージのクリアがそろった勝利で破局エンドへ',
              r['after'] is True and r['state'] == 'ending' and r['ending'] and r['firstAll'], r)

        # ================================================================ A11
        print('\nA11 エンドのスキップ・再読込・再生')
        r = js(page, """() => {
          const early = XMAS.skipEnding();
          XMAS.run(0.3, 1/60);
          const toRevival = XMAS.skipEnding() && XMAS.G.ending && XMAS.G.ending.t >= XMAS.CFG.ending.revival;
          XMAS.run(0.3, 1/60);
          const late = toRevival && XMAS.skipEnding();
          return { early, late, state: XMAS.G.state, head: document.getElementById('resultHead').textContent,
                   sub: document.getElementById('resultSub').textContent,
                   art: document.getElementById('resultArt').getAttribute('src'), seen: XMAS.save.allClearEndingSeen };
        }""")
        check('A11a', '0.25秒後の入力で復縁の場面へ、もう一度で全任務達成の結果へ',
              not r['early'] and r['late'] and r['state'] == 'result' and r['head'] == '全任務達成'
              and r['sub'] == '聖夜、完全終了。' and 'ending_all_clear' in (r['art'] or ''), r)
        page.reload(); page.wait_for_function("() => !!window.XMAS"); page.evaluate("() => XMAS.setAuto(false)")
        r = js(page, """() => {
          const u = XMAS.save.allClearEndingUnlocked, s = XMAS.save.allClearEndingSeen;
          const slot = !!document.querySelector('.slot.ending');
          const b0 = JSON.stringify(XMAS.save.best4);
          XMAS.startEnding(true, 'ovSelect'); XMAS.run(10.5, 1/60); XMAS.skipEnding();
          const b1 = JSON.stringify(XMAS.save.best4);
          const back = document.getElementById('ovSelect').classList.contains('on');
          /* 2回目の全制覇（既に解放済み）は通常の成功演出 */
          XMAS.beginPlay(4);
          const G = XMAS.G; XMAS.leaveOnly(G.targets[0]);
          XMAS.sabotage(G.targets[0]); XMAS.step(1/60);
          return { u, s, slot, same: b0 === b1, back, second: G.state };
        }""")
        check('A11b', '再読込後も解放が残り、メニューから再生できる', r['u'] and r['s'] and r['slot'] and r['back'], r)
        check('A11c', '再生で記録・得点は増えない', r['same'])
        check('A11d', '2回目以降の全制覇では強制再生しない', r['second'] == 'finishing', r)

        # ================================================================ A12
        print('\nA12 旧セーブの移行')
        old = {'unlocked': 5, 'lefty': False, 'bgm': False, 'se': True, 'lite': True,
               'best': {'1': {'score': 9999, 'time': 50, 'rank': 'S'}},
               'best2': {str(i): {'score': 100 * i, 'time': 60, 'rank': 'B', 'v': 2} for i in range(1, 6)}}
        fresh(page, old)
        r = js(page, """() => ({ c: XMAS.save.controls, unlocked: XMAS.save.unlocked, bgm: XMAS.save.bgm, lite: XMAS.save.lite,
                                best1: XMAS.save.best[1].score, best2: Object.keys(XMAS.save.best2).length,
                                best3: Object.keys(XMAS.save.best4).length,
                                end: XMAS.save.allClearEndingUnlocked, seen: XMAS.save.allClearEndingSeen,
                                state: XMAS.G.state, ending: !!XMAS.G.ending })""")
        check('A12a', '解放・設定・旧記録（版1/版2）を保持し、今回の版4は空', r['unlocked'] == 5 and r['bgm'] is False and r['lite'] is True
              and r['best1'] == 9999 and r['best2'] == 5 and r['best3'] == 0, r)
        check('A12b', '旧「左利きOFF」＝左側スティック → 左下へ移行', r['c']['preset'] == 'bl' and r['c']['mode'] == 'stick', r['c'])
        check('A12c', '旧版の全クリア証跡で破局エンドを解放（起動時に強制再生しない）',
              r['end'] is True and r['seen'] is False and r['state'] == 'title' and not r['ending'], r)
        fresh(page, {'unlocked': 3, 'lefty': True})
        r = js(page, "() => ({ c: XMAS.save.controls, end: XMAS.save.allClearEndingUnlocked })")
        check('A12d', '旧「左利きON」＝右側スティック → 右下へ移行／証跡なしは解放しない',
              r['c']['preset'] == 'br' and r['end'] is False, r)
        fresh(page, {'unlocked': 5, 'lefty': True, 'controls': {'v': 1, 'mode': 'drag', 'preset': 'bc', 'stick': None, 'btn': None}})
        r = js(page, "() => XMAS.save.controls")
        check('A12e', '移行済み・変更済みの配置は上書きしない', r['mode'] == 'drag' and r['preset'] == 'bc', r)
        fresh(page)
        r = js(page, "() => XMAS.save.controls")
        check('A12f', '新規プレイヤーは右下から始まる', r['preset'] == 'br' and r['mode'] == 'stick', r)

        # ================================================================ A13
        print('\nA13 右下／中央下／左下と自由配置')
        bad = []
        for vw, vh in [(360, 640), (400, 800), (320, 568), (430, 932), (800, 600)]:
            page.set_viewport_size({'width': vw, 'height': vh})
            r = js(page, """() => {
              const C = XMAS.CFG.controls, out = [];
              for (const pr of ['br', 'bc', 'bl']) {
                XMAS.setPreset(pr);
                const p = XMAS.ctl.pos, s = XMAS.ctl.safe;
                const d = Math.hypot(p.btn.x - p.stick.x, p.btn.y - p.stick.y);
                const inside = (pt, r) => pt.x - r >= s.x0 && pt.x + r <= s.x1 && pt.y - r >= s.y0 && pt.y + r <= s.y1;
                out.push({ pr, gap: d - (C.acquireR + C.btnR), inS: inside(p.stick, C.acquireR), inB: inside(p.btn, C.btnR) });
              }
              return out;
            }""")
            for x in r:
                if x['gap'] < 8 - 1e-6 or not x['inS'] or not x['inB']:
                    bad.append((vw, vh, x))
        check('A13a', '5種類の画面サイズ×3プリセットで、画面内・HUD外・8px以上の隙間', not bad, bad)
        page.set_viewport_size({'width': 400, 'height': 800})
        r = js(page, """() => {
          XMAS.setPreset('br');
          XMAS.openLayoutEditor();
          const e = XMAS.editor, C = XMAS.CFG.controls;
          /* 工作ボタンをスティックの真上に重ねようとしても押しのけられる */
          e.pos.btn.x = e.pos.stick.x; e.pos.btn.y = e.pos.stick.y;
          XMAS.fitLayout(e.pos, XMAS.ctl.safe, 'btn');
          const sep = Math.hypot(e.pos.btn.x - e.pos.stick.x, e.pos.btn.y - e.pos.stick.y) >= C.acquireR + C.btnR + C.gap - 1e-6;
          /* キャンセルでは保存しない */
          document.getElementById('btnLayoutCancel').click();
          const afterCancel = XMAS.save.controls.preset;
          /* 保存すると自由配置として正規化座標で残る */
          XMAS.openLayoutEditor();
          e.pos.stick.x -= 40; e.pos.stick.y -= 60;
          XMAS.fitLayout(e.pos, XMAS.ctl.safe, 'stick');
          document.getElementById('btnLayoutSave').click();
          const saved = JSON.parse(localStorage.getItem('xmas-funsai-v1')).controls;
          /* 初期位置に戻す */
          XMAS.openLayoutEditor();
          document.getElementById('btnLayoutReset').click();
          const reset = XMAS.presetPos('br', XMAS.ctl.safe);
          const resetOk = Math.abs(e.pos.stick.x - reset.stick.x) < 1 && Math.abs(e.pos.btn.x - reset.btn.x) < 1;
          document.getElementById('btnLayoutCancel').click();
          return { sep, afterCancel, saved, resetOk, bgm: XMAS.save.bgm };
        }""")
        check('A13b', '編集中に重ねようとしても隙間を保つ', r['sep'])
        check('A13c', 'キャンセルでは保存しない／保存で自由配置（0〜1の座標）', r['afterCancel'] == 'br'
              and r['saved']['preset'] == 'custom' and all(0 <= v <= 1 for v in r['saved']['stick'] + r['saved']['btn']), r)
        check('A13d', '「初期位置に戻す」は右下の配置', r['resetOk'])
        page.set_viewport_size({'width': 340, 'height': 600})
        r = js(page, """() => {
          const C = XMAS.CFG.controls, p = XMAS.ctl.pos, s = XMAS.ctl.safe;
          return { gap: Math.hypot(p.btn.x - p.stick.x, p.btn.y - p.stick.y) - (C.acquireR + C.btnR),
                   inside: p.stick.x + C.acquireR <= s.x1 && p.btn.y + C.btnR <= s.y1 };
        }""")
        check('A13e', '画面サイズが変わっても自由配置を再クランプして重ならない', r['gap'] >= 8 - 1e-6 and r['inside'], r)
        page.set_viewport_size({'width': 400, 'height': 800})

        # ================================================================ A14
        print('\nA14 指2本・領域外のup・cancel')
        fresh(page)
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, fr = document.getElementById('frame').getBoundingClientRect();
          const P = XMAS.ctl.pos;
          const fire = (type, id, x, y, el) => (el || document.elementFromPoint(fr.left + x, fr.top + y) || document.getElementById('frame'))
            .dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: fr.left + x, clientY: fr.top + y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
          const frame = document.getElementById('frame');
          /* 画面の空き地（右半分）をタップしても何も起きない（暗黙の工作領域は廃止） */
          const t0 = G.targets[0];
          G.player.x = t0.x + 50; G.player.y = t0.y + 20; XMAS.step(1/60);
          fire('pointerdown', 7, fr.width * 0.75, fr.height * 0.45); fire('pointerup', 7, fr.width * 0.75, fr.height * 0.45);
          const noImplicit = !G.action;
          /* 指1でスティック、指2で工作ボタン */
          fire('pointerdown', 1, P.stick.x, P.stick.y);
          fire('pointermove', 1, P.stick.x - 30, P.stick.y, frame);
          const stickOwner = XMAS.ctl.stick.id;
          fire('pointerdown', 2, P.btn.x, P.btn.y);
          const working = !!G.action, workOwner = XMAS.ctl.work.id;
          /* スティックの指が工作ボタンの上を通っても工作は発火しない・担当も変わらない */
          XMAS.releaseAll(); G.action = null;
          fire('pointerdown', 3, P.stick.x, P.stick.y);
          fire('pointermove', 3, P.btn.x, P.btn.y, frame);
          const crossed = !G.action && XMAS.ctl.stick.id === 3 && XMAS.ctl.work.id === null;
          /* 領域外でのup・cancel・capture喪失で解除される */
          fire('pointerup', 3, fr.width + 50, fr.height + 50, frame);
          const up = XMAS.ctl.stick.id === null && XMAS.ctl.stick.vx === 0;
          fire('pointerdown', 4, P.stick.x, P.stick.y);
          fire('pointermove', 4, P.stick.x + 30, P.stick.y, frame);
          fire('pointercancel', 4, 0, 0, frame);
          const cancel = XMAS.ctl.stick.id === null;
          fire('pointerdown', 5, P.stick.x, P.stick.y);
          frame.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 5, bubbles: true }));
          const lost = XMAS.ctl.stick.id === null;
          /* 一時停止ボタンはスティックを取らない */
          const pb = document.getElementById('btnPause').getBoundingClientRect();
          fire('pointerdown', 6, pb.left - fr.left + 5, pb.top - fr.top + 5);
          const ui = XMAS.ctl.stick.id === null && XMAS.ctl.drag.id === null;
          return { noImplicit, stickOwner, working, workOwner, crossed, up, cancel, lost, ui };
        }""")
        check('A14a', '画面の空き地のタップでは工作しない', r['noImplicit'])
        check('A14b', '指1＝移動・指2＝工作、担当が入れ替わらない', r['stickOwner'] == 1 and r['working'] and r['workOwner'] == 2, r)
        check('A14c', '移動の指が工作ボタン上を通っても工作しない', r['crossed'])
        check('A14d', '領域外のup／cancel／capture喪失で押しっぱなしが残らない', r['up'] and r['cancel'] and r['lost'], r)
        check('A14e', 'UI（一時停止）への押下は移動に取られない', r['ui'])

        # ================================================================ A15
        print('\nA15 工作開始と保持入力')
        r = js(page, """() => {
          const out = {};
          const setup = () => {
            XMAS.beginPlay(0);
            const G = XMAS.G, t = G.targets[0];
            G.player.x = t.x + 60; G.player.y = t.y + 10; G.player.face = Math.PI;
            XMAS.step(1/60);
            return G;
          };
          /* スティックを倒したまま工作を開始 → そのままでは中断しない／6px以上動かすと中断 */
          let G = setup(), c = XMAS.ctl;
          c.stick.id = 1; c.stick.ox = -30; c.stick.oy = 0; c.stick.vx = -0.8; c.stick.vy = 0;
          XMAS.startAction(); XMAS.run(0.2, 1/60);
          out.stickHeld = !!G.action;
          c.stick.ox = -30; c.stick.oy = 8; XMAS.step(1/60);
          out.stickMoved = !G.action;
          XMAS.releaseAll();
          /* キー：押したまま開始 → 継続／新しいキーで中断 */
          G = setup();
          XMAS.input.keys.l = 1; XMAS.startAction(); XMAS.run(0.2, 1/60);
          out.keyHeld = !!G.action;
          XMAS.input.keys.u = 1; XMAS.step(1/60);
          out.keyNew = !G.action;
          XMAS.releaseAll();
          /* ドラッグ：つかんだまま開始 → 継続／6px以上動かすと中断 */
          XMAS.setControlMode('drag');
          G = setup(); c = XMAS.ctl;
          const f = XMAS.worldToCss(G.player.x, G.player.y);
          c.drag.id = 9; c.drag.fx = c.drag.sx = f.x; c.drag.fy = c.drag.sy = f.y; c.drag.offX = 0; c.drag.offY = 0;
          XMAS.startAction(); XMAS.run(0.2, 1/60);
          out.dragHeld = !!G.action;
          c.drag.fx += 7; XMAS.step(1/60);
          out.dragMoved = !G.action;
          XMAS.releaseAll(); XMAS.setControlMode('stick');
          return out;
        }""")
        check('A15a', 'スティック：置いたままの指では中断しない／新しい移動で中断', r['stickHeld'] and r['stickMoved'], r)
        check('A15b', 'キーボード：押したままでは中断しない／新しいキーで中断', r['keyHeld'] and r['keyNew'], r)
        check('A15c', '直接ドラッグ：つかんだままでは中断しない／6px以上で中断', r['dragHeld'] and r['dragMoved'], r)

        # ================================================================ A16
        print('\nA16 直接ドラッグ')
        r = js(page, """() => {
          XMAS.setControlMode('drag');
          XMAS.beginPlay(1);
          const G = XMAS.G, c = XMAS.ctl, fr = document.getElementById('frame').getBoundingClientRect();
          XMAS.run(0.2, 1/60);
          const fire = (type, id, x, y) => document.getElementById('frame').dispatchEvent(new PointerEvent(type,
              { pointerId: id, clientX: fr.left + x, clientY: fr.top + y, bubbles: true, pointerType: 'touch' }));
          /* 主人公以外の場所では取得しない */
          fire('pointerdown', 11, 30, fr.height * 0.4);
          const offActor = c.drag.id === null;
          /* 胸のあたりをつかむ：瞬間移動しない */
          const chest = XMAS.worldToCss(G.player.x + 6, G.player.y - 30);
          const x0 = G.player.x, y0 = G.player.y;
          fire('pointerdown', 12, chest.x, chest.y);
          const grabbed = c.drag.id === 12;
          XMAS.run(0.4, 1/60);
          const still = Math.hypot(G.player.x - x0, G.player.y - y0);
          /* 指を上へ 120px：通常速度（168px/秒）を超えない */
          fire('pointermove', 12, chest.x, chest.y - 120);
          const y1 = G.player.y;
          XMAS.run(0.25, 1/60);
          const speed = (y1 - G.player.y) / 0.25;
          XMAS.run(1.5, 1/60);
          const arrivedErr = Math.abs(XMAS.worldToCss(G.player.x, G.player.y).y - (chest.y - 120 - (chest.y - XMAS.worldToCss(x0, y0).y)));
          /* 離すと止まる */
          fire('pointerup', 12, chest.x, chest.y - 120);
          const yRel = G.player.y; XMAS.run(0.5, 1/60);
          const stopped = Math.abs(G.player.y - yRel) < 0.5;
          return { offActor, grabbed, still, speed, arrivedErr, stopped };
        }""")
        check('A16a', '主人公に触れたときだけ取得する', r['offActor'] and r['grabbed'], r)
        check('A16b', 'つかんだ瞬間に主人公が飛ばない', r['still'] < 1.0, r)
        check('A16c', '移動は通常速度の上限（168px/秒）を守る', 0 < r['speed'] <= 168.5, r)
        check('A16d', '指の位置（つかんだずれを保ったまま）へ到着し、離すと止まる', r['arrivedErr'] < 4 and r['stopped'], r)
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, a = G.auras[0], c = XMAS.ctl, C = XMAS.CFG.aura;
          G.player.x = a.x; G.player.y = a.y + a.r + 60;
          G.cam.y = Math.max(0, G.player.y - 540); XMAS.step(1/60);
          const f = XMAS.worldToCss(G.player.x, G.player.y);
          const target = XMAS.worldToCss(a.x, a.y - a.r - 60);
          c.drag.id = 13; c.drag.fx = c.drag.sx = f.x; c.drag.fy = c.drag.sy = f.y; c.drag.offX = 0; c.drag.offY = 0;
          c.drag.fx = target.x; c.drag.fy = target.y;
          let minD = 1e9;
          for (let i = 0; i < 180; i++) { XMAS.step(1/60); minD = Math.min(minD, Math.hypot(G.player.x - a.x, G.player.y - a.y)); }
          c.drag.id = null; XMAS.setControlMode('stick');
          return { minD, rr: a.r + C.playerR };
        }""")
        check('A16e', 'ドラッグでもオーラの衝突は同じ（輪の中へ入らない）', r['minD'] >= r['rr'] - 0.01, r)

        # ================================================================ A17
        print('\nA17 幅360px・異なる縦横比')
        for vw, vh in [(360, 640), (360, 780)]:
            page.set_viewport_size({'width': vw, 'height': vh})
            fresh(page)
            r = js(page, """() => {
              XMAS.beginPlay(0);
              const px = (id) => parseFloat(getComputedStyle(document.getElementById(id)).fontSize);
              const box = (id) => document.getElementById(id).getBoundingClientRect();
              const pb = box('btnPause'), sb = box('btnSab'), st = box('stick');
              return { hint: px('hint'), mood: px('moodPct'), pause: [pb.width, pb.height], btn: [sb.width, sb.height],
                       stick: [st.width, st.height], hscroll: document.body.scrollWidth <= window.innerWidth + 1 };
            }""")
            check('A17a-%dx%d' % (vw, vh), '重要な文字14px以上・操作領域44px以上・横スクロールなし',
                  r['hint'] >= 14 and r['mood'] >= 14 and min(r['pause']) >= 44 and min(r['btn']) >= 44
                  and min(r['stick']) >= 44 and r['hscroll'], r)
            r = js(page, """() => {
              XMAS.beginPlay(0);
              const G = XMAS.G; XMAS.leaveOnly(G.targets[0]);
              XMAS.sabotage(G.targets[0]); XMAS.step(1/60); XMAS.run(2.0, 1/60);
              const ov = document.getElementById('ovResult');
              const btn = document.getElementById('btnRetry2');
              btn.scrollIntoView();
              const r2 = btn.getBoundingClientRect(), f = document.getElementById('frame').getBoundingClientRect();
              const img = document.getElementById('resultArt');
              return { reachable: r2.bottom <= f.bottom + 1 && r2.top >= f.top - 1,
                       contain: getComputedStyle(img).objectFit, scrolls: ov.scrollHeight > ov.clientHeight };
            }""")
            check('A17b-%dx%d' % (vw, vh), '結果画面：絵は contain（切り抜かない）・ボタンに届く', r['contain'] == 'contain' and r['reachable'], r)
        page.set_viewport_size({'width': 400, 'height': 800})

        # ================================================================ A18
        print('\nA18 無音・低負荷・保存不可')
        fresh(page, {'se': False, 'bgm': False, 'lite': True})
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          G.player.x = t.x + 80; G.player.y = t.y + 60; G.cam.y = t.y - 480;
          XMAS.run(0.6, 1/60);
          const cue = ev.cue;
          XMAS.setEvT(ev, 3.0); XMAS.sabotage(t);
          const line = ev.couple.line;
          return { cue, line, mood: ev.couple.mood, aura: G.auras[0].on };
        }""")
        check('A18a', '無音・低負荷でも予告と結末が文字と表情で残る', bool(r['cue']) and bool(r['line']) and r['mood'] == 'heartbroken', r)
        r = js(page, """() => {
          const orig = Storage.prototype.setItem;
          Storage.prototype.setItem = function () { throw new Error('QuotaExceeded'); };
          try {
            XMAS.beginPlay(0);
            const G = XMAS.G; XMAS.leaveOnly(G.targets[0]);
            XMAS.sabotage(G.targets[0]); XMAS.step(1/60); XMAS.run(2.0, 1/60);
            return { state: G.state, total: G.result && G.result.total };
          } finally { Storage.prototype.setItem = orig; }
        }""")
        check('A18b', '保存できない環境でもプレイと結果が成立する', r['state'] == 'result' and r['total'] > 0, r)
        page.evaluate("() => localStorage.setItem('xmas-funsai-v1', '{壊れたJSON')")
        page.reload(); page.wait_for_function("() => !!window.XMAS")
        r = js(page, "() => ({ state: XMAS.G.state, unlocked: XMAS.save.unlocked, c: XMAS.save.controls.preset })")
        check('A18c', 'JSONが壊れていても起動できる', r['state'] == 'title' and r['unlocked'] == 1 and r['c'] == 'br', r)
        fresh(page, {'unlocked': 4, 'best': 'broken', 'controls': {'v': 1, 'mode': 'x', 'preset': 'custom', 'stick': [5, 5]}})
        r = js(page, "() => ({ u: XMAS.save.unlocked, best: typeof XMAS.save.best, c: XMAS.save.controls })")
        check('A18d', '壊れた項目だけ既定値へ（解放は残す）',
              r['u'] == 4 and r['best'] == 'object' and r['c']['mode'] == 'stick' and r['c']['preset'] == 'br', r)

        # ================================================================ v2 からの回帰確認
        print('\nR  v2 からの回帰確認')
        fresh(page)
        r = js(page, """() => XMAS.STAGES.map(s => ({ id: s.special ? 'SP' : s.id, n: s.targets.length, time: s.time,
                   led: s.targets.filter(t => t.type === 'led').length,
                   reindeer: s.targets.filter(t => t.type === 'reindeer').length }))""")
        check('R01', '大型LED（テレビ）は置かない', all(x['led'] == 0 for x in r), r)
        check('R02', '各ステージに時間延長のトナカイ（通常1〜2体・特別4体）',
              all((1 <= x['reindeer'] <= 2) if x['id'] != 'SP' else x['reindeer'] == 4 for x in r), r)
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          G.player.x = t.x + 30; G.player.y = t.y + 30; G.player.face = Math.atan2(-30, -30);
          G.combo = 2; G.comboT = 1.0;
          XMAS.setEvT(ev, 0.1);
          XMAS.step(1/60);
          const c0 = G.comboT;
          XMAS.run(1.0, 1/60);
          const held = G.comboT;
          XMAS.run(1.0, 1/60);
          return { c0, held, used: t.graceUsed, evT: ev.t };
        }""")
        check('R03', 'コンボ待機猶予（最大1.2秒・デート期限は延ばさない）',
              abs(r['held'] - r['c0']) < 0.05 and abs(r['used'] - 1.2) < 0.03 and r['evT'] > 2.0, r)
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0];
          XMAS.setEvT(ev, 0.5);
          const snap = { left: G.left, time: G.time };
          G.state = 'pause';
          XMAS.run(1.0, 1/60);
          return { moved: G.left !== snap.left || G.time !== snap.time };
        }""")
        check('R04', '一時停止で制限時間・デート期限・発見がすべて止まる', r['moved'] is False)
        r = js(page, """() => {
          XMAS.beginPlay(1);
          const G = XMAS.G;
          const g = G.guards.find(x => x.mode === 'patrol');
          const t = G.targets.reduce((a, b) => Math.hypot(b.x - g.x, b.y - g.y) < Math.hypot(a.x - g.x, a.y - g.y) ? b : a);
          XMAS.notifyGuards(t);
          const reacted = g.inv;
          let check = false, wall = false;
          for (let i = 0; i < 60 * 12; i++) {
            XMAS.step(1/60);
            if (g.inv === 'check') check = true;
            for (const o of G.obstacles) if (g.x > o.x && g.x < o.x + o.w && g.y > o.y && g.y < o.y + o.h) wall = true;
            if (check && g.inv === 'patrol') break;
            if (G.state !== 'playing') break;
          }
          XMAS.beginPlay(0);
          XMAS.notifyGuards(XMAS.G.targets[0]);
          return { reacted, check, wall, back: g.inv, s1: XMAS.G.guards.every(x => x.inv === 'patrol') };
        }""")
        check('R05', '警備員の調査（反応→確認→復帰、什器を通らない、ステージ1は対象外）',
              r['reacted'] == 'react' and r['check'] and not r['wall'] and r['back'] == 'patrol' and r['s1'], r)
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, t = G.targets[0];
          XMAS.leaveOnly(t);
          XMAS.sabotage(t);
          G.detect = 99.99;
          G.guards.forEach(g => { g.range = 9999; g.fov = 3.2; g.x = G.player.x; g.y = G.player.y - 20; });
          XMAS.step(1/60);
          return { state: G.state, result: !!G.result, best: Object.keys(XMAS.bests()).length };
        }""")
        check('R06', '同一フレームの勝敗は敗北が優先・二重保存なし', r['state'] == 'failing' and not r['result'] and r['best'] == 0, r)
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G; G.score = 0; XMAS.leaveOnly(G.targets[0]); G.left = 40;
          XMAS.sabotage(G.targets[0]); XMAS.step(1/60);
          const res = G.result; XMAS.run(2.0, 1/60);
          return { total: res.total, expect: Math.round(res.leftAtWin * 50) + 300, still: G.left === res.leftAtWin };
        }""")
        check('R07', 'タイムボーナスは演出前の残り時間・演出中に減らない', r['total'] == r['expect'] and r['still'], r)
        r = js(page, """() => XMAS.STAGES.map(s => ({ id: s.id, ev: (s.events || []).length, auras: (s.auras || []).length }))""")
        check('R08', '全ステージ（特別含む）に固有のデート1つ・オーラ1〜2か所', all(x['ev'] >= 1 and 1 <= x['auras'] <= 2 for x in r), r)

        # ================================================================ v4
        print('\nV  v4：全イルミ・時間延長・フィーバー・通行カップル・向き・特別ステージ')
        fresh(page)
        r = js(page, """() => {
          const out = [];
          for (let i = 0; i < XMAS.STAGES.length; i++) {
            XMAS.beginPlay(i);
            const G = XMAS.G, n = G.targets.length;
            let beforeLast = null;
            G.targets.forEach((t, k) => {
              if (k === n - 1) { XMAS.step(1/60); beforeLast = { state: G.state, mood: G.mood }; }
              XMAS.sabotage(t);
            });
            XMAS.step(1/60);
            out.push({ id: G.stage.id, beforeLast, after: G.state, mood: G.mood });
          }
          return out;
        }""")
        check('V01', '全ステージ：最後の1個を残すと続行、すべて工作でクリア（ムード0%）',
              all(x['beforeLast']['state'] == 'playing' and x['beforeLast']['mood'] > 0
                  and x['after'] in ('finishing', 'ending') and x['mood'] == 0 for x in r), r)
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, t = G.targets.find(x => x.type === 'reindeer'), other = G.targets.find(x => x.type === 'tree');
          const l0 = G.left; XMAS.sabotage(other); const l1 = G.left; XMAS.sabotage(t);
          return { plain: l0 - l1, bonus: G.left - l1, count: G.bonusCount };
        }""")
        check('V02', '金色のトナカイの工作で制限時間+10秒（ほかのイルミでは増えない）',
              abs(r['plain']) < 1e-9 and abs(r['bonus'] - 10) < 1e-9 and r['count'] == 1, r)
        r = js(page, """() => {
          XMAS.beginPlay(0); const G = XMAS.G;
          const m = []; for (const c of [1, 3, 9, 10, 25]) { G.combo = c; m.push(XMAS.workMul()); }
          return m;
        }""")
        check('V03', '工作時間：3連鎖 ×0.84、10連鎖以上（フィーバー） ×0.7', r == [1, 0.84, 0.84, 0.7, 0.7], r)
        r = js(page, """() => {
          const out = [];
          for (let i = 0; i < XMAS.STAGES.length; i++) {
            XMAS.beginPlay(i);
            const G = XMAS.G, st = G.stage;
            let near = 0;
            for (const m of G.mobs) {
              const segD = (px, py) => Math.hypot(px < m.x0 ? m.x0 - px : px > m.x1 ? px - m.x1 : 0, py - m.y);
              if (G.targets.some(t => segD(t.x, t.y) < 70)) near++;
              if (G.auras.some(a => segD(a.x, a.y) < a.r + 44)) near++;
            }
            out.push({ id: st.id, want: st.mobs, got: G.mobs.length, near });
          }
          return out;
        }""")
        check('V04a', '通行人は全員カップル・指定数を配置・イルミやオーラに重ならない',
              all(x['want'] == x['got'] and x['near'] == 0 for x in r), r)
        r = js(page, """() => {
          XMAS.beginPlay(1);
          const G = XMAS.G, m = G.mobs[0];
          const t = G.targets.reduce((a, b) => Math.hypot(b.x - m.x, b.y - m.y) < Math.hypot(a.x - m.x, a.y - m.y) ? b : a);
          const d = Math.hypot(t.x - m.x, t.y - m.y);
          XMAS.sabotage(t);
          const far = G.mobs.filter(x => Math.hypot(x.x - t.x, x.y - t.y) > XMAS.CFG.mobReactR).every(x => !x.mood);
          /* 視線を遮る */
          const blocks = (() => { const g = { x: m.x - 120, y: m.y - 20 }, q = { x: m.x + 120, y: m.y - 20 }; G.player.x = q.x; G.player.y = q.y; return true; })();
          return { d, mood: d <= XMAS.CFG.mobReactR ? m.mood : 'skip', far };
        }""")
        check('V04b', '近くのイルミが消えた通行カップルだけが冷める', (r['mood'] in ('dejected', 'skip')) and r['far'], r)
        r = js(page, """() => ({
          gr: XMAS.walkPick('guard', 50, 0), gl: XMAS.walkPick('guard', -50, 0), gu: XMAS.walkPick('guard', 0, -50),
          cr: XMAS.walkPick('couple', 30, 0), cl: XMAS.walkPick('couple', -30, 0),
          pl: XMAS.walkPick('player', -1, 0), pr: XMAS.walkPick('player', 1, 0),
          side: XMAS.img('npc_guard_walk_side'),
        })""")
        if not r['side']:
            ok = (r['gr']['key'] == 'npc_guard_check' and r['gr']['flip'] and not r['gl']['flip']
                  and r['cr']['key'] == 'npc_couple_tunnel' and r['cr']['flip'] and not r['cl']['flip']
                  and r['pl']['flip'] and not r['pr']['flip'])
        else:
            ok = not r['gr']['flip'] and r['gl']['flip']
        check('V05', '歩く向き：左右の進行方向に合わせて絵を反転（後ろ向き歩きをしない）', ok, r)
        r = js(page, """() => XMAS.STAGES.map(s => s.targets.filter(t => ['gift', 'snowman', 'reindeer'].includes(t.type)).length)""")
        check('V06', 'ステージ5はテレビではなくプレゼント・雪だるま・トナカイ', r[4] >= 4, r)
        fresh(page)
        r = js(page, """() => {
          const locked = !XMAS.save.specialUnlocked && !document.querySelector('.slot.special');
          const n = XMAS.NORMAL.length;
          XMAS.save.best4 = { 1: {score:1,time:9,rank:'C'}, 2: {score:1,time:9,rank:'C'}, 3: {score:1,time:9,rank:'C'}, 4: {score:1,time:9,rank:'C'} };
          XMAS.beginPlay(4);
          const G = XMAS.G; XMAS.leaveOnly(G.targets[0]); XMAS.sabotage(G.targets[0]); XMAS.step(1/60);
          XMAS.run(10.5, 1/60); XMAS.skipEnding();
          const unlocked = XMAS.save.specialUnlocked;
          document.getElementById('btnSelect2').click();
          const slot = !!document.querySelector('.slot.special');
          const si = XMAS.STAGES.findIndex(s => s.special);
          const unlockedBefore = XMAS.save.unlocked;
          XMAS.beginPlay(si);
          const G2 = XMAS.G; XMAS.leaveOnly(G2.targets[0]); XMAS.sabotage(G2.targets[0]); XMAS.step(1/60); XMAS.run(2.2, 1/60);
          return { locked, n, unlocked, slot, head: document.getElementById('resultHead').textContent,
                   next: document.getElementById('btnNext').style.display, unlockedSame: XMAS.save.unlocked === unlockedBefore,
                   spBest: !!XMAS.bests()[6], allCleared: XMAS.allCleared() };
        }""")
        check('V07a', '特別ステージは全制覇まで出ない（通常は5ステージ）', r['locked'] and r['n'] == 5, r)
        check('V07b', '全制覇でエンディング後に出現し、ステージ選択に並ぶ', r['unlocked'] and r['slot'], r)
        check('V07c', '特別ステージの結果（延長戦、終了）・次のステージ無し・記録は別枠',
              r['head'] == '延長戦、終了' and r['next'] == 'none' and r['spBest'] and r['unlockedSame'] and r['allCleared'], r)
        fresh(page, {'unlocked': 5, 'allClearEndingUnlocked': True, 'allClearEndingSeen': True})
        r = js(page, "() => ({ sp: XMAS.save.specialUnlocked, seen: XMAS.save.specialSeen, badge: !document.getElementById('newEnding').hidden, text: document.getElementById('newEnding').textContent })")
        check('V08', '全制覇済みのセーブにも特別ステージを出し、タイトルで知らせる', r['sp'] and not r['seen'] and r['badge'] and '青の回廊' in r['text'], r)
        r = js(page, """() => {
          XMAS.beginPlay(0);
          const G = XMAS.G, t = G.targets[0];
          G.player.x = t.x + 40; G.player.y = t.y + 10; G.player.face = Math.PI; XMAS.step(1/60);
          XMAS.startAction();
          for (let i = 0; i < 60 && !t.done; i++) XMAS.step(1/60);
          const stale = G.candidate;
          G.candidate = t;              // 完了直後の1フレームに残ったロックを再現
          XMAS.startAction();
          const started = !!G.action;
          XMAS.run(1.0, 1/60);
          return { done: t.done, started, stuck: !!G.action };
        }""")
        check('V09', '完了直後に工作ボタンを押しても、完了済みの対象で固まらない', r['done'] and not r['started'] and not r['stuck'], r)
        r = js(page, """() => {
          XMAS.startEnding(true, 'ovSelect'); XMAS.run(9.9, 1/60);
          const vis = (id) => +getComputedStyle(document.getElementById(id)).opacity;
          const out = { lineA: vis('revLineA'), lineB: vis('revLineB'), banner: vis('revBanner'),
                        a: document.getElementById('revLineA').textContent, b: document.getElementById('revLineB').textContent };
          XMAS.skipEnding();
          return out;
        }""")
        check('V10', '破局の後、復縁（「意地でも、クリスマスデートをする！」）と特別ステージの出現を見せる',
              r['lineA'] > 0.9 and r['lineB'] > 0.9 and r['banner'] > 0.9 and '意地でも' in r['b'], r)

        # ================================================================ 実行時エラー
        print('\n実行時エラー')
        real = [e for e in errors if 'Failed to load resource' not in e]
        check('ERR', 'JavaScriptエラーなし', not real, real[:3])
        b.close()

    print('\n' + '=' * 64)
    ng = [x for x in results if not x[2]]
    print('合計 %d 件 / PASS %d / FAIL %d' % (len(results), len(results) - len(ng), len(ng)))
    for x in ng:
        print('  FAIL %s %s  %s' % (x[0], x[1], x[3]))
    print('=' * 64)
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
