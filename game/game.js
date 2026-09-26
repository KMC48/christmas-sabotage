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

  /* ---------- v2 調整パラメータ（数値はここだけで調整する） ---------- */
  const RULES_VERSION = 2;                // スコア記録のルール版
  const CFG = {
    event: {
      radius: 260,        // 予告が起動するプレイヤー→対象の距離
      windup: 3.0,        // 予告の長さ。基準時刻 = windup
      justBefore: 1.0,    // 受付開始（基準時刻の前）
      justAfter: 1.0,     // 受付終了（基準時刻の後）
      cooldown: 6.0,      // 撮り切られた後、再予告までの待ち
      reaction: 1.4,      // NPCのオチ表示（仕様1.2秒、読了のため1.5秒まで可）
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
      skipAfter: 0.25,    // これ以降の新しい入力でスキップ可
      zoom: 0.08,         // カメラの引き（低負荷モードでは省略）
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
    led:     { name: '大型LED演出',    mood: 15, dur: 0.70, score: 650, effect: 'white'   },
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
  const STAGES = [
    {
      /* v2：8対象・ムード倍率1.5。6〜7回の工作でクリアできる短い導入に作り替えた */
      id: 1, name: '光の並木道', theme: '待ち合わせ', style: 'street',
      time: 90, worldH: 2100, start: { x: 270, y: 1980 }, tutorial: true,
      moodMul: 1.5,
      rank: { S: 9000, A: 6800, B: 4600 },
      targets: [
        T('tree', 110, 1850),      // 0 出発地点から見える最初の1本
        T('heart', 430, 1690),     // 1
        T('tree', 110, 1520),      // 2
        T('photo', 290, 1330),     // 3 カップルイベント付き
        T('heart', 110, 1130),     // 4
        T('tree', 440, 1000),      // 5
        T('photo', 250, 790),      // 6 通常のフォトスポット
        T('bigtree', 270, 430),    // 7 見せ場。必須の最終対象にはしない
      ],
      obstacles: [{ x: 212, y: 1745, w: 46, h: 58 }, { x: 322, y: 1070, w: 50, h: 56 }],
      guards: [{ x: 452, y: 470, type: 'cam', dir: 2.3, amp: 0.75, spd: 0.6, range: 235, fov: 0.42 }],
      couples: [{ pts: [[212, 1402], [352, 1332]], spd: 15 }],
      crowd: 0,
      events: [{
        id: 's1_photo', type: 'photo', target: 3, couple: 0,
        cues: ['撮るよ', '3', '2', '1'], payoff: '証明写真みたい……',
      }],
    },
    {
      id: 2, name: 'クリスマスマーケット', theme: '食べ歩きデート', style: 'market',
      time: 85, worldH: 2200, start: { x: 270, y: 2080 },
      rank: { S: 11500, A: 8600, B: 5800 },
      targets: [
        T('booth', 96, 1930), T('booth', 444, 1870), T('booth', 96, 1680),
        T('wreath', 270, 1540),
        T('booth', 444, 1420), T('booth', 96, 1300),
        T('tree', 444, 1160), T('tree', 96, 1060),
        T('heart', 270, 940),
        T('wreath', 430, 760),
        T('photo', 150, 620),
        T('bigtree', 300, 360),
      ],
      obstacles: [
        { x: 200, y: 1800, w: 140, h: 44 }, { x: 150, y: 1480, w: 120, h: 44 },
        { x: 300, y: 1230, w: 130, h: 44 }, { x: 180, y: 860, w: 120, h: 44 },
      ],
      guards: [
        { x: 270, y: 1620, type: 'guard', mode: 'patrol', pts: [[120, 1620], [420, 1620]], spd: 42, range: 210, fov: 0.46 },
        { x: 470, y: 520, type: 'cam', dir: 2.6, amp: 0.7, spd: 0.75, range: 240, fov: 0.4 },
      ],
      couples: [{ pts: [[190, 1640], [340, 1562]], spd: 18 }, { pts: [[420, 1000], [160, 880]], spd: 16 }],
      crowd: 10,
      investigate: true,
      events: [{
        id: 's2_wreath', type: 'wreath', target: 3, couple: 0,
        cues: ['ここ、いい感じ', '3', '2', '1'], payoff: 'リース、片側休業？',
      }],
    },
    {
      id: 3, name: '夜景レストラン', theme: 'ディナー', style: 'restaurant',
      time: 80, worldH: 2150, start: { x: 270, y: 2040 },
      rank: { S: 12500, A: 9400, B: 6400 },
      targets: [
        T('window', 90, 1860), T('window', 90, 1700), T('window', 450, 1780),
        T('tree', 270, 1560),
        T('window', 450, 1420), T('window', 90, 1340),
        T('photo', 270, 1180),
        T('window', 450, 1020), T('window', 90, 940),
        T('heart', 270, 800),
        T('tree', 450, 640),
        T('bigtree', 240, 380),
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
      couples: [{ pts: [[368, 1472], [424, 1436]], spd: 14 }, { pts: [[380, 880], [180, 760]], spd: 15 }],
      crowd: 4,
      investigate: true,
      events: [{
        id: 's3_window', type: 'toast', target: 4, couple: 0,
        cues: ['乾杯', '3', '2', '1'], payoff: '急に社員食堂だね',
      }],
    },
    {
      id: 4, name: '海辺のイルミ公園', theme: '告白前', style: 'park',
      time: 85, worldH: 2300, start: { x: 270, y: 2180 },
      rank: { S: 14000, A: 10500, B: 7000 },
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
      ],
      obstacles: [{ x: 60, y: 1700, w: 60, h: 60 }, { x: 420, y: 1240, w: 60, h: 60 }, { x: 60, y: 760, w: 60, h: 60 }],
      guards: [
        { x: 270, y: 1660, type: 'guard', mode: 'patrol', pts: [[110, 1660], [430, 1700]], spd: 50, range: 215, fov: 0.48 },
        { x: 270, y: 980, type: 'guard', mode: 'patrol', pts: [[430, 1000], [120, 960]], spd: 56, range: 215, fov: 0.48 },
        { x: 470, y: 420, type: 'cam', dir: 2.4, amp: 0.85, spd: 0.85, range: 250, fov: 0.44 },
      ],
      couples: [
        { pts: [[180, 1900], [360, 1820]], spd: 16 },
        { pts: [[360, 1322], [190, 1282]], spd: 17 },
        { pts: [[200, 620], [380, 700]], spd: 15 },
      ],
      crowd: 6,
      investigate: true,
      events: [{
        id: 's4_tunnel', type: 'tunnel', target: 5, couple: 1,
        cues: ['せーので入ろう', '3', '2', '1'], payoff: '半分、営業時間外？',
      }],
    },
    {
      id: 5, name: '展望台', theme: 'クライマックス', style: 'tower',
      time: 80, worldH: 2250, start: { x: 270, y: 2130 },
      rank: { S: 16000, A: 12000, B: 8000 },
      targets: [
        T('led', 100, 1980), T('led', 440, 1900),
        T('heart', 270, 1740),
        T('window', 100, 1580), T('window', 440, 1520),
        T('bigtree', 270, 1330),
        T('led', 100, 1120), T('led', 440, 1050),
        T('photo', 270, 890),
        T('heart', 120, 700), T('window', 440, 660),
        T('bigtree', 270, 400),
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
      couples: [{ pts: [[168, 1402], [372, 1358]], spd: 16 }, { pts: [[380, 560], [180, 520]], spd: 15 }],
      crowd: 6,
      investigate: true,
      events: [{
        id: 's5_star', type: 'star', target: 5, couple: 0,
        cues: ['星、見て', '3', '2', '1'], payoff: '主役だけ帰った？',
      }],
    },
  ];

  /* 無線（本部⇔工作員）。長い会話にはしない */
  const RADIO = {
    start:   '本部「この区画を平日に戻せ」',
    startMe: '「了解。定時までに終わらせる」',
    star:    '「頂点を制圧」',
    clear:   '本部「平常運転を確認」',
    caught:  '本部「身分を説明しろ」／「……設備点検です」',
    allClear: '任務完了。缶コーヒー、一本。',
  };

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
    prop_wreath: [78, 7, 363, 495]
  };

  /* 工作対象の種類 → 素材キー / 表示高さ(px) */
  const PROP_KEY = {
    tree: 'prop_tree', bigtree: 'prop_bigtree', heart: 'prop_heart', tunnel: 'prop_tunnel',
    photo: 'prop_photospot', booth: 'prop_booth', wreath: 'prop_wreath', window: 'prop_window',
    water: 'prop_water', led: 'prop_led',
  };
  const PROP_H = {
    tree: 104, bigtree: 186, heart: 98, tunnel: 208, photo: 96,
    booth: 84, wreath: 92, window: 88, water: 46, led: 96,
  };
  const CHAR_H = {
    player_agent: 64, npc_guard: 62, npc_couple: 66, npc_crowd: 54,
    /* 追補ポーズは腕の上げ方・しゃがみで全身の高さが変わるので、体の大きさが揃うよう個別に指定 */
    npc_couple_photo: 72, npc_couple_toast: 66, npc_couple_tunnel: 70, npc_couple_star: 74,
    npc_guard_check: 62, player_agent_work: 54,
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
        if (TRIM[k] && k.indexOf('prop_') === 0) {
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
    best: {},        // ルール版1（旧ルール）の記録。読み取り専用で保持する
    best2: {},       // ルール版2（今回のルール）の記録
    allClear2: false,
    bgm: true, se: true, hap: true, lefty: false, lite: false, awards: {},
  };
  /* 記録はルール版ごとに分ける。旧版の点数と新版の点数は混ぜない */
  function bests() { return RULES_VERSION === 2 ? save.best2 : save.best; }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SKEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && typeof o === 'object') Object.assign(save, o);
      }
    } catch (e) { /* プライベートモード・JSON破損：既定値のまま続行 */ }
    if (!save.best || typeof save.best !== 'object') save.best = {};
    if (!save.best2 || typeof save.best2 !== 'object') save.best2 = {};
    save.unlocked = Math.max(1, Math.min(STAGES.length, save.unlocked | 0));
    /* 旧版で全ステージ踏破済みのセーブに、新版で「初の全クリア」を再演出しない */
    if (!save.allClear2 && STAGES.every((st) => save.best[st.id])) save.allClear2 = true;
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

  function haptic(pattern) {
    if (!save.hap || !navigator.vibrate) return;
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

    G.targets = st.targets.map((t, i) => ({
      i: i, type: t.type, x: t.x, y: t.y, def: SAB[t.type], done: false, glowPhase: Math.random() * 6.28, t: 0,
      mood: Math.round(SAB[t.type].mood * (st.moodMul || 1)),  // ステージ倍率はムードだけに効かせる
      justGiven: false,   // 同じ対象からジャストを二重取得させない
      graceUsed: 0,       // コンボ待機猶予の使用量（1プレイ1対象あたり）
      evt: null,          // 紐付いたイベント
    }));
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
    }));

    /* デートイベント：ステージデータのIDを実在の対象・カップルへ解決する */
    G.events = [];
    (st.events || []).forEach((def) => {
      const tg = G.targets[def.target], cp = G.couples[def.couple];
      if (!tg || !cp) return;                       // 解決できない定義は起動させない
      const ev = {
        def: def, target: tg, couple: cp,
        phase: 'idle', t: 0, cool: 0, cue: '', shot: false,
      };
      tg.evt = ev; cp.evt = ev;
      G.events.push(ev);
    });
    const rnd = mulberry(st.id * 9973);
    G.crowd = [];
    for (let i = 0; i < (st.crowd || 0); i++) {
      G.crowd.push({
        x: 70 + rnd() * 400, y: 260 + rnd() * (st.worldH - 420),
        a: rnd() * 6.28, spd: 8 + rnd() * 10, t: rnd() * 4,
      });
    }
    G.player.x = st.start.x; G.player.y = st.start.y; G.player.vx = G.player.vy = 0; G.player.face = -Math.PI / 2;
    G.cam.y = clamp(G.player.y - H * 0.58, 0, st.worldH - H); G.cam.shake = 0; G.cam.zoom = 1;

    G.snow = [];
    const n = save.lite ? 26 : 54;
    for (let i = 0; i < n; i++) G.snow.push({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 1.9, s: 12 + Math.random() * 26, d: Math.random() * 6.28 });

    Audio2.setIntensity(1);
    hint('');   // 前のステージのチュートリアル表示を持ち越さない
    ui.stageName.textContent = 'STAGE ' + st.id + '　' + st.name;
    updateMoodUI(); updateTimeUI();
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
    for (let i = 0; i < G.crowd.length; i++) if (segCircle(ax, ay, bx, by, G.crowd[i].x, G.crowd[i].y, 15)) return true;
    return false;
  }

  /* ---------- 更新 ---------- */
  function update(dt) {
    const st = G.stage;
    G.time += dt;

    /* --- 残り時間 --- */
    G.left -= dt;
    if (G.left <= 0) { G.left = 0; return fail('時間切れ', '街は今夜も明るいままだ'); }

    /* --- プレイヤー移動 --- */
    const p = G.player;
    let mx = input.mx, my = input.my;
    if (input.keys.l) mx -= 1; if (input.keys.r) mx += 1;
    if (input.keys.u) my -= 1; if (input.keys.d) my += 1;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    const moving = mag > 0.18;

    if (G.action) {
      // 工作中：移動入力でキャンセル（ペナルティなし）
      if (G.action.phase === 'work' && mag > 0.38) cancelAction();
    }
    if (!G.action && moving) {
      p.x += mx * PLAYER_SPEED * dt;
      p.y += my * PLAYER_SPEED * dt;
      p.x = clamp(p.x, 34, W - 34);
      p.y = clamp(p.y, 90, st.worldH - 60);
      p.face = Math.atan2(my, mx);
      p.anim += dt * 11;
    } else {
      p.anim += dt * 2;
    }
    p.vx = mx * PLAYER_SPEED; p.vy = my * PLAYER_SPEED;

    /* --- 工作対象のロック（オートエイム） --- */
    G.candidate = pickTarget();

    /* --- 工作アクション --- */
    if (G.action) {
      const a = G.action;
      if (a.phase === 'snap') {
        a.t += dt;
        const k = clamp(a.t / SNAP_TIME, 0, 1);
        const tx = a.target.x + a.ox, ty = a.target.y + a.oy;
        p.x = lerp(a.fx, tx, k); p.y = lerp(a.fy, ty, k);
        p.face = Math.atan2(a.target.y - p.y, a.target.x - p.x);
        if (k >= 1) { a.phase = 'work'; a.t = 0; Audio2.se.work(); }
      } else {
        a.t += dt;
        ui.sabRing.style.setProperty('--deg', (a.t / a.dur * 360) + 'deg');
        if (a.t >= a.dur) doSabotage(a.target);
      }
    }

    /* --- デートイベント（工作完了の判定より後に進めることで、受付終了の境界を含める） --- */
    updateEvents(dt);

    /* --- 監視（発見ゲージ） --- */
    let seen = false;
    for (let i = 0; i < G.guards.length; i++) {
      const g = G.guards[i];
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
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      let hit = false;
      if (d < g.range) {
        let ang = Math.atan2(p.y - g.y, p.x - g.x) - g.dir;
        while (ang > Math.PI) ang -= 6.2832; while (ang < -Math.PI) ang += 6.2832;
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
    if (G.detect >= DETECT_MAX) return fail('発見された', '工作員は撤退した');

    /* --- カップルNPC --- */
    for (let i = 0; i < G.couples.length; i++) {
      const c = G.couples[i];
      c.t += dt * c.spd / 100 * c.dirSign;
      if (c.t > 1) { c.t = 1; c.dirSign = -1; } else if (c.t < 0) { c.t = 0; c.dirSign = 1; }
      c.x = lerp(c.pts[0][0], c.pts[1][0], c.t);
      c.y = lerp(c.pts[0][1], c.pts[1][1], c.t);
      /* 旧ハート判定はイベント未割当のカップルにだけ残す（ジャスト判定を一本化するため） */
      if (!c.evt) {
        c.next -= dt;
        if (c.next < -JUST_WINDOW) c.next = 5.5 + Math.random() * 3.5;
      }
      if (c.lineT > 0) c.lineT -= dt;
      c.pose = c.evt && (c.evt.phase === 'windup' || c.evt.phase === 'beat')
        ? Math.min(1, c.pose + dt * 4) : Math.max(0, c.pose - dt * 4);
    }
    /* --- 雑踏NPC --- */
    for (let i = 0; i < G.crowd.length; i++) {
      const n = G.crowd[i];
      n.t -= dt;
      if (n.t <= 0) { n.t = 1.5 + Math.random() * 3; n.a = Math.random() * 6.28; }
      n.x = clamp(n.x + Math.cos(n.a) * n.spd * dt, 50, W - 50);
      n.y = clamp(n.y + Math.sin(n.a) * n.spd * dt, 200, st.worldH - 200);
    }

    /* --- コンボ（狙って待てるよう、条件を満たす間だけコンボ時計を止める） --- */
    G.graceOn = false;
    if (G.combo > 0) {
      if (comboGrace(dt)) G.graceOn = true;
      else {
        G.comboT -= dt;
        if (G.comboT <= 0) { G.combo = 0; ui.comboTag.classList.remove('on'); }
      }
    }

    /* --- カメラ --- */
    const want = clamp(p.y - H * 0.56 + p.vy * 0.24, 0, st.worldH - H);
    G.cam.y = lerp(G.cam.y, want, 1 - Math.pow(0.0015, dt));
    G.cam.zoom = lerp(G.cam.zoom, 1, 1 - Math.pow(0.002, dt));
    if (G.cam.shake > 0) G.cam.shake = Math.max(0, G.cam.shake - dt * 3);

    /* --- 雪 --- */
    for (let i = 0; i < G.snow.length; i++) {
      const s = G.snow[i];
      s.d += dt; s.y += s.s * dt; s.x += Math.sin(s.d) * 8 * dt;
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
    }

    if (G.slowmo > 0) G.slowmo -= dt;
    if (G.flash > 0) G.flash -= dt * 2.6;

    if (G.radioT > 0) G.radioT -= dt;

    Audio2.setIntensity(G.mood / 100);
    updateTimeUI();
    updateChrome();
    if (st.tutorial) tutorial();

    /* 同一フレームで失敗も成立していた場合、失敗が先に state を変えている。
       ここまで playing のままなら勝利を確定する（結果の二重保存を防ぐ） */
    if (G.pendingWin && G.state === 'playing') winConfirm();
  }

  /* ---------- デートイベント ---------- */
  const EVCFG = CFG.event;
  function beatTime() { return EVCFG.windup; }
  function justOpen() { return EVCFG.windup - EVCFG.justBefore; }
  function justClose() { return EVCFG.windup + EVCFG.justAfter; }

  /* 今その対象へ工作を始めたら、何秒後に完了するか（吸着＋工作時間＋コンボ短縮） */
  function completeDelay(t) {
    return SNAP_TIME + t.def.dur * (G.combo >= 3 ? 0.84 : 1);
  }

  function updateEvents(dt) {
    let active = null;
    for (let i = 0; i < G.events.length; i++) {
      const e = G.events[i];
      if (e.phase === 'windup' || e.phase === 'beat') { active = e; break; }
    }
    for (let i = 0; i < G.events.length; i++) {
      const e = G.events[i];
      if (e.phase === 'resolved') continue;
      if (e.cool > 0) e.cool -= dt;

      if (e.phase === 'idle') {
        /* 起動条件：対象が未工作・画面内・距離内、かつ強い予告は同時に1つだけ */
        if (active || e.cool > 0 || e.target.done) continue;
        const d = Math.hypot(G.player.x - e.target.x, G.player.y - e.target.y);
        if (d > EVCFG.radius) continue;
        if (!inView(e.target.y, G.cam.y, 40)) continue;
        e.phase = 'windup'; e.t = 0; e.shot = false; e.cue = e.def.cues[0];
        Audio2.se.cue(0);
        active = e;
        continue;
      }

      e.t += dt;
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
      if (e.phase === 'beat' && e.t >= justClose()) {
        /* 受付終了まで妨害されなければ、ここで初めて「撮れた」を確定する */
        if (!e.shot) {
          e.shot = true;
          Audio2.se.shutter();
          say(e.couple, okLine(e.def.type), EVCFG.reaction);
        }
        e.phase = 'cooldown'; e.cool = EVCFG.cooldown; e.cue = '';
      }
      if (e.phase === 'cooldown' && e.cool <= 0) { e.phase = 'idle'; e.t = 0; }
    }
  }

  function okLine(type) {
    return type === 'toast' ? '乾杯' : type === 'tunnel' ? '行こっか' : type === 'star' ? 'きれい……' : 'いい感じ';
  }
  function say(c, line, sec) { c.line = line; c.lineT = sec; }

  /* 受付中か（工作完了時刻で判定する） */
  function evJustOpen(e) {
    return (e.phase === 'windup' || e.phase === 'beat') && e.t >= justOpen() && e.t <= justClose();
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
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < G.targets.length; i++) {
      const t = G.targets[i];
      if (t.done) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d > PICK_RADIUS + 26) continue;
      let ang = Math.atan2(t.y - p.y, t.x - p.x) - p.face;
      while (ang > Math.PI) ang -= 6.2832; while (ang < -Math.PI) ang += 6.2832;
      const s = -d * 1.0 - Math.abs(ang) * 26 + t.def.mood * 1.2;
      if (s > bestScore) { bestScore = s; best = t; }
    }
    return best;
  }

  function startAction() {
    if (G.state !== 'playing' || G.action) return;
    const t = G.candidate;
    if (!t) return;
    const p = G.player;
    const a = Math.atan2(p.y - t.y, p.x - t.x);
    G.action = {
      target: t, phase: 'snap', t: 0,
      fx: p.x, fy: p.y, ox: Math.cos(a) * 42, oy: Math.sin(a) * 42,
      dur: t.def.dur * (G.combo >= 3 ? 0.84 : 1),
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

  /* 工作の確定。順序＝対象の変更→得点→ジャスト→ムード→イベント終了→警備員通知→クリア保留 */
  function doSabotage(t) {
    if (t.done) return;
    t.done = true; t.t = 0;
    G.doneCount++;
    cancelAction();

    /* コンボ */
    G.combo = G.comboT > 0 ? G.combo + 1 : 1;
    G.comboT = COMBO_WINDOW;
    G.maxCombo = Math.max(G.maxCombo, G.combo);

    /* ジャストは1経路に集約し、同じ対象から二重に取らせない */
    const just = t.justGiven ? false : resolveJust(t);
    if (just) t.justGiven = true;

    /* スコア・ムード（ムード減少はステージ倍率込みの実数値） */
    const dmg = t.mood;
    const gain = Math.round(t.def.score * G.combo) + (just ? JUST_BONUS : 0);
    G.score += gain;
    G.mood = Math.max(0, G.mood - dmg);

    /* 演出 */
    G.cam.zoom = 1.06; G.flash = 1;
    Audio2.se.success(G.combo);
    haptic(just ? [18, 30, 24] : 16);
    if (just) {
      G.just++; G.slowmo = 0.16; Audio2.se.just();
      centerMsg('JUST SABOTAGE', '+' + JUST_BONUS);
      if (t.type === 'bigtree') radio(RADIO.star, 2.0);
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

    /* NPCリアクション。イベント対象ならそのオチ、それ以外は汎用の短文 */
    const ev = t.evt;
    if (ev && ev.phase !== 'resolved') {
      const wasOpen = just && evJustOpen(ev);
      ev.phase = 'resolved'; ev.cue = ''; ev.shot = true;
      if (wasOpen) { Audio2.se.shutter(); say(ev.couple, ev.def.payoff, CFG.event.reaction); }
      else say(ev.couple, pickLine(t), CFG.event.reaction);
    } else {
      const lines = REACT[t.def.effect] || REACT.off;
      let near = null, nd = 1e9;
      for (let i = 0; i < G.couples.length; i++) {
        const d = dist2(G.couples[i].x, G.couples[i].y, t.x, t.y);
        if (d < nd) { nd = d; near = G.couples[i]; }
      }
      if (near && nd < 420 * 420) say(near, lines[(Math.random() * lines.length) | 0], CFG.event.reaction);
    }

    /* 照明の異常に気づいた警備員を1人だけ動かす */
    notifyGuards(t);

    updateMoodUI();
    if (G.stage.tutorial && G.tutorialStep < 4) G.tutorialStep = 4;
    /* 勝利は update の末尾で確定する（同一フレームの失敗を優先するため） */
    if (G.mood <= 0) G.pendingWin = true;
  }

  function pickLine(t) {
    const lines = REACT[t.def.effect] || REACT.off;
    return lines[(Math.random() * lines.length) | 0];
  }

  /* ジャスト判定の唯一の入口。完了時刻で判定し、+500は1回だけ */
  function resolveJust(t) {
    if (t.evt && evJustOpen(t.evt)) return true;
    for (let i = 0; i < G.couples.length; i++) {
      const c = G.couples[i];
      if (c.evt) continue;                       // イベント紐付きには旧判定を重ねない
      if (Math.abs(c.next) <= JUST_WINDOW && dist2(c.x, c.y, t.x, t.y) < 320 * 320) {
        c.next = 5.5 + Math.random() * 3.5;      // 同じ合図で2回取らせない
        return true;
      }
    }
    return false;
  }

  /* ---------- 結果・失敗 ---------- */
  const RANK_ORDER = { C: 0, B: 1, A: 2, S: 3 };

  /* 勝利の確定。得点と記録はここで1回だけ確定・保存し、演出は別state で見せる */
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
    if (G.stageIdx + 1 < STAGES.length) save.unlocked = Math.max(save.unlocked, G.stageIdx + 2);
    let allNew = false;
    if (!save.allClear2 && STAGES.every((s2) => B[s2.id])) { save.allClear2 = true; allNew = true; }
    putSave();   // 演出を待たずに保存する。途中で閉じても解放は失われない

    G.result = {
      total: total, rank: rank, award: award, timeUsed: timeUsed, leftAtWin: G.left,
      isFirst: isFirst, isBest: isBest, allNew: allNew,
      just: G.just, maxCombo: G.maxCombo, close: G.close,
    };
    G.state = 'finishing'; G.finishT = 0;
    Audio2.se.clear(); Audio2.duck(true); haptic([26, 40, 14]);
  }

  /* クリア確定後の1.8秒。移動・工作・警備員・イベント・失敗判定は止まる */
  function updateFinishing(dt) {
    const before = G.finishT;
    G.finishT += dt;
    for (let i = 0; i < G.couples.length; i++) if (G.couples[i].lineT > 0) G.couples[i].lineT -= dt;
    for (let i = 0; i < G.guards.length; i++) if (G.guards[i].bubbleT > 0) G.guards[i].bubbleT -= dt;
    if (G.radioT > 0) G.radioT -= dt;
    if (G.slowmo > 0) G.slowmo -= dt;
    if (G.flash > 0) G.flash -= dt * 2.6;
    for (let i = 0; i < G.snow.length; i++) {
      const s2 = G.snow[i];
      s2.d += dt; s2.y += s2.s * dt; s2.x += Math.sin(s2.d) * 8 * dt;
      if (s2.y > H + 4) { s2.y = -4; s2.x = Math.random() * W; }
    }
    /* 変えた周辺を見せるため、低負荷モードでなければ少しだけ引く */
    const z = save.lite ? 1 : 1 - CFG.finish.zoom * clamp((G.finishT - 0.3) / 0.9, 0, 1);
    G.cam.zoom = lerp(G.cam.zoom, z, 1 - Math.pow(0.02, dt));
    if (before < CFG.finish.radioAt && G.finishT >= CFG.finish.radioAt) {
      radio(RADIO.clear, 2.4);
      centerMsg('MISSION CLEAR', '聖夜ムード 0%');
    }
    if (G.finishT >= CFG.finish.hold) showResult();
  }

  function skipFinish() {
    if (G.state === 'finishing' && G.finishT >= CFG.finish.skipAfter) { showResult(); return true; }
    return false;
  }

  function showResult() {
    if (G.state === 'result' || !G.result) return;
    G.state = 'result';
    const r = G.result;
    $('resultEyebrow').textContent = 'MISSION CLEAR / STAGE ' + G.stage.id;
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
    fin.textContent = r.allNew ? RADIO.allClear : '';
    fin.classList.toggle('on', !!r.allNew);

    $('btnNext').style.display = G.stageIdx + 1 < STAGES.length ? '' : 'none';
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

  function fail(title, sub) {
    if (G.state !== 'playing') return;
    G.state = 'fail';
    G.pendingWin = false;
    cancelAction();
    Audio2.se.fail(); Audio2.stopBgm(); haptic([40, 60, 40]);
    G.cam.shake = 1;
    $('failTtl').textContent = title;
    $('failSub').textContent = title === '発見された' ? RADIO.caught : sub;
    setTimeout(() => { if (G.state === 'fail') showOv('ovFail'); }, 480);
  }

  /* ---------- チュートリアル（文章は最小限） ---------- */
  function tutorial() {
    const s = G.tutorialStep;
    if (s === 1) {
      hint(touchMode ? '左側を押したまま動かして移動' : 'WASD / 矢印キーで移動');
      if (G.time > 2.2 || Math.hypot(G.player.vx, G.player.vy) > 30) G.tutorialStep = 2;
    } else if (s === 2) {
      hint('光っている街路樹に近づけ');
      if (G.candidate) G.tutorialStep = 3;
    } else if (s === 3) {
      hint(touchMode ? '右下の「工作」ボタンを押す' : 'スペースキーで工作');
      if (!G.candidate) G.tutorialStep = 2;
    } else if (s === 4) {
      hint('聖夜ムードを 0% にすれば任務完了');
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
    for (let i = 0; i < G.crowd.length; i++) { const c = G.crowd[i]; if (inView(c.y, camY, 60)) draws.push({ y: c.y, k: 'c', o: c }); }
    for (let i = 0; i < G.couples.length; i++) { const c = G.couples[i]; if (inView(c.y, camY, 90)) draws.push({ y: c.y, k: 'p', o: c }); }
    for (let i = 0; i < G.guards.length; i++) { const g = G.guards[i]; if (inView(g.y, camY, 300)) draws.push({ y: g.y, k: 'g', o: g }); }
    draws.push({ y: G.player.y, k: 'me', o: G.player });
    draws.sort((a, b) => a.y - b.y);

    /* 視線コーンは対象より下に敷く */
    for (let i = 0; i < G.guards.length; i++) if (inView(G.guards[i].y, camY, 320)) drawCone(G.guards[i]);
    drawObstacles(camY);

    for (let i = 0; i < draws.length; i++) {
      const d = draws[i];
      if (d.k === 't') drawTarget(d.o);
      else if (d.k === 'c') drawCrowd(d.o);
      else if (d.k === 'p') drawCouple(d.o);
      else if (d.k === 'g') drawGuard(d.o);
      else drawPlayer(d.o);
    }

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
    g.addColorStop(0, style === 'tower' ? '#0C1428' : COL.night);
    g.addColorStop(1, COL.asphalt);
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
    if (style === 'street' || style === 'market') {
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
            ctx.fillStyle = r2() > 0.55 ? 'rgba(255,192,105,.18)' : 'rgba(220,238,255,.10)';
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
      const c = t.done ? 'rgba(220,238,255,.10)' : 'rgba(255,192,105,.14)';
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
    if (IMG[key] && TRIM[key]) {
      shadow(t.x, t.y + 4, Math.max(13, h * 0.20));
      /* 工作後は effect に応じて「冷白色化」か「消灯」に差し替える */
      const vari = lit ? null : (t.def.effect === 'off' ? 'dark' : 'cold');
      drawTrimmed(key, t.x, t.y + 6, h, vari);
      const gy = t.y - h * (t.type === 'water' ? 0.1 : 0.5);
      glow(lit ? 'warm' : 'cold', t.x, gy, lit ? h * 0.7 : h * 0.44, lit ? 0.48 : 0.26);
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
    }
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
    if (working && IMG.player_agent_work
        && drawTrimmed('player_agent_work', p.x, p.y + 5, CHAR_H.player_agent_work)) {
      /* 工作ポーズ素材がある場合はそのまま */
    } else if (drawTrimmed('player_agent', p.x, p.y + 5 + bob, CHAR_H.player_agent)) {
      dot(p.x + 5, p.y - CHAR_H.player_agent * 0.78 + bob, 1.7, '#FF4A5C');   // イヤホンのLED
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
      const checking = g.inv !== 'patrol';
      if (checking && IMG.npc_guard_check) {
        drawTrimmed('npc_guard_check', g.x, g.y + 4, CHAR_H.npc_guard_check);
      } else if (!drawTrimmed('npc_guard', g.x, g.y + 4, CHAR_H.npc_guard)) {
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
    if (poseKey && IMG[poseKey]) {
      drawTrimmed(poseKey, c.x, c.y + 4, CHAR_H[poseKey] || CHAR_H.npc_couple);
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
    if (!ev && c.next <= JUST_WINDOW) {
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
    }
    if (c.lineT > 0 && c.line) bubble(c.x, c.y - 66, c.line, Math.min(1, c.lineT));
  }
  function person(x, y, coat, skin) {
    ctx.fillStyle = coat;
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x - 6, y - 24);
    ctx.lineTo(x + 6, y - 24); ctx.lineTo(x + 8, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x, y - 30, 6, 0, 6.2832); ctx.fill();
  }
  function drawCrowd(n) {
    shadow(n.x, n.y + 3, 10);
    if (!drawTrimmed('npc_crowd', n.x, n.y + 3, CHAR_H.npc_crowd)) person(n.x, n.y, '#2A3550', '#D9C3A6');
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
      'radio'].forEach((k) => { ui[k] = $(k); });
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
  const OVS = ['ovTitle', 'ovSelect', 'ovResult', 'ovFail', 'ovPause', 'ovSettings'];
  function showOv(id) {
    OVS.forEach((o) => $(o).classList.toggle('on', o === id));
    ui.hud.classList.toggle('hide', !!id);
    if (id) { hint(''); ui.stick.classList.remove('on'); input.mx = input.my = 0; input.active = false; }
  }
  function hideOv() { OVS.forEach((o) => $(o).classList.remove('on')); ui.hud.classList.remove('hide'); }

  function startStage(idx) {
    Audio2.unlock();
    buildStage(idx);
    hideOv();
    G.state = 'ready';
    centerMsg('STAGE ' + STAGES[idx].id, STAGES[idx].name + '　/　' + STAGES[idx].theme);
    radio(idx === 0 ? RADIO.start + '　' + RADIO.startMe : RADIO.start, 3.0);
    Audio2.duck(false);
    Audio2.startBgm();
    setTimeout(() => { if (G.state === 'ready') G.state = 'playing'; }, 1100);
  }
  function retry() { releaseAll(); startStage(G.stageIdx); }

  function buildStageList() {
    const list = $('stageList');
    list.innerHTML = '';
    STAGES.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'slot';
      const open = i + 1 <= save.unlocked;
      if (!open) b.disabled = true;
      const best = save.best[s.id];
      b.innerHTML =
        '<span class="no">0' + s.id + '</span>' +
        '<span><span class="nm">' + (open ? s.name : '???') + '</span>' +
        '<span class="th">' + (open ? s.theme + '　/　制限 ' + s.time + '秒' : '前のステージをクリアで解放') + '</span></span>' +
        '<span class="best">' + (best ? '<b>' + best.rank + '</b>' + best.score.toLocaleString() : open ? '<b>–</b>未挑戦' : '') + '</span>';
      b.addEventListener('click', () => { if (open) { Audio2.se.ui(); startStage(i); } });
      list.appendChild(b);
    });
  }

  /* ---------- 入力 ---------- */
  let touchMode = false;
  const frame = $('frame');
  let stickId = null, sabId = null, stickOx = 0, stickOy = 0;
  const STICK_R = 62;

  function local(e) {
    const r = frame.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, w: r.width };
  }
  frame.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    Audio2.unlock();
    if (e.pointerType === 'touch') touchMode = true;
    /* 新しい押下だけがスキップになる。工作に使った押しっぱなしは拾わない */
    if (skipFinish()) return;
    const p = local(e);
    const leftHalf = p.x < W / 2;
    const isStick = save.lefty ? !leftHalf : leftHalf;
    if (isStick && stickId === null) {
      stickId = e.pointerId; stickOx = p.x; stickOy = p.y;
      input.active = true;
      ui.stick.style.left = (p.x - 70) / W * 100 + '%';
      ui.stick.style.top = (p.y - 70) / H * 100 + '%';
      ui.stick.classList.add('on');
      ui.stickKnob.style.transform = 'translate(0,0)';
      frame.setPointerCapture(e.pointerId);
    } else if (!isStick && sabId === null) {
      sabId = e.pointerId;
      ui.btnSab.classList.add('press');
      startAction();
      frame.setPointerCapture(e.pointerId);
    }
  });
  frame.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    const p = local(e);
    let dx = p.x - stickOx, dy = p.y - stickOy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
    const dead = 6;
    input.mx = Math.abs(dx) < dead ? 0 : dx / STICK_R;
    input.my = Math.abs(dy) < dead ? 0 : dy / STICK_R;
    const m = Math.hypot(input.mx, input.my);
    if (m > 1) { input.mx /= m; input.my /= m; }
    const r = frame.getBoundingClientRect();
    ui.stickKnob.style.transform = 'translate(' + (dx / W * r.width) + 'px,' + (dy / H * r.height) + 'px)';
  });
  function releaseAll() {
    stickId = null; sabId = null;
    input.mx = input.my = 0; input.active = false;
    input.keys.l = input.keys.r = input.keys.u = input.keys.d = 0;
    ui.stick.classList.remove('on');
    ui.btnSab.classList.remove('press');
  }
  function release(e) {
    if (e.pointerId === stickId) {
      stickId = null; input.mx = input.my = 0; input.active = false;
      ui.stick.classList.remove('on');
    }
    if (e.pointerId === sabId) { sabId = null; ui.btnSab.classList.remove('press'); }
  }
  frame.addEventListener('pointerup', release);
  frame.addEventListener('pointercancel', release);
  frame.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') input.keys.l = 1;
    if (k === 'd' || k === 'arrowright') input.keys.r = 1;
    if (k === 'w' || k === 'arrowup') input.keys.u = 1;
    if (k === 's' || k === 'arrowdown') input.keys.d = 1;
    if ((k === ' ' || k === 'enter') && !e.repeat) {
      e.preventDefault();
      if (skipFinish()) return;
      if (G.state === 'playing') startAction();
    }
    if (k === 'p' || k === 'escape') { if (G.state === 'playing') doPause(); }
    if (k === 'r' && (G.state === 'fail' || G.state === 'playing' || G.state === 'result')) retry();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseAll();
      if (G.state === 'playing') doPause();
      else Audio2.stopBgm();
    } else {
      last = 0;   // 復帰直後に大きなdtで一気に進めない
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') input.keys.l = 0;
    if (k === 'd' || k === 'arrowright') input.keys.r = 0;
    if (k === 'w' || k === 'arrowup') input.keys.u = 0;
    if (k === 's' || k === 'arrowdown') input.keys.d = 0;
  });

  /* ---------- ボタン結線 ---------- */
  function on(id, fn) { $(id).addEventListener('click', () => { Audio2.se.ui(); fn(); }); }
  function doPause() {
    if (G.state !== 'playing') return;
    G.state = 'pause'; Audio2.duck(true); showOv('ovPause');
  }
  function wireUI() {
    on('btnStart', () => startStage(0));
    on('btnSelect', () => { buildStageList(); showOv('ovSelect'); });
    on('btnSelBack', () => showOv('ovTitle'));
    on('btnSettings', () => { settingsBack = 'ovTitle'; showOv('ovSettings'); });
    on('btnSettings2', () => { settingsBack = 'ovPause'; showOv('ovSettings'); });
    on('btnSetBack', () => showOv(settingsBack));
    on('btnPause', doPause);
    on('btnResume', () => { hideOv(); G.state = 'playing'; Audio2.duck(false); });
    on('btnRetry', retry); on('btnRetry2', retry); on('btnRetry3', retry);
    on('btnQuit', () => { Audio2.stopBgm(); G.stage = null; G.state = 'title'; showOv('ovTitle'); });
    on('btnSelect2', () => { buildStageList(); showOv('ovSelect'); });
    on('btnSelect3', () => { buildStageList(); showOv('ovSelect'); });
    on('btnNext', () => startStage(Math.min(G.stageIdx + 1, STAGES.length - 1)));
    on('btnWipe', () => {
      if (!confirm('記録と設定を消去しますか？')) return;
      try { localStorage.removeItem(SKEY); } catch (e) { /* 消せない環境は次回も残る */ }
      location.reload();
    });
    sw('swBgm', 'bgm', (v) => { if (!v) Audio2.stopBgm(); else if (G.stage && G.state === 'playing') Audio2.startBgm(); });
    sw('swSe', 'se');
    sw('swHap', 'hap', (v) => { if (v) haptic(16); });
    sw('swLefty', 'lefty', (v) => document.body.classList.toggle('lefty', v));
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
       受付・工作・制限時間・コンボ・発見が同じ時計で進むので、窓はずれない */
    if (G.slowmo > 0) dt *= 0.35;
    if (!autoUpdate) { render(); return; }
    if (G.state === 'playing') update(dt);
    else if (G.state === 'finishing') updateFinishing(dt);
    else if (G.state === 'ready' && G.stage) {
      // 開始演出中も雪とカメラは動かす
      for (let i = 0; i < G.snow.length; i++) { const s = G.snow[i]; s.y += s.s * dt; if (s.y > H) s.y = -4; }
    }
    render();
  }

  /* ---------- テスト用フック ----------
     自動テストから固定dtで進めるための最小限の口。通常プレイでは使わない */
  let autoUpdate = true;
  window.XMAS = {
    G: G, CFG: CFG, SAB: SAB, STAGES: STAGES, save: save, SKEY: SKEY, RULES_VERSION: RULES_VERSION,
    input: input,
    setAuto(v) { autoUpdate = !!v; },
    startStage: (i) => startStage(i),
    beginPlay(i) { startStage(i); G.state = 'playing'; },
    step(dt) {
      if (G.state === 'playing') update(dt);
      else if (G.state === 'finishing') updateFinishing(dt);
    },
    run(sec, dt) { const n = Math.round(sec / (dt || 1 / 60)); for (let k = 0; k < n; k++) this.step(dt || 1 / 60); },
    sabotage: (t) => doSabotage(t),
    startAction: () => startAction(),
    skipFinish: () => skipFinish(),
    bests: () => bests(),
    findPath: (ax, ay, bx, by, st) => findPath(ax, ay, bx, by, st),
    notifyGuards: (t) => notifyGuards(t),
    evJustOpen: (e) => evJustOpen(e),
  };

  /* ---------- 起動 ---------- */
  function boot() {
    loadSave();
    cacheUI();
    initGlow();
    document.body.classList.toggle('lefty', !!save.lefty);
    loadAssets();
    resize();
    wireUI();
    buildStageList();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));
    if (!('ontouchstart' in window)) {
      $('briefMove').textContent = 'WASD / 矢印キー（スマホは左スティック）';
      $('briefSab').textContent = '近づいてスペースキー（スマホは工作ボタン）';
    }
    requestAnimationFrame(loop);
  }
  boot();
})();
