/* =========================================================
   クリスマス粉砕大作戦 / Operation Silent Night
   縦持ちスマホ向け 潜入イルミネーション工作アクション
   - 仕様書「クリスマス粉砕大作戦_ゲーム実装仕様書.md」準拠
   - 画像素材が無くてもプロシージャル描画で完全動作する
   - assets/ に指定名のPNGを置くと自動で差し替わる（素材フック）
   ========================================================= */
(function () {
  'use strict';

  /* ---------- 基本定数 ---------- */
  const W = 540, H = 960;                 // 論理解像度（9:16）
  const PLAYER_SPEED = 168;               // px/秒
  const PICK_RADIUS = 96;                 // 工作対象の吸着判定半径
  const SNAP_TIME = 0.22;                 // 対象への位置合わせ時間
  const COMBO_WINDOW = 5.0;               // コンボ継続猶予（秒）
  const DETECT_MAX = 100;
  const DETECT_RECOVER_DELAY = 0.8;
  const DETECT_RECOVER_RATE = 72;
  const JUST_WINDOW = 1.0;                // ジャスト妨害の前後判定
  const JUST_BONUS = 500;
  const TIME_BONUS = 50;                  // 残り1秒あたり

  /* ---------- 調整パラメータ（数値はここだけで調整する） ---------- */
  const RULES_VERSION = 4;                // スコア記録のルール版（v4：全イルミ工作でクリア・時間延長イルミ）
  const CFG = {
    /* v4：クリア条件は「フィールドのイルミをすべて工作」。特別なイルミ（金色のトナカイ）で制限時間が延びる */
    bonusSec: 10,
    fever: { combo: 10, mul: 0.7 },   // 10連鎖以上は工作時間 ×0.7（3連鎖以上は従来どおり ×0.84）
    mobReactR: 170,                   // この距離の通行カップルは、近くの消灯で冷める
    event: {
      radius: 260,        // 予告が起動するプレイヤー→対象の距離
      windup: 3.0,        // 予告の長さ。基準時刻 = windup
      justBefore: 1.0,    // 受付開始（基準時刻の前）
      justAfter: 1.0,     // 受付終了（基準時刻の後）
      /* v3：紐付いたデートは1プレイ1回で結末が確定する。期限 = 受付終了（windup + justAfter） */
      reaction: 1.4,      // NPCのオチ表示（仕様1.2秒、読了のため1.5秒まで可）
      lineDelay: 0.45,    // 主人公の一言はカップルの反応より少し遅らせる
      cardT: 0.8,         // 画面端の反応カード（最初のジャスト／最初の期限切れだけ）
    },
    grace: {
      enabled: true,
      max: 1.2,           // 対象ごと1プレイ1回、コンボ時計だけを止める上限
      radius: PICK_RADIUS,
    },
    guard: {
      notifyRadius: 300,  // 工作の音が届く範囲
      reactT: 0.45,       // 「故障か？」と対象を見る
      moveTimeout: 5.0,   // 到達できなければ打ち切り
      checkT: 1.8,        // 現地確認
      cooldown: 4.0,      // 巡回復帰後、再調査までの待ち
    },
    finish: {
      hold: 1.8,          // クリア確定から結果画面まで
      radioAt: 1.2,       // 無線とMISSION CLEAR
      poseAt: 0.5,        // 主人公が得意顔に変わる（最後の工作の反応を先に見せる）
      skipAfter: 0.25,    // これ以降の新しい入力でスキップ可
      zoom: 0.08,         // カメラの引き（低負荷モードでは省略）
    },
    fail: {
      hold: 1.2,          // 敗北確定から失敗画面まで（悔し顔を見せる）
      skipAfter: 0.25,
    },
    /* 全ステージ制覇の破局エンディング（秒） */
    ending: {
      dim: 0.6,           // 0〜0.6 暗転して余韻
      couple: 0.6,        // 0.6〜1.8 親密 → 破局のクロスフェード
      lineA: 1.8,         // 女性「……もう、終わりにしよう」
      lineB: 2.4,         // 男性「……ああ」
      art: 3.0,           // 3.0〜4.5 最終絵
      hero: 4.5,          // 4.5〜6.0 主人公「任務、完了」
      /* v4：別れたふたりが復縁し、特別ステージが出現する */
      revival: 6.2,       // 暗転から、ふたりが戻ってくる
      revLineA: 6.9,      // 女性「……やっぱり、諦めきれない」
      revLineB: 7.8,      // 男性「意地でも、クリスマスデートをする！」
      revBanner: 8.8,     // 「特別ステージ出現」
      end: 9.8,           // 以降はタップ待ち
      skipAfter: 0.25,
    },
    /* ラブラブオーラ：照明で増幅された「圧」。対応灯を消すと消える通行障害 */
    aura: {
      radius: 56,         // 衝突円の半径（論理px）。輪の芯と一致させる
      playerR: 12,        // 主人公の足元の半径
      ringImg: 512,       // fx_love_aura_ring の一辺
      ringCore: 176,      // 同画像での輪の芯の半径 → 描画サイズ = 512 × R / 176
      breakT: 0.4,        // 消滅エフェクト（衝突は工作完了の瞬間に解除済み）
      tipRange: 240,      // 初接近で対応関係を示す距離
      linkT: 2.6,         // 点線で対応灯を示す時間
      substep: 4,         // 1回の移動を分割する最大距離（低FPSでの貫通防止）
    },
    /* 操作。寸法は CSS px（Canvas の論理pxとは別物） */
    controls: {
      stickR: 44,         // スティックのベース半径
      knobR: 18,          // つまみの半径
      acquireR: 56,       // 触れたらスティック操作になる半径
      dead: 6,            // デッドゾーン
      btnR: 38,           // 工作ボタンの半径
      gap: 8,             // 操作領域どうしの最小の隙間
      edgeY: 88,          // 下端からの中心位置
      sideX: 76,          // 左右端からの中心位置
      centerBtnX: 48,     // 中央下プリセットでの工作ボタンの右端からの位置
      cancelMove: 6,      // 工作中、この距離以上の新しい移動ジェスチャーでキャンセル
      dragHitMin: 56,     // 直接ドラッグで主人公をつかめる最小の領域
      dragHitPad: 12,     // 主人公の描画範囲に足すつかみやすい余白
      dragBandTop: 0.34,  // 直接ドラッグ中、主人公がこの高さより上へ行くとカメラが追う
      dragBandBottom: 0.72,
    },
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

  /* ---------- 工作対象データ（ScriptableObject相当） ---------- */
  // effect: white=冷白色化 / off=完全消灯 / partial=部分消灯 / half=半分消灯 / star=星だけ消灯
  const SAB = {
    tree:    { name: '街路樹ライト',   mood: 8,  dur: 0.45, score: 300, effect: 'white'   },
    heart:   { name: 'ハートイルミ',   mood: 10, dur: 0.55, score: 400, effect: 'partial' },
    tunnel:  { name: '光のトンネル',   mood: 15, dur: 0.70, score: 650, effect: 'half'    },
    bigtree: { name: '大型ツリー',     mood: 20, dur: 0.80, score: 900, effect: 'star'    },
    photo:   { name: 'フォトスポット', mood: 12, dur: 0.60, score: 520, effect: 'white'   },
    booth:   { name: '屋台照明',       mood: 8,  dur: 0.45, score: 300, effect: 'off'     },
    wreath:  { name: '巨大リース',     mood: 12, dur: 0.60, score: 520, effect: 'partial' },
    window:  { name: '窓際照明',       mood: 10, dur: 0.50, score: 420, effect: 'white'   },
    water:   { name: '水面ライト',     mood: 10, dur: 0.50, score: 420, effect: 'off'     },
    led:     { name: '大型LED演出',    mood: 15, dur: 0.70, score: 650, effect: 'white'   },   // v4では配置しない
    /* v4：クリスマスならではの装飾 */
    reindeer: { name: '金色のトナカイ', mood: 15, dur: 0.70, score: 700, effect: 'white', bonus: true },  // 工作で制限時間+10秒
    gift:     { name: 'プレゼントのイルミ', mood: 12, dur: 0.55, score: 500, effect: 'off'   },
    snowman:  { name: '雪だるまのイルミ',   mood: 10, dur: 0.50, score: 450, effect: 'white' },
    bluetree: { name: '青いLED並木',       mood: 3,  dur: 0.25, score: 150, effect: 'off'   },  // 特別ステージ用
  };

  /* NPCリアクション（1〜2秒で消える短文のみ） */
  const REACT = {
    white:   ['……なんか急に市役所みたい', 'は？ 色、変わった？', '蛍光灯じゃん'],
    off:     ['え、終わった？', '消えちゃった……', 'もう時間？'],
    partial: ['そこだけ消えるんだ……', '形、崩れてない？', 'ハート……欠けてる'],
    half:    ['半分だけ真っ暗なんだけど', '工事中？', '奥、行けるのかな'],
    star:    ['星、どこ行った', 'てっぺん消えてる……', '写真、撮れないね'],
  };

  /* ---------- ステージデータ ---------- */
  const T = (t, x, y, opt) => Object.assign({ type: t, x: x, y: y }, opt || {});

  /* 特別ステージ「青の回廊」：街じゅうが青いLEDで埋まった通り。膨大な数を工作する延長戦 */
  const SPECIAL_STAGE = (() => {
    const targets = [];
    for (let y = 3150; y >= 450; y -= 100) targets.push(T('bluetree', 100, y), T('bluetree', 440, y));   // 56本
    [[270, 2900, 'gift'], [270, 2500, 'snowman'], [270, 2100, 'heart'],
     [270, 1700, 'gift'], [270, 1300, 'snowman'], [270, 900, 'heart']].forEach((a) => targets.push(T(a[2], a[0], a[1])));
    [3050, 2300, 1500, 700].forEach((y) => targets.push(T('reindeer', 270, y)));                        // 時間延長 ×4
    targets.push(T('bigtree', 270, 330));                                                               // 最後の大型ツリー
    const idx = (type, y) => targets.findIndex((t) => t.type === type && t.y === y);
    return {
      id: 6, special: true, name: '青の回廊', theme: '意地のクリスマスデート', style: 'blue',
      time: 80, worldH: 3400, start: { x: 270, y: 3300 },
      rank: { S: 400000, A: 250000, B: 140000 },
      targets: targets,
      obstacles: [{ x: 210, y: 2740, w: 120, h: 40 }, { x: 210, y: 1940, w: 120, h: 40 }, { x: 210, y: 1140, w: 120, h: 40 }],
      guards: [
        { x: 270, y: 2400, type: 'guard', mode: 'patrol', pts: [[150, 2400], [390, 2400]], spd: 60, range: 200, fov: 0.48 },
        { x: 270, y: 1600, type: 'guard', mode: 'patrol', pts: [[390, 1600], [150, 1600]], spd: 64, range: 200, fov: 0.48 },
        { x: 30, y: 2000, type: 'cam', dir: 0.2, amp: 0.8, spd: 0.7, range: 240, fov: 0.42 },
        { x: 510, y: 1000, type: 'cam', dir: 2.9, amp: 0.8, spd: 0.8, range: 240, fov: 0.42 },
      ],
      couples: [
        { pts: [[340, 2620]], spd: 0 },
        { pts: [[200, 1620]], spd: 0 },
        { pts: [[200, 430], [340, 430]], spd: 12 },          // 復縁したふたり
      ],
      mobs: 10,
      investigate: true,
      auras: [
        { id: 's6_aura_a', couple: 0, source: idx('gift', 2900) },
        { id: 's6_aura_b', couple: 1, source: idx('snowman', 1300) },
      ],
      events: [{
        id: 's6_star', type: 'star', target: targets.length - 1, couple: 2,
        cues: ['星の下で、もう一度', '3', '2', '1'], payoff: 'もう……帰ろうか',
      }],
    };
  })();
  const STAGES = [
    {
      /* v2：8対象・ムード倍率1.5。6〜7回の工作でクリアできる短い導入に作り替えた */
      id: 1, name: '光の並木道', theme: '待ち合わせ', style: 'street',
      time: 70, worldH: 2100, start: { x: 270, y: 1980 }, tutorial: true,
      moodMul: 1.5,
      rank: { S: 17000, A: 11000, B: 6000 },
      targets: [
        T('tree', 110, 1850),      // 0 出発地点から見える最初の1本
        T('heart', 430, 1690),     // 1
        T('tree', 110, 1520),      // 2
        T('photo', 290, 1330),     // 3 カップルイベント付き
        T('heart', 110, 1130),     // 4
        T('tree', 440, 1000),      // 5
        T('photo', 250, 790),      // 6 通常のフォトスポット
        T('bigtree', 270, 430),    // 7 見せ場
        T('reindeer', 440, 1400),  // 8 金色のトナカイ（+10秒）
      ],
      obstacles: [{ x: 212, y: 1745, w: 46, h: 58 }, { x: 322, y: 1070, w: 50, h: 56 }],
      guards: [{ x: 452, y: 470, type: 'cam', dir: 2.3, amp: 0.75, spd: 0.6, range: 235, fov: 0.42 }],
      couples: [{ pts: [[185, 1405]], spd: 0 }],   // フォトスポット脇で立ち止まる
      mobs: 3,
      /* 迂回もできる位置に1つ。左の街路樹を消すと近道になることを学ぶ */
      auras: [{ id: 's1_aura', couple: 0, source: 2 }],
      events: [{
        id: 's1_photo', type: 'photo', target: 3, couple: 0,
        cues: ['撮るよ', '3', '2', '1'], payoff: '証明写真みたい……',
      }],
    },
    {
      id: 2, name: 'クリスマスマーケット', theme: '食べ歩きデート', style: 'market',
      time: 65, worldH: 2200, start: { x: 270, y: 2080 },
      rank: { S: 27000, A: 17500, B: 10000 },
      targets: [
        T('booth', 96, 1930), T('booth', 444, 1870), T('booth', 96, 1680),
        T('wreath', 270, 1540),
        T('booth', 444, 1420), T('booth', 96, 1300),
        T('tree', 444, 1160), T('tree', 96, 1060),
        T('heart', 270, 940),
        T('wreath', 430, 760),
        T('photo', 150, 620),
        T('bigtree', 300, 360),
        T('reindeer', 230, 1180),
      ],
      obstacles: [
        { x: 200, y: 1800, w: 140, h: 44 }, { x: 150, y: 1480, w: 120, h: 44 },
        { x: 300, y: 1230, w: 130, h: 44 }, { x: 180, y: 860, w: 120, h: 44 },
      ],
      guards: [
        { x: 270, y: 1620, type: 'guard', mode: 'patrol', pts: [[120, 1620], [420, 1620]], spd: 42, range: 210, fov: 0.46 },
        { x: 470, y: 520, type: 'cam', dir: 2.6, amp: 0.7, spd: 0.75, range: 240, fov: 0.4 },
      ],
      couples: [{ pts: [[190, 1640], [340, 1562]], spd: 18 }, { pts: [[120, 940]], spd: 0 }],
      mobs: 8,
      auras: [{ id: 's2_aura', couple: 1, source: 8 }],
      investigate: true,
      events: [{
        id: 's2_wreath', type: 'wreath', target: 3, couple: 0,
        cues: ['ここ、いい感じ', '3', '2', '1'], payoff: 'リース、片側休業？',
      }],
    },
    {
      id: 3, name: '夜景レストラン', theme: 'ディナー', style: 'restaurant',
      time: 60, worldH: 2150, start: { x: 270, y: 2040 },
      rank: { S: 32000, A: 21000, B: 11500 },
      targets: [
        T('window', 90, 1860), T('window', 90, 1700), T('window', 450, 1780),
        T('tree', 270, 1560),
        T('window', 450, 1420), T('window', 90, 1340),
        T('photo', 270, 1180),
        T('window', 450, 1020), T('window', 90, 940),
        T('heart', 270, 800),
        T('tree', 450, 640),
        T('bigtree', 240, 380),
        T('reindeer', 270, 1450),
      ],
      obstacles: [
        { x: 175, y: 1900, w: 190, h: 40 }, { x: 175, y: 1620, w: 190, h: 40 },
        { x: 175, y: 1300, w: 190, h: 40 }, { x: 175, y: 980, w: 190, h: 40 },
        { x: 175, y: 700, w: 190, h: 40 },
      ],
      guards: [
        { x: 270, y: 1740, type: 'guard', mode: 'patrol', pts: [[110, 1740], [430, 1740]], spd: 52, range: 200, fov: 0.5 },
        { x: 270, y: 1100, type: 'guard', mode: 'patrol', pts: [[430, 1100], [110, 1100]], spd: 58, range: 200, fov: 0.5 },
        { x: 60, y: 520, type: 'cam', dir: 0.5, amp: 0.8, spd: 0.8, range: 250, fov: 0.42 },
      ],
      couples: [{ pts: [[368, 1472], [424, 1436]], spd: 14 }, { pts: [[380, 880]], spd: 0 }],
      mobs: 5,
      auras: [{ id: 's3_aura', couple: 1, source: 9 }],
      investigate: true,
      events: [{
        id: 's3_window', type: 'toast', target: 4, couple: 0,
        cues: ['乾杯', '3', '2', '1'], payoff: '急に社員食堂だね',
      }],
    },
    {
      id: 4, name: '海辺のイルミ公園', theme: '告白前', style: 'park',
      time: 65, worldH: 2300, start: { x: 270, y: 2180 },
      rank: { S: 37000, A: 24000, B: 13000 },
      targets: [
        T('water', 110, 2020), T('water', 430, 1950),
        T('tunnel', 270, 1780),
        T('heart', 120, 1600), T('water', 420, 1540),
        T('tunnel', 270, 1340),
        T('photo', 110, 1140), T('water', 430, 1080),
        T('tunnel', 270, 880),
        T('photo', 400, 660),
        T('heart', 140, 560),
        T('bigtree', 270, 330),
        T('reindeer', 440, 1760), T('reindeer', 440, 870),
      ],
      obstacles: [{ x: 60, y: 1700, w: 60, h: 60 }, { x: 420, y: 1240, w: 60, h: 60 }, { x: 60, y: 760, w: 60, h: 60 }],
      guards: [
        { x: 270, y: 1660, type: 'guard', mode: 'patrol', pts: [[110, 1660], [430, 1700]], spd: 50, range: 215, fov: 0.48 },
        { x: 270, y: 980, type: 'guard', mode: 'patrol', pts: [[430, 1000], [120, 960]], spd: 56, range: 215, fov: 0.48 },
        { x: 470, y: 420, type: 'cam', dir: 2.4, amp: 0.85, spd: 0.85, range: 250, fov: 0.44 },
      ],
      couples: [
        { pts: [[190, 1900]], spd: 0 },
        { pts: [[360, 1322], [190, 1282]], spd: 17 },
        { pts: [[250, 650]], spd: 0 },
      ],
      mobs: 7,
      /* 後半は2か所。どちらも迂回でき、電源は輪の外から工作できる */
      auras: [{ id: 's4_aura_a', couple: 0, source: 0 }, { id: 's4_aura_b', couple: 2, source: 10 }],
      investigate: true,
      events: [{
        id: 's4_tunnel', type: 'tunnel', target: 5, couple: 1,
        cues: ['せーので入ろう', '3', '2', '1'], payoff: '半分、営業時間外？',
      }],
    },
    {
      id: 5, name: '展望台', theme: 'クライマックス', style: 'tower',
      time: 60, worldH: 2250, start: { x: 270, y: 2130 },
      rank: { S: 38000, A: 24500, B: 13500 },
      targets: [
        T('gift', 100, 1980), T('snowman', 440, 1900),
        T('heart', 270, 1740),
        T('window', 100, 1580), T('window', 440, 1520),
        T('bigtree', 270, 1330),
        T('reindeer', 100, 1120), T('gift', 440, 1050),
        T('photo', 270, 890),
        T('heart', 120, 700), T('window', 440, 660),
        T('bigtree', 270, 400),
        T('reindeer', 270, 1560),
      ],
      obstacles: [
        { x: 190, y: 1860, w: 160, h: 44 }, { x: 190, y: 1180, w: 160, h: 44 }, { x: 190, y: 600, w: 160, h: 44 },
      ],
      guards: [
        { x: 270, y: 1660, type: 'guard', mode: 'patrol', pts: [[100, 1660], [440, 1660]], spd: 62, range: 210, fov: 0.5 },
        { x: 270, y: 1230, type: 'guard', mode: 'patrol', pts: [[440, 1230], [100, 1230]], spd: 66, range: 210, fov: 0.5 },
        { x: 270, y: 820, type: 'guard', mode: 'patrol', pts: [[110, 800], [430, 840]], spd: 60, range: 205, fov: 0.5 },
        { x: 60, y: 300, type: 'cam', dir: 0.6, amp: 0.9, spd: 0.9, range: 260, fov: 0.44 },
      ],
      couples: [{ pts: [[168, 1402], [372, 1358]], spd: 16 }, { pts: [[340, 540]], spd: 0 }],
      mobs: 7,
      auras: [{ id: 's5_aura', couple: 1, source: 10 }],
      investigate: true,
      events: [{
        id: 's5_star', type: 'star', target: 5, couple: 0,
        cues: ['星、見て', '3', '2', '1'], payoff: '主役だけ帰った？',
      }],
    },
    SPECIAL_STAGE,
  ];
  /* 通常ステージ（全制覇の判定に使う）と、全制覇後に出る特別ステージを分ける */
  const NORMAL = STAGES.filter((st) => !st.special);

  /* 無線（本部⇔工作員）。長い会話にはしない */
  const RADIO = {
    start:   '本部「この区画を平日に戻せ」',
    startMe: '「了解。定時までに終わらせる」',
    star:    '「頂点を制圧」',
    clear:   '本部「平常運転を確認」',
    caught:  '本部「身分を説明しろ」／「……設備点検です」',
    allClear: '任務完了。缶コーヒー、一本。',
  };

  /* v3：デートの結末ごとの短文。カップル → 少し遅れて主人公 */
  const OUTCOME_LINE = {
    normal: { couple: '……なんか冷めた',     me: '「平常運転だ」' },
    just:   { couple: null,                 me: '「いい夜になった」' },   // カップルはステージ固有の payoff
    missed: { couple: 'もっとくっつこう？', me: '「なぜ盛り上がる」' },
    late:   { couple: null,                 me: '「……手遅れか」' },     // 親密ポーズのまま
  };
  const AURA_TIP = '光を消せば、オーラが消える';

  /* 称号（上から優先） */
  const AWARDS = [
    { id: 'kei', name: '聖夜の経費削減担当', test: (r) => r.rank === 'S' },
    { id: 'rom', name: 'ロマンス停電主任',   test: (r) => r.just >= 3 },
    { id: 'kai', name: 'ムード破壊一級',     test: (r) => r.maxCombo >= 5 },
    { id: 'hei', name: '平日化スペシャリスト', test: (r) => r.time <= 45 },
    { id: 'tek', name: '照明設備の敵',       test: (r) => r.close >= 3 },
    { id: 'min', name: '見習い工作員',       test: () => true },
  ];

  /* ---------- 素材フック（assets/ に置けば自動で差し替わる） ---------- */
  const ASSET_SRC = {
    title_key:    'assets/title_key.jpg',
    hero:         'assets/hero.jpg',
    player_agent: 'assets/player_agent.png',
    npc_guard:    'assets/npc_guard.png',
    npc_couple:   'assets/npc_couple.png',
    npc_crowd:    'assets/npc_crowd.png',
    prop_tree:      'assets/prop_tree.png',
    prop_bigtree:   'assets/prop_bigtree.png',
    prop_heart:     'assets/prop_heart.png',
    prop_tunnel:    'assets/prop_tunnel.png',
    prop_photospot: 'assets/prop_photospot.png',
    prop_booth:     'assets/prop_booth.png',
    prop_wreath:    'assets/prop_wreath.png',
    prop_window:    'assets/prop_window.png',
    prop_water:     'assets/prop_water.png',
    prop_led:       'assets/prop_led.png',
    /* v2追補（任意）。余白を詰めた素材を置けば自動で使う */
    npc_couple_photo:  'assets/npc_couple_photo.png',
    npc_couple_toast:  'assets/npc_couple_toast.png',
    npc_couple_tunnel: 'assets/npc_couple_tunnel.png',
    npc_couple_star:   'assets/npc_couple_star.png',
    npc_guard_check:   'assets/npc_guard_check.png',
    player_agent_work: 'assets/player_agent_work.png',
    /* v3：感情差分・成否・結果絵・オーラ */
    npc_couple_dejected:    'assets/v3/npc_couple_dejected.png',
    npc_couple_heartbroken: 'assets/v3/npc_couple_heartbroken.png',
    npc_couple_lovey:       'assets/v3/npc_couple_lovey.png',
    npc_couple_breakup:     'assets/v3/npc_couple_breakup.png',
    player_agent_success:   'assets/v3/player_agent_success.png',
    player_agent_failure:   'assets/v3/player_agent_failure.png',
    fx_love_aura_ring:      'assets/v3/fx_love_aura_ring.png',
    fx_love_heart:          'assets/v3/fx_love_heart.png',
    fx_love_aura_break:     'assets/v3/fx_love_aura_break.png',
    /* v4（ChatGPTへ発注中）。置けば自動で使い、無い間は図形描画・既存の絵で代用する */
    prop_reindeer:          'assets/v4/prop_reindeer.png',
    prop_gift:              'assets/v4/prop_gift.png',
    prop_snowman:           'assets/v4/prop_snowman.png',
    prop_bluetree:          'assets/v4/prop_bluetree.png',
    npc_guard_walk_side:    'assets/v4/npc_guard_walk_side.png',
    npc_guard_walk_front:   'assets/v4/npc_guard_walk_front.png',
    npc_guard_walk_back:    'assets/v4/npc_guard_walk_back.png',
    npc_couple_walk_side:   'assets/v4/npc_couple_walk_side.png',
    npc_couple_walk_front:  'assets/v4/npc_couple_walk_front.png',
    npc_couple_walk_back:   'assets/v4/npc_couple_walk_back.png',
    player_agent_back:      'assets/v4/player_agent_back.png',
    bg6: 'assets/v4/bg_stage6.jpg',
    bg1: 'assets/bg_stage1.jpg', bg2: 'assets/bg_stage2.jpg', bg3: 'assets/bg_stage3.jpg',
    bg4: 'assets/bg_stage4.jpg', bg5: 'assets/bg_stage5.jpg',
  };

  /* スプライトの不透明部分の外接矩形 [x, y, w, h]。
     素材ごとの余白に左右されず、指定した表示サイズで足元を接地させるために事前計測してある。 */
  const TRIM = {
    npc_couple: [175, 4, 289, 508],
    npc_crowd: [179, 4, 154, 508],
    npc_guard: [164, 4, 183, 508],
    player_agent: [136, 0, 239, 512],
    prop_bigtree: [42, 16, 557, 987],
    prop_booth: [32, 6, 592, 505],
    prop_heart: [47, 17, 425, 483],
    prop_led: [77, 19, 365, 478],
    prop_photospot: [69, 4, 374, 508],
    prop_tree: [27, 4, 457, 508],
    prop_tunnel: [101, 4, 822, 764],
    prop_water: [92, 35, 308, 181],
    prop_window: [74, 6, 373, 504],
    prop_wreath: [78, 7, 363, 495],
    /* v3人物は「体の高さ744px（y=12〜756）」を共通基準にする。
       頭を下げた差分でも拡大率が変わらず、頭身が揃う */
    npc_couple_dejected: [13, 12, 532, 744],
    npc_couple_heartbroken: [13, 12, 520, 744],
    npc_couple_lovey: [13, 12, 440, 744],
    npc_couple_breakup: [12, 12, 622, 744],
    player_agent_success: [13, 12, 341, 744],
    player_agent_failure: [13, 12, 371, 744],
    /* v4歩行：alpha > 12 の外接矩形。全方向の足元を同じ基準に揃える */
    npc_guard_walk_side: [103, 4, 306, 508],
    npc_guard_walk_front: [145, 4, 221, 508],
    npc_guard_walk_back: [151, 4, 210, 508],
    npc_couple_walk_side: [131, 4, 377, 508],
    npc_couple_walk_front: [164, 4, 311, 508],
    npc_couple_walk_back: [165, 4, 309, 508],
  };
  /* 結果・エンディング絵（DOMで表示。縦画面では contain の横長パネル） */
  const PANEL_SRC = {
    success: 'assets/v3/result_mission_success.jpg',
    failure: 'assets/v3/result_mission_failure.jpg',
    ending:  'assets/v3/ending_all_clear_breakup.jpg',
    revival: 'assets/v4/story_revival.jpg',          // 発注中。無い間はカップルの立ち絵と青い背景で見せる
    special: 'assets/v4/result_special_clear.jpg',   // 発注中。無い間は通常の成功絵
  };

  /* 工作対象の種類 → 素材キー / 表示高さ(px) */
  const PROP_KEY = {
    tree: 'prop_tree', bigtree: 'prop_bigtree', heart: 'prop_heart', tunnel: 'prop_tunnel',
    photo: 'prop_photospot', booth: 'prop_booth', wreath: 'prop_wreath', window: 'prop_window',
    water: 'prop_water', led: 'prop_led',
    reindeer: 'prop_reindeer', gift: 'prop_gift', snowman: 'prop_snowman', bluetree: 'prop_bluetree',
  };
  const PROP_H = {
    tree: 104, bigtree: 186, heart: 98, tunnel: 208, photo: 96,
    booth: 84, wreath: 92, window: 88, water: 46, led: 96,
    reindeer: 118, gift: 72, snowman: 86, bluetree: 112,
  };
  const CHAR_H = {
    player_agent: 64, npc_guard: 62, npc_couple: 66, npc_crowd: 54,
    /* 追補ポーズは腕の上げ方・しゃがみで全身の高さが変わるので、体の大きさが揃うよう個別に指定 */
    npc_couple_photo: 72, npc_couple_toast: 66, npc_couple_tunnel: 70, npc_couple_star: 74,
    npc_guard_check: 62, player_agent_work: 54,
    npc_couple_dejected: 66, npc_couple_heartbroken: 66, npc_couple_lovey: 66, npc_couple_breakup: 66,
    player_agent_success: 64, player_agent_failure: 64,
    npc_guard_walk_side: 62, npc_guard_walk_front: 62, npc_guard_walk_back: 62,
    npc_couple_walk_side: 66, npc_couple_walk_front: 66, npc_couple_walk_back: 66, player_agent_back: 64,
  };
  /* 歩く向きごとの絵。[素材キー, 絵が向いている左右（1=右, -1=左, 0=反転なし）]。fb = 向きの絵が無いときの代用 */
  const WALK = {
    guard:  { side: ['npc_guard_walk_side', 1], front: ['npc_guard_walk_front', 0], back: ['npc_guard_walk_back', 0], fb: ['npc_guard_check', -1] },
    couple: { side: ['npc_couple_walk_side', 1], front: ['npc_couple_walk_front', 0], back: ['npc_couple_walk_back', 0], fb: ['npc_couple_tunnel', -1] },
    player: { side: ['player_agent', 1], front: ['player_agent', 1], back: ['player_agent_back', 1], fb: ['player_agent', 1] },
  };
  /* カップルの結末 → 差分素材 */
  const MOOD_KEY = {
    dejected: 'npc_couple_dejected', heartbroken: 'npc_couple_heartbroken',
    lovey: 'npc_couple_lovey', breakup: 'npc_couple_breakup',
  };
  /* イベント種別 → 予告ポーズ素材（未納品なら既存の立ち絵で代用） */
  const POSE_KEY = {
    photo: 'npc_couple_photo', wreath: 'npc_couple_photo',
    toast: 'npc_couple_toast', tunnel: 'npc_couple_tunnel', star: 'npc_couple_star',
  };

  const IMG = {};
  const VAR = { cold: {}, dark: {} };   /* 工作後の見た目（冷白色化／消灯）を事前合成 */

  function makeVariant(im, mode) {
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = mode === 'cold' ? 'rgba(188,214,242,.66)' : 'rgba(24,34,58,.80)';
    g.fillRect(0, 0, c.width, c.height);
    if (mode === 'cold') { g.fillStyle = 'rgba(20,27,48,.18)'; g.fillRect(0, 0, c.width, c.height); }
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  function loadAssets() {
    Object.keys(ASSET_SRC).forEach((k) => {
      const im = new Image();
      im.onload = () => {
        IMG[k] = im;
        if (k.indexOf('prop_') === 0) {
          VAR.cold[k] = makeVariant(im, 'cold');
          VAR.dark[k] = makeVariant(im, 'dark');
        }
        if (k === 'title_key' || k === 'hero') applyTitleArt();
      };
      im.onerror = () => { /* 未納品：プロシージャル描画にフォールバック */ };
      im.src = ASSET_SRC[k];
    });
  }
  function applyTitleArt() {
    const src = IMG.title_key ? ASSET_SRC.title_key : IMG.hero ? ASSET_SRC.hero : null;
    if (!src) return;
    const a = $('titleArt');
    a.style.backgroundImage = 'url("' + src + '")';
    a.style.backgroundPosition = IMG.title_key ? 'center top' : '52% 18%';
    a.classList.remove('none');
  }

  /* 切り抜き矩形を使って、足元を (cx, by) に合わせて描く */
  function drawTrimmed(key, cx, by, targetH, variant) {
    const im = IMG[key];
    if (!im) return false;
    const t = TRIM[key] || [0, 0, im.width, im.height];
    const src = (variant && VAR[variant][key]) || im;
    const s = targetH / t[3];
    ctx.drawImage(src, t[0], t[1], t[2], t[3], cx - t[2] * s / 2, by - targetH, t[2] * s, targetH);
    return true;
  }

  /* ---------- セーブ ---------- */
  const SKEY = 'xmas-funsai-v1';
  const save = {
    unlocked: 1,
    best: {},        // ルール版1の記録。読み取り専用で保持する
    best2: {},       // ルール版2の記録。読み取り専用で保持する
    best3: {},       // ルール版3の記録。読み取り専用で保持する
    best4: {},       // ルール版4（今回）の記録
    allClear2: false,                 // v2の旧フラグ（読み取りのみ）
    allClearEndingUnlocked: false,    // 全ステージ制覇の破局エンディング
    allClearEndingSeen: false,
    specialUnlocked: false,           // 全制覇後の特別ステージ「青の回廊」
    specialSeen: false,
    bgm: true, se: true, hap: true,
    lefty: false,    // v2までの左右交換。v3では controls へ移行済み（値は残す）
    lite: false, awards: {},
    controls: null,  // { v, mode:'stick'|'drag', preset:'br'|'bc'|'bl'|'custom', stick:[nx,ny], btn:[nx,ny] }
    tips: {},        // 1回だけの説明を見たか
    proto: {},       // 操作方式ごとの比較メモ（端末内だけ）
  };
  const CONTROL_MODES = ['stick', 'drag'];
  const PRESETS = ['br', 'bc', 'bl', 'custom'];

  /* 記録はルール版ごとに分ける。旧版の点数と新版の点数は混ぜない */
  function bests() { return save.best4; }
  /* クリアの証跡。旧版の記録も「そのステージをクリアした」ことの証拠として使う */
  function cleared(id) { return !!(save.best[id] || save.best2[id] || save.best3[id] || save.best4[id]); }
  function allCleared() { return NORMAL.every((st) => cleared(st.id)); }

  function loadSave() {
    let had = false;
    try {
      const raw = localStorage.getItem(SKEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && typeof o === 'object') { Object.assign(save, o); had = true; }
      }
    } catch (e) { /* プライベートモード・JSON破損：既定値のまま続行 */ }
    /* 壊れている項目だけを既定値へ戻す（進行や記録を巻き込まない） */
    ['best', 'best2', 'best3', 'best4', 'awards', 'tips', 'proto'].forEach((k) => {
      if (!save[k] || typeof save[k] !== 'object' || Array.isArray(save[k])) save[k] = {};
    });
    ['bgm', 'se', 'hap', 'lite'].forEach((k) => { if (typeof save[k] !== 'boolean') save[k] = k !== 'lite'; });
    save.unlocked = Math.max(1, Math.min(NORMAL.length, save.unlocked | 0));
    save.controls = migrateControls(save.controls, had, save.lefty);
    /* 全制覇の解放は、5ステージすべてのクリア証跡がある場合だけ。起動時に強制再生はしない */
    if (!save.allClearEndingUnlocked && allCleared()) save.allClearEndingUnlocked = true;
    save.allClearEndingUnlocked = !!save.allClearEndingUnlocked;
    save.allClearEndingSeen = !!save.allClearEndingSeen;
    /* 特別ステージは全制覇と同時に出現する（既に全制覇済みのセーブにも出す） */
    if (save.allClearEndingUnlocked) save.specialUnlocked = true;
    save.specialUnlocked = !!save.specialUnlocked;
    save.specialSeen = !!save.specialSeen;
  }

  /* 旧「左利き」の移行。名前ではなく、旧コードが実際に移動へ割り当てていた側を引き継ぐ：
     lefty=false → 画面左半分がスティック → 左下 / lefty=true → 右半分 → 右下。
     新規プレイヤーは右下から始める。移行済み・変更済みの配置は上書きしない */
  function migrateControls(c, hadSave, lefty) {
    if (c && typeof c === 'object' && c.v === 1) {
      const out = {
        v: 1,
        mode: CONTROL_MODES.indexOf(c.mode) >= 0 ? c.mode : 'stick',
        preset: PRESETS.indexOf(c.preset) >= 0 ? c.preset : 'br',
        stick: validPt(c.stick) ? c.stick : null,
        btn: validPt(c.btn) ? c.btn : null,
        from: c.from || null,
      };
      if (out.preset === 'custom' && (!out.stick || !out.btn)) out.preset = 'br';
      return out;
    }
    return {
      v: 1, mode: 'stick',
      preset: hadSave ? (lefty ? 'br' : 'bl') : 'br',
      stick: null, btn: null,
      from: hadSave ? ('v2-lefty-' + (lefty ? 'on' : 'off')) : 'new',
    };
  }
  function validPt(a) {
    return Array.isArray(a) && a.length === 2 && a.every((v) => typeof v === 'number' && v >= 0 && v <= 1);
  }
  function putSave() {
    try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) { /* 保存不可でもプレイは継続 */ }
  }

  /* ---------- オーディオ（合成音：音声素材ゼロで成立させる） ---------- */
  const Audio2 = (function () {
    let ac = null, master = null, seBus = null, bgmBus = null, timer = null, step = 0, nextT = 0;
    let intensity = 1; // 1=ロマンチック → 0=無機質
    function ctx() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
        seBus = ac.createGain(); seBus.gain.value = 0.5; seBus.connect(master);
        bgmBus = ac.createGain(); bgmBus.gain.value = 0.28; bgmBus.connect(master);
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(freq, dur, type, gain, when, glideTo) {
      const c = ctx(); if (!c || !save.se) return;
      const t = when || c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain || 0.3, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(seBus); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, gain, hp) {
      const c = ctx(); if (!c || !save.se) return;
      const n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = c.createBufferSource(); s.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 1200;
      const g = c.createGain(); g.gain.value = gain || 0.25;
      s.connect(f); f.connect(g); g.connect(seBus); s.start();
    }
    const se = {
      ready()  { tone(1180, 0.05, 'sine', 0.08); },
      work()   { noise(0.07, 0.18, 2200); tone(190, 0.07, 'square', 0.12); },
      success(combo) {
        const base = 560 * Math.pow(1.09, Math.min(combo, 8) - 1);
        noise(0.05, 0.3, 2600);
        tone(base, 0.09, 'square', 0.16);
        tone(base * 1.5, 0.16, 'sine', 0.2);
      },
      just() {
        const c = ctx(); if (!c) return;
        [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.32, 'sine', 0.22, c.currentTime + i * 0.045));
      },
      combo(n) { tone(660 + n * 90, 0.12, 'triangle', 0.16); },
      alert()  { tone(880, 0.08, 'sawtooth', 0.1); tone(660, 0.1, 'sawtooth', 0.1, (ac ? ac.currentTime : 0) + 0.1); },
      fail() {
        const c = ctx(); if (!c) return;
        tone(420, 0.5, 'sawtooth', 0.22, c.currentTime, 90); noise(0.35, 0.18, 400);
      },
      clear() {
        const c = ctx(); if (!c) return;
        [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.45, 'triangle', 0.22, c.currentTime + i * 0.085));
      },
      ui() { tone(520, 0.05, 'sine', 0.1); },
      /* 予告のカウント。k=0は開始、k=4は基準時刻 */
      cue(k) { tone(k >= 4 ? 1320 : 880 + k * 60, k >= 4 ? 0.16 : 0.07, 'sine', k >= 4 ? 0.16 : 0.1); },
      shutter() { noise(0.05, 0.3, 3000); tone(2100, 0.05, 'square', 0.1); },
      notice() { tone(520, 0.1, 'triangle', 0.12); tone(700, 0.12, 'triangle', 0.1, (ac ? ac.currentTime : 0) + 0.1); },
      /* v3：落胆（下がる2音）／親密化（甘い和音）／オーラ消滅／破局 */
      timeUp() {
        const c = ctx(); if (!c) return;
        [880, 1175, 1568].forEach((f, i) => tone(f, 0.18, 'square', 0.08, c.currentTime + 0.05 + i * 0.06));
      },
      deflate() {
        const c = ctx(); if (!c) return;
        tone(620, 0.22, 'triangle', 0.12, c.currentTime + 0.12, 300);
      },
      lovey() {
        const c = ctx(); if (!c) return;
        [784, 988, 1175].forEach((f, i) => tone(f, 0.5, 'sine', 0.08, c.currentTime + i * 0.07));
      },
      auraBreak() {
        const c = ctx(); if (!c) return;
        noise(0.12, 0.16, 4200);
        [1760, 1320, 990].forEach((f, i) => tone(f, 0.12, 'sine', 0.08, c.currentTime + i * 0.05));
      },
      ending() {
        const c = ctx(); if (!c) return;
        [392, 311, 262, 196].forEach((f, i) => tone(f, 1.4, 'triangle', 0.1, c.currentTime + 0.6 + i * 0.35));
      },
    };
    /* BGM：ロマンチックなベル → 工作が進むほど楽器が減り無機質になる */
    const CHORDS = [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 5], [-5, -1, 2, 7]];
    function noteHz(semi) { return 261.63 * Math.pow(2, semi / 12); }
    function schedule() {
      const c = ctx(); if (!c) return;
      const spb = 60 / 104 / 2; // 8分
      while (nextT < c.currentTime + 0.25) {
        const bar = Math.floor(step / 8) % CHORDS.length;
        const ch = CHORDS[bar];
        const g = bgmBus;
        if (save.bgm) {
          // ベルのアルペジオ（intensity 高いときだけ）
          if (intensity > 0.34) {
            const semi = ch[step % ch.length] + 12;
            bell(noteHz(semi), nextT, 0.5 * intensity, g);
          }
          // パッド（さらに高いときだけ）
          if (intensity > 0.66 && step % 8 === 0) pad(noteHz(ch[0]), nextT, g);
          // ベース
          if (step % 4 === 0) {
            const o = c.createOscillator(), gg = c.createGain();
            o.type = intensity > 0.34 ? 'triangle' : 'square';
            o.frequency.value = noteHz(ch[0] - 24);
            gg.gain.setValueAtTime(0.0001, nextT);
            gg.gain.exponentialRampToValueAtTime(0.18, nextT + 0.02);
            gg.gain.exponentialRampToValueAtTime(0.0001, nextT + 0.42);
            o.connect(gg); gg.connect(g); o.start(nextT); o.stop(nextT + 0.45);
          }
          // 無機質モードの点検音
          if (intensity <= 0.34 && step % 2 === 0) {
            const o = c.createOscillator(), gg = c.createGain();
            o.type = 'square'; o.frequency.value = 1400;
            gg.gain.setValueAtTime(0.0001, nextT);
            gg.gain.exponentialRampToValueAtTime(0.03, nextT + 0.005);
            gg.gain.exponentialRampToValueAtTime(0.0001, nextT + 0.05);
            o.connect(gg); gg.connect(g); o.start(nextT); o.stop(nextT + 0.06);
          }
        }
        nextT += spb; step++;
      }
    }
    function bell(f, t, amp, out) {
      const c = ac; const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13 * amp + 0.0001, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.6);
    }
    function pad(f, t, out) {
      const c = ac; const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f / 2;
      fl.type = 'lowpass'; fl.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + 1.9);
      o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + 2);
    }
    return {
      se: se,
      unlock() { ctx(); },
      startBgm() {
        const c = ctx(); if (!c) return;
        stopBgm(); step = 0; nextT = c.currentTime + 0.08;
        timer = setInterval(schedule, 60);
      },
      stopBgm: stopBgm,
      setIntensity(v) { intensity = clamp(v, 0, 1); },
      duck(on) { if (bgmBus && ac) bgmBus.gain.setTargetAtTime(on ? 0.08 : 0.28, ac.currentTime, 0.08); },
    };
    function stopBgm() { if (timer) { clearInterval(timer); timer = null; } }
  })();

  /* アプリ版（Capacitor）では Haptics プラグイン。WebView は navigator.vibrate が効かないことがある */
  const nativeHap = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
    && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
  function haptic(pattern) {
    if (!save.hap) return;
    if (nativeHap) {
      // [振動, 休み, 振動, …] を順に鳴らす
      const seq = Array.isArray(pattern) ? pattern : [pattern];
      let at = 0;
      seq.forEach((ms, i) => {
        if (i % 2 === 0) setTimeout(() => { nativeHap.vibrate({ duration: ms }).catch(() => {}); }, at);
        at += ms;
      });
      return;
    }
    if (!navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* 非対応端末では無視 */ }
  }

  /* ---------- 描画ユーティリティ ---------- */
  const cv = $('view'), ctx = cv.getContext('2d');
  let dpr = 1;
  function resize() {
    const r = $('frame').getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, save.lite ? 1.5 : 2.5);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    document.documentElement.style.setProperty('--u', (r.width / W) + 'px');
    if (ui.btnSab) applyLayout();
  }

  /* 発光スプライト（毎フレームのグラデ生成を避ける） */
  const glowSprites = {};
  function makeGlow(color) {
    const s = document.createElement('canvas'); s.width = s.height = 128;
    const g = s.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, color); rg.addColorStop(0.35, color.replace('1)', '0.45)'));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    return s;
  }
  function initGlow() {
    glowSprites.warm = makeGlow('rgba(255,192,105,1)');
    glowSprites.cold = makeGlow('rgba(220,238,255,1)');
    glowSprites.red  = makeGlow('rgba(255,74,92,1)');
    glowSprites.green = makeGlow('rgba(120,255,170,1)');
    glowSprites.blue = makeGlow('rgba(80,140,255,1)');
  }
  function glow(kind, x, y, r, a) {
    if (save.lite && r < 40) return;
    ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprites[kind], x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function dot(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const COL = {
    night: '#0A0E1C', asphalt: '#141B30', walk: '#1B2440', dark: '#0B1120',
  };
  const WARM = '#FFC069', COLD = '#DCEEFF', RED = '#FF4A5C';

  /* ---------- ゲーム状態 ---------- */
  const G = {
    state: 'title',    // title/select/ready/playing/pause/finishing/fail/result
    stage: null, stageIdx: 0,
    time: 0, left: 0, mood: 100, score: 0,
    combo: 0, comboT: 0, maxCombo: 0, just: 0, close: 0,
    graceOn: false,    // コンボ時計を止めている最中か（表示用）
    detect: 0, seenT: 0, closeFlag: false,
    targets: [], guards: [], couples: [], crowd: [], obstacles: [], events: [],
    player: { x: 270, y: 800, vx: 0, vy: 0, face: -Math.PI / 2, anim: 0 },
    cam: { y: 0, shake: 0, zoom: 1 },
    action: null, candidate: null,
    snow: [], slowmo: 0, flash: 0, tutorialStep: 0, doneCount: 0,
    pendingWin: false, // 同一フレームで失敗が成立したら勝利より失敗を優先するための保留
    finishT: 0, result: null, radio: '', radioT: 0,
    auras: [],
    lines: [],         // 遅れて出す主人公の一言 { at, text }
    failT: 0, failInfo: null,
    ending: null,      // 破局エンディング再生中 { t, replay, done }
    blocked: null,     // 近いのにオーラで工作位置へ行けない対象
    cards: {},         // 反応カードを出したか（1プレイ1回）
    metrics: null,     // 操作比較メモ
    tip: '', tipT: 0,  // 1回だけの短い説明
    cardT: 0,
    totalW: 1, remainW: 1, bonusCount: 0,
    mobs: [],          // 通行カップル
  };

  const input = { mx: 0, my: 0, active: false, sabQueued: false, keys: {} };

  /* ---------- ステージ構築 ---------- */
  function buildStage(idx) {
    const st = STAGES[idx];
    G.stage = st; G.stageIdx = idx;
    G.time = 0; G.left = st.time; G.mood = 100; G.score = 0;
    G.combo = 0; G.comboT = 0; G.maxCombo = 0; G.just = 0; G.close = 0;
    G.detect = 0; G.seenT = 0; G.closeFlag = false;
    G.action = null; G.candidate = null; G.slowmo = 0; G.doneCount = 0;
    G.tutorialStep = st.tutorial ? 1 : 0;

    G.pendingWin = false; G.finishT = 0; G.result = null; G.radio = ''; G.radioT = 0; G.graceOn = false;
    G.lines = []; G.failT = 0; G.failInfo = null; G.ending = null; G.blocked = null; G.cards = {};
    G.tip = ''; G.tipT = 0; G.cardT = 0; G.bonusCount = 0;
    if (ui.reactCard) ui.reactCard.classList.remove('on');
    G.metrics = {
      mode: save.controls.mode, firstMove: null, firstWork: null,
      cancels: 0, auraBumps: 0, bumping: false,
    };

    G.targets = st.targets.map((t, i) => ({
      i: i, type: t.type, x: t.x, y: t.y, def: SAB[t.type], done: false, glowPhase: Math.random() * 6.28, t: 0,
      w: SAB[t.type].mood,  // 重み。聖夜ムード = 残っているイルミの重みの割合
      mood: 0,              // 下で割合（%）に直す
      justGiven: false,   // 同じ対象からジャストを二重取得させない
      graceUsed: 0,       // コンボ待機猶予の使用量（1プレイ1対象あたり）
      evt: null,          // 紐付いたイベント
      aura: null,         // このライトが電源になっているオーラ
      effOff: false,      // オーラ電源は種別の見た目に関わらず「消灯」で表す
    }));
    G.totalW = G.targets.reduce((a, t) => a + t.w, 0);
    G.remainW = G.totalW;
    G.targets.forEach((t) => { t.mood = 100 * t.w / G.totalW; });
    G.obstacles = (st.obstacles || []).map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
    G.guards = (st.guards || []).map((g, i) => ({
      i: i,
      x: g.x, y: g.y, type: g.type, mode: g.mode || 'sweep',
      dir: g.dir !== undefined ? g.dir : Math.PI / 2,
      amp: g.amp || 0.6, spd: g.spd || 0.7, range: g.range, fov: g.fov,
      pts: g.pts, leg: 0, legT: 0, base: g.dir !== undefined ? g.dir : Math.PI / 2, hot: 0,
      /* 調査行動。巡回データは書き換えず、復帰先を別に持つ */
      inv: 'patrol', invT: 0, invAt: null, invLook: null, invPath: null, invCool: 0,
      homeLeg: 0, homeLegT: 0, homeX: g.x, homeY: g.y, bubble: '', bubbleT: 0,
    }));
    G.couples = (st.couples || []).map((c, i) => ({
      i: i,
      pts: c.pts, spd: c.spd, t: Math.random(), dirSign: 1,
      x: c.pts[0][0], y: c.pts[0][1],
      next: 3 + i * 2 + Math.random() * 3, line: '', lineT: 0,
      evt: null,      // 紐付いたイベント。紐付いたカップルには旧ハート判定を重ねない
      pose: 0,        // 予告中の構え（0〜1）
      fixed: c.pts.length === 1,   // 1点だけならその場に留まる
      mood: null,     // v3：結末の表情 dejected / heartbroken / lovey（確定後は維持）
      aura: null,
    }));

    /* デートイベント：ステージデータのIDを実在の対象・カップルへ解決する */
    G.events = [];
    (st.events || []).forEach((def) => {
      const tg = G.targets[def.target], cp = G.couples[def.couple];
      if (!tg || !cp) return;                       // 解決できない定義は起動させない
      const ev = {
        def: def, target: tg, couple: cp,
        phase: 'idle',     // idle → windup → beat → resolved（v3では再予告しない）
        startAt: 0, t: 0, cue: '',
        outcome: null,     // pre / normal / just / missed
      };
      tg.evt = ev; cp.evt = ev;
      G.events.push(ev);
    });

    /* オーラ：カップル・電源ライト・半径をデータで固定する（毎フレーム最寄りの灯りを探さない） */
    G.auras = [];
    (st.auras || []).forEach((def) => {
      const cp = G.couples[def.couple], src = G.targets[def.source];
      if (!cp || !src) return;
      const off = def.offset || [0, -6];
      const a = {
        id: def.id, couple: cp, source: src,
        x: cp.x + off[0], y: cp.y + off[1],
        r: def.radius || CFG.aura.radius,
        on: true, breakT: 0, linkT: 0, seen: false, ph: Math.random() * 6.28,
      };
      cp.aura = a; src.aura = a; src.effOff = true;
      G.auras.push(a);
    });
    G.mobs = buildMobs(st);
    G.player.x = st.start.x; G.player.y = st.start.y; G.player.vx = G.player.vy = 0; G.player.face = -Math.PI / 2;
    G.cam.y = clamp(G.player.y - H * 0.58, 0, st.worldH - H); G.cam.shake = 0; G.cam.zoom = 1;

    G.snow = [];
    const n = save.lite ? 26 : 54;
    for (let i = 0; i < n; i++) G.snow.push({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 1.9, s: 12 + Math.random() * 26, d: Math.random() * 6.28 });

    Audio2.setIntensity(1);
    hint('');   // 前のステージのチュートリアル表示を持ち越さない
    ui.stageName.textContent = (st.special ? 'SPECIAL' : 'STAGE ' + st.id) + '　' + st.name;
    updateMoodUI(); updateTimeUI();
  }

  /* 通行カップルを置く。対象・オーラ・カップル・什器・開始地点と重ならない場所だけに（決定的な乱数で毎回同じ配置） */
  function buildMobs(st) {
    const rnd = mulberry(st.id * 7919 + 11);
    const out = [];
    for (let tries = 0; out.length < (st.mobs || 0) && tries < 800; tries++) {
      const x = 70 + rnd() * 400, y = 240 + rnd() * (st.worldH - 480);
      const walker = rnd() < 0.5;
      const span = walker ? 80 + rnd() * 70 : 0;
      const x0 = clamp(x - span / 2, 60, W - 60), x1 = clamp(x + span / 2, 60, W - 60);
      const idle = rnd() < 0.5 ? 'npc_couple' : 'npc_couple_lovey';
      const dir = rnd() < 0.5 ? -1 : 1, spd = 16 + rnd() * 8, wait = rnd() * 2, step = rnd() * 6;
      if (!mobSpotOk(x0, x1, y, st, out)) continue;
      out.push({ x: (x0 + x1) / 2, y: y, x0: x0, x1: x1, dir: dir, spd: walker ? spd : 0, wait: wait,
                 idleKey: idle, mood: null, step: step, vx: 0, sighT: 0 });
    }
    return out;
  }
  function mobSpotOk(x0, x1, y, st, list) {
    const segD = (px, py) => Math.hypot(px < x0 ? x0 - px : px > x1 ? px - x1 : 0, py - y);
    if (segD(st.start.x, st.start.y) < 170) return false;
    for (let i = 0; i < G.targets.length; i++) if (segD(G.targets[i].x, G.targets[i].y) < 70) return false;
    for (let i = 0; i < G.auras.length; i++) if (segD(G.auras[i].x, G.auras[i].y) < G.auras[i].r + 44) return false;
    for (let i = 0; i < G.couples.length; i++) if (segD(G.couples[i].x, G.couples[i].y) < 80) return false;
    for (let i = 0; i < G.obstacles.length; i++) {
      const o = G.obstacles[i];
      if (y > o.y - 40 && y < o.y + o.h + 30 && x1 > o.x - 30 && x0 < o.x + o.w + 30) return false;
    }
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (Math.abs(m.y - y) < 70 && x1 > m.x0 - 60 && x0 < m.x1 + 60) return false;
    }
    return true;
  }
  /* 近くのイルミが消えると、通行カップルもその場で冷める */
  function mobsReact(t) {
    for (let i = 0; i < G.mobs.length; i++) {
      const m = G.mobs[i];
      if (m.mood || Math.hypot(m.x - t.x, m.y - t.y) > CFG.mobReactR) continue;
      m.mood = 'dejected'; m.vx = 0; m.sighT = 1.6;
    }
  }

  /* ---------- 視線・遮蔽 ---------- */
  function segRect(x1, y1, x2, y2, r) {
    // 線分と矩形の交差（分離軸の簡易版）
    const minx = Math.min(x1, x2), maxx = Math.max(x1, x2), miny = Math.min(y1, y2), maxy = Math.max(y1, y2);
    if (maxx < r.x || minx > r.x + r.w || maxy < r.y || miny > r.y + r.h) return false;
    const dx = x2 - x1, dy = y2 - y1;
    const c = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const s = Math.sign(dx * (c[i][1] - y1) - dy * (c[i][0] - x1));
      if (s !== 0) { if (sign === 0) sign = s; else if (s !== sign) return true; }
    }
    return false;
  }
  function segCircle(x1, y1, x2, y2, cx, cy, rad) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
    t = clamp(t, 0, 1);
    return dist2(x1 + dx * t, y1 + dy * t, cx, cy) < rad * rad;
  }
  function blocked(ax, ay, bx, by) {
    for (let i = 0; i < G.obstacles.length; i++) if (segRect(ax, ay, bx, by, G.obstacles[i])) return true;
    for (let i = 0; i < G.mobs.length; i++) if (segCircle(ax, ay, bx, by, G.mobs[i].x, G.mobs[i].y - 20, 18)) return true;
    return false;
  }

  /* ---------- 更新 ---------- */
  /* 順序：時間切れ → 移動 → 監視（発見） → 工作の進行と完了 → デート → オーラ → NPC → 勝利の確定。
     敗北条件は工作完了より先に確定させ、敗北後に工作成功を後付けしない */
  function update(dt) {
    const st = G.stage;
    G.time += dt;

    /* --- 残り時間 --- */
    G.left -= dt;
    if (G.left <= 0) { G.left = 0; return fail('time'); }

    /* --- プレイヤー移動（スティック・直接ドラッグ・キーボードで共通の処理） --- */
    const p = G.player;
    if (G.action && actionCancelIntent()) { cancelAction(); G.metrics.cancels++; }
    const mv = moveIntent(dt);
    if (!G.action && mv.active) {
      const bumped = movePlayer(mv.dx, mv.dy);
      if (bumped && !G.metrics.bumping) G.metrics.auraBumps++;
      G.metrics.bumping = bumped;
      p.face = Math.atan2(mv.dy, mv.dx);
      p.anim += dt * 11;
      if (G.metrics.firstMove === null) G.metrics.firstMove = G.time;
    } else {
      p.anim += dt * 2;
      G.metrics.bumping = false;
    }
    p.vx = dt > 0 ? mv.dx / dt : 0; p.vy = dt > 0 ? mv.dy / dt : 0;

    /* --- 工作対象のロック（オートエイム。オーラ越しの位置合わせはしない） --- */
    G.candidate = pickTarget();

    /* --- 監視（発見ゲージ） --- */
    let seen = false;
    for (let i = 0; i < G.guards.length; i++) {
      const g = G.guards[i];
      const gx0 = g.x, gy0 = g.y;
      if (g.bubbleT > 0) g.bubbleT -= dt;
      if (g.invCool > 0) g.invCool -= dt;
      if (g.type === 'cam' || g.mode === 'sweep') {
        g.dir = g.base + Math.sin(G.time * g.spd) * g.amp;
      } else if (g.inv !== 'patrol') {
        updateInvestigate(g, dt);
      } else {
        g.legT += dt;
        const a = g.pts[g.leg], b = g.pts[(g.leg + 1) % g.pts.length];
        const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const k = clamp(g.legT * g.spd / seg, 0, 1);
        g.x = lerp(a[0], b[0], k); g.y = lerp(a[1], b[1], k);
        g.dir = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (k >= 1) { g.leg = (g.leg + 1) % g.pts.length; g.legT = 0; }
      }
      /* 実際に動いた向きと速さ（絵の向き・歩幅に使う） */
      if (dt > 0) { g.vx = (g.x - gx0) / dt; g.vy = (g.y - gy0) / dt; g.step = (g.step || 0) + Math.hypot(g.x - gx0, g.y - gy0) * 0.09; }
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      let hit = false;
      if (d < g.range) {
        let ang = Math.atan2(p.y - g.y, p.x - g.x) - g.dir;
        while (ang > Math.PI) ang -= 6.2832; while (ang < -Math.PI) ang += 6.2832;
        /* オーラは視線を遮らない（発見判定を勝手に安全化しない） */
        if (Math.abs(ang) < g.fov && !blocked(g.x, g.y, p.x, p.y)) hit = true;
      }
      g.hot = hit ? Math.min(1, g.hot + dt * 5) : Math.max(0, g.hot - dt * 3);
      if (hit) { seen = true; G.detect += (46 + (1 - d / g.range) * 48) * dt; }
    }
    if (seen) {
      G.seenT = 0;
      if (G.detect > 60 && Math.random() < dt * 2.2) { Audio2.se.alert(); haptic([12, 60, 12]); }
    } else {
      G.seenT += dt;
      if (G.seenT > DETECT_RECOVER_DELAY) G.detect -= DETECT_RECOVER_RATE * dt;
    }
    G.detect = clamp(G.detect, 0, DETECT_MAX);
    if (G.detect >= 80) G.closeFlag = true;
    if (G.closeFlag && G.detect < 25) { G.closeFlag = false; G.close++; }
    if (G.detect >= DETECT_MAX) return fail('seen');

    /* --- 工作アクション（完了時刻はフレームの区切りに依存させない） --- */
    if (G.action) {
      const a = G.action;
      if (a.phase === 'snap') {
        a.t += dt;
        const k = clamp(a.t / SNAP_TIME, 0, 1);
        p.x = lerp(a.fx, a.ax, k); p.y = lerp(a.fy, a.ay, k);
        resolveAuras(p);                        // 吸着中も衝突は有効
        p.face = Math.atan2(a.target.y - p.y, a.target.x - p.x);
        if (k >= 1) {
          const extra = a.t - SNAP_TIME;        // 余った時間は作業に繰り越す
          a.phase = 'work'; a.t = extra; Audio2.se.work();
        }
      } else if (a.phase === 'work') a.t += dt;
      if (a.phase === 'work') {
        ui.sabRing.style.setProperty('--deg', (a.t / a.dur * 360) + 'deg');
        if (a.t >= a.dur) doSabotage(a.target, a.t - a.dur);
      }
    }

    /* --- デート（工作完了の後に進めることで、期限ちょうどの完了を成功に含める） --- */
    updateEvents(dt);
    updateAuras(dt);

    /* --- カップルNPC --- */
    for (let i = 0; i < G.couples.length; i++) {
      const c = G.couples[i];
      const cx0 = c.x, cy0 = c.y;
      if (!c.fixed) {
        c.t += dt * c.spd / 100 * c.dirSign;
        if (c.t > 1) { c.t = 1; c.dirSign = -1; } else if (c.t < 0) { c.t = 0; c.dirSign = 1; }
        c.x = lerp(c.pts[0][0], c.pts[1][0], c.t);
        c.y = lerp(c.pts[0][1], c.pts[1][1], c.t);
      }
      if (dt > 0) { c.vx = (c.x - cx0) / dt; c.vy = (c.y - cy0) / dt; if (c.vx || c.vy) c.step = (c.step || 0) + dt * 8; }
      /* 旧ハート判定はイベント未割当のカップルにだけ残す（ジャスト判定を一本化するため） */
      if (!c.evt) {
        c.next -= dt;
        if (c.next < -JUST_WINDOW) c.next = 5.5 + Math.random() * 3.5;
      }
      if (c.lineT > 0) c.lineT -= dt;
      c.pose = c.evt && (c.evt.phase === 'windup' || c.evt.phase === 'beat')
        ? Math.min(1, c.pose + dt * 4) : Math.max(0, c.pose - dt * 4);
    }
    /* --- 通行カップル：端まで歩いたら少し立ち止まり、向きを変える --- */
    for (let i = 0; i < G.mobs.length; i++) {
      const m = G.mobs[i];
      if (m.sighT > 0) m.sighT -= dt;
      if (m.spd <= 0 || m.mood) { m.vx = 0; continue; }
      if (m.wait > 0) { m.wait -= dt; m.vx = 0; continue; }
      const nx = m.x + m.dir * m.spd * dt;
      if (nx <= m.x0 || nx >= m.x1) {
        m.x = clamp(nx, m.x0, m.x1); m.dir = -m.dir; m.vx = 0; m.wait = 1.2 + Math.random() * 2.2;
      } else { m.x = nx; m.vx = m.dir * m.spd; m.step += dt * 8; }
    }

    /* --- コンボ（狙って待てるよう、条件を満たす間だけコンボ時計を止める。デート期限は延ばさない） --- */
    G.graceOn = false;
    if (G.combo > 0) {
      if (comboGrace(dt)) G.graceOn = true;
      else {
        G.comboT -= dt;
        if (G.comboT <= 0) { G.combo = 0; ui.comboTag.classList.remove('on'); }
      }
    }

    /* --- カメラ --- */
    updateCamera(dt);

    tickFx(dt);

    Audio2.setIntensity(G.mood / 100);
    updateTimeUI();
    updateChrome();
    if (G.tipT > 0) {
      G.tipT -= dt;
      hint(G.tipT > 0 ? G.tip : '');
    } else if (st.tutorial) tutorial();

    /* 同一フレームで失敗も成立していた場合、失敗が先に state を変えている。
       ここまで playing のままなら勝利を確定する（結果の二重保存を防ぐ） */
    if (G.pendingWin && G.state === 'playing') winConfirm();
  }

  /* 見た目だけの時間経過（雪・フラッシュ・吹き出し・遅延セリフ・反応カード）。
     プレイ中・勝利演出・敗北演出で共通に使う */
  function tickFx(dt) {
    for (let i = 0; i < G.snow.length; i++) {
      const s2 = G.snow[i];
      s2.d += dt; s2.y += s2.s * dt; s2.x += Math.sin(s2.d) * 8 * dt;
      if (s2.y > H + 4) { s2.y = -4; s2.x = Math.random() * W; }
    }
    if (G.slowmo > 0) G.slowmo -= dt;
    if (G.flash > 0) G.flash -= dt * 2.6;
    if (G.radioT > 0) G.radioT -= dt;
    if (G.cam.shake > 0) G.cam.shake = Math.max(0, G.cam.shake - dt * 3);
    /* 主人公の一言はカップルの反応より少し遅らせ、会話を一度に重ねない */
    if (G.lines.length) {
      G.lines[0].t -= dt;
      if (G.lines[0].t <= 0) { radio(G.lines.shift().text, 1.8); if (G.lines.length) G.lines[0].t = Math.max(G.lines[0].t, 1.2); }
    }
    if (G.cardT > 0) { G.cardT -= dt; if (G.cardT <= 0 && ui.reactCard) ui.reactCard.classList.remove('on'); }
    for (let i = 0; i < G.auras.length; i++) if (G.auras[i].breakT > 0) G.auras[i].breakT -= dt;
  }

  function updateCamera(dt) {
    const p = G.player, st = G.stage;
    let want;
    if (save.controls.mode === 'drag' && ctl.drag.id !== null) {
      /* 直接ドラッグ中はカメラを追わせすぎない。主人公が帯の外へ出たときだけ追う
         （指の位置へ主人公が来て止まる。上端近くに指を置くとスクロールしながら進む） */
      const top = CFG.controls.dragBandTop * H, bottom = CFG.controls.dragBandBottom * H;
      const sy = p.y - G.cam.y;
      want = G.cam.y;
      if (sy < top) want = p.y - top; else if (sy > bottom) want = p.y - bottom;
      want = clamp(want, 0, st.worldH - H);
      G.cam.y = lerp(G.cam.y, want, 1 - Math.pow(0.0004, dt));
    } else {
      want = clamp(p.y - H * 0.56 + p.vy * 0.24, 0, st.worldH - H);
      G.cam.y = lerp(G.cam.y, want, 1 - Math.pow(0.0015, dt));
    }
    G.cam.zoom = lerp(G.cam.zoom, 1, 1 - Math.pow(0.002, dt));
  }

  /* ---------- 移動（両方式で共通の物理） ---------- */
  /* 今フレームの移動量。速度上限・衝突・工作の条件はスティックとドラッグで同じ */
  function moveIntent(dt) {
    const p = G.player;
    let mx = 0, my = 0;
    if (input.keys.l) mx -= 1; if (input.keys.r) mx += 1;
    if (input.keys.u) my -= 1; if (input.keys.d) my += 1;
    if (ctl.stick.id !== null) { mx += ctl.stick.vx; my += ctl.stick.vy; }
    let mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
    if (mag > 0.18) return { dx: mx * PLAYER_SPEED * dt, dy: my * PLAYER_SPEED * dt, active: true };
    if (ctl.drag.id !== null) {
      const tg = dragTarget();
      if (tg) {
        const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy);
        if (d > 1.5) {
          const step = Math.min(d, PLAYER_SPEED * dt);
          return { dx: dx / d * step, dy: dy / d * step, active: true };
        }
      }
    }
    return { dx: 0, dy: 0, active: false };
  }

  /* 分割して動かし、オーラに入ったら円の外へ押し戻す（接線方向の成分は残るので滑る） */
  function movePlayer(dx, dy) {
    const p = G.player, st = G.stage;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / CFG.aura.substep));
    let bumped = false;
    for (let i = 0; i < n; i++) {
      p.x += dx / n; p.y += dy / n;
      p.x = clamp(p.x, 34, W - 34);
      p.y = clamp(p.y, 90, st.worldH - 60);
      if (resolveAuras(p)) bumped = true;
    }
    return bumped;
  }
  function resolveAuras(p) {
    let hit = false;
    for (let i = 0; i < G.auras.length; i++) {
      const a = G.auras[i];
      if (!a.on) continue;
      const rr = a.r + CFG.aura.playerR;
      const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
      if (d < rr) {
        hit = true;
        if (d < 0.001) { p.y = a.y + rr; }
        else { p.x = a.x + dx / d * rr; p.y = a.y + dy / d * rr; }
      }
    }
    return hit;
  }
  /* 工作位置（対象から主人公側へ42px）に、オーラを越えずに行けるか */
  function anchorOf(t, px, py) {
    const a = Math.atan2(py - t.y, px - t.x);
    return { x: t.x + Math.cos(a) * 42, y: t.y + Math.sin(a) * 42 };
  }
  function reachable(px, py, ax, ay) {
    for (let i = 0; i < G.auras.length; i++) {
      const a = G.auras[i];
      if (!a.on) continue;
      const rr = a.r + CFG.aura.playerR;
      if (Math.hypot(ax - a.x, ay - a.y) < rr) return false;
      if (segCircle(px, py, ax, ay, a.x, a.y, rr - 0.5)) return false;
    }
    return true;
  }

  /* ---------- オーラ ---------- */
  function updateAuras(dt) {
    const p = G.player;
    for (let i = 0; i < G.auras.length; i++) {
      const a = G.auras[i];
      a.ph += dt;
      if (a.linkT > 0) a.linkT -= dt;
      if (!a.on || a.seen) continue;
      /* 初めて近づいたときだけ、対応するライトを点線で示す */
      if (Math.hypot(p.x - a.x, p.y - a.y) < CFG.aura.tipRange && inView(a.y, G.cam.y, 0)) {
        a.seen = true; a.linkT = CFG.aura.linkT;
        if (!save.tips.aura) {
          save.tips.aura = true; putSave();
          G.tip = AURA_TIP; G.tipT = CFG.aura.linkT;
        }
      }
    }
  }
  /* 対応灯の工作完了と同じ更新で衝突を解除する。見た目の消滅はその後に流す */
  function auraOff(a) {
    if (!a.on) return;
    a.on = false; a.breakT = CFG.aura.breakT; a.linkT = 0;
    Audio2.se.auraBreak();
  }

  /* ---------- デートイベント ---------- */
  /* ステージの制限時間とは別の、デートごとの期限。
     起動 t=0、期待の瞬間 = windup、ジャスト受付 = windup ± 1.0、デート期限 = 受付終了 */
  const EVCFG = CFG.event;
  function beatTime() { return EVCFG.windup; }
  function justOpen() { return EVCFG.windup - EVCFG.justBefore; }
  function justClose() { return EVCFG.windup + EVCFG.justAfter; }
  /* 境界ちょうど（2.0 / 4.0）の完了を、時間の足し算の丸め誤差で取りこぼさないための幅 */
  const T_EPS = 1e-6;

  /* 今その対象へ工作を始めたら、何秒後に完了するか（吸着＋工作時間＋コンボ短縮） */
  function completeDelay(t) {
    return SNAP_TIME + t.def.dur * workMul();
  }

  function updateEvents(dt) {
    let active = null;
    for (let i = 0; i < G.events.length; i++) {
      const e = G.events[i];
      if (e.phase === 'windup' || e.phase === 'beat') { active = e; break; }
    }
    for (let i = 0; i < G.events.length; i++) {
      const e = G.events[i];
      if (e.phase === 'resolved') continue;       // v3：一度決まった結末は巻き戻さない

      if (e.phase === 'idle') {
        /* 起動条件：対象が未工作・画面内・距離内、強い予告は同時に1つだけ。クリア確定後は起動しない */
        if (active || G.pendingWin || e.target.done) continue;
        const d = Math.hypot(G.player.x - e.target.x, G.player.y - e.target.y);
        if (d > EVCFG.radius) continue;
        if (!inView(e.target.y, G.cam.y, 40)) continue;
        e.phase = 'windup'; e.startAt = G.time; e.t = 0; e.cue = e.def.cues[0];
        Audio2.se.cue(0);
        active = e;
        continue;
      }

      e.t = G.time - e.startAt;
      if (e.phase === 'windup') {
        const at = [0, 0.9, 1.7, 2.4];
        for (let k = e.def.cues.length - 1; k >= 0; k--) {
          if (e.t >= at[k]) {
            if (e.cue !== e.def.cues[k]) { e.cue = e.def.cues[k]; Audio2.se.cue(k); }
            break;
          }
        }
        if (e.t >= beatTime()) { e.phase = 'beat'; Audio2.se.cue(4); }
      }
      /* 期限ちょうどまではデート成功の余地を残す。超えたら親密化で確定 */
      if (e.phase === 'beat' && e.t > justClose() + T_EPS) resolveMissed(e, false);
    }
  }

  /* デートの結末を確定する（1プレイ1回） */
  function settleDate(e, outcome) {
    e.phase = 'resolved'; e.outcome = outcome; e.cue = '';
    e.couple.mood = outcome === 'just' ? 'heartbroken' : outcome === 'missed' ? 'lovey' : 'dejected';
    e.couple.fixed = true; e.couple.vx = e.couple.vy = 0;   // 結末のポーズで立ち止まる
  }
  function resolveMissed(e, quiet) {
    settleDate(e, 'missed');
    if (quiet) return;
    Audio2.se.lovey();
    say(e.couple, OUTCOME_LINE.missed.couple, EVCFG.reaction);
    queueLine(OUTCOME_LINE.missed.me);
    reactCard('missed', e.couple);
  }

  /* 工作完了の時刻 at で、紐付いたデートの結末を決める。
     戻り値：pre（起動前）/ normal / just / late（期限切れ後の消灯）/ null（既に決着済み） */
  function resolveDate(e, at) {
    if (e.phase === 'resolved') return e.outcome === 'missed' ? 'late' : null;
    if (e.phase === 'idle') { settleDate(e, 'pre'); return 'pre'; }
    const et = at - e.startAt;
    if (et > justClose() + T_EPS) { resolveMissed(e, true); return 'late'; }
    if (et >= justOpen() - T_EPS) { settleDate(e, 'just'); return 'just'; }
    settleDate(e, 'normal');
    return 'normal';
  }

  function say(c, line, sec) { c.line = line; c.lineT = sec; }
  function queueLine(text) { G.lines.push({ t: EVCFG.lineDelay, text: text }); }

  /* 受付中か（テスト・表示用。判定そのものは resolveDate が完了時刻で行う） */
  function evJustOpen(e) {
    return (e.phase === 'windup' || e.phase === 'beat') && e.t >= justOpen() - T_EPS && e.t <= justClose() + T_EPS;
  }

  /* 顔が小さいので、最初のジャスト／最初の期限切れだけ画面端に反応カードを出す */
  function reactCard(kind, c) {
    if (G.cards[kind] || !ui.reactCard) return;
    G.cards[kind] = true;
    const key = kind === 'just' ? 'npc_couple_heartbroken' : 'npc_couple_lovey';
    if (!IMG[key]) return;
    ui.reactImg.src = ASSET_SRC[key];
    ui.reactTxt.textContent = kind === 'just' ? 'JUST' : 'MISSED';
    ui.reactCard.className = 'on ' + kind;
    G.cardT = EVCFG.cardT;
  }

  /* ---------- コンボ待機猶予 ---------- */
  function comboGrace(dt) {
    if (!CFG.grace.enabled || G.comboT <= 0) return false;
    const t = G.candidate;
    if (!t || t.done || !t.evt) return false;
    if (t.graceUsed >= CFG.grace.max) return false;
    if (!(t.evt.phase === 'windup' || t.evt.phase === 'beat')) return false;
    if (Math.hypot(G.player.x - t.x, G.player.y - t.y) > CFG.grace.radius) return false;
    t.graceUsed = Math.min(CFG.grace.max, t.graceUsed + dt);
    return true;
  }

  /* ---------- 警備員の調査行動 ---------- */
  /* 工作の音で最寄りの巡回警備員を1人だけ呼ぶ。待ち行列は作らない */
  function notifyGuards(t) {
    if (!G.stage.investigate) return;
    let best = null, bestD = CFG.guard.notifyRadius;
    for (let i = 0; i < G.guards.length; i++) {
      const g = G.guards[i];
      if (g.type === 'cam' || g.mode !== 'patrol' || g.inv !== 'patrol') continue;
      if (g.invCool > 0) continue;
      if (g.hot > 0.5) continue;                       // プレイヤーを直視中は誘導できない
      const d = Math.hypot(g.x - t.x, g.y - t.y);
      if (d > bestD) continue;
      const path = findPath(g.x, g.y, t.x, t.y, 48);
      if (!path) continue;                              // 到達できない対象は誘導対象外
      if (best && d >= bestD) continue;
      best = { g: g, path: path }; bestD = d;
    }
    if (!best) return;
    const g = best.g;
    g.inv = 'react'; g.invT = 0;
    g.invLook = { x: t.x, y: t.y };
    g.invPath = best.path;
    g.homeLeg = g.leg; g.homeLegT = g.legT; g.homeX = g.x; g.homeY = g.y;
    g.bubble = '故障か？'; g.bubbleT = 1.4;
    Audio2.se.notice();
  }

  function updateInvestigate(g, dt) {
    g.invT += dt;
    if (g.invLook) g.dir = Math.atan2(g.invLook.y - g.y, g.invLook.x - g.x);

    if (g.inv === 'react') {
      if (g.invT >= CFG.guard.reactT) { g.inv = 'move'; g.invT = 0; }
      return;
    }
    if (g.inv === 'move' || g.inv === 'return') {
      const arrived = walkPath(g, dt);
      const limit = g.inv === 'move' ? CFG.guard.moveTimeout : CFG.guard.moveTimeout * 1.6;
      if (arrived) {
        if (g.inv === 'move') { g.inv = 'check'; g.invT = 0; }
        else { backToPatrol(g); }
      } else if (g.invT >= limit) {
        /* 打ち切り。復帰も直線で戻れなければその場から巡回へ復帰する */
        if (g.inv === 'move') goHome(g); else backToPatrol(g);
      }
      return;
    }
    if (g.inv === 'check') {
      if (g.invT >= CFG.guard.checkT) goHome(g);
    }
  }

  function goHome(g) {
    const path = findPath(g.x, g.y, g.homeX, g.homeY, 0);
    g.inv = 'return'; g.invT = 0; g.invLook = null;
    g.invPath = path || [{ x: g.homeX, y: g.homeY }];
    if (!path) { backToPatrol(g); }
  }
  function backToPatrol(g) {
    g.inv = 'patrol'; g.invT = 0; g.invPath = null; g.invLook = null;
    g.invCool = CFG.guard.cooldown;
    g.leg = g.homeLeg; g.legT = g.homeLegT;   // 元の巡回位置から再開する
    g.x = g.homeX; g.y = g.homeY;
  }

  /* 経路上を進む。到達したらtrue */
  function walkPath(g, dt) {
    const path = g.invPath;
    if (!path || !path.length) return true;
    let budget = g.spd * dt;
    while (budget > 0 && path.length) {
      const n = path[0];
      const dx = n.x - g.x, dy = n.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d <= budget) {
        g.x = n.x; g.y = n.y; budget -= d; path.shift();
        if (!path.length) return true;
      } else {
        g.x += dx / d * budget; g.y += dy / d * budget;
        if (!g.invLook) g.dir = Math.atan2(dy, dx);
        budget = 0;
      }
    }
    return !path.length;
  }

  /* 什器・壁を通り抜けない経路を作る。直線が無理なら1点だけ経由して試す */
  function clearLine(ax, ay, bx, by) {
    for (let i = 0; i < G.obstacles.length; i++) {
      const o = G.obstacles[i];
      const pad = { x: o.x - 10, y: o.y - 10, w: o.w + 20, h: o.h + 20 };
      if (segRect(ax, ay, bx, by, pad)) return false;
    }
    return true;
  }
  function findPath(ax, ay, bx, by, stopAt) {
    const d = Math.hypot(bx - ax, by - ay) || 1;
    const tx = bx - (bx - ax) / d * stopAt, ty = by - (by - ay) / d * stopAt;
    if (clearLine(ax, ay, tx, ty)) return [{ x: tx, y: ty }];
    const cand = [];
    for (let i = 0; i < G.obstacles.length; i++) {
      const o = G.obstacles[i], m = 26;
      cand.push({ x: o.x - m, y: o.y - m }, { x: o.x + o.w + m, y: o.y - m },
                { x: o.x - m, y: o.y + o.h + m }, { x: o.x + o.w + m, y: o.y + o.h + m });
    }
    let best = null, bestLen = Infinity;
    for (let i = 0; i < cand.length; i++) {
      const w = cand[i];
      if (w.x < 30 || w.x > W - 30 || w.y < 60 || w.y > G.stage.worldH - 40) continue;
      if (!clearLine(ax, ay, w.x, w.y) || !clearLine(w.x, w.y, tx, ty)) continue;
      const len = Math.hypot(w.x - ax, w.y - ay) + Math.hypot(tx - w.x, ty - w.y);
      if (len < bestLen) { bestLen = len; best = w; }
    }
    return best ? [best, { x: tx, y: ty }] : null;
  }

  function pickTarget() {
    const p = G.player;
    let best = null, bestScore = -Infinity, blockedBest = null, blockedScore = -Infinity;
    for (let i = 0; i < G.targets.length; i++) {
      const t = G.targets[i];
      if (t.done) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d > PICK_RADIUS + 26) continue;
      let ang = Math.atan2(t.y - p.y, t.x - p.x) - p.face;
      while (ang > Math.PI) ang -= 6.2832; while (ang < -Math.PI) ang += 6.2832;
      const s = -d * 1.0 - Math.abs(ang) * 26 + t.def.mood * 1.2;
      /* 工作位置へオーラを越えずに行けない対象はロックしない（吸着で貫通させない） */
      const an = anchorOf(t, p.x, p.y);
      if (!reachable(p.x, p.y, an.x, an.y)) {
        if (s > blockedScore) { blockedScore = s; blockedBest = t; }
        continue;
      }
      if (s > bestScore) { bestScore = s; best = t; }
    }
    G.blocked = best ? null : blockedBest;
    return best;
  }

  function startAction() {
    if (G.state !== 'playing' || G.action) return;
    const t = G.candidate;
    if (!t || t.done) return;            // 完了直後の1フレームに残ったロックでは始めない
    const p = G.player;
    const an = anchorOf(t, p.x, p.y);
    G.action = {
      target: t, phase: 'snap', t: 0, started: false,
      fx: p.x, fy: p.y, ax: an.x, ay: an.y,
      dur: t.def.dur * workMul(),
      /* 工作開始時に置かれていた入力。これ自体ではキャンセルしない */
      keys: { l: input.keys.l, r: input.keys.r, u: input.keys.u, d: input.keys.d },
      stick: ctl.stick.id !== null ? { x: ctl.stick.ox, y: ctl.stick.oy } : null,
      drag: ctl.drag.id !== null ? { x: ctl.drag.fx, y: ctl.drag.fy } : null,
    };
    ui.sabRing.classList.add('on');
    ui.sabRing.style.setProperty('--deg', '0deg');
    ui.btnSab.classList.add('press');
  }
  function cancelAction() {
    G.action = null;
    ui.sabRing.classList.remove('on');
    ui.btnSab.classList.remove('press');
  }
  /* 「指が置かれたまま」ではなく「新しい移動ジェスチャー」だけで工作を中断する */
  function actionCancelIntent() {
    const a = G.action, lim = CFG.controls.cancelMove;
    for (const k of ['l', 'r', 'u', 'd']) if (input.keys[k] && !a.keys[k]) return true;
    if (ctl.stick.id !== null) {
      const b = a.stick || { x: 0, y: 0 };
      if (Math.hypot(ctl.stick.ox - b.x, ctl.stick.oy - b.y) >= lim) return true;
    }
    if (ctl.drag.id !== null) {
      const b = a.drag || { x: ctl.drag.sx, y: ctl.drag.sy };
      if (Math.hypot(ctl.drag.fx - b.x, ctl.drag.fy - b.y) >= lim) return true;
    }
    return false;
  }

  /* 工作の確定（1か所に集約）。
     順序＝対象の変更 → 消灯とオーラ衝突の解除 → デートの結末 → コンボ・ジャスト・得点・ムード
          → 反応 → 勝利の保留（確定は update 末尾）／勝っていなければ警備員へ通知
     over：作業が完了してからフレーム末までの超過時間。完了の正確な時刻 = G.time - over */
  function doSabotage(t, over) {
    if (t.done) { if (G.action && G.action.target === t) cancelAction(); return; }
    const at = G.time - (over || 0);
    t.done = true; t.t = 0;
    G.doneCount++;
    cancelAction();
    if (G.candidate === t) G.candidate = null;
    if (G.metrics && G.metrics.firstWork === null) G.metrics.firstWork = at;

    /* 電源ライトならオーラの衝突をこの更新で解除（次の移動からすぐ通れる） */
    if (t.aura) auraOff(t.aura);

    /* デートの結末は紐付いた対象の工作でだけ決まる。近くの別の照明では決まらない */
    const ev = t.evt;
    const outcome = ev ? resolveDate(ev, at) : null;

    /* コンボ */
    G.combo = G.comboT > 0 ? G.combo + 1 : 1;
    G.comboT = COMBO_WINDOW;
    G.maxCombo = Math.max(G.maxCombo, G.combo);

    /* ジャストは1経路に集約し、同じ対象から二重に取らせない */
    let just = outcome === 'just' || (!ev && legacyJust(t));
    if (just && t.justGiven) just = false;
    if (just) t.justGiven = true;

    /* スコア・ムード（ムード＝残っているイルミの割合。期限切れでもムードは回復させない） */
    const dmg = fmtPct(t.mood);
    const gain = Math.round(t.def.score * G.combo) + (just ? JUST_BONUS : 0);
    G.score += gain;
    G.remainW = Math.max(0, G.remainW - t.w);
    G.mood = G.remainW <= 1e-9 ? 0 : 100 * G.remainW / G.totalW;
    /* 特別なイルミ：制限時間が延びる */
    if (t.def.bonus) { G.left += CFG.bonusSec; G.bonusCount = (G.bonusCount || 0) + 1; }

    /* 演出 */
    G.cam.zoom = 1.06; G.flash = 1;
    Audio2.se.success(G.combo);
    haptic(just ? [18, 30, 24] : 16);
    if (t.def.bonus) Audio2.se.timeUp();
    if (just) {
      G.just++; G.slowmo = 0.16; Audio2.se.just();
      centerMsg('JUST SABOTAGE', '+' + JUST_BONUS);
    } else if (t.def.bonus) {
      centerMsg('TIME +' + CFG.bonusSec + '秒', t.def.name + (G.combo >= 2 ? '　COMBO x' + G.combo : ''));
    } else if (G.combo >= 2) {
      Audio2.se.combo(G.combo);
      centerMsg('MOOD −' + dmg + '%', 'COMBO x' + G.combo);
    } else {
      centerMsg('MOOD −' + dmg + '%', t.def.name);
    }
    if (G.combo >= 2) {
      ui.comboTag.firstChild.nodeValue = 'x' + G.combo;
      ui.comboTag.classList.add('on');
    }

    /* 反応。強いリアクションは1組だけ。主人公の一言は少し遅らせる */
    if (outcome === 'pre' || outcome === 'normal') {
      Audio2.se.deflate();
      say(ev.couple, OUTCOME_LINE.normal.couple, EVCFG.reaction);
      queueLine(OUTCOME_LINE.normal.me);
    } else if (outcome === 'just') {
      if (ev.def.type === 'photo' || ev.def.type === 'wreath') Audio2.se.shutter();
      say(ev.couple, ev.def.payoff, EVCFG.reaction);
      queueLine(t.type === 'bigtree' ? RADIO.star : OUTCOME_LINE.just.me);
      reactCard('just', ev.couple);
    } else if (outcome === 'late') {
      queueLine(OUTCOME_LINE.late.me);        // 親密なポーズはそのまま。成功を無かったことにしない
    } else if (t.aura && !t.aura.couple.evt) {
      /* 電源を落とされたカップル（デートに紐付いていない組）は、その場で冷める */
      const c = t.aura.couple;
      c.mood = 'dejected'; c.fixed = true; c.vx = c.vy = 0;
      say(c, pickLine(t), EVCFG.reaction);
    } else if (!ev) {
      let near = null, nd = 1e9;
      for (let i = 0; i < G.couples.length; i++) {
        const d = dist2(G.couples[i].x, G.couples[i].y, t.x, t.y);
        if (d < nd) { nd = d; near = G.couples[i]; }
      }
      if (near && nd < 420 * 420) say(near, pickLine(t), EVCFG.reaction);
    }

    updateMoodUI();
    if (G.stage.tutorial && G.tutorialStep < 4) G.tutorialStep = 4;
    /* 勝利は update の末尾で確定する（同一フレームの失敗を優先するため）。
       クリアが決まった工作では新しい調査を始めない */
    if (G.targets.every((x) => x.done)) G.pendingWin = true;    // フィールドのイルミをすべて工作したらクリア
    else notifyGuards(t);
    mobsReact(t);
  }

  /* 割合の表示：小さい装飾は小数1桁まで */
  function fmtPct(v) { return v < 9.95 ? (Math.round(v * 10) / 10).toFixed(1) : String(Math.round(v)); }
  /* 工作時間の倍率：3連鎖以上 ×0.84、10連鎖以上（フィーバー）×0.7 */
  function workMul() { return G.combo >= CFG.fever.combo ? CFG.fever.mul : G.combo >= 3 ? 0.84 : 1; }

  function pickLine(t) {
    const lines = REACT[t.def.effect] || REACT.off;
    return lines[(Math.random() * lines.length) | 0];
  }

  /* デートに紐付いていないカップルだけに残す旧ハート判定。+500 は1回だけ */
  function legacyJust(t) {
    for (let i = 0; i < G.couples.length; i++) {
      const c = G.couples[i];
      if (c.evt) continue;
      if (Math.abs(c.next) <= JUST_WINDOW && dist2(c.x, c.y, t.x, t.y) < 320 * 320) {
        c.next = 5.5 + Math.random() * 3.5;      // 同じ合図で2回取らせない
        return true;
      }
    }
    return false;
  }

  /* ---------- 結果・失敗 ---------- */
  const RANK_ORDER = { C: 0, B: 1, A: 2, S: 3 };

  /* 勝利の確定。得点と記録はここで1回だけ確定・保存し、演出は別の state で見せる */
  function winConfirm() {
    G.pendingWin = false;
    cancelAction();
    const st = G.stage;
    const timeUsed = st.time - G.left;
    const total = G.score + Math.round(G.left * TIME_BONUS);   // 残り時間は演出前の値
    const rk = st.rank;
    const rank = total >= rk.S ? 'S' : total >= rk.A ? 'A' : total >= rk.B ? 'B' : 'C';
    const res = { rank: rank, just: G.just, maxCombo: G.maxCombo, time: timeUsed, close: G.close, score: total };
    const award = AWARDS.find((a) => a.test(res));

    /* 記録は同じルール版の中だけで比較する */
    const B = bests();
    const prev = B[st.id] || null;
    const isFirst = !prev;
    const isBest = !!prev && total > prev.score;
    B[st.id] = {
      score: prev ? Math.max(prev.score, total) : total,
      time: prev ? Math.min(prev.time, timeUsed) : timeUsed,
      rank: prev && RANK_ORDER[prev.rank] > RANK_ORDER[rank] ? prev.rank : rank,
      v: RULES_VERSION,
    };
    save.awards[award.id] = true;
    if (!st.special && G.stageIdx + 1 < NORMAL.length) save.unlocked = Math.max(save.unlocked, G.stageIdx + 2);
    /* 5ステージすべてのクリア証跡がそろった最初の1回だけ、破局エンディング → 復縁 → 特別ステージ出現 */
    const firstAll = !st.special && !save.allClearEndingUnlocked && allCleared();
    if (firstAll) { save.allClearEndingUnlocked = true; save.specialUnlocked = true; }
    recordMetrics('clear');
    putSave();   // 演出を待たずに保存する。途中で閉じても解放は失われない

    G.result = {
      total: total, rank: rank, award: award, timeUsed: timeUsed, leftAtWin: G.left,
      isFirst: isFirst, isBest: isBest, firstAll: firstAll,
      just: G.just, maxCombo: G.maxCombo, close: G.close,
    };
    Audio2.se.clear(); Audio2.duck(true); haptic([26, 40, 14]);
    hint(''); G.tipT = 0;
    if (firstAll) { startEnding(false); return; }
    G.state = 'finishing'; G.finishT = 0;
  }

  /* クリア確定後の1.8秒。移動・工作・警備員・デート・失敗判定は止まる */
  function updateFinishing(dt) {
    const before = G.finishT;
    G.finishT += dt;
    for (let i = 0; i < G.couples.length; i++) if (G.couples[i].lineT > 0) G.couples[i].lineT -= dt;
    for (let i = 0; i < G.guards.length; i++) if (G.guards[i].bubbleT > 0) G.guards[i].bubbleT -= dt;
    tickFx(dt);
    /* 変えた周辺を見せるため、低負荷モードでなければ少しだけ引く */
    const z = save.lite ? 1 : 1 - CFG.finish.zoom * clamp((G.finishT - 0.3) / 0.9, 0, 1);
    G.cam.zoom = lerp(G.cam.zoom, z, 1 - Math.pow(0.02, dt));
    if (before < CFG.finish.radioAt && G.finishT >= CFG.finish.radioAt) {
      G.lines.length = 0;
      radio(RADIO.clear, 2.4);
      centerMsg('MISSION CLEAR', '聖夜ムード 0%');
    }
    if (G.finishT >= CFG.finish.hold) showResult();
  }

  /* 新しいタップ／スペースで演出を飛ばす（0.25秒以降） */
  function skipFinish() {
    if (G.state === 'finishing' && G.finishT >= CFG.finish.skipAfter) { showResult(); return true; }
    if (G.state === 'failing' && G.failT >= CFG.fail.skipAfter) { showFail(); return true; }
    if (G.ending) return skipEnding();
    return false;
  }

  /* fallback：その絵がまだ無いときに使う絵（無ければ文字だけで成立させる） */
  function setPanel(id, kind, fallback) {
    const img = $(id);
    img.parentNode.classList.remove('none');
    img.onerror = () => {
      if (fallback && img.getAttribute('src') !== PANEL_SRC[fallback]) img.src = PANEL_SRC[fallback];
      else img.parentNode.classList.add('none');
    };
    if (img.getAttribute('src') !== PANEL_SRC[kind]) img.src = PANEL_SRC[kind];
    img.parentNode.dataset.kind = kind;
  }

  function showResult() {
    if (G.state === 'result' || !G.result) return;
    G.state = 'result';
    const r = G.result;
    const all = r.firstAll, sp = !!G.stage.special;
    setPanel('resultArt', all ? 'ending' : 'success');
    if (sp) setPanel('resultArt', 'special', 'success');
    $('resultEyebrow').textContent = sp ? 'SPECIAL STAGE CLEAR' : (all ? 'ALL MISSIONS COMPLETE' : 'MISSION CLEAR') + ' / STAGE ' + G.stage.id;
    $('resultHead').textContent = sp ? '延長戦、終了' : all ? '全任務達成' : '任務達成';
    $('resultSub').textContent = sp ? '青の回廊も、ただの平日になった' : all ? '聖夜、完全終了。' : '聖夜の平日化に成功';
    const badge = $('rankBadge');
    badge.textContent = r.rank; badge.className = r.rank;
    $('titleAward').textContent = r.award.name;
    $('stTime').textContent = r.timeUsed.toFixed(1);
    $('stCombo').textContent = 'x' + r.maxCombo;
    $('stJust').textContent = r.just;
    $('stClose').textContent = r.close;
    $('stScore').textContent = r.total.toLocaleString();

    /* 見どころは1つだけ。初クリア → 自己ベスト → ジャスト → コンボ */
    const hl = $('highlight');
    let text = '';
    if (r.isFirst) text = '初任務、完了';
    else if (r.isBest) text = '自己ベスト更新';
    else if (r.just > 0) text = 'ジャスト妨害 ' + r.just + '回';
    else if (r.maxCombo >= 2) text = r.maxCombo + '連鎖で平日化';
    hl.textContent = text;
    hl.classList.toggle('on', !!text);

    const fin = $('finale');
    fin.textContent = all ? RADIO.allClear + '　／　特別ステージ「青の回廊」が出現した' : '';
    fin.classList.toggle('on', !!all);

    $('btnNext').style.display = !G.stage.special && G.stageIdx + 1 < NORMAL.length ? '' : 'none';
    /* 初回以後は通常の結果からもエンディングを再生できる */
    $('btnEnding').style.display = save.allClearEndingUnlocked && !all ? '' : 'none';
    showOv('ovResult');
    Audio2.stopBgm();
  }

  /* 無線の1行 */
  function radio(text, sec) {
    G.radio = text; G.radioT = sec || 2.2;
    if (ui.radio) {
      ui.radio.textContent = text;
      ui.radio.classList.add('on');
      clearTimeout(radioTimer);
      radioTimer = setTimeout(() => ui.radio.classList.remove('on'), (sec || 2.2) * 1000);
    }
  }
  let radioTimer = null;

  /* 敗北の確定。ゲーム時計を止め、悔し顔を1.2秒以内だけ見せてから失敗画面へ */
  function fail(kind) {
    if (G.state !== 'playing') return;
    G.state = 'failing'; G.failT = 0;
    G.pendingWin = false;
    cancelAction();
    G.failInfo = kind === 'seen'
      ? { reason: '発見された', sub: '「……設備点検です」', radio: '本部「身分を説明しろ」' }
      : { reason: '時間切れ', sub: '聖夜は、まだ終わらない', radio: '本部「時間切れだ。撤収しろ」' };
    Audio2.se.fail(); Audio2.stopBgm(); haptic([40, 60, 40]);
    G.cam.shake = 1;
    G.lines.length = 0;
    hint(''); G.tipT = 0;
    radio(G.failInfo.radio, 1.4);
    recordMetrics('fail');
    putSave();
  }
  function updateFailing(dt) {
    G.failT += dt;
    for (let i = 0; i < G.couples.length; i++) if (G.couples[i].lineT > 0) G.couples[i].lineT -= dt;
    tickFx(dt);
    if (G.failT >= CFG.fail.hold) showFail();
  }
  function showFail() {
    if (G.state === 'fail') return;
    G.state = 'fail';
    const f = G.failInfo || { reason: '任務失敗', sub: '' };
    setPanel('failArt', 'failure');
    $('failReason').textContent = f.reason;
    $('failSub').textContent = f.sub;
    showOv('ovFail');
  }

  /* ---------- 全ステージ制覇：破局エンディング ---------- */
  /* replay=true はメニューからの再生。得点や記録には一切触れない */
  function startEnding(replay, back) {
    releaseAll();
    G.ending = { t: 0, replay: !!replay, back: back || 'ovSelect' };
    if (!replay) G.state = 'ending';
    OVS.forEach((o) => $(o).classList.remove('on'));
    ui.hud.classList.add('hide');
    const ov = $('ovEnding');
    ov.classList.toggle('replay', !!replay);
    ov.classList.add('on');
    updateEnding(0);
    Audio2.stopBgm();
    Audio2.se.ending();
    save.allClearEndingSeen = true;
    save.specialUnlocked = true;
    putSave();
    buildStageList();
    updateTitleBadge();
    /* 復縁の絵が届いていれば、それを主役にする */
    const ra = $('revArt');
    ra.onerror = () => ra.parentNode.classList.add('none');
    ra.onload = () => { ra.parentNode.classList.remove('none'); $('ovEnding').classList.add('hasRevArt'); };
    if (!ra.getAttribute('src')) ra.src = PANEL_SRC.revival;
  }
  function updateEnding(dt) {
    const e = G.ending;
    if (!e) return;
    e.t += dt;
    const t = e.t, C = CFG.ending;
    const k = (a, d) => clamp((t - a) / d, 0, 1);
    const E = endingEls;
    /* 0〜0.6 暗転（再生時は最初から暗い） */
    E.dim.style.opacity = e.replay ? 1 : (k(0, C.dim) * 0.96).toFixed(3);
    /* 0.6〜1.8 親密 → 破局。距離が開き、カメラが引く */
    const cIn = k(C.couple, 0.3), cOut = 1 - k(C.art, 0.45);
    const brk = k(C.couple + 0.35, 0.6);
    E.couple.style.opacity = (cIn * cOut).toFixed(3);
    E.couple.style.transform = 'translateX(-50%) scale(' + (1 - 0.1 * k(C.couple, 1.2)).toFixed(3) + ')';
    E.lovey.style.opacity = (1 - brk).toFixed(3);
    E.breakup.style.opacity = brk.toFixed(3);
    /* 1.8〜3.0 台詞を順に */
    E.lineA.style.opacity = (k(C.lineA, 0.25) * cOut).toFixed(3);
    E.lineB.style.opacity = (k(C.lineB, 0.25) * cOut).toFixed(3);
    /* 3.0〜4.5 最終絵、4.5〜 主人公の満足げな顔。復縁が始まると消える */
    const rOut = 1 - k(C.revival, 0.4);
    E.art.style.opacity = (k(C.art, 0.5) * rOut).toFixed(3);
    const h = k(C.hero, 0.4);
    E.hero.style.opacity = (h * rOut).toFixed(3);
    E.hero.style.transform = 'translateY(' + ((1 - h) * 12).toFixed(1) + 'px)';
    /* 6.2〜 復縁：青い街の光の中に、ふたりが戻ってくる */
    const rIn = k(C.revival, 0.5);
    E.revBg.style.opacity = rIn.toFixed(3);
    const cp = k(C.revival + 0.35, 0.35);
    E.revCouple.style.opacity = cp.toFixed(3);
    E.revCouple.style.transform = 'translateX(-50%) scale(' + (0.9 + 0.1 * cp + (cp >= 1 ? Math.sin((t - C.revival - 0.7) * 9) * 0.015 : 0)).toFixed(3) + ')';
    E.revLineA.style.opacity = k(C.revLineA, 0.25).toFixed(3);
    E.revLineB.style.opacity = k(C.revLineB, 0.2).toFixed(3);
    E.revLineB.style.transform = 'scale(' + (1 + 0.12 * (1 - k(C.revLineB, 0.25))).toFixed(3) + ')';
    const bn = k(C.revBanner, 0.4);
    E.revBanner.style.opacity = bn.toFixed(3);
    E.revBanner.style.transform = 'translateY(' + ((1 - bn) * 14).toFixed(1) + 'px)';
    E.prompt.style.opacity = t >= C.end ? '1' : '0';
  }
  /* スキップ：破局の途中なら復縁の場面へ、復縁の途中以降なら結果へ（どちらも0.25秒以降の新しい入力だけ） */
  function skipEnding() {
    const e = G.ending;
    if (!e) return false;
    const C = CFG.ending;
    if (e.t < C.skipAfter) return false;
    if (e.t < C.revival) { e.t = C.revival; updateEnding(0); return true; }
    if (e.t < C.revival + C.skipAfter) return false;
    finishEnding();
    return true;
  }
  function finishEnding() {
    const e = G.ending;
    if (!e) return;
    G.ending = null;
    $('ovEnding').classList.remove('on');
    if (e.replay) showOv(e.back);
    else showResult();
  }
  let endingEls = null;

  /* ---------- 操作比較メモ（端末内だけ。外部送信はしない） ---------- */
  function recordMetrics(kind) {
    const m = G.metrics;
    if (!m || m.recorded) return;
    m.recorded = true;
    const a = save.proto[m.mode] || (save.proto[m.mode] = {
      runs: 0, clears: 0, fails: 0, move: 0, moveN: 0, work: 0, workN: 0, cancels: 0, bumps: 0,
    });
    a.runs++; if (kind === 'clear') a.clears++; else a.fails++;
    if (m.firstMove !== null) { a.move += m.firstMove; a.moveN++; }
    if (m.firstWork !== null) { a.work += m.firstWork; a.workN++; }
    a.cancels += m.cancels; a.bumps += m.auraBumps;
  }
  function fmtSec(v) { return v === null || v === undefined ? '—' : v.toFixed(1) + '秒'; }
  function protoLine() {
    const m = G.metrics;
    if (!m) return '';
    return '操作：' + modeName(m.mode) + '　初移動 ' + fmtSec(m.firstMove) + '　初工作 ' + fmtSec(m.firstWork)
      + '　中断 ' + m.cancels + '回　オーラ接触 ' + m.auraBumps + '回';
  }
  function modeName(m) { return m === 'drag' ? '直接ドラッグ' : 'スティック'; }

  /* ---------- チュートリアル（文章は最小限） ---------- */
  function tutorial() {
    const s = G.tutorialStep;
    if (s === 1) {
      hint(!touchMode ? 'WASD / 矢印キーで移動'
        : save.controls.mode === 'drag' ? '主人公を指でつかんで、行きたい場所へ動かす' : 'スティックで移動');
      if (G.time > 2.2 || Math.hypot(G.player.vx, G.player.vy) > 30) G.tutorialStep = 2;
    } else if (s === 2) {
      hint('光っている街路樹に近づけ');
      if (G.candidate) G.tutorialStep = 3;
    } else if (s === 3) {
      hint(touchMode ? '「工作」ボタンを押す' : 'スペースキーで工作');
      if (!G.candidate) G.tutorialStep = 2;
    } else if (s === 4) {
      hint('すべてのイルミを工作すれば任務完了');
      if (G.time > 11) G.tutorialStep = 5;
    } else if (s === 5) { hint(''); G.tutorialStep = 6; }
  }

  /* ---------- 描画 ---------- */
  function render() {
    const st = G.stage;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (!st) { renderIdle(); return; }

    const shake = G.cam.shake > 0 ? G.cam.shake * 6 : 0;
    const camY = G.cam.y + (shake ? (Math.random() - 0.5) * shake : 0);
    const z = G.cam.zoom;
    ctx.save();
    if (z !== 1) { ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
    ctx.translate(0, -camY);

    drawBackdrop(st, camY);

    /* 描画順：y でソート */
    const draws = [];
    for (let i = 0; i < G.targets.length; i++) { const t = G.targets[i]; if (inView(t.y, camY, 220)) draws.push({ y: t.y, k: 't', o: t }); }
    for (let i = 0; i < G.mobs.length; i++) { const m = G.mobs[i]; if (inView(m.y, camY, 90)) draws.push({ y: m.y, k: 'c', o: m }); }
    for (let i = 0; i < G.couples.length; i++) { const c = G.couples[i]; if (inView(c.y, camY, 90)) draws.push({ y: c.y, k: 'p', o: c }); }
    for (let i = 0; i < G.guards.length; i++) { const g = G.guards[i]; if (inView(g.y, camY, 300)) draws.push({ y: g.y, k: 'g', o: g }); }
    draws.push({ y: G.player.y, k: 'me', o: G.player });
    draws.sort((a, b) => a.y - b.y);

    /* 視線コーンは対象より下に敷く */
    for (let i = 0; i < G.guards.length; i++) if (inView(G.guards[i].y, camY, 320)) drawCone(G.guards[i]);
    drawObstacles(camY);
    for (let i = 0; i < G.auras.length; i++) if (inView(G.auras[i].y, camY, 120)) drawAuraRing(G.auras[i]);

    for (let i = 0; i < draws.length; i++) {
      const d = draws[i];
      if (d.k === 't') drawTarget(d.o);
      else if (d.k === 'c') drawMob(d.o);
      else if (d.k === 'p') drawCouple(d.o);
      else if (d.k === 'g') drawGuard(d.o);
      else drawPlayer(d.o);
    }

    for (let i = 0; i < G.auras.length; i++) if (inView(G.auras[i].y, camY, 160)) drawAuraFx(G.auras[i]);
    drawDragUI();
    for (let i = 0; i < G.targets.length; i++) if (G.targets[i].def.bonus && inView(G.targets[i].y, camY, 200)) drawBonusBadge(G.targets[i]);
    if (G.blocked && !G.candidate && !G.action && G.state === 'playing') drawBlocked(G.blocked);

    /* 工作可能リング */
    for (let i = 0; i < G.events.length; i++) drawEventUI(G.events[i]);
    if (G.candidate && !G.action) drawPickRing(G.candidate);
    if (G.action && G.action.phase === 'work') drawWorkRing(G.action);

    ctx.restore();

    drawSnow();
    if (G.flash > 0) {
      ctx.fillStyle = 'rgba(220,238,255,' + (G.flash * 0.12) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }
  function inView(y, camY, m) { return y > camY - m && y < camY + H + m; }

  function renderIdle() {
    ctx.fillStyle = COL.night; ctx.fillRect(0, 0, W, H);
  }

  function drawBackdrop(st, camY) {
    const style = st.style;
    const bgImg = IMG['bg' + st.id];
    const top = camY, bot = camY + H;
    // 地面
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, style === 'tower' ? '#0C1428' : style === 'blue' ? '#050920' : COL.night);
    g.addColorStop(1, style === 'blue' ? '#0A1338' : COL.asphalt);
    ctx.fillStyle = g; ctx.fillRect(-60, top - 80, W + 120, H + 160);

    if (bgImg) {
      // 背景素材（地面の俯瞰マップ）から、画面に映る帯だけを切り出して敷く
      const sy = Math.max(0, top - 40), sh = Math.min(st.worldH - sy, H + 80);
      const k = bgImg.height / st.worldH;
      ctx.drawImage(bgImg, 0, sy * k, bgImg.width, sh * k, 0, sy, W, sh);
      // イルミネーションを主役にするため、地面は一段沈める
      ctx.fillStyle = 'rgba(10,14,28,.28)';
      ctx.fillRect(0, top, W, H);
      drawReflections(st, camY);
      return;
    }

    const rnd = mulberry(st.id * 1237);
    // 歩道・路面
    ctx.fillStyle = COL.walk;
    if (style === 'blue') {
      ctx.fillStyle = '#0D1646'; ctx.fillRect(40, top, 118, H); ctx.fillRect(W - 158, top, 118, H);
      ctx.fillStyle = 'rgba(80,140,255,.06)'; ctx.fillRect(158, top, W - 316, H);
    } else if (style === 'street' || style === 'market') {
      ctx.fillRect(58, top, 46, H); ctx.fillRect(W - 104, top, 46, H);
    } else if (style === 'restaurant') {
      ctx.fillRect(0, top, 74, H); ctx.fillRect(W - 74, top, 74, H);
    } else if (style === 'park') {
      ctx.fillStyle = '#101B2E'; ctx.fillRect(0, top, W, H);
      ctx.fillStyle = '#16243C';
      ctx.fillRect(150, top, 240, H);
    } else if (style === 'tower') {
      ctx.fillStyle = '#0E1729'; ctx.fillRect(40, top, W - 80, H);
    }

    // 遠景ビル（決定的乱数で固定）
    ctx.fillStyle = '#0D1526';
    const bandTop = Math.floor(top / 400) * 400;
    for (let by = bandTop - 400; by < bot + 400; by += 400) {
      const r2 = mulberry(st.id * 31 + by);
      for (let i = 0; i < 6; i++) {
        const bw = 38 + r2() * 60, bh = 70 + r2() * 130;
        const bx = r2() * (W - bw);
        ctx.fillStyle = '#0D1526';
        ctx.fillRect(bx, by + r2() * 200, bw, bh);
        if (!save.lite) {
          for (let k = 0; k < 6; k++) {
            const wx = bx + 6 + r2() * (bw - 12), wy = by + 8 + r2() * (bh - 10);
            ctx.fillStyle = style === 'blue' ? 'rgba(90,150,255,.22)' : r2() > 0.55 ? 'rgba(255,192,105,.18)' : 'rgba(220,238,255,.10)';
            ctx.fillRect(wx, wy, 3, 4);
          }
        }
      }
    }

    drawReflections(st, camY);

    // park：水面
    if (style === 'park') {
      ctx.fillStyle = 'rgba(30,60,92,.5)';
      for (let y = Math.floor(top / 300) * 300; y < bot + 300; y += 300) {
        ctx.fillRect(0, y, 120, 180); ctx.fillRect(W - 120, y + 120, 120, 180);
      }
    }
  }

  /* 濡れた路面に落ちる光の反射 */
  function drawReflections(st, camY) {
    if (save.lite) return;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < G.targets.length; i++) {
      const t = G.targets[i];
      if (!inView(t.y, camY, 140)) continue;
      const c = t.done ? 'rgba(220,238,255,.10)' : t.type === 'bluetree' ? 'rgba(80,140,255,.2)' : 'rgba(255,192,105,.14)';
      const gr = ctx.createLinearGradient(0, t.y + 20, 0, t.y + 150);
      gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(t.x - 28, t.y + 20, 56, 130);
    }
    ctx.globalAlpha = 1;
  }

  /* --- 工作対象の描画 --- */
  function drawTarget(t) {
    const lit = !t.done;
    t.t += 0.016;
    const key = PROP_KEY[t.type], h = PROP_H[t.type];
    if (IMG[key]) {
      shadow(t.x, t.y + 4, Math.max(13, h * 0.20));
      /* 工作後は effect に応じて「冷白色化」か「消灯」に差し替える */
      const vari = lit ? null : ((t.effOff || t.def.effect === 'off') ? 'dark' : 'cold');
      drawTrimmed(key, t.x, t.y + 6, h, vari);
      const gy = t.y - h * (t.type === 'water' ? 0.1 : 0.5);
      if (lit || !t.effOff) glow(lit ? (t.type === 'bluetree' ? 'blue' : 'warm') : 'cold', t.x, gy, lit ? h * 0.7 : h * 0.44, lit ? 0.48 : 0.26);
      if (t.type === 'bigtree') {
        const sy = t.y + 6 - h * 0.93;
        if (lit) glow('warm', t.x, sy, 42, 0.8);
        else dot(t.x, sy, 8, 'rgba(14,20,38,.9)');   // 星だけ消灯
      }
      return;
    }
    switch (t.type) {
      case 'tree': drawTree(t, lit, 1); break;
      case 'bigtree': drawTree(t, lit, 1.9); break;
      case 'heart': drawHeart(t, lit); break;
      case 'tunnel': drawTunnel(t, lit); break;
      case 'photo': drawPhoto(t, lit); break;
      case 'booth': drawBooth(t, lit); break;
      case 'wreath': drawWreath(t, lit); break;
      case 'window': drawWindow(t, lit); break;
      case 'water': drawWater(t, lit); break;
      case 'led': drawLed(t, lit); break;
      case 'reindeer': drawReindeer(t, lit); break;
      case 'gift': drawGift(t, lit); break;
      case 'snowman': drawSnowman(t, lit); break;
      case 'bluetree': drawBlueTree(t, lit); break;
    }
  }

  /* 金色のトナカイ（時間延長）。素材が届くまでの線画。光る枠のオブジェに見えるよう、胴を薄く塗る */
  function drawReindeer(t, lit) {
    const x = t.x, y = t.y;
    shadow(x, y + 4, 34);
    const c = lit ? '#FFD27A' : 'rgba(170,190,220,.8)';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fillStyle = lit ? 'rgba(255,200,110,.28)' : 'rgba(120,140,180,.18)';
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    /* 胴・首・頭 */
    ctx.beginPath(); ctx.ellipse(x - 4, y - 50, 30, 15, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 18, y - 58); ctx.lineTo(x + 30, y - 84); ctx.lineTo(x + 40, y - 80); ctx.lineTo(x + 26, y - 50); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + 40, y - 88, 11, 7, -0.35, 0, 6.2832); ctx.fill(); ctx.stroke();
    /* 脚 */
    ctx.beginPath();
    [-26, -14, 8, 20].forEach((dx) => { ctx.moveTo(x + dx, y - 40); ctx.lineTo(x + dx + (dx > 0 ? 2 : -2), y - 1); });
    ctx.stroke();
    /* 角 */
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x + 34, y - 94); ctx.lineTo(x + 26, y - 116); ctx.moveTo(x + 29, y - 106); ctx.lineTo(x + 17, y - 110);
    ctx.moveTo(x + 43, y - 95); ctx.lineTo(x + 50, y - 118); ctx.moveTo(x + 47, y - 108); ctx.lineTo(x + 59, y - 112);
    ctx.stroke();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    if (lit) {
      const pts = [];
      for (let i = 0; i < 16; i++) { const a = i / 16 * 6.2832; pts.push([x - 4 + Math.cos(a) * 30, y - 50 + Math.sin(a) * 15]); }
      [-26, -14, 8, 20].forEach((dx) => { pts.push([x + dx, y - 26], [x + dx, y - 12]); });
      pts.push([x + 26, y - 116], [x + 50, y - 118], [x + 30, y - 84], [x + 40, y - 88]);
      pts.forEach((q) => dot(q[0], q[1], 1.9, '#FFF1C9'));
      glow('warm', x + 4, y - 56, 88, 0.62);
    } else glow('cold', x + 4, y - 56, 50, 0.22);
  }
  function drawGift(t, lit) {
    const x = t.x, y = t.y;
    shadow(x, y + 4, 30);
    ctx.fillStyle = lit ? '#B8323F' : '#2A3550'; ctx.fillRect(x - 26, y - 44, 52, 44);
    ctx.fillStyle = lit ? '#D8424F' : '#313D5C'; ctx.fillRect(x - 30, y - 54, 60, 12);
    ctx.fillStyle = lit ? '#FFC069' : '#46557A';
    ctx.fillRect(x - 4, y - 54, 8, 54);
    ctx.beginPath(); ctx.ellipse(x - 10, y - 60, 10, 6, -0.5, 0, 6.2832); ctx.ellipse(x + 10, y - 60, 10, 6, 0.5, 0, 6.2832); ctx.fill();
    for (let i = 0; i < 8; i++) {
      const px = x - 26 + i * 7.4;
      dot(px, y - 1, 2, lit ? WARM : '#28334E'); dot(px, y - 44, 2, lit ? WARM : '#28334E');
    }
    if (lit) glow('warm', x, y - 30, 60, 0.45);
  }
  function drawSnowman(t, lit) {
    const x = t.x, y = t.y;
    shadow(x, y + 4, 26);
    const body = lit ? '#EEF4FF' : '#5A6A88';
    dot(x, y - 22, 22, body); dot(x, y - 56, 15, body);
    ctx.fillStyle = '#1A2338'; ctx.fillRect(x - 13, y - 76, 26, 5); ctx.fillRect(x - 8, y - 92, 16, 17);
    ctx.fillStyle = lit ? '#D8424F' : '#39445F'; ctx.fillRect(x - 15, y - 44, 30, 6);
    dot(x - 5, y - 59, 1.8, '#1A2338'); dot(x + 5, y - 59, 1.8, '#1A2338');
    ctx.fillStyle = lit ? '#FF9A3C' : '#46557A';
    ctx.beginPath(); ctx.moveTo(x, y - 54); ctx.lineTo(x + 10, y - 52); ctx.lineTo(x, y - 50); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * 6.2832;
      dot(x + Math.cos(a) * 24, y - 22 + Math.sin(a) * 24, 1.8, lit ? WARM : '#28334E');
    }
    if (lit) glow('warm', x, y - 40, 62, 0.42); else glow('cold', x, y - 40, 40, 0.18);
  }
  /* 青いLEDで覆われた並木（特別ステージ） */
  function drawBlueTree(t, lit) {
    const x = t.x, y = t.y;
    shadow(x, y + 4, 22);
    ctx.strokeStyle = '#2A3150'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 46);
    ctx.moveTo(x, y - 30); ctx.lineTo(x - 22, y - 62); ctx.moveTo(x, y - 38); ctx.lineTo(x + 24, y - 70);
    ctx.moveTo(x, y - 46); ctx.lineTo(x - 6, y - 88); ctx.stroke();
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, r = 8 + (i % 6) * 5.2;
      const px = x + Math.cos(a) * r, py = y - 62 + Math.sin(a) * r * 0.9;
      dot(px, py, 2, lit ? '#9CC4FF' : '#1E2742');
    }
    if (lit) glow('blue', x, y - 60, 58, 0.62);
  }
  /* 時間延長のイルミには「+10秒」の札を出す */
  function drawBonusBadge(t) {
    if (t.done || !t.def.bonus) return;
    const y = t.y - (PROP_H[t.type] || 96) - 20 + Math.sin(G.time * 3) * 2;
    ctx.font = '700 20px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    const text = '+' + CFG.bonusSec + '秒';
    const w = ctx.measureText(text).width + 30;
    ctx.fillStyle = 'rgba(10,14,28,.88)'; rr(t.x - w / 2, y - 22, w, 30, 15); ctx.fill();
    ctx.strokeStyle = '#FFC069'; ctx.lineWidth = 2; ctx.stroke();
    /* 時計の記号 */
    ctx.beginPath(); ctx.arc(t.x - w / 2 + 14, y - 7, 7, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(t.x - w / 2 + 14, y - 11); ctx.lineTo(t.x - w / 2 + 14, y - 7); ctx.lineTo(t.x - w / 2 + 17, y - 5); ctx.stroke();
    ctx.fillStyle = '#FFC069'; ctx.fillText(text, t.x + 7, y);
  }

  /* 進行方向に合わせて絵を選び、左右を反転し、歩幅に合わせて弾ませる。描けたら true */
  /* 進行方向 → 使う絵と左右反転。{ key, flip, dir } */
  function walkPick(kind, vx, vy) {
    const set = WALK[kind];
    const dir = Math.abs(vy) > Math.abs(vx) * 1.2 ? (vy < 0 ? 'back' : 'front') : 'side';
    let pick = set[dir];
    if (!IMG[pick[0]]) pick = set.fb;
    return { key: pick[0], flip: Math.abs(vx) > 0.5 && vx * pick[1] < 0, dir: dir };
  }
  function drawWalker(kind, x, footY, vx, vy, step, h) {
    const w = walkPick(kind, vx, vy);
    const key = w.key;
    if (!IMG[key]) return false;
    const flip = w.flip;
    const bob = Math.abs(Math.sin(step)) * 2.2;
    const hh = CHAR_H[key] || h;
    if (flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
    drawTrimmed(key, x, footY - bob, hh);
    if (flip) ctx.restore();
    return true;
  }

  function shadow(x, y, w) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.32, 0, 0, 6.2832); ctx.fill();
  }

  function drawTree(t, lit, s) {
    const x = t.x, y = t.y;
    shadow(x, y + 6, 22 * s);
    ctx.fillStyle = '#3A2A1C';
    ctx.fillRect(x - 4 * s, y - 14 * s, 8 * s, 18 * s);
    // 三段の樹形
    for (let i = 0; i < 3; i++) {
      const w = (30 - i * 7) * s, h = (30 + i * 2) * s, cy = y - 10 * s - i * 22 * s;
      ctx.fillStyle = i === 0 ? '#16351F' : '#1B4027';
      ctx.beginPath(); ctx.moveTo(x, cy - h); ctx.lineTo(x + w, cy); ctx.lineTo(x - w, cy); ctx.closePath(); ctx.fill();
    }
    // 電飾
    const n = Math.round(11 * s);
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const cy = y - 12 * s - p * 66 * s;
      const w = (30 - p * 24) * s;
      const ox = Math.sin(i * 2.4 + t.t * (lit ? 1.6 : 0)) * w;
      const on = lit || i % 3 !== 0;
      const col = lit ? WARM : (on ? COLD : '#243049');
      dot(x + ox, cy, 2.1 * s, col);
      if (on && !save.lite) glow(lit ? 'warm' : 'cold', x + ox, cy, 11 * s, lit ? 0.5 : 0.3);
    }
    if (s > 1.4) {
      // てっぺんの星（bigtree）
      const sy = y - 12 * s - 70 * s;
      star(x, sy, 11 * s, t.done ? '#2B3654' : '#FFE9A8');
      if (!t.done) glow('warm', x, sy, 40, 0.75);
    }
    glow(lit ? 'warm' : 'cold', x, y - 40 * s, 52 * s, lit ? 0.3 : 0.18);
  }
  function star(x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr2 = i % 2 ? r * 0.44 : r;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    }
    ctx.closePath(); ctx.fill();
  }

  function heartPt(a, s) {
    const x = 16 * Math.pow(Math.sin(a), 3);
    const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    return [x * s, -y * s];
  }
  function drawHeart(t, lit) {
    const x = t.x, y = t.y - 46;
    shadow(t.x, t.y + 4, 16);
    ctx.strokeStyle = '#243049'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(t.x - 3, t.y); ctx.lineTo(t.x - 3, y + 26); ctx.stroke();
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832;
      const p = heartPt(a, 1.5);
      const col = lit ? '#FF9AA6' : (i % 4 === 0 ? '#3C5372' : '#232E47');
      dot(x + p[0], y + p[1], 2.4, col);
      if (lit && !save.lite) glow('red', x + p[0], y + p[1], 10, 0.35);
    }
    glow(lit ? 'red' : 'cold', x, y, lit ? 56 : 30, lit ? 0.45 : 0.12);
  }

  function drawTunnel(t, lit) {
    const x = t.x, y = t.y;
    const ribs = 7;
    for (let i = 0; i < ribs; i++) {
      const ry = y - i * 26;
      const rw = 150 - i * 6;
      const on = lit ? true : i >= ribs / 2 ? false : true;  // 半分だけ消灯
      ctx.strokeStyle = on ? (lit ? 'rgba(255,192,105,.9)' : 'rgba(220,238,255,.85)') : 'rgba(40,51,78,.9)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, ry + 30, rw / 2, 40, 0, Math.PI, 0); ctx.stroke();
      if (on && !save.lite) glow(lit ? 'warm' : 'cold', x, ry - 6, 54, lit ? 0.3 : 0.18);
    }
    glow(lit ? 'warm' : 'cold', x, y - 70, 110, lit ? 0.3 : 0.12);
  }

  function drawPhoto(t, lit) {
    const x = t.x, y = t.y;
    shadow(x, y + 4, 34);
    ctx.fillStyle = '#1A2338';
    ctx.fillRect(x - 40, y - 76, 8, 80); ctx.fillRect(x + 32, y - 76, 8, 80);
    const grd = ctx.createLinearGradient(0, y - 78, 0, y - 6);
    if (lit) { grd.addColorStop(0, 'rgba(255,192,105,.85)'); grd.addColorStop(1, 'rgba(255,150,90,.35)'); }
    else { grd.addColorStop(0, 'rgba(220,238,255,.85)'); grd.addColorStop(1, 'rgba(180,210,240,.32)'); }
    ctx.fillStyle = grd; ctx.fillRect(x - 32, y - 78, 64, 72);
    ctx.strokeStyle = lit ? 'rgba(255,225,180,.9)' : 'rgba(220,238,255,.9)'; ctx.lineWidth = 2;
    ctx.strokeRect(x - 40, y - 82, 80, 78);
    glow(lit ? 'warm' : 'cold', x, y - 44, 66, lit ? 0.5 : 0.35);
  }

  function drawBooth(t, lit) {
    const x = t.x, y = t.y;
    shadow(x, y + 4, 34);
    ctx.fillStyle = '#20293F'; ctx.fillRect(x - 34, y - 42, 68, 42);
    // 屋根のストライプ
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#8E2F3A' : '#D8DEEA';
      ctx.fillRect(x - 40 + i * 13, y - 56, 13, 14);
    }
    // 吊り電飾
    for (let i = 0; i < 6; i++) {
      const lx = x - 32 + i * 13, ly = y - 36 + Math.sin(i) * 2;
      dot(lx, ly, 2.3, lit ? WARM : '#28334E');
      if (lit && !save.lite) glow('warm', lx, ly, 12, 0.5);
    }
    glow(lit ? 'warm' : 'cold', x, y - 30, 50, lit ? 0.35 : 0.1);
  }

  function drawWreath(t, lit) {
    const x = t.x, y = t.y - 40;
    shadow(t.x, t.y + 4, 20);
    ctx.strokeStyle = '#1B4027'; ctx.lineWidth = 13;
    ctx.beginPath(); ctx.arc(x, y, 26, 0, 6.2832); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * 6.2832;
      const on = lit || i % 2 === 0;
      const col = lit ? WARM : (on ? COLD : '#28334E');
      dot(x + Math.cos(a) * 26, y + Math.sin(a) * 26, 2.3, col);
    }
    ctx.fillStyle = '#B33344';
    ctx.beginPath(); ctx.moveTo(x - 8, y + 26); ctx.lineTo(x + 8, y + 26); ctx.lineTo(x, y + 38); ctx.closePath(); ctx.fill();
    glow(lit ? 'warm' : 'cold', x, y, 52, lit ? 0.42 : 0.2);
  }

  function drawWindow(t, lit) {
    const x = t.x, y = t.y;
    ctx.fillStyle = '#131C31'; ctx.fillRect(x - 34, y - 72, 68, 76);
    ctx.fillStyle = lit ? 'rgba(255,186,96,.75)' : 'rgba(220,238,255,.72)';
    ctx.fillRect(x - 28, y - 66, 56, 62);
    ctx.strokeStyle = '#0B1120'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y - 66); ctx.lineTo(x, y - 4); ctx.moveTo(x - 28, y - 34); ctx.lineTo(x + 28, y - 34); ctx.stroke();
    glow(lit ? 'warm' : 'cold', x, y - 34, 62, lit ? 0.45 : 0.3);
  }

  function drawWater(t, lit) {
    const x = t.x, y = t.y;
    ctx.fillStyle = 'rgba(24,52,80,.7)';
    ctx.beginPath(); ctx.ellipse(x, y, 42, 20, 0, 0, 6.2832); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * 6.2832 + t.t * 0.4;
      const px = x + Math.cos(a) * 28, py = y + Math.sin(a) * 12;
      if (lit) { dot(px, py, 2.6, WARM); if (!save.lite) glow('warm', px, py, 16, 0.5); }
      else dot(px, py, 2, '#2A3550');
    }
    if (lit) glow('warm', x, y, 54, 0.32);
  }

  function drawLed(t, lit) {
    const x = t.x, y = t.y;
    shadow(x, y + 4, 36);
    ctx.fillStyle = '#10182B'; ctx.fillRect(x - 40, y - 88, 80, 88);
    for (let i = 0; i < 5; i++) {
      for (let k = 0; k < 5; k++) {
        const on = lit
          ? (Math.sin(t.t * 2 + i + k) > -0.4)
          : ((i + k) % 2 === 0);
        const px = x - 32 + k * 16, py = y - 78 + i * 16;
        ctx.fillStyle = on ? (lit ? (k === 2 || i === 1 ? '#FF7D8C' : WARM) : 'rgba(220,238,255,.75)') : '#1A2440';
        ctx.fillRect(px, py, 11, 11);
      }
    }
    glow(lit ? 'warm' : 'cold', x, y - 44, 70, lit ? 0.42 : 0.3);
  }

  /* --- キャラクター --- */
  function drawPlayer(p) {
    const bob = Math.sin(p.anim) * 2;
    shadow(p.x, p.y + 4, 16);
    // 黒コートが暗い路面に沈むので、足元と背に淡いリムライトを置く
    glow('cold', p.x, p.y - 20 + bob, 32, 0.16);
    const working = G.action && G.action.phase === 'work';
    /* 成否の差分は移動中には使わず、任務の確定後だけに出す（移動・工作の見やすさを守る） */
    const st = G.state;
    const verdict = (st === 'failing' || st === 'fail') ? 'player_agent_failure'
      : ((st === 'finishing' && G.finishT >= CFG.finish.poseAt) || st === 'result' || st === 'ending') ? 'player_agent_success' : null;
    if (verdict && IMG[verdict] && drawTrimmed(verdict, p.x, p.y + 5, CHAR_H[verdict])) {
      /* 得意顔／悔し顔 */
    } else if (working && IMG.player_agent_work
        && drawTrimmed('player_agent_work', p.x, p.y + 5, CHAR_H.player_agent_work)) {
      /* 工作ポーズ素材がある場合はそのまま */
    } else if (drawWalker('player', p.x, p.y + 5, Math.cos(p.face), Math.sin(p.face) * (Math.hypot(p.vx, p.vy) > 5 ? 1 : 0), p.anim, CHAR_H.player_agent)) {
      /* 左へ向いたら絵を反転する（イヤホンのLEDは描き込みの側に付いてくる） */
    } else {
      // 黒コート・スーツ・イヤホンの工作員
      const y = p.y + bob;
      ctx.fillStyle = '#0D1220';
      ctx.beginPath();
      ctx.moveTo(p.x - 13, y); ctx.lineTo(p.x - 10, y - 32);
      ctx.lineTo(p.x + 10, y - 32); ctx.lineTo(p.x + 13, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#E7EEFB'; ctx.fillRect(p.x - 2.5, y - 30, 5, 13);  // シャツ
      ctx.fillStyle = '#2A3550'; ctx.fillRect(p.x - 1.4, y - 28, 2.8, 12); // ネクタイ
      ctx.fillStyle = '#E7C9A8';
      ctx.beginPath(); ctx.arc(p.x, y - 39, 8, 0, 6.2832); ctx.fill();     // 頭
      ctx.fillStyle = '#12161F';
      ctx.beginPath(); ctx.arc(p.x, y - 41, 8.2, Math.PI, 0); ctx.fill();  // 髪
      dot(p.x + 7, y - 38, 1.7, '#FF4A5C');                                // イヤホンのLED
      if (!save.lite) glow('red', p.x + 7, y - 38, 8, 0.6);
    }
    // 向き
    ctx.strokeStyle = 'rgba(220,238,255,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 2);
    ctx.lineTo(p.x + Math.cos(p.face) * 20, p.y + 2 + Math.sin(p.face) * 8); ctx.stroke();
  }

  function drawGuard(g) {
    shadow(g.x, g.y + 4, 14);
    const hot = g.hot;
    if (g.type === 'cam') {
      ctx.fillStyle = '#1A2338'; ctx.fillRect(g.x - 3, g.y - 46, 6, 46);
      ctx.save(); ctx.translate(g.x, g.y - 52); ctx.rotate(g.dir);
      ctx.fillStyle = hot > 0.2 ? '#7A2430' : '#28334E';
      rr(-8, -7, 26, 14, 4); ctx.fill();
      dot(16, 0, 3.2, hot > 0.2 ? RED : '#8FA0C0');
      ctx.restore();
    } else {
      const moving = Math.hypot(g.vx || 0, g.vy || 0) > 4;
      let drew = false;
      if (moving) drew = drawWalker('guard', g.x, g.y + 4, g.vx, g.vy, g.step || 0, CHAR_H.npc_guard);
      else if (g.inv !== 'patrol' && IMG.npc_guard_check) {
        /* 立ち止まって故障を確かめる：懐中電灯を調査先へ向ける（絵は左向き） */
        const flip = g.invLook && g.invLook.x > g.x;
        if (flip) { ctx.save(); ctx.translate(g.x, 0); ctx.scale(-1, 1); ctx.translate(-g.x, 0); }
        drew = drawTrimmed('npc_guard_check', g.x, g.y + 4, CHAR_H.npc_guard_check);
        if (flip) ctx.restore();
      }
      if (!drew && !drawTrimmed('npc_guard', g.x, g.y + 4, CHAR_H.npc_guard)) {
        ctx.fillStyle = hot > 0.2 ? '#4A2030' : '#1C2740';
        ctx.beginPath(); ctx.moveTo(g.x - 12, g.y); ctx.lineTo(g.x - 9, g.y - 30);
        ctx.lineTo(g.x + 9, g.y - 30); ctx.lineTo(g.x + 12, g.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#D9C3A6'; ctx.beginPath(); ctx.arc(g.x, g.y - 37, 7.5, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#28334E'; ctx.beginPath(); ctx.arc(g.x, g.y - 39, 8, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#28334E'; ctx.fillRect(g.x - 9, g.y - 43, 18, 3);
      }
      if (hot > 0.2) glow('red', g.x, g.y - 30, 34, 0.35);
      if (g.bubbleT > 0 && g.bubble) bubble(g.x, g.y - CHAR_H.npc_guard - 10, g.bubble, Math.min(1, g.bubbleT));
      /* 調査先を小さく示す。画面全体に誘導線は増やさない */
      if (g.invLook && inView(g.invLook.y, G.cam.y, 120)) {
        ctx.strokeStyle = 'rgba(255,192,105,.7)'; ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); ctx.lineDashOffset = -G.time * 18;
        ctx.beginPath(); ctx.arc(g.invLook.x, g.invLook.y + 2, 20 + Math.sin(G.time * 5) * 2, 0, 6.2832); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (hot > 0.35) {
      ctx.fillStyle = RED; ctx.font = '700 15px "Chakra Petch", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', g.x, g.y - 58);
    }
  }

  function drawCone(g) {
    const a0 = g.dir - g.fov, a1 = g.dir + g.fov;
    const gr = ctx.createRadialGradient(g.x, g.y, 6, g.x, g.y, g.range);
    const c = g.hot > 0.2 ? '255,74,92' : '255,225,180';
    gr.addColorStop(0, 'rgba(' + c + ',' + (0.2 + g.hot * 0.22) + ')');
    gr.addColorStop(1, 'rgba(' + c + ',0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.arc(g.x, g.y, g.range, a0, a1); ctx.closePath(); ctx.fill();
  }

  /* 遮蔽物（視線を遮る什器・壁）。コーンの上に描いて「陰になる」ことを示す */
  function drawObstacles(camY) {
    for (let i = 0; i < G.obstacles.length; i++) {
      const o = G.obstacles[i];
      if (!inView(o.y, camY, 200)) continue;
      ctx.fillStyle = '#0B1120';
      ctx.fillRect(o.x, o.y - 14, o.w, o.h + 14);
      ctx.fillStyle = '#1C2740';
      ctx.fillRect(o.x, o.y - 14, o.w, 8);
      ctx.fillStyle = 'rgba(143,160,192,.18)';
      ctx.fillRect(o.x, o.y + o.h - 3, o.w, 3);
    }
  }

  function drawCouple(c) {
    shadow(c.x, c.y + 4, 20);
    const ev = c.evt;
    const posing = ev && (ev.phase === 'windup' || ev.phase === 'beat');
    const poseKey = posing ? POSE_KEY[ev.def.type] : null;
    /* 結末が決まったら、そのポーズを保つ（成功を無かったことにしない） */
    const moodKey = !posing && c.mood ? MOOD_KEY[c.mood] : null;
    let h = CHAR_H.npc_couple;
    if (poseKey && IMG[poseKey]) {
      h = CHAR_H[poseKey] || h;
      drawTrimmed(poseKey, c.x, c.y + 4, h);
    } else if (moodKey && IMG[moodKey]) {
      drawTrimmed(moodKey, c.x, c.y + 4, CHAR_H[moodKey]);
    } else if (Math.hypot(c.vx || 0, c.vy || 0) > 1 && drawWalker('couple', c.x, c.y + 4, c.vx, c.vy, c.step || 0, h)) {
      /* 歩いている：進行方向を向く */
    } else {
      /* 専用ポーズ素材が無い場合は、既存の立ち絵を軽く傾けて「構えた」ことを示す */
      const lean = c.pose * 0.12;
      if (lean > 0.001) { ctx.save(); ctx.translate(c.x, c.y + 4); ctx.rotate(lean); ctx.translate(-c.x, -(c.y + 4)); }
      if (!drawTrimmed('npc_couple', c.x, c.y + 4, CHAR_H.npc_couple)) {
        person(c.x - 9, c.y, '#5E4A6E', '#F0D6BE');
        person(c.x + 9, c.y, '#7A3A46', '#F6E0CC');
      }
      if (lean > 0.001) ctx.restore();
    }
    if (posing && ev.cue) drawCue(ev, c);
    // ジャスト妨害の予告（イベント未割当のカップルはハートの合図を使う）
    if (!ev && !c.mood && c.next <= JUST_WINDOW) {
      const k = clamp(1 - Math.abs(c.next) / JUST_WINDOW, 0, 1);
      const y = c.y - 62 - k * 8;
      ctx.globalAlpha = 0.35 + k * 0.65;
      ctx.fillStyle = '#FF7D8C';
      const s = 0.5 + k * 0.7;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const p = heartPt(i / 24 * 6.2832, s); ctx[i ? 'lineTo' : 'moveTo'](c.x + p[0], y + p[1]); }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      if (!save.lite) glow('red', c.x, y, 26 * s, 0.5 * k);
    } else if (!posing && !(c.lineT > 0)) {
      /* 無音・素材なしでも結末が分かる小さな記号（オーラ持ちはハートで対応灯と揃える） */
      const sy = c.y - h - 12;
      if (c.mood === 'lovey' || (c.aura && c.aura.on && !c.mood)) heartIcon(c.x, sy, 9, 1);
      else if (c.mood === 'heartbroken') brokenHeart(c.x, sy, 9);
      else if (c.mood === 'dejected') sighIcon(c.x, sy);
    }
    if (c.lineT > 0 && c.line) bubble(c.x, c.y - 66, c.line, Math.min(1, c.lineT));
  }

  /* 小さなハート（素材があればそれを使う） */
  function heartIcon(x, y, r, a) {
    ctx.globalAlpha = a;
    if (IMG.fx_love_heart) ctx.drawImage(IMG.fx_love_heart, x - r * 1.25, y - r * 1.25, r * 2.5, r * 2.5);
    else {
      ctx.fillStyle = '#FF7DB0';
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const q = heartPt(i / 24 * 6.2832, r / 16); ctx[i ? 'lineTo' : 'moveTo'](x + q[0], y + q[1]); }
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function brokenHeart(x, y, r) {
    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(x + side * 2.5, y + (side > 0 ? 2 : 0));
      ctx.rotate(side * 0.18);
      ctx.beginPath(); ctx.rect(side < 0 ? -r * 1.3 : 0, -r * 1.3, r * 1.3, r * 2.6); ctx.clip();
      ctx.fillStyle = '#9DA9C4';
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const q = heartPt(i / 24 * 6.2832, r / 16); ctx[i ? 'lineTo' : 'moveTo'](q[0], q[1]); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  function sighIcon(x, y) {
    ctx.fillStyle = 'rgba(10,14,28,.8)'; rr(x - 17, y - 10, 34, 18, 9); ctx.fill();
    for (let i = -1; i <= 1; i++) dot(x + i * 8, y - 1, 2.4, '#9DA9C4');
  }

  /* ---------- オーラ ---------- */
  /* 地面の輪。輪の芯（画像上の半径176px）がワールドの半径 r と一致する大きさで描く */
  function drawAuraRing(a) {
    if (!a.on) return;
    const pulse = save.lite ? 0.85 : 0.72 + Math.sin(a.ph * 2.2) * 0.18;
    if (IMG.fx_love_aura_ring) {
      const size = CFG.aura.ringImg * a.r / CFG.aura.ringCore;
      ctx.globalAlpha = pulse;
      ctx.drawImage(IMG.fx_love_aura_ring, a.x - size / 2, a.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = 'rgba(255,125,176,' + pulse + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.stroke();
    }
  }
  /* 浮かぶハート・消滅・対応灯の印・初接近の点線 */
  function drawAuraFx(a) {
    if (a.on) {
      const mood = a.couple.mood;
      const n = save.lite ? 1 : mood === 'lovey' ? 5 : (mood === 'dejected' || mood === 'heartbroken') ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const k = save.lite ? 0.5 : ((a.ph * 0.45 + i / n) % 1);
        const ang = i * 2.4 + a.ph * 0.3;
        const x = a.x + Math.cos(ang) * a.r * 0.78;
        const y = a.y + Math.sin(ang) * a.r * 0.35 - 14 - k * 46;
        heartIcon(x, y, 6 + (1 - k) * 2, Math.sin(k * Math.PI) * 0.9);
      }
      /* 電源の照明にも同じハートを付けて対応を示す */
      const t = a.source;
      heartIcon(t.x, t.y - (PROP_H[t.type] || 96) - 14, 8, 0.9);
      if (a.linkT > 0) {
        const al = Math.min(1, a.linkT / 0.6);
        ctx.strokeStyle = 'rgba(255,125,176,' + (0.75 * al) + ')'; ctx.lineWidth = 2;
        ctx.setLineDash([6, 7]); ctx.lineDashOffset = -a.ph * 24;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(t.x, t.y - (PROP_H[t.type] || 96) * 0.5); ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (a.breakT > 0) {
      /* 砕ける輪。倍率 1 → 1.15、不透明度 1 → 0（衝突は既に解除済み） */
      const k = 1 - a.breakT / CFG.aura.breakT;
      const size = CFG.aura.ringImg * a.r / CFG.aura.ringCore * (1 + 0.15 * k);
      ctx.globalAlpha = 1 - k;
      if (IMG.fx_love_aura_break) ctx.drawImage(IMG.fx_love_aura_break, a.x - size / 2, a.y - size / 2, size, size);
      else { ctx.strokeStyle = '#FF7DB0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(a.x, a.y, a.r * (1 + 0.15 * k), 0, 6.2832); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  }

  /* 直接ドラッグ：つかめる場所の輪と、移動目標の目印（速度上限で主人公が指より遅れるとき） */
  function drawDragUI() {
    if (save.controls.mode !== 'drag' || G.state !== 'playing') return;
    const p = G.player;
    if (ctl.drag.id === null) {
      if (G.action) return;
      /* 主人公そのものが操作対象だと分かるよう、つかめる範囲をはっきり示す */
      const r = 25 + Math.sin(G.time * 4) * 2;
      ctx.fillStyle = 'rgba(220,238,255,.08)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 26, r, r * 1.45, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(220,238,255,.85)'; ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]); ctx.lineDashOffset = -G.time * 12;
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const tg = dragTarget();
    if (!tg || Math.hypot(tg.x - p.x, tg.y - p.y) < 14) return;
    ctx.strokeStyle = 'rgba(220,238,255,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(tg.x, tg.y + 2, 11, 5, 0, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tg.x - 5, tg.y + 2); ctx.lineTo(tg.x + 5, tg.y + 2);
    ctx.moveTo(tg.x, tg.y - 3); ctx.lineTo(tg.x, tg.y + 7); ctx.stroke();
  }

  /* 見えているのにオーラ越しで工作位置へ行けない対象に、短い案内を出す */
  function drawBlocked(t) {
    const y = t.y - (PROP_H[t.type] || 96) - 34;
    ctx.font = '700 20px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    const text = '近づける側へ';
    const w = ctx.measureText(text).width + 20;
    ctx.fillStyle = 'rgba(10,14,28,.85)'; rr(t.x - w / 2, y - 22, w, 30, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(255,125,176,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#FFC2DA';
    ctx.fillText(text, t.x, y);
  }

  function person(x, y, coat, skin) {
    ctx.fillStyle = coat;
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x - 6, y - 24);
    ctx.lineTo(x + 6, y - 24); ctx.lineTo(x + 8, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x, y - 30, 6, 0, 6.2832); ctx.fill();
  }
  /* 通行カップル：立ち止まって眺める組と、左右に散歩する組。近くの消灯で冷める */
  function drawMob(m) {
    shadow(m.x, m.y + 4, 18);
    const h = CHAR_H.npc_couple;
    let drew = false;
    if (m.mood === 'dejected') drew = drawTrimmed('npc_couple_dejected', m.x, m.y + 4, CHAR_H.npc_couple_dejected);
    else if (Math.abs(m.vx) > 1) drew = drawWalker('couple', m.x, m.y + 4, m.vx, 0, m.step, h);
    else drew = drawTrimmed(m.idleKey, m.x, m.y + 4, CHAR_H[m.idleKey] || h) || drawTrimmed('npc_couple', m.x, m.y + 4, h);
    if (!drew) { person(m.x - 9, m.y, '#5E4A6E', '#F0D6BE'); person(m.x + 9, m.y, '#7A3A46', '#F6E0CC'); }
    if (m.sighT > 0) sighIcon(m.x, m.y - h - 12);
  }
  /* 幅360px相当の画面でも14CSSpx以上になるよう、論理21pxで描く。最大2行 */
  function bubble(x, y, text, a) {
    ctx.font = '500 21px "Noto Sans JP", sans-serif';
    const lines = wrapText(text, 12, 2);
    let w = 0;
    for (let i = 0; i < lines.length; i++) w = Math.max(w, ctx.measureText(lines[i]).width);
    w += 24;
    const lh = 26, bh = lines.length * lh + 8;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(231,238,251,.95)';
    rr(x - w / 2, y - bh, w, bh, 9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#141B30'; ctx.textAlign = 'center';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y - bh + 12 + i * lh + 9);
    ctx.globalAlpha = 1;
  }
  function wrapText(text, per, maxLines) {
    const out = [];
    for (let i = 0; i < text.length && out.length < maxLines; i += per) out.push(text.substr(i, per));
    if (out.length === maxLines && text.length > maxLines * per) {
      out[maxLines - 1] = out[maxLines - 1].slice(0, per - 1) + '…';
    }
    return out;
  }

  /* カップルの頭上に出る合図（アイコン＋短い言葉） */
  function drawCue(ev, c) {
    const s = clamp(c.pose, 0, 1);
    const poseKey = POSE_KEY[ev.def.type];
    const ch = (IMG[poseKey] && CHAR_H[poseKey]) || CHAR_H.npc_couple;
    const y = c.y - ch - 18;
    ctx.font = '700 21px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'left';
    const tw = ctx.measureText(ev.cue).width;
    const w = tw + 46, h = 30;
    ctx.globalAlpha = 0.35 + s * 0.65;
    ctx.fillStyle = 'rgba(10,14,28,.88)';
    rr(c.x - w / 2, y - h, w, h, 9); ctx.fill();
    ctx.strokeStyle = ev.phase === 'beat' ? RED : WARM;
    ctx.lineWidth = 2; ctx.stroke();
    drawCueIcon(ev.def.type, c.x - w / 2 + 18, y - h / 2, 11);
    ctx.fillStyle = COLD;
    ctx.fillText(ev.cue, c.x - w / 2 + 34, y - h / 2 + 7);
    ctx.textAlign = 'center';
    ctx.globalAlpha = 1;
  }

  function drawCueIcon(type, x, y, r) {
    ctx.fillStyle = WARM; ctx.strokeStyle = WARM; ctx.lineWidth = 1.8;
    if (type === 'toast') {
      for (let i = 0; i < 2; i++) {
        const d = i ? r * 0.55 : -r * 0.55;
        ctx.beginPath();
        ctx.moveTo(x + d - r * 0.4, y - r * 0.7); ctx.lineTo(x + d + r * 0.4, y - r * 0.7);
        ctx.lineTo(x + d, y + r * 0.2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + d, y + r * 0.2); ctx.lineTo(x + d, y + r * 0.7); ctx.stroke();
      }
    } else if (type === 'tunnel') {
      ctx.beginPath(); ctx.arc(x, y + r * 0.5, r * 0.8, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r * 0.8, y + r * 0.5); ctx.lineTo(x - r * 0.8, y + r * 0.8);
      ctx.moveTo(x + r * 0.8, y + r * 0.5); ctx.lineTo(x + r * 0.8, y + r * 0.8); ctx.stroke();
    } else if (type === 'star') {
      star(x, y, r * 0.95, WARM);
    } else {
      rr(x - r, y - r * 0.6, r * 2, r * 1.4, 3); ctx.fill();
      ctx.fillStyle = '#0A0E1C';
      ctx.beginPath(); ctx.arc(x, y + r * 0.1, r * 0.42, 0, 6.2832); ctx.fill();
      ctx.fillStyle = WARM;
      ctx.fillRect(x + r * 0.3, y - r * 0.95, r * 0.5, r * 0.4);
    }
  }

  /* 対象の上のタイミング表示。「今から押して間に合うか」を完了予測の印で示す */
  function drawEventUI(ev) {
    if (ev.phase !== 'windup' && ev.phase !== 'beat') return;
    const t = ev.target;
    if (!inView(t.y, G.cam.y, 200)) return;
    const span = justClose();
    const w = 124, h = 9;
    const x = t.x - w / 2, y = t.y - (PROP_H[t.type] || 96) - 34;

    ctx.fillStyle = 'rgba(10,14,28,.85)'; rr(x - 3, y - 3, w + 6, h + 6, 5); ctx.fill();
    /* 受付帯 */
    const a0 = justOpen() / span;
    ctx.fillStyle = 'rgba(255,74,92,.42)'; ctx.fillRect(x + w * a0, y, w * (1 - a0), h);
    /* 経過 */
    ctx.fillStyle = 'rgba(220,238,255,.6)'; ctx.fillRect(x, y, w * clamp(ev.t / span, 0, 1), h);
    /* 基準時刻 */
    ctx.fillStyle = WARM; ctx.fillRect(x + w * (beatTime() / span) - 1.5, y - 4, 3, h + 8);

    /* 工作が完了する位置。ここが受付帯に入っていれば間に合う */
    let rest;
    if (G.action && G.action.target === t) {
      rest = G.action.phase === 'snap'
        ? (SNAP_TIME - G.action.t) + G.action.dur
        : G.action.dur - G.action.t;
    } else if (G.candidate === t) {
      rest = completeDelay(t);
    }
    if (rest !== undefined) {
      const pt = clamp((ev.t + rest) / span, 0, 1);
      const inWin = (ev.t + rest) >= justOpen() && (ev.t + rest) <= justClose();
      const mx = x + w * pt;
      ctx.fillStyle = inWin ? '#6BFFA8' : 'rgba(143,160,192,.9)';
      ctx.beginPath();
      ctx.moveTo(mx, y + h + 3); ctx.lineTo(mx - 5, y + h + 11); ctx.lineTo(mx + 5, y + h + 11);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawPickRing(t) {
    const r = 30 + Math.sin(G.time * 5) * 2.5;
    ctx.strokeStyle = RED; ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 6]); ctx.lineDashOffset = -G.time * 26;
    ctx.beginPath(); ctx.ellipse(t.x, t.y + 2, r, r * 0.42, 0, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = RED; ctx.font = '700 12px "Chakra Petch", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('工作可能', t.x, t.y - 96);
  }
  function drawWorkRing(a) {
    const t = a.target, k = clamp(a.t / a.dur, 0, 1);
    ctx.strokeStyle = 'rgba(220,238,255,.25)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(t.x, t.y - 4, 30, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = COLD;
    ctx.beginPath(); ctx.arc(t.x, t.y - 4, 30, -Math.PI / 2, -Math.PI / 2 + k * 6.2832); ctx.stroke();
  }

  function drawSnow() {
    ctx.fillStyle = 'rgba(231,238,251,.55)';
    for (let i = 0; i < G.snow.length; i++) {
      const s = G.snow[i];
      ctx.globalAlpha = 0.25 + s.r * 0.22;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- HUD 更新 ---------- */
  const ui = {};
  function cacheUI() {
    ['stageName', 'timeVal', 'timeBox', 'moodFill', 'moodPct', 'moodBar', 'comboTag', 'centerMsg',
      'hint', 'danger', 'eye', 'eyeRing', 'btnSab', 'sabRing', 'stick', 'stickKnob', 'hud',
      'radio', 'reactCard', 'reactImg', 'reactTxt'].forEach((k) => { ui[k] = $(k); });
    endingEls = {
      dim: $('endDim'), couple: $('endCouple'), lovey: $('endLovey'), breakup: $('endBreakup'),
      lineA: $('endLineA'), lineB: $('endLineB'), art: $('endArt'), hero: $('endHero'), prompt: $('endPrompt'),
      revBg: $('revBg'), revCouple: $('revCouple'), revLineA: $('revLineA'), revLineB: $('revLineB'), revBanner: $('revBanner'),
    };
  }
  function updateMoodUI() {
    const m = Math.max(0, Math.round(G.mood));
    ui.moodFill.style.width = m + '%';
    ui.moodPct.textContent = m + '%';
    ui.moodBar.classList.toggle('cold', m <= 50);
    ui.moodPct.style.color = m <= 50 ? 'var(--cold)' : 'var(--gold)';
  }
  function updateTimeUI() {
    const s = Math.ceil(G.left);
    if (ui.timeVal.textContent !== String(s)) ui.timeVal.textContent = s;
    ui.timeBox.classList.toggle('warn', G.left <= 15);
  }
  function updateChrome() {
    const d = G.detect;
    ui.danger.style.opacity = d > 30 ? ((d - 30) / 70 * 0.85).toFixed(3) : 0;
    ui.eye.classList.toggle('on', d > 8);
    ui.eyeRing.style.setProperty('--deg', (d / 100 * 360) + 'deg');
    ui.comboTag.classList.toggle('grace', G.graceOn);
    const ready = !!G.candidate && !G.action;
    if (ready !== chromeReady) {
      chromeReady = ready;
      ui.btnSab.classList.toggle('ready', ready);
      if (ready) { Audio2.se.ready(); haptic(8); }
    }
  }
  let chromeReady = false;
  let msgTimer = null;
  function centerMsg(main, sub) {
    ui.centerMsg.innerHTML = main + (sub ? '<span class="sub">' + sub + '</span>' : '');
    ui.centerMsg.classList.remove('show');
    void ui.centerMsg.offsetWidth;
    ui.centerMsg.classList.add('show');
  }
  function hint(text) {
    if (!text) { ui.hint.classList.remove('on'); return; }
    if (ui.hint.textContent !== text) ui.hint.textContent = text;
    ui.hint.classList.add('on');
  }

  /* ---------- 画面遷移 ---------- */
  const OVS = ['ovTitle', 'ovSelect', 'ovResult', 'ovFail', 'ovPause', 'ovSettings', 'ovLayout', 'ovEnding', 'ovExit'];
  function showOv(id) {
    OVS.forEach((o) => $(o).classList.toggle('on', o === id));
    ui.hud.classList.toggle('hide', !!id);
    if (id) { hint(''); releaseAll(); }
  }
  function hideOv() { OVS.forEach((o) => $(o).classList.remove('on')); ui.hud.classList.remove('hide'); }

  function showTitle() {
    ++startToken;
    Audio2.stopBgm();
    G.stage = null; G.state = 'title';
    showOv('ovTitle');
  }
  function showSelect() {
    G.state = 'select';
    buildStageList();
    showOv('ovSelect');
  }

  function startStage(idx) {
    Audio2.unlock();
    releaseAll();
    buildStage(idx);
    hideOv();
    applyLayout();
    G.state = 'ready';
    const st = STAGES[idx];
    centerMsg(st.special ? 'SPECIAL STAGE' : 'STAGE ' + st.id, st.name + '　/　' + st.theme);
    radio(st.special ? '本部「延長戦だ。ふたりの意地ごと、平日に戻せ」'
      : idx === 0 ? RADIO.start + '　' + RADIO.startMe : RADIO.start, 3.0);
    Audio2.duck(false);
    Audio2.startBgm();
    const token = ++startToken;
    setTimeout(() => { if (G.state === 'ready' && token === startToken) G.state = 'playing'; }, 1100);
  }
  let startToken = 0;
  function retry() { releaseAll(); startStage(G.stageIdx); }

  function buildStageList() {
    const list = $('stageList');
    list.innerHTML = '';
    NORMAL.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'slot';
      const open = i + 1 <= save.unlocked;
      if (!open) b.disabled = true;
      const best = bests()[s.id];                 // 比較・表示は今回のルール版の記録だけ
      const old = !best && (save.best2[s.id] || save.best[s.id]);
      b.innerHTML =
        '<span class="no">0' + s.id + '</span>' +
        '<span><span class="nm">' + (open ? s.name : '???') + '</span>' +
        '<span class="th">' + (open ? s.theme + '　/　制限 ' + s.time + '秒' : '前のステージをクリアで解放') + '</span></span>' +
        '<span class="best">' + (best ? '<b>' + best.rank + '</b>' + best.score.toLocaleString()
          : old ? '<b>–</b>旧版クリア済み' : open ? '<b>–</b>未挑戦' : '') + '</span>';
      b.addEventListener('click', () => { if (open) { Audio2.se.ui(); startStage(i); } });
      list.appendChild(b);
    });
    /* 全制覇の後に出現する特別ステージ。何度でも遊べる */
    if (save.specialUnlocked) {
      const sp = STAGES.find((x) => x.special), si = STAGES.indexOf(sp);
      const best = bests()[sp.id];
      const b = document.createElement('button');
      b.className = 'slot special';
      b.innerHTML = '<span class="no">SP</span><span><span class="nm">' + sp.name + '</span>'
        + '<span class="th">' + sp.theme + '　/　イルミ ' + sp.targets.length + '個・制限 ' + sp.time + '秒</span></span>'
        + '<span class="best">' + (best ? '<b>' + best.rank + '</b>' + best.score.toLocaleString()
          : save.specialSeen ? '<b>–</b>未挑戦' : '<b class="new">NEW</b>') + '</span>';
      b.addEventListener('click', () => {
        Audio2.se.ui();
        save.specialSeen = true; putSave(); updateTitleBadge();
        startStage(si);
      });
      list.appendChild(b);
    }
    /* 全ステージ制覇で解放。何度でも再生できる（復縁の場面まで） */
    if (save.allClearEndingUnlocked) {
      const b = document.createElement('button');
      b.className = 'slot ending';
      b.innerHTML = '<span class="no">END</span><span><span class="nm">エンディングを見る</span>'
        + '<span class="th">聖夜、完全終了。</span></span>'
        + '<span class="best">' + (save.allClearEndingSeen ? '' : '<b class="new">NEW</b>') + '</span>';
      b.addEventListener('click', () => { Audio2.se.ui(); startEnding(true, 'ovSelect'); });
      list.appendChild(b);
    }
  }
  function updateTitleBadge() {
    const b = $('newEnding');
    if (!b) return;
    if (save.specialUnlocked && !save.specialSeen) {
      b.textContent = '特別ステージ「青の回廊」が出現しました（ステージ選択から）';
      b.hidden = false;
    } else if (save.allClearEndingUnlocked && !save.allClearEndingSeen) {
      b.textContent = '新しいエンディングが解放されました（ステージ選択から）';
      b.hidden = false;
    } else b.hidden = true;
  }

  /* ---------- 入力 ---------- */
  /* pointerId ごとに「移動／工作／UI」の担当を決め、取得後は担当を変えない。
     画面の半分で役割を決める暗黙の領域は廃止し、見えるスティックと工作ボタンだけに反応する */
  let touchMode = false;
  const frame = $('frame');
  const ctl = {
    stick: { id: null, ox: 0, oy: 0, vx: 0, vy: 0 },   // ox,oy：つまみのずれ（CSS px）
    drag:  { id: null, fx: 0, fy: 0, sx: 0, sy: 0, offX: 0, offY: 0 },   // 指の位置（フレーム内 CSS px）
    work:  { id: null },
    pos:   { stick: { x: 0, y: 0 }, btn: { x: 0, y: 0 } },              // 現在の中心（フレーム内 CSS px）
    safe:  { x0: 0, y0: 0, x1: 0, y1: 0 },
    rect:  { left: 0, top: 0, width: W, height: H },
  };

  function localCss(e) { return { x: e.clientX - ctl.rect.left, y: e.clientY - ctl.rect.top }; }
  /* ワールド座標（足元）→ フレーム内 CSS px。カメラの位置とズームを反映する */
  function worldToCss(x, y) {
    const z = G.cam.zoom, sc = ctl.rect.width / W;
    return { x: ((x - W / 2) * z + W / 2) * sc, y: ((y - G.cam.y - H / 2) * z + H / 2) * sc };
  }
  function cssToWorld(cx, cy) {
    const z = G.cam.zoom, sc = ctl.rect.width / W;
    return { x: (cx / sc - W / 2) / z + W / 2, y: (cy / sc - H / 2) / z + H / 2 + G.cam.y };
  }
  /* 直接ドラッグの目標。毎フレーム、現在のカメラで変換し直す（スクロールで目標が飛ばない） */
  function dragTarget() {
    if (ctl.drag.id === null || !G.stage) return null;
    const w = cssToWorld(ctl.drag.fx - ctl.drag.offX, ctl.drag.fy - ctl.drag.offY);
    return { x: clamp(w.x, 34, W - 34), y: clamp(w.y, 90, G.stage.worldH - 60) };
  }
  /* 主人公の描画範囲＋つかみやすい余白。最低 56 CSS px 四方 */
  function hitPlayer(pt) {
    const C = CFG.controls, sc = ctl.rect.width / W, f = worldToCss(G.player.x, G.player.y);
    let half = Math.max(20 * sc + C.dragHitPad, C.dragHitMin / 2);
    let top = f.y - CHAR_H.player_agent * sc - C.dragHitPad, bottom = f.y + 8 * sc + C.dragHitPad;
    if (bottom - top < C.dragHitMin) { const m = (top + bottom) / 2; top = m - C.dragHitMin / 2; bottom = m + C.dragHitMin / 2; }
    return pt.x >= f.x - half && pt.x <= f.x + half && pt.y >= top && pt.y <= bottom;
  }

  /* ----- 配置 ----- */
  /* ゲーム表示領域からノッチ・ホームバー等を除き、上部HUDの帯も避けた、操作を置ける範囲 */
  function safeRect() {
    const r = frame.getBoundingClientRect();
    ctl.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    const cs = getComputedStyle($('safeProbe'));
    const it = parseFloat(cs.paddingTop) || 0, ir = parseFloat(cs.paddingRight) || 0;
    const ib = parseFloat(cs.paddingBottom) || 0, il = parseFloat(cs.paddingLeft) || 0;
    const u = r.width / W;
    return {
      x0: Math.max(0, il - r.left),
      y0: Math.max(190 * u, it - r.top),                 // 一時停止・ムード・発見ゲージの帯
      x1: Math.min(r.width, window.innerWidth - ir - r.left),
      y1: Math.min(r.height, window.innerHeight - ib - r.top),
    };
  }
  function presetPos(preset, sr) {
    const C = CFG.controls, y = sr.y1 - C.edgeY;
    if (preset === 'bl') return { stick: { x: sr.x0 + C.sideX, y: y }, btn: { x: sr.x1 - C.sideX, y: y } };
    if (preset === 'bc') return { stick: { x: (sr.x0 + sr.x1) / 2, y: y }, btn: { x: sr.x1 - C.centerBtnX, y: y } };
    return { stick: { x: sr.x1 - C.sideX, y: y }, btn: { x: sr.x0 + C.sideX, y: y } };   // br（初期）
  }
  function layoutFrom(c, sr) {
    if (c.preset === 'custom' && c.stick && c.btn) {
      const w = sr.x1 - sr.x0, h = sr.y1 - sr.y0;
      return {
        stick: { x: sr.x0 + c.stick[0] * w, y: sr.y0 + c.stick[1] * h },
        btn: { x: sr.x0 + c.btn[0] * w, y: sr.y0 + c.btn[1] * h },
      };
    }
    return presetPos(c.preset, sr);
  }
  /* 画面外・HUD・互いの操作領域と重ならない位置へ直す。keep は動かさない側 */
  function fitLayout(pos, sr, keep) {
    const C = CFG.controls;
    const rs = C.acquireR, rb = C.btnR, minD = rs + rb + C.gap;
    const cl = (pt, r) => {
      pt.x = clamp(pt.x, sr.x0 + r + 4, Math.max(sr.x0 + r + 4, sr.x1 - r - 4));
      pt.y = clamp(pt.y, sr.y0 + r + 4, Math.max(sr.y0 + r + 4, sr.y1 - r - 4));
    };
    cl(pos.stick, rs); cl(pos.btn, rb);
    for (let i = 0; i < 4; i++) {
      const dx = pos.btn.x - pos.stick.x, dy = pos.btn.y - pos.stick.y, d = Math.hypot(dx, dy);
      if (d >= minD) return pos;
      const ux = d > 0.01 ? dx / d : 1, uy = d > 0.01 ? dy / d : 0;
      if (keep === 'btn') { pos.stick.x = pos.btn.x - ux * minD; pos.stick.y = pos.btn.y - uy * minD; cl(pos.stick, rs); }
      else { pos.btn.x = pos.stick.x + ux * minD; pos.btn.y = pos.stick.y + uy * minD; cl(pos.btn, rb); }
    }
    /* それでも重なる狭い画面では、工作ボタンをスティックの上へ逃がす */
    if (Math.hypot(pos.btn.x - pos.stick.x, pos.btn.y - pos.stick.y) < minD) {
      pos.btn.x = pos.stick.x; pos.btn.y = pos.stick.y - minD; cl(pos.btn, rb);
    }
    return pos;
  }
  function applyLayout() {
    const sr = safeRect();
    ctl.safe = sr;
    const pos = fitLayout(layoutFrom(save.controls, sr), sr, null);
    ctl.pos = pos;
    placeControls(pos);
  }
  function placeControls(pos) {
    const C = CFG.controls;
    ui.stick.style.left = (pos.stick.x - C.stickR) + 'px';
    ui.stick.style.top = (pos.stick.y - C.stickR) + 'px';
    ui.btnSab.style.left = (pos.btn.x - C.btnR) + 'px';
    ui.btnSab.style.top = (pos.btn.y - C.btnR) + 'px';
    const drag = save.controls.mode === 'drag';
    ui.stick.hidden = drag;
    document.body.classList.toggle('mode-drag', drag);
    /* 無線は操作系の少し上に置く */
    const topOfControls = Math.min(drag ? Infinity : pos.stick.y - C.acquireR, pos.btn.y - C.btnR);
    ui.radio.style.bottom = Math.max(8, ctl.rect.height - topOfControls + 8) + 'px';
  }

  /* ----- ポインター ----- */
  function capture(e) { try { frame.setPointerCapture(e.pointerId); } catch (err) { /* 取得できなくても動作は続ける */ } }
  frame.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') touchMode = true;
    Audio2.unlock();
    const onBtn = e.target.closest('#btnSab');
    /* UIの取得が最優先。オーバーレイと通常のボタンはそれぞれの処理に任せる */
    if (!onBtn && (e.target.closest('button') || e.target.closest('.ov'))) return;
    /* 新しい押下だけがスキップになる。工作に使っていた押しっぱなしは拾わない */
    if (skipFinish()) { e.preventDefault(); return; }
    if (G.state !== 'playing' && G.state !== 'ready') return;
    const pt = localCss(e);
    if (onBtn) {
      if (ctl.work.id !== null) return;
      ctl.work.id = e.pointerId; capture(e);
      ui.btnSab.classList.add('press');
      startAction();
      e.preventDefault();
      return;
    }
    if (save.controls.mode === 'stick') {
      const C = CFG.controls;
      if (ctl.stick.id === null && Math.hypot(pt.x - ctl.pos.stick.x, pt.y - ctl.pos.stick.y) <= C.acquireR) {
        ctl.stick.id = e.pointerId; capture(e);
        ui.stick.classList.add('active');
        stickMove(pt);
        e.preventDefault();
      }
      return;
    }
    /* 直接ドラッグ：主人公に触れたときだけ取得。つかんだ位置のずれを保ち、指へ瞬間移動させない */
    if (ctl.drag.id === null && G.stage && hitPlayer(pt)) {
      const f = worldToCss(G.player.x, G.player.y);
      ctl.drag.id = e.pointerId;
      ctl.drag.fx = ctl.drag.sx = pt.x; ctl.drag.fy = ctl.drag.sy = pt.y;
      ctl.drag.offX = pt.x - f.x; ctl.drag.offY = pt.y - f.y;
      capture(e);
      e.preventDefault();
    }
  });
  frame.addEventListener('pointermove', (e) => {
    if (e.pointerId === ctl.stick.id) stickMove(localCss(e));
    else if (e.pointerId === ctl.drag.id) { const pt = localCss(e); ctl.drag.fx = pt.x; ctl.drag.fy = pt.y; }
  });
  function stickMove(pt) {
    const C = CFG.controls;
    let dx = pt.x - ctl.pos.stick.x, dy = pt.y - ctl.pos.stick.y;
    const d = Math.hypot(dx, dy);
    if (d > C.stickR) { dx = dx / d * C.stickR; dy = dy / d * C.stickR; }
    ctl.stick.ox = dx; ctl.stick.oy = dy;
    const m = Math.hypot(dx, dy);
    if (m < C.dead) { ctl.stick.vx = 0; ctl.stick.vy = 0; }
    else {
      /* 半分ほど倒せば全速。わずかに倒したときだけ細かく歩ける */
      const k = clamp((m - C.dead) / (C.stickR * 0.5 - C.dead), 0, 1) / m;
      ctl.stick.vx = dx * k; ctl.stick.vy = dy * k;
    }
    ui.stickKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  function resetStick() {
    ctl.stick.id = null; ctl.stick.ox = ctl.stick.oy = 0; ctl.stick.vx = ctl.stick.vy = 0;
    ui.stickKnob.style.transform = 'translate(0,0)';
    ui.stick.classList.remove('active');
  }
  function release(e) {
    if (e.pointerId === ctl.stick.id) resetStick();
    if (e.pointerId === ctl.drag.id) ctl.drag.id = null;
    if (e.pointerId === ctl.work.id) { ctl.work.id = null; ui.btnSab.classList.remove('press'); }
  }
  /* 入力状態を全部解除する（pointercancel・タブ非表示・リトライ・操作方式の切替） */
  function releaseAll() {
    resetStick();
    ctl.drag.id = null;
    ctl.work.id = null;
    input.keys.l = input.keys.r = input.keys.u = input.keys.d = 0;
    if (ui.btnSab) ui.btnSab.classList.remove('press');
  }
  frame.addEventListener('pointerup', release);
  frame.addEventListener('pointercancel', release);
  frame.addEventListener('lostpointercapture', release);
  frame.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (G.ending) {
      if ((k === ' ' || k === 'enter') && !e.repeat) { e.preventDefault(); skipEnding(); }
      return;
    }
    if ($('ovLayout').classList.contains('on')) return;
    if (k === 'a' || k === 'arrowleft') input.keys.l = 1;
    if (k === 'd' || k === 'arrowright') input.keys.r = 1;
    if (k === 'w' || k === 'arrowup') input.keys.u = 1;
    if (k === 's' || k === 'arrowdown') input.keys.d = 1;
    if ((k === ' ' || k === 'enter') && !e.repeat) {
      if (e.target.closest && e.target.closest('button') && G.state !== 'playing') return;
      e.preventDefault();
      if (skipFinish()) return;
      if (G.state === 'playing') startAction();
    }
    if (k === 'p' || k === 'escape') { if (G.state === 'playing') doPause(); }
    if (k === 'r' && (G.state === 'fail' || G.state === 'playing' || G.state === 'result')) retry();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseForBackground();
    } else {
      last = 0;   // 復帰直後に大きなdtで一気に進めない
    }
  });
  window.addEventListener('blur', releaseAll);
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') input.keys.l = 0;
    if (k === 'd' || k === 'arrowright') input.keys.r = 0;
    if (k === 'w' || k === 'arrowup') input.keys.u = 0;
    if (k === 's' || k === 'arrowdown') input.keys.d = 0;
  });

  /* ----- 操作方式・配置の変更 ----- */
  function setControlMode(m) {
    if (CONTROL_MODES.indexOf(m) < 0) return;
    releaseAll();                     // 保持中のポインター・移動目標を解除する
    save.controls.mode = m;
    putSave();
    applyLayout();
    refreshControlUI();
  }
  function setPreset(pr) {
    if (PRESETS.indexOf(pr) < 0 || pr === 'custom') return;
    save.controls.preset = pr;        // 自由配置の値は残しておく（プリセットに切り替えるだけ）
    putSave();
    applyLayout();
    refreshControlUI();
  }
  function refreshControlUI() {
    const c = save.controls;
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === c.mode)));
    document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === c.preset)));
    $('presetNote').textContent = c.preset === 'custom' ? '自由配置を使用中' : '';
    const drag = c.mode === 'drag';
    $('briefMove').textContent = !touchMode ? 'WASD / 矢印キー（スマホは' + (drag ? '主人公を直接ドラッグ' : 'スティック') + '）'
      : drag ? '主人公を指でつかんで動かす' : '画面下のスティック';
    $('briefSab').textContent = !touchMode ? '近づいてスペースキー（スマホは「工作」ボタン）' : '近づいて「工作」ボタン';
    if ($('protoStats')) $('protoStats').innerHTML = protoStatsHtml();
  }
  function protoStatsHtml() {
    const row = (m) => {
      const a = save.proto[m];
      if (!a || !a.runs) return '<tr><th>' + modeName(m) + '</th><td colspan="4">記録なし</td></tr>';
      const avg = (sum, n) => n ? (sum / n).toFixed(1) + '秒' : '—';
      return '<tr><th>' + modeName(m) + '</th><td>' + a.runs + '回</td><td>' + avg(a.move, a.moveN)
        + '</td><td>' + avg(a.work, a.workN) + '</td><td>' + (a.cancels / a.runs).toFixed(1) + '</td></tr>';
    };
    return '<table><thead><tr><th></th><th>プレイ</th><th>初移動</th><th>初工作</th><th>中断/回</th></tr></thead><tbody>'
      + row('stick') + row('drag') + '</tbody></table>';
  }

  /* ----- 位置の調整（編集画面でだけ動かせる。ゲーム中のドラッグでは配置は変わらない） ----- */
  const editor = { pos: null, id: null, which: null, grabX: 0, grabY: 0 };
  function openLayoutEditor() {
    editor.id = null; editor.which = null;
    const sr = safeRect();
    ctl.safe = sr;
    editor.pos = fitLayout(layoutFrom(save.controls, sr), sr, null);
    showOv('ovLayout');
    $('edStick').classList.toggle('dim', save.controls.mode === 'drag');
    drawEditor();
  }
  function drawEditor() {
    const C = CFG.controls, p2 = editor.pos;
    const es = $('edStick'), eb = $('edBtn');
    es.style.left = (p2.stick.x - C.acquireR) + 'px'; es.style.top = (p2.stick.y - C.acquireR) + 'px';
    eb.style.left = (p2.btn.x - C.btnR) + 'px'; eb.style.top = (p2.btn.y - C.btnR) + 'px';
    const band = $('edHud');
    band.style.height = ctl.safe.y0 + 'px';
  }
  function editorDown(e) {
    const which = e.target.closest('#edStick') ? 'stick' : e.target.closest('#edBtn') ? 'btn' : null;
    if (!which || editor.id !== null) return;
    const r = $('ovLayout').getBoundingClientRect();
    editor.id = e.pointerId; editor.which = which;
    editor.grabX = e.clientX - r.left - editor.pos[which].x;
    editor.grabY = e.clientY - r.top - editor.pos[which].y;
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
    e.preventDefault();
  }
  function editorMove(e) {
    if (e.pointerId !== editor.id) return;
    const r = $('ovLayout').getBoundingClientRect();
    editor.pos[editor.which].x = e.clientX - r.left - editor.grabX;
    editor.pos[editor.which].y = e.clientY - r.top - editor.grabY;
    fitLayout(editor.pos, ctl.safe, editor.which);   // 重なりはもう一方を押しのけて解消
    drawEditor();
  }
  function editorUp(e) { if (e.pointerId === editor.id) { editor.id = null; editor.which = null; } }
  function saveLayout() {
    const sr = ctl.safe, w = sr.x1 - sr.x0, h = sr.y1 - sr.y0, p2 = editor.pos;
    const n = (pt) => [clamp((pt.x - sr.x0) / w, 0, 1), clamp((pt.y - sr.y0) / h, 0, 1)];
    save.controls.preset = 'custom';
    save.controls.stick = n(p2.stick);
    save.controls.btn = n(p2.btn);
    putSave();
    applyLayout();
    refreshControlUI();
    showOv('ovSettings');
  }
  function resetLayoutInEditor() {
    editor.pos = fitLayout(presetPos('br', ctl.safe), ctl.safe, null);
    drawEditor();
  }

  function cancelLayout() {
    editor.id = null; editor.which = null; editor.pos = null;
    showOv('ovSettings');
  }

  /* Android back is UI navigation, never WebView history navigation. */
  let androidApp = null;
  let lastAndroidBack = -Infinity;
  let exitPending = false;
  function handleAndroidBack() {
    const now = performance.now();
    if (exitPending || now - lastAndroidBack < 300) return;
    lastAndroidBack = now;
    releaseAll();
    // Overlays take precedence: settings/ending replays can retain the previous G.state.
    const visible = OVS.find((id) => $(id).classList.contains('on'));
    switch (visible) {
      case 'ovExit': showOv('ovTitle'); return;
      case 'ovLayout': cancelLayout(); return;
      case 'ovSettings': showOv(settingsBack); return;
      case 'ovEnding': finishEnding(); return;
      case 'ovPause': resumePlay(); return;
      case 'ovResult': case 'ovFail': showSelect(); return;
      case 'ovSelect': showTitle(); return;
      case 'ovTitle':
        showOv('ovExit');
        $('btnExitCancel').focus();
        return;
    }
    if (G.state === 'playing' || G.state === 'ready') doPause();
    else if (G.state === 'finishing') showResult();
    else if (G.state === 'failing') showFail();
    // Unknown/transitional states consume Back without exiting or discarding the run.
  }
  function pauseForBackground() {
    releaseAll();
    if (G.state === 'playing' || G.state === 'ready') doPause();
    else Audio2.stopBgm();
  }
  async function exitAndroidApp() {
    if (!androidApp || exitPending || !$('ovExit').classList.contains('on')) return;
    exitPending = true;
    $('btnExitConfirm').disabled = true;
    putSave();
    try { await androidApp.exitApp(); }
    catch (err) { console.warn('Android app exit failed', err); }
    finally {
      exitPending = false;
      $('btnExitConfirm').disabled = false;
      showOv('ovTitle');
    }
  }
  function initAndroidNavigation() {
    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()
        || !cap.getPlatform || cap.getPlatform() !== 'android') return;
    androidApp = cap.Plugins && cap.Plugins.App;
    if (!androidApp) return;
    // The native bridge exposes the installed App plugin for this unbundled script.
    // Listeners live for this document's lifetime; boot registers them only once.
    const listen = (event, fn) => {
      try {
        Promise.resolve(androidApp.addListener(event, fn)).catch((err) =>
          console.warn('Android navigation listener failed: ' + event, err));
      } catch (err) { console.warn('Android navigation listener failed: ' + event, err); }
    };
    listen('backButton', handleAndroidBack);
    listen('pause', pauseForBackground);
    listen('resume', () => { last = 0; });
  }

  /* ---------- ボタン結線 ---------- */
  function on(id, fn) { $(id).addEventListener('click', () => { Audio2.se.ui(); fn(); }); }
  function doPause() {
    if (G.state !== 'playing' && G.state !== 'ready') return;
    ++startToken; // Invalidate the pending stage-intro timer, including background pauses.
    G.state = 'pause'; Audio2.duck(true); showOv('ovPause');
  }
  function resumePlay() {
    if (G.state !== 'pause') return;
    releaseAll(); last = 0;
    hideOv(); applyLayout(); G.state = 'playing'; Audio2.duck(false);
    Audio2.startBgm();
  }
  function wireUI() {
    on('btnStart', () => startStage(0));
    on('btnSelect', showSelect);
    on('btnSelBack', showTitle);
    on('btnSettings', () => { settingsBack = 'ovTitle'; refreshControlUI(); showOv('ovSettings'); });
    on('btnSettings2', () => { settingsBack = 'ovPause'; refreshControlUI(); showOv('ovSettings'); });
    on('btnSetBack', () => showOv(settingsBack));
    on('btnPause', doPause);
    on('btnResume', resumePlay);
    on('btnRetry', retry); on('btnRetry2', retry); on('btnRetry3', retry);
    on('btnQuit', showTitle);
    on('btnSelect2', showSelect);
    on('btnSelect3', showSelect);
    on('btnExitCancel', () => showOv('ovTitle'));
    on('btnExitConfirm', exitAndroidApp);
    on('btnNext', () => startStage(Math.min(G.stageIdx + 1, NORMAL.length - 1)));
    on('btnEnding', () => startEnding(true, 'ovResult'));
    on('btnWipe', () => {
      if (!confirm('記録と設定を消去しますか？（操作の配置も初期化されます）')) return;
      try { localStorage.removeItem(SKEY); } catch (e) { /* 消せない環境は次回も残る */ }
      location.reload();
    });
    /* 操作方式（タイトル・設定のどちらからでも切り替えられる） */
    document.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => { Audio2.se.ui(); setControlMode(b.dataset.mode); }));
    document.querySelectorAll('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => { Audio2.se.ui(); setPreset(b.dataset.preset); }));
    on('btnLayout', openLayoutEditor);
    on('btnLayoutSave', saveLayout);
    on('btnLayoutCancel', cancelLayout);
    on('btnLayoutReset', resetLayoutInEditor);
    const ed = $('ovLayout');
    ed.addEventListener('pointerdown', editorDown);
    ed.addEventListener('pointermove', editorMove);
    ed.addEventListener('pointerup', editorUp);
    ed.addEventListener('pointercancel', editorUp);
    ed.addEventListener('lostpointercapture', editorUp);
    /* エンディングは新しいタップで先へ（0.25秒以降） */
    $('ovEnding').addEventListener('pointerdown', (e) => { e.preventDefault(); skipEnding(); });

    sw('swBgm', 'bgm', (v) => { if (!v) Audio2.stopBgm(); else if (G.stage && G.state === 'playing') Audio2.startBgm(); });
    sw('swSe', 'se');
    sw('swHap', 'hap', (v) => { if (v) haptic(16); });
    sw('swLite', 'lite', () => resize());
  }
  let settingsBack = 'ovTitle';
  function sw(id, key, after) {
    const el = $(id);
    el.setAttribute('aria-checked', String(!!save[key]));
    el.addEventListener('click', () => {
      save[key] = !save[key];
      el.setAttribute('aria-checked', String(save[key]));
      putSave(); Audio2.se.ui();
      if (after) after(save[key]);
    });
  }

  /* ---------- メインループ ---------- */
  let last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const now = ts / 1000;
    let dt = last ? now - last : 0;
    last = now;
    dt = Math.min(dt, 0.05);
    /* ジャスト演出のスローは、判定に使う時計も含めて一様に遅くする。
       デート期限・工作・制限時間・コンボ・発見が同じ時計で進むので、窓はずれない */
    if (G.slowmo > 0) dt *= 0.35;
    if (!autoUpdate) { render(); return; }
    stepAll(dt);
    render();
  }
  function stepAll(dt) {
    if (G.ending) updateEnding(dt);          // エンディングは状態に関係なく進める（メニューからの再生も）
    if (G.state === 'playing') update(dt);
    else if (G.state === 'finishing') updateFinishing(dt);
    else if (G.state === 'failing') updateFailing(dt);
    else if (G.state === 'ready' && G.stage) {
      // 開始演出中も雪は動かす
      for (let i = 0; i < G.snow.length; i++) { const s2 = G.snow[i]; s2.y += s2.s * dt; if (s2.y > H) s2.y = -4; }
    }
  }

  /* ---------- テスト用フック ----------
     自動テストから固定dtで進めるための口。通常プレイでは使わない */
  let autoUpdate = true;
  window.XMAS = {
    G: G, CFG: CFG, SAB: SAB, STAGES: STAGES, save: save, SKEY: SKEY, RULES_VERSION: RULES_VERSION,
    input: input, ctl: ctl,
    setAuto(v) { autoUpdate = !!v; },
    startStage: (i) => startStage(i),
    beginPlay(i) { startStage(i); G.state = 'playing'; },
    step(dt) { stepAll(dt); },
    run(sec, dt) { const n = Math.round(sec / (dt || 1 / 60)); for (let k = 0; k < n; k++) this.step(dt || 1 / 60); },
    sabotage: (t, over) => doSabotage(t, over),
    startAction: () => startAction(),
    skipFinish: () => skipFinish(),
    bests: () => bests(),
    findPath: (ax, ay, bx, by, st) => findPath(ax, ay, bx, by, st),
    notifyGuards: (t) => notifyGuards(t),
    evJustOpen: (e) => evJustOpen(e),
    /* イベントの経過時間を t 秒に合わせる（startAt を逆算） */
    setEvT(e, t) { e.phase = t >= CFG.event.windup ? 'beat' : 'windup'; e.startAt = G.time - t; e.t = t; },
    movePlayer: (dx, dy) => movePlayer(dx, dy),
    reachable: (px, py, ax, ay) => reachable(px, py, ax, ay),
    anchorOf: (t, px, py) => anchorOf(t, px, py),
    pickTarget: () => pickTarget(),
    worldToCss: (x, y) => worldToCss(x, y),
    cssToWorld: (x, y) => cssToWorld(x, y),
    hitPlayer: (pt) => hitPlayer(pt),
    applyLayout: () => applyLayout(),
    fitLayout: (pos, sr, keep) => fitLayout(pos, sr, keep),
    presetPos: (pr, sr) => presetPos(pr, sr),
    setControlMode: (m) => setControlMode(m),
    setPreset: (p2) => setPreset(p2),
    releaseAll: () => releaseAll(),
    startEnding: (replay, back) => startEnding(replay, back),
    skipEnding: () => skipEnding(),
    allCleared: () => allCleared(),
    loadSave: () => loadSave(),
    migrateControls: (c, had, lefty) => migrateControls(c, had, lefty),
    NORMAL: NORMAL,
    /* t 以外を工作済みにする（得点は付けない）。最後の1個の検証用 */
    leaveOnly(t) {
      G.targets.forEach((x) => { if (x !== t) { x.done = true; G.remainW -= x.w; } });
      G.remainW = Math.max(t.done ? 0 : t.w, G.remainW);
      G.mood = 100 * G.remainW / G.totalW;
    },
    buildMobs: (st) => buildMobs(st),
    walkPick: (k, vx, vy) => walkPick(k, vx, vy),
    img: (k) => !!IMG[k],
    workMul: () => workMul(),
    openLayoutEditor: () => openLayoutEditor(),
    editor: editor,
  };

  /* ---------- 起動 ---------- */
  function boot() {
    loadSave();
    cacheUI();
    initGlow();
    /* プロトタイプ比較用：?control=stick|drag ／ ?layout=br|bc|bl で方式・配置を指定して開ける */
    try {
      const q = new URLSearchParams(location.search);
      if (CONTROL_MODES.indexOf(q.get('control')) >= 0) save.controls.mode = q.get('control');
      if (['br', 'bc', 'bl'].indexOf(q.get('layout')) >= 0) save.controls.preset = q.get('layout');
    } catch (e) { /* URL が読めない環境では保存値を使う */ }
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) touchMode = true;
    putSave();
    loadAssets();
    wireUI();
    resize();
    applyLayout();
    buildStageList();
    refreshControlUI();
    updateTitleBadge();
    initAndroidNavigation();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));
    requestAnimationFrame(loop);
  }
  boot();
})();
