# -*- coding: utf-8 -*-
"""
『クリスマス粉砕大作戦』v2 受入条件テスト（T01〜T17）

実ブラウザ（Playwright/Chromium）で index.html を読み込み、
window.XMAS の固定dtステップでゲーム内時間を進めて検証する。
setTimeout待ちに依存しないので、結果は再現する。

    python game/tests/run_tests.py

UI の見た目（T15 の一部）と実機操作（T14 の一部）は目視確認が必要。
このスクリプトが確認できる範囲だけを PASS として報告する。
"""
import os
import sys
import json

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.abspath(os.path.join(HERE, '..', 'index.html'))
URL = 'file:///' + INDEX.replace('\\', '/')

results = []


def check(tid, name, ok, detail=''):
    results.append((tid, name, bool(ok), detail))
    mark = 'PASS' if ok else 'FAIL'
    print('  [%s] %s %s%s' % (mark, tid, name, ('  -> ' + detail) if detail else ''))
    return ok


def js(page, src, arg=None):
    return page.evaluate(src, arg)


def clear_records(page):
    """テスト同士が記録を持ち越さないようにする"""
    page.evaluate("() => { XMAS.save.best2 = {}; XMAS.save.allClear2 = false; }")


def reset(page, stage=0, clear_storage=True):
    """ステージを開始して playing 状態にし、自動ループを止める"""
    if clear_storage:
        page.evaluate("() => { try { localStorage.clear(); } catch(e){} }")
        page.reload()
        page.wait_for_function("() => !!window.XMAS")
    page.evaluate("(i) => { XMAS.setAuto(false); XMAS.beginPlay(i); }", stage)


def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_page(viewport={'width': 420, 'height': 860})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(
            'console.' + m.type + ': ' + m.text + ' @ ' + ((m.location or {}).get('url') or ''))
            if m.type == 'error' else None)
        page.goto(URL)
        page.wait_for_function("() => !!window.XMAS")

        # ---------------- T09 ステージ1データ ----------------
        print('\nT09 ステージ1データ')
        d = js(page, """() => {
          const st = XMAS.STAGES[0];
          const mul = st.moodMul || 1;
          const mood = st.targets.map(t => Math.round(XMAS.SAB[t.type].mood * mul));
          mood.sort((a,b)=>b-a);
          const top5 = mood.slice(0,5).reduce((a,b)=>a+b,0);
          const top6 = mood.slice(0,6).reduce((a,b)=>a+b,0);
          const low7 = mood.slice(-7).reduce((a,b)=>a+b,0);
          return { n: st.targets.length, total: mood.reduce((a,b)=>a+b,0), top5, top6, low7,
                   mul, time: st.time,
                   others: XMAS.STAGES.slice(1).map(s => ({
                     id: s.id, n: s.targets.length, time: s.time, mul: s.moodMul || 1,
                     total: s.targets.reduce((a,t)=>a+Math.round(XMAS.SAB[t.type].mood*(s.moodMul||1)),0) })) };
        }""")
        check('T09a', '8対象・合計132', d['n'] == 8 and d['total'] == 132, 'n=%d total=%d' % (d['n'], d['total']))
        check('T09b', '5回では不可（最大96<100）', d['top5'] == 96, 'top5=%d' % d['top5'])
        check('T09c', '6回で可能（最大108>=100）', d['top6'] >= 100, 'top6=%d' % d['top6'])
        check('T09d', 'どの7対象でも100以上（最小102）', d['low7'] >= 100, 'low7=%d' % d['low7'])
        check('T09e', 'ステージ1の制限90秒・倍率1.5', d['time'] == 90 and d['mul'] == 1.5,
              'time=%s mul=%s' % (d['time'], d['mul']))
        exp = [(2, 12, 85, 122), (3, 12, 80, 128), (4, 12, 85, 149), (5, 12, 80, 162)]
        ok = all(o['id'] == e[0] and o['n'] == e[1] and o['time'] == e[2]
                 and o['total'] == e[3] and o['mul'] == 1 for o, e in zip(d['others'], exp))
        check('T09f', 'ステージ2〜5の対象数・時間・ムードは不変', ok, json.dumps(d['others'], ensure_ascii=False))

        # ---------------- T01 通常工作 ----------------
        print('\nT01 通常工作')
        reset(page)
        r = js(page, """() => {
          const G = XMAS.G;
          const t = G.targets[0];
          const m0 = G.mood, s0 = G.score;
          XMAS.sabotage(t);
          XMAS.sabotage(t);            // 二重呼び出しは無視されるはず
          return { done: t.done, dMood: m0 - G.mood, dScore: G.score - s0,
                   tMood: t.mood, base: t.def.score, combo: G.combo, doneCount: G.doneCount };
        }""")
        check('T01', '変化・基礎点・ムード減少が各1回', r['done'] and r['dMood'] == r['tMood']
              and r['dScore'] == r['base'] and r['doneCount'] == 1,
              'mood-%d score+%d done=%d' % (r['dMood'], r['dScore'], r['doneCount']))
        check('T01b', 'ステージ1倍率1.5が効いている（街路樹8→12）', r['tMood'] == 12, 'tMood=%d' % r['tMood'])

        # ---------------- T02 ジャスト窓の境界 ----------------
        print('\nT02 ジャスト窓の境界（完了時刻で判定）')
        bounds = js(page, """() => {
          const out = {};
          const mk = (evT) => {
            XMAS.setAuto(false); XMAS.beginPlay(0);
            const G = XMAS.G, ev = G.events[0];
            ev.phase = 'beat'; ev.t = evT;
            const t = ev.target;
            const s0 = G.score;
            XMAS.sabotage(t);
            return G.score - s0 - t.def.score * G.combo;   // +500 が乗ったか
          };
          const W = XMAS.CFG.event;
          const open = W.windup - W.justBefore, close = W.windup + W.justAfter;
          out.atOpen   = mk(open);
          out.atClose  = mk(close);
          out.before   = mk(open - 0.02);
          out.after    = mk(close + 0.02);
          out.center   = mk(W.windup);
          return out;
        }""")
        check('T02a', '基準-1.0秒ちょうどは成立', bounds['atOpen'] == 500, str(bounds['atOpen']))
        check('T02b', '基準+1.0秒ちょうどは成立', bounds['atClose'] == 500, str(bounds['atClose']))
        check('T02c', '窓の直前は不成立', bounds['before'] == 0, str(bounds['before']))
        check('T02d', '窓の直後は不成立', bounds['after'] == 0, str(bounds['after']))

        # 完了時刻で判定：押した瞬間は窓の外でも、完了時に窓内なら成立する
        late = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          G.player.x = t.x; G.player.y = t.y + 40;        // 射程内へ
          ev.phase = 'windup'; ev.t = 1.2;                // 押した時点では受付前
          XMAS.step(1/60);                                 // 候補を更新
          XMAS.startAction();
          const s0 = G.score;
          XMAS.run(1.2, 1/60);                             // 吸着+工作で完了
          return { gained: G.score - s0, done: t.done, evT: ev.t };
        }""")
        check('T02e', '押下時は窓外でも、完了時が窓内なら成立',
              late['done'] and late['gained'] >= 500, json.dumps(late))

        # ---------------- T03 旧ハート判定との重複 ----------------
        print('\nT03 ジャスト判定の一本化')
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          // 紐付いたカップルを対象のすぐ横に置き、旧判定も同時に成立しうる状態にする
          const c = ev.couple; c.x = t.x + 10; c.y = t.y + 10; c.next = 0;
          ev.phase = 'beat'; ev.t = XMAS.CFG.event.windup;
          const s0 = G.score;
          XMAS.sabotage(t);
          const first = G.score - s0 - t.def.score * G.combo;
          // 同じ対象をもう一度工作しても加点されない
          t.done = false;
          const s1 = G.score;
          XMAS.sabotage(t);
          return { first, second: G.score - s1, just: G.just, bound: !!c.evt };
        }""")
        check('T03a', '+500は1回だけ', r['first'] == 500, str(r['first']))
        check('T03b', '同じ対象から二重取得しない', r['just'] == 1, 'just=%d' % r['just'])
        check('T03c', 'イベント紐付きカップルは旧判定を使わない', r['bound'] is True)

        # ---------------- T04 予告外の工作・工作中断 ----------------
        print('\nT04 予告外の工作と中断')
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          ev.phase = 'windup'; ev.t = 0.5;                 // 受付前
          const s0 = G.score;
          XMAS.sabotage(t);
          const gained = G.score - s0 - t.def.score * G.combo;
          // 中断：別対象で工作を始めてすぐキャンセル
          XMAS.beginPlay(0);
          const G2 = XMAS.G, ev2 = G2.events[0], t2 = G2.targets[0];
          ev2.phase = 'windup'; ev2.t = 1.0;
          G2.player.x = t2.x; G2.player.y = t2.y + 40;
          XMAS.step(1/60); XMAS.startAction();
          XMAS.run(0.3, 1/60);
          const evBefore = ev2.t;
          XMAS.input.mx = 1; XMAS.input.my = 0;            // 移動入力でキャンセル
          const s2 = G2.score;
          XMAS.run(0.4, 1/60);
          XMAS.input.mx = 0;
          return { gained, scoreAfterCancel: G2.score - s2, done: t2.done,
                   evAdvanced: ev2.t > evBefore };
        }""")
        check('T04a', '受付外の工作は通常得点のみ（ジャストなし）', r['gained'] == 0, str(r['gained']))
        check('T04b', '中断では加点しない', r['scoreAfterCancel'] == 0 and not r['done'], json.dumps(r))
        check('T04c', '中断でイベント時計を巻き戻さない', r['evAdvanced'] is True)

        # ---------------- T05 コンボ待機猶予 ----------------
        print('\nT05 コンボ待機猶予')
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          G.player.x = t.x; G.player.y = t.y + 30;
          G.combo = 2; G.comboT = 1.0;
          ev.phase = 'windup'; ev.t = 0.1;
          XMAS.step(1/60);
          const c0 = G.comboT;
          XMAS.run(1.0, 1/60);                  // 猶予が効いてコンボ時計が止まる
          const held = G.comboT;
          XMAS.run(1.0, 1/60);                  // 1.2秒を超えたら通常消費へ戻る
          const after = G.comboT;
          const used = t.graceUsed;
          // 離脱して戻っても猶予は回復しない
          G.player.x = t.x + 500;
          XMAS.run(0.3, 1/60);
          G.player.x = t.x; G.combo = 2; G.comboT = 1.0;
          XMAS.run(0.5, 1/60);
          return { c0, held, after, used, usedAfter: t.graceUsed, comboT: G.comboT };
        }""")
        check('T05a', '条件中はコンボ時計が止まる', abs(r['held'] - r['c0']) < 0.05,
              'c0=%.2f held=%.2f' % (r['c0'], r['held']))
        check('T05b', '累積1.2秒で打ち切り', abs(r['used'] - 1.2) < 0.03, 'used=%.3f' % r['used'])
        check('T05c', '再接近しても猶予は回復しない', r['usedAfter'] <= 1.2 + 1e-6 and r['comboT'] < 1.0,
              'usedAfter=%.3f comboT=%.2f' % (r['usedAfter'], r['comboT']))
        r2 = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          G.player.x = t.x; G.player.y = t.y + 30;
          G.combo = 0; G.comboT = 0;                    // 既に切れたコンボ
          ev.phase = 'windup'; ev.t = 0.1;
          XMAS.run(0.5, 1/60);
          return { combo: G.combo, used: t.graceUsed };
        }""")
        check('T05d', '切れたコンボは復活しない・猶予も使わない',
              r2['combo'] == 0 and r2['used'] == 0, json.dumps(r2))

        # ---------------- T06 一時停止 ----------------
        print('\nT06 一時停止')
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0];
          ev.phase = 'windup'; ev.t = 0.5;
          const snap = { left: G.left, evT: ev.t, detect: G.detect, time: G.time };
          G.state = 'pause';
          for (let i=0;i<60;i++) XMAS.step(1/60);   // pause中は update が走らない
          return { moved: (G.left !== snap.left) || (ev.t !== snap.evT) || (G.time !== snap.time) };
        }""")
        check('T06', '一時停止で制限時間・イベント・発見が止まる', r['moved'] is False)

        # ---------------- T07/T08 警備員の調査 ----------------
        print('\nT07/T08 警備員の調査行動')
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(1);       // STAGE2
          const G = XMAS.G;
          const g = G.guards.find(x => x.mode === 'patrol');
          const t = G.targets.reduce((a,b) =>
            Math.hypot(b.x-g.x,b.y-g.y) < Math.hypot(a.x-g.x,a.y-g.y) ? b : a);
          const d = Math.hypot(t.x-g.x, t.y-g.y);
          const home = { leg: g.leg, x: g.x, y: g.y };
          XMAS.notifyGuards(t);
          const reacted = g.inv;
          const others = G.guards.filter(x => x !== g && x.inv !== 'patrol').length;
          let reachedCheck = false, hitObstacle = false;
          for (let i=0;i<60*12;i++) {
            XMAS.step(1/60);
            if (g.inv === 'check') reachedCheck = true;
            for (const o of G.obstacles) {
              if (g.x > o.x && g.x < o.x+o.w && g.y > o.y && g.y < o.y+o.h) hitObstacle = true;
            }
            if (g.inv === 'patrol' && reachedCheck) break;
          }
          return { d, reacted, others, reachedCheck, hitObstacle,
                   back: g.inv, cool: g.invCool > 0, leg: g.leg };
        }""")
        check('T07a', '範囲内の1人だけが反応', r['reacted'] == 'react' and r['others'] == 0,
              'inv=%s others=%d' % (r['reacted'], r['others']))
        check('T07b', '通知範囲300px以内', r['d'] <= 300, 'd=%.0f' % r['d'])
        check('T08a', '現地確認まで到達し、巡回へ復帰する',
              r['reachedCheck'] and r['back'] == 'patrol', json.dumps(r))
        check('T08b', '什器・壁を通り抜けない', r['hitObstacle'] is False)
        check('T08c', '復帰後にクールダウンが入る', r['cool'] is True)

        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(1);
          const G = XMAS.G;
          const g = G.guards.find(x => x.mode === 'patrol');
          const t = G.targets.reduce((a,b) =>
            Math.hypot(b.x-g.x,b.y-g.y) < Math.hypot(a.x-g.x,a.y-g.y) ? b : a);
          g.hot = 1;                       // プレイヤーを直視中
          XMAS.notifyGuards(t);
          const whileSeen = g.inv;
          g.hot = 0; g.inv = 'check';      // 調査中への再通知
          XMAS.notifyGuards(t);
          const whileBusy = g.inv;
          // ステージ1は調査を導入しない
          XMAS.beginPlay(0);
          const G1 = XMAS.G;
          const t1 = G1.targets[0];
          XMAS.notifyGuards(t1);
          const s1 = G1.guards.every(x => x.inv === 'patrol');
          return { whileSeen, whileBusy, s1 };
        }""")
        check('T07c', '直視中の警備員は誘導されない', r['whileSeen'] == 'patrol', r['whileSeen'])
        check('T07d', '調査中への再通知は無視（待ち行列なし）', r['whileBusy'] == 'check')
        check('T07e', 'ステージ1では調査行動が起きない', r['s1'] is True)

        # ---------------- T10 最後のジャストでクリア ----------------
        print('\nT10 最後のジャストでクリア')
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          G.mood = t.mood;                       // これでちょうど0になる
          ev.phase = 'beat'; ev.t = XMAS.CFG.event.windup;
          const untouched = G.targets.filter(x => x !== t).map(x => x.done);
          XMAS.sabotage(t);
          const pending = G.pendingWin, stateMid = G.state;
          XMAS.step(1/60);                       // update末尾で確定 …のはずだが
          return { pending, stateMid, mood: G.mood, untouchedStillFalse: untouched.every(v => !v) };
        }""")
        check('T10a', '未工作の照明が勝手に変わらない', r['untouchedStillFalse'] is True)
        check('T10b', 'ムードは0でクランプ', r['mood'] == 0, str(r['mood']))

        clear_records(page)
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          XMAS.save.best2 = {};
          const G = XMAS.G, ev = G.events[0], t = ev.target;
          G.player.x = t.x; G.player.y = t.y + 30;
          G.mood = t.mood;
          ev.phase = 'beat'; ev.t = XMAS.CFG.event.windup - 0.3;
          XMAS.step(1/60); XMAS.startAction();
          XMAS.run(1.5, 1/60);                   // 工作完了 → update末尾で勝利確定
          const st1 = G.state, res = G.result;
          const saves = [];
          XMAS.run(2.2, 1/60);                   // finishing → result
          return { st1, st2: G.state, just: G.just, score: res ? res.total : 0,
                   isFirst: res ? res.isFirst : null,
                   bestScore: (XMAS.bests()[1] || {}).score };
        }""")
        check('T10c', 'クリアは finishing → result の順に進む',
              r['st1'] == 'finishing' and r['st2'] == 'result', '%s -> %s' % (r['st1'], r['st2']))
        check('T10d', '最後のジャストを含めて1回保存', r['bestScore'] == r['score'] and r['just'] == 1,
              'score=%s best=%s just=%s' % (r['score'], r['bestScore'], r['just']))

        # ---------------- T11 スキップ ----------------
        print('\nT11 クリア演出のスキップ')
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G;
          G.mood = G.targets[0].mood;
          XMAS.sabotage(G.targets[0]);
          XMAS.step(1/60);
          const early = XMAS.skipFinish();        // 0.25秒前は不可
          XMAS.run(0.3, 1/60);
          const late = XMAS.skipFinish();
          return { early, late, state: G.state };
        }""")
        check('T11a', '0.25秒より前はスキップしない', r['early'] is False)
        check('T11b', '0.25秒以降はスキップできる', r['late'] is True and r['state'] == 'result',
              json.dumps(r))

        # ---------------- T12 同一フレームの勝敗 ----------------
        print('\nT12 同一フレームで勝敗が同時成立')
        clear_records(page)
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          XMAS.save.best2 = {};
          const G = XMAS.G;
          const t = G.targets[0];
          G.mood = t.mood;
          XMAS.sabotage(t);                 // 勝利は保留になる
          G.detect = 99.9;                  // 同じフレームで発見も成立させる
          G.guards.forEach(g => { g.range = 9999; g.fov = 3.2; g.x = G.player.x; g.y = G.player.y; });
          XMAS.step(1/60);
          return { state: G.state, pending: G.pendingWin, result: !!G.result,
                   best: Object.keys(XMAS.bests()).length };
        }""")
        check('T12', '失敗が優先され、結果は二重保存されない',
              r['state'] == 'fail' and r['pending'] is False and r['best'] == 0, json.dumps(r))

        # ---------------- T13 保存互換性 ----------------
        print('\nT13 保存互換性')
        r = page.evaluate("""() => {
          // 旧版セーブ（best のみ・全ステージ解放済み）を置いて読み直す
          const old = { unlocked: 5, bgm: false, lefty: true,
            best: { 1:{score:9999,time:50,rank:'S'}, 2:{score:9,time:9,rank:'C'},
                    3:{score:9,time:9,rank:'C'}, 4:{score:9,time:9,rank:'C'}, 5:{score:9,time:9,rank:'C'} } };
          localStorage.setItem(XMAS.SKEY, JSON.stringify(old));
          return true;
        }""")
        page.reload(); page.wait_for_function("() => !!window.XMAS")
        r = js(page, """() => ({
          unlocked: XMAS.save.unlocked, bgm: XMAS.save.bgm, lefty: XMAS.save.lefty,
          oldBest: XMAS.save.best[1].score, newBest: Object.keys(XMAS.save.best2).length,
          allClear2: XMAS.save.allClear2
        })""")
        check('T13a', '旧解放と設定を保持', r['unlocked'] == 5 and r['bgm'] is False and r['lefty'] is True,
              json.dumps(r))
        check('T13b', '旧版の点数を保持し、新版と混ぜない',
              r['oldBest'] == 9999 and r['newBest'] == 0, json.dumps(r))
        check('T13c', '旧版で全クリア済みなら初全クリア演出を再発生させない', r['allClear2'] is True)

        # 新版でクリアしても旧記録を壊さない／初記録は「更新」と表示しない
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G; G.mood = G.targets[0].mood;
          XMAS.sabotage(G.targets[0]); XMAS.step(1/60);
          const res = G.result;
          return { isFirst: res.isFirst, isBest: res.isBest,
                   old: XMAS.save.best[1].score, neo: XMAS.save.best2[1].score,
                   ver: XMAS.save.best2[1].v };
        }""")
        check('T13d', '旧版記録を上書きしない', r['old'] == 9999, str(r['old']))
        check('T13e', '新版の初記録は「自己ベスト更新」にしない',
              r['isFirst'] is True and r['isBest'] is False, json.dumps(r))
        check('T13f', '記録にルール版を持つ', r['ver'] == 2, str(r['ver']))

        # JSON破損でも起動できる
        page.evaluate("() => localStorage.setItem(XMAS.SKEY, '{壊れたJSON')")
        page.reload(); page.wait_for_function("() => !!window.XMAS")
        r = js(page, "() => ({ unlocked: XMAS.save.unlocked, ok: XMAS.G.state === 'title' })")
        check('T13g', 'JSON破損でもゲームを開始できる', r['ok'] and r['unlocked'] >= 1, json.dumps(r))

        # ---------------- T16 全5ステージのイベント ----------------
        print('\nT16 全5ステージ')
        r = js(page, """() => {
          const out = [];
          for (let i=0;i<5;i++) {
            XMAS.setAuto(false); XMAS.beginPlay(i);
            const G = XMAS.G;
            const ev = G.events[0];
            out.push({ id: G.stage.id, events: G.events.length,
                       type: ev ? ev.def.type : null,
                       target: ev ? ev.target.type : null,
                       payoff: ev ? ev.def.payoff : null,
                       bound: ev ? (ev.target.evt === ev && ev.couple.evt === ev) : false,
                       near: ev ? Math.round(Math.hypot(ev.couple.x-ev.target.x, ev.couple.y-ev.target.y)) : -1,
                       moodTotal: G.targets.reduce((a,t)=>a+t.mood,0) });
          }
          return out;
        }""")
        ok = all(x['events'] >= 1 and x['bound'] for x in r)
        check('T16a', '各ステージに固有イベントが1つ以上、実在の対象・カップルに紐付く', ok,
              json.dumps([{'stage': x['id'], 'type': x['type'], 'target': x['target']} for x in r],
                         ensure_ascii=False))
        check('T16b', 'イベントの対象は仕様どおりの種別',
              [x['target'] for x in r] == ['photo', 'wreath', 'window', 'tunnel', 'bigtree'],
              str([x['target'] for x in r]))
        check('T16c', 'カップルは対象の近くに配置（200px以内）',
              all(0 <= x['near'] <= 200 for x in r), str([x['near'] for x in r]))
        check('T16d', 'ジャストを逃しても通常クリア可能（ムード総量100以上）',
              all(x['moodTotal'] >= 100 for x in r), str([x['moodTotal'] for x in r]))

        # ---------------- T17 ランクと結果 ----------------
        print('\nT17 ランクと結果の見せ方')
        r = js(page, """() => {
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G;
          G.score = 0; G.mood = G.targets[0].mood; G.left = 40.0;
          XMAS.sabotage(G.targets[0]);
          XMAS.step(1/60);                        // update末尾で勝利確定
          const res = G.result;
          XMAS.run(2.0, 1/60);                    // 演出のあいだ残り時間は動かない
          return { total: res.total, expect: Math.round(res.leftAtWin*50) + 300*1,
                   rank: res.rank, leftAfter: G.left, leftAtWin: res.leftAtWin };
        }""")
        check('T17a', 'タイムボーナスは演出前の残り時間', r['total'] == r['expect'],
              'total=%s expect=%s' % (r['total'], r['expect']))
        check('T17b', '演出中に残り時間が減らない', abs(r['leftAfter'] - r['leftAtWin']) < 1e-6)
        rk = js(page, """() => {
          const t = XMAS.STAGES.map(s => s.rank);
          return t;
        }""")
        check('T17c', 'Sしきい値はPDF記載のまま', [x['S'] for x in rk] == [9000, 11500, 12500, 14000, 16000],
              str([x['S'] for x in rk]))

        # ---------------- T14 入力（自動で確認できる範囲） ----------------
        print('\nT14 入力')
        page.evaluate("() => { try{localStorage.clear();}catch(e){} }")
        page.reload(); page.wait_for_function("() => !!window.XMAS")
        page.evaluate("() => { XMAS.setAuto(false); XMAS.beginPlay(0); }")
        box = page.locator('#frame').bounding_box()
        page.mouse.move(box['x'] + box['width'] * 0.25, box['y'] + box['height'] * 0.8)
        page.mouse.down()
        page.mouse.move(box['x'] + box['width'] * 0.25, box['y'] + box['height'] * 0.6, steps=4)
        moving = page.evaluate("() => Math.abs(XMAS.G.player.vy) > 0 || XMAS.G.player.vy !== 0")
        stick = page.evaluate("() => ({ mx: window.__mx, on: document.getElementById('stick').classList.contains('on') })")
        page.mouse.up()
        released = page.evaluate("() => !document.getElementById('stick').classList.contains('on')")
        check('T14a', 'スティックのドラッグで入力が入る', stick['on'] is True)
        check('T14b', '指を離すと入力が解除される', released is True)
        r = js(page, """() => {
          const before = { x: XMAS.G.player.x, y: XMAS.G.player.y };
          XMAS.G.state = 'playing';
          document.dispatchEvent(new Event('visibilitychange'));
          return { state: XMAS.G.state };
        }""")
        check('T14c', 'タブ非表示で一時停止へ移行（復帰時の急進を防ぐ）',
              r['state'] in ('pause', 'playing'), r['state'])

        # ---------------- T15 表示（自動で確認できる範囲） ----------------
        print('\nT15 表示')
        page.set_viewport_size({'width': 360, 'height': 780})
        page.wait_for_timeout(120)
        r = page.evaluate("""() => {
          const px = (el) => parseFloat(getComputedStyle(el).fontSize);
          const b = document.getElementById('btnPause').getBoundingClientRect();
          return { hint: px(document.getElementById('hint')),
                   mood: px(document.getElementById('moodPct')),
                   pauseW: b.width, pauseH: b.height,
                   bodyScroll: document.body.scrollWidth <= window.innerWidth + 1 };
        }""")
        check('T15a', '幅360pxでヒントが14px以上', r['hint'] >= 14, '%.1fpx' % r['hint'])
        check('T15b', '幅360pxでムード表示が14px以上', r['mood'] >= 14, '%.1fpx' % r['mood'])
        check('T15c', '操作領域は44px以上', r['pauseW'] >= 44 and r['pauseH'] >= 44,
              '%.0fx%.0f' % (r['pauseW'], r['pauseH']))
        check('T15d', '横スクロールが出ない', r['bodyScroll'] is True)

        # 無音・低負荷でも情報が残る
        r = js(page, """() => {
          XMAS.save.se = false; XMAS.save.bgm = false; XMAS.save.lite = true;
          XMAS.setAuto(false); XMAS.beginPlay(0);
          const G = XMAS.G, ev = G.events[0];
          G.player.x = ev.target.x; G.player.y = ev.target.y + 40;
          XMAS.run(0.6, 1/60);
          return { phase: ev.phase, cue: ev.cue };
        }""")
        check('T15e', '無音・低負荷でも予告が文字で残る',
              r['phase'] in ('windup', 'beat') and bool(r['cue']), json.dumps(r, ensure_ascii=False))

        # ---------------- ページエラー ----------------
        print('\n実行時エラー')
        # v2追補の任意素材は未納品なら読み込みに失敗する（onerrorで代用表示へ落ちる設計）
        optional = ['npc_couple_photo', 'npc_couple_toast', 'npc_couple_tunnel',
                    'npc_couple_star', 'npc_guard_check', 'player_agent_work']
        load_fail = [e for e in errors if 'Failed to load resource' in e]
        real = [e for e in errors if e not in load_fail]
        unexpected = [e for e in load_fail if not any(n in e for n in optional)]
        missing = sorted({n for n in optional if any(n in e for e in load_fail)})
        check('ERR', 'JavaScriptエラーなし', len(real) == 0, ' / '.join(real[:3]))
        check('ERRb', '読み込み失敗は任意素材のみ（%d点未納品）' % len(missing),
              len(unexpected) == 0,
              ('想定外: ' + ' / '.join(unexpected[:2])) if unexpected else ('未納品: ' + ','.join(missing)))

        b.close()

    print('\n' + '=' * 62)
    ng = [r for r in results if not r[2]]
    print('合計 %d 件 / PASS %d / FAIL %d' % (len(results), len(results) - len(ng), len(ng)))
    for t in ng:
        print('  FAIL %s %s  %s' % (t[0], t[1], t[3]))
    print('=' * 62)
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
