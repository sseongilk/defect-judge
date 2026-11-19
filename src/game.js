'use strict';
(() => {
  // ============================================================
  // 불량 판정소 (Defect Judge) - 128x224 도트 화면을 정수 배율로 확대
  // ============================================================
  const W = 128, H = 224;
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const stageEl = document.getElementById('stage');
  const wrapEl = document.getElementById('wrap');
  const nickEl = document.getElementById('nick');
  const chatEl = document.getElementById('chatin');
  ctx.imageSmoothingEnabled = false;

  // ---------- 저장 (브라우저 저장소는 실패할 수 있음) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
  };

  // ---------- 색 ----------
  const PAL = {
    O: [74, 48, 84], o: [120, 92, 130], K: [40, 28, 48], W: [255, 255, 255],
    cream: [255, 244, 224], cream2: [250, 230, 205], cream3: [242, 216, 190],
    S: [126, 196, 240], B: [91, 155, 213], H: [255, 196, 120], F: [255, 222, 200],
    P: [255, 150, 170], p: [225, 105, 135], M: [130, 220, 180], m: [70, 170, 140],
    Y: [255, 222, 120], y: [240, 180, 80], L: [200, 182, 255], l: [150, 130, 210],
    C: [138, 128, 182], c: [154, 145, 198], G: [226, 226, 240], g: [190, 190, 210],
    N: [52, 60, 92], n: [60, 70, 104], R: [255, 110, 110], T: [160, 150, 190], t: [130, 118, 165],
    sky: [200, 232, 255], glare: [182, 174, 226], Z: [205, 120, 80],
  };
  const CSS = {};
  for (const k in PAL) CSS[k] = `rgb(${PAL[k].join(',')})`;

  // ---------- 기본 그리기 ----------
  function rect(x, y, w, h, c) {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = CSS[c] || c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function px(x, y, c) { rect(x, y, 1, 1, c); }

  function rrect(x, y, w, h, fill, edge = 'O', shadow = null) {
    x = Math.round(x); y = Math.round(y);
    if (shadow) rrect(x, y + 2, w, h, shadow, edge);
    rect(x + 2, y, w - 4, 1, edge);
    rect(x + 2, y + h - 1, w - 4, 1, edge);
    rect(x, y + 2, 1, h - 4, edge);
    rect(x + w - 1, y + 2, 1, h - 4, edge);
    px(x + 1, y + 1, edge); px(x + w - 2, y + 1, edge);
    px(x + 1, y + h - 2, edge); px(x + w - 2, y + h - 2, edge);
    rect(x + 2, y + 1, w - 4, 1, fill);
    rect(x + 2, y + h - 2, w - 4, 1, fill);
    rect(x + 1, y + 2, w - 2, h - 4, fill);
  }

  const sprCache = new Map();
  function spr(rows) {
    let cv = sprCache.get(rows);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = Math.max(...rows.map(r => r.length));
      cv.height = rows.length;
      const c = cv.getContext('2d');
      rows.forEach((r, j) => {
        for (let i = 0; i < r.length; i++) {
          const v = r[i];
          if (v !== '.') { c.fillStyle = CSS[v]; c.fillRect(i, j, 1, 1); }
        }
      });
      sprCache.set(rows, cv);
    }
    return cv;
  }
  function sprite(x, y, rows, flip = false) {
    const cv = spr(rows);
    x = Math.round(x); y = Math.round(y);
    if (flip) {
      ctx.save(); ctx.translate(x + cv.width, y); ctx.scale(-1, 1);
      ctx.drawImage(cv, 0, 0); ctx.restore();
    } else ctx.drawImage(cv, x, y);
  }

  // ---------- 도트 글자 (임계값으로 또렷하게 + 외곽선) ----------
  const FONTS = { b: "12px 'Galmuri11B', monospace", m: "10px 'Galmuri9', monospace", s: "8px 'Galmuri7', monospace" };
  const txtCache = new Map();
  function textImg(t, f, fill, edge, scale, shadow) {
    const key = `${t}|${f}|${fill}|${edge}|${scale}|${shadow}`;
    let r = txtCache.get(key);
    if (r) return r;
    const m = document.createElement('canvas');
    const mc = m.getContext('2d');
    mc.font = FONTS[f];
    const tw = Math.ceil(mc.measureText(t).width) + 8, th = 28;
    m.width = tw; m.height = th;
    // 기준선을 정수 픽셀에 맞춰야 도트 글꼴이 번지지 않음
    mc.font = FONTS[f]; mc.textBaseline = 'alphabetic'; mc.fillStyle = '#fff';
    mc.fillText(t, 4, 20);
    const src = mc.getImageData(0, 0, tw, th).data;
    const on = new Uint8Array(tw * th);
    let x0 = tw, y0 = th, x1 = -1, y1 = -1;
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
      if (src[(j * tw + i) * 4 + 3] >= 120) {
        on[j * tw + i] = 1;
        if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
      }
    }
    if (x1 < 0) { r = { c: null, w: 0, h: 0 }; txtCache.set(key, r); return r; }
    const bw = (x1 - x0 + 1) * scale, bh = (y1 - y0 + 1) * scale;
    const ow = bw + 2, oh = bh + 2 + (shadow ? 1 : 0);
    const mask = new Uint8Array(ow * oh);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      if (on[(y0 + ((j / scale) | 0)) * tw + x0 + ((i / scale) | 0)]) mask[(j + 1) * ow + i + 1] = 1;
    }
    const out = new ImageData(ow, oh);
    const d = out.data;
    const put = (i, j, c) => { const k = (j * ow + i) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255; };
    const near = (i, j) => {
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b;
        if (ii >= 0 && jj >= 0 && ii < ow && jj < oh && mask[jj * ow + ii]) return true;
      }
      return false;
    };
    if (shadow) for (let j = 1; j < oh; j++) for (let i = 0; i < ow; i++) if (near(i, j - 1)) put(i, j, PAL[shadow]);
    if (edge) for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) if (near(i, j)) put(i, j, PAL[edge]);
    for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) if (mask[j * ow + i]) put(i, j, PAL[fill]);
    const c = document.createElement('canvas');
    c.width = ow; c.height = oh;
    c.getContext('2d').putImageData(out, 0, 0);
    r = { c, w: ow, h: oh };
    txtCache.set(key, r);
    return r;
  }
  function textW(t, f, scale = 1) { return textImg(t, f, 'O', null, scale, null).w; }
  function ptext(t, x, y, f, fill, opt = {}) {
    const { edge = 'O', scale = 1, align = 'l', shadow = null } = opt;
    const r = textImg(String(t), f, fill, edge, scale, shadow);
    if (!r.c) return 0;
    let dx = x;
    if (align === 'c') dx = x - Math.floor(r.w / 2);
    else if (align === 'r') dx = x - r.w;
    ctx.drawImage(r.c, Math.round(dx), Math.round(y));
    return r.w;
  }
  const fmt = n => Math.floor(n).toLocaleString('en-US');
  // 랭킹용 짧은 점수: 9,160 / 44.3k / 105k / 1.23M (반올림하지 않고 내림)
  function fmtShort(n) {
    n = Math.floor(n);
    if (n < 10000) return fmt(n);
    if (n < 100000) return (Math.floor(n / 100) / 10).toFixed(1) + 'k';
    if (n < 1000000) return Math.floor(n / 1000) + 'k';
    return (Math.floor(n / 10000) / 100).toFixed(2) + 'M';
  }
  // 정해진 폭 안에 맞추기: 넘치면 뒤를 줄이고 .. 붙임 (작은 글꼴은 뭉개져서 쓰지 않음)
  function fitText(t, maxW, f = 'm') {
    t = String(t);
    if (textW(t, f) <= maxW) return { t, f };
    const chars = Array.from(t);
    while (chars.length > 1 && textW(chars.join('') + '..', f) > maxW) chars.pop();
    return { t: chars.join('') + '..', f };
  }

  // ---------- 스프라이트 ----------
  const INSPECTOR = [
    '.......OOOOOOOO.......',
    '.....OOSSSSSSSSOO.....',
    '....OSSWWSSSSSSSSO....',
    '...OSSWSSSSYYSSSSSO...',
    '...OSSSSSSSYYSSSSSO...',
    '..OBBBBBBBBBBBBBBBBO..',
    '.OHHHHHHHHHHHHHHHHHHO.',
    '.OHFFHHHFFHHHHFFHHFHO.',
    'OHFFFFFFFFFFFFFFFFFFHO',
    'OHFFFFFFFFFFFFFFFFFFHO',
    'OHFFWKFFFFFFFFFFWKFFHO',
    'OHFFKKFFFFFFFFFFKKFFHO',
    'OHFFKKFFFFFFFFFFKKFFHO',
    'OHFPPFFFFKFFKFFFFPPFHO',
    '.OFFFFFFFFKKFFFFFFFFO.',
    '..OOFFFFFFFFFFFFFFOO..',
    '....OOOOOOOOOOOOOO....',
    '......OWWWSSWWWO......',
    '.....OFWWWSSWWWFO.....',
    '.....OOWWWWWWWWOO.....',
    '......OWWWOOWWWO......',
    '......OBBO..OBBO......',
    '......OOOO..OOOO......',
  ];
  const INSPECTOR_BLINK = INSPECTOR.map((r, j) => (j >= 10 && j <= 12)
    ? (j === 11 ? 'OHFFKKFFFFFFFFFFKKFFHO' : 'OHFFFFFFFFFFFFFFFFFFHO') : r);
  const LOUPE = ['.OOOO.', 'OSSSSO', 'OSWSSO', 'OSSSSO', '.OOOOO', '....OO'];
  const HEART = ['.OO...OO.', 'OPPO.OPPO', 'OPWPOPPPO', 'OPPPPPPPO', '.OPPPPPO.', '..OPPPO..', '...OPO...', '....O....'];
  const HEART_EMPTY = HEART.map(r => r.replace(/[PW]/g, 'g'));
  const STAR = ['...O...', '..OYO..', 'OOOYOOO', 'OYYYYYO', '.OYYYO.', '.OYOYO.', '.OO.OO.'];
  const SPARK = ['..Y..', '..Y..', 'YYWYY', '..Y..', '..Y..'];
  const CAMERA = [
    '..OOOOOOOOOOOO..', '.OLLLLLLLLLLRLO.', '.OLWLLLLLLLLLLO.', '.OLLLLOOOOLLLLO.',
    '.OllllOSSOllllO.', '..OOOOOSSOOOOO..', '......OOOO......',
  ];
  const CIRCLE_O = [
    '....OOOOOO....', '..OOWWWWWWOO..', '.OWWOOOOOOWWO.', '.OWO......OWO.', 'OWO........OWO',
    'OWO........OWO', 'OWO........OWO', 'OWO........OWO', 'OWO........OWO', '.OWO......OWO.',
    '.OWWOOOOOOWWO.', '..OOWWWWWWOO..', '....OOOOOO....',
  ];
  const CROSS_X = [
    '.OOO......OOO.', 'OWWWO....OWWWO', 'OWWWWO..OWWWWO', '.OWWWWOOWWWWO.', '..OWWWWWWWWO..',
    '...OWWWWWWO...', '...OWWWWWWO...', '..OWWWWWWWWO..', '.OWWWWOOWWWWO.', 'OWWWWO..OWWWWO',
    'OWWWO....OWWWO', '.OOO......OOO.',
  ];
  const CLOUD = ['....OOOO.......', '..OOWWWWOOOO...', '.OWWWWWWWWWWOO.', 'OWWWWWWWWWWWWWO', '.OOOOOOOOOOOOO.'];
  const ROOF = ['......OO........', '....OOMMOO......', '..OOMMMMMMOO....', 'OOMMMMMMMMMMOO..', 'OOOOOOOOOOOOOOOO'];
  const KNOB = ['.OO.', 'OYYO', '.OO.'];
  const ROLLER = ['.OOO.', 'OGgGO', '.OOO.'];
  const SWEAT = ['.O.', 'OSO', 'OWO', '.O.'];
  const ARM_DOWN_L = ['..OO', '.OGO', 'OGO.', 'OO..'];
  const ARM_UP_L = ['OO..', 'OGO.', '.OGO', '..OO'];
  const JOY_EYE = ['..KKK..', '.K...K.', 'K.....K'];
  const CROSS_EYE = ['KK....', '.KKK..', '...KKK', '.KKK..', 'KK....'];
  const MOUTH_O = ['.OO.', 'OPPO', '.OO.'];
  const MOUTH_SMILE = ['K....K', '.KKKK.'];
  const MOUTH_JOY = ['KKKKKK', 'KPPPPK', '.KPPK.', '..KK..'];
  const MOUTH_WAVY = ['.K.K.K', 'K.K.K.'];
  const BADGE_OK = ['.OOO.', 'OMMMO', 'OMWMO', 'OMMMO', '.OOO.'];
  const BADGE_NG = ['OO.OO', 'OPOPO', '.OPO.', 'OPOPO', 'OO.OO'];
  const TAIL = ['OWWO', '.OWO', '..OO'];
  const SPEAKER = ['...O.....', '..OO..O..', 'OOWO...O.', 'OWWO.O.O.', 'OOWO...O.', '..OO..O..', '...O.....'];
  const SPEAKER_OFF = ['...O.....', '..OO.....', 'OOWO.p.p.', 'OWWO..p..', 'OOWO.p.p.', '..OO.....', '...O.....'];
  const TROPHY = ['OOOOOOO', 'OYYYYYO', 'OYWYYYO', '.OYYYO.', '..OYO..', '.OOOOO.', '.OyyyO.', '.OOOOO.'];
  const CROWN = ['O..O..O', 'OYOYOYO', 'OYYWYYO', 'OYYYYYO', 'OOOOOOO'];
  const CROWN_S = ['O.O.O', 'OYYYO', 'OOOOO'];
  const RIBBON = ['.O...O.', 'OPO.OPO', 'OPPOPPO', 'OPO.OPO', '.O...O.'];
  const GLASSES = ['OOOO........OOOO', 'O..OOOOOOOOOO..O', 'O..O........O..O', 'OOOO........OOOO'];
  const CLOCK = ['..OOO..', '.OWWWO.', 'OWWOWWO', 'OWWOOWO', 'OWWWWWO', '.OWWWO.', '..OOO..'];
  const LOCK = ['.OOO.', 'O...O', 'OOOOO', 'OYOYO', 'OYYYO', 'OOOOO'];
  const ARROW_L = ['...O', '..OO', '.OWO', 'OWWO', '.OWO', '..OO', '...O'];
  const ARROW_R = ARROW_L.map(r => r.split('').reverse().join(''));

  // ---------- 배경 미리 그리기 ----------
  function makeWall() {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = CSS.cream; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
      if (((x >> 3) + (y >> 3)) % 2 === 0) { c.fillStyle = CSS.cream2; c.fillRect(x, y, 8, 8); }
    }
    c.fillStyle = CSS.cream3;
    for (let y = 3; y < H; y += 16) for (let x = 3; x < W; x += 16) c.fillRect(x, y, 1, 1);
    return cv;
  }
  let WALL = null;

  // ---------- 캐릭터 ----------
  // 작은 전극 친구 (컨베이어 위)
  // 몸 색: 보통 / 금색
  const BODY = { normal: { side: 'G', side2: 'g', body: 'C', stripe: 'c' }, gold: { side: 'W', side2: 'Y', body: 'Y', stripe: 'y' } };
  function buddy(x, y, mood, badge, opt = {}) {
    const w = 16, h = 13;
    const col = opt.gold ? BODY.gold : BODY.normal;
    x = Math.round(x); y = Math.round(y);
    rect(x + 3, y + h - 1, 4, 3, 'O'); rect(x + 4, y + h - 1, 2, 1, col.body);
    rect(x + w - 7, y + h - 1, 4, 3, 'O'); rect(x + w - 6, y + h - 1, 2, 1, col.body);
    rrect(x, y, w, h, col.side);
    rect(x + 3, y + 1, w - 6, h - 2, col.body);
    rect(x + 3, y + 1, w - 6, 1, col.stripe);
    if (opt.crown) sprite(x + 5, y - 3, CROWN_S);
    if (opt.shiny && ((G.t * 4) | 0) % 2 === 0) { sprite(x - 4, y - 2, SPARK); sprite(x + w - 1, y + 5, SPARK); }
    px(x + 1, y + 3, 'W'); px(x + 1, y + 4, 'W');
    const ex1 = x + 4, ex2 = x + w - 6, ey = y + 4;
    if (mood === 'cross') {
      [[0, 0], [1, 1], [0, 2]].forEach(([dx, dy]) => { px(ex1 + dx, ey + dy, 'K'); px(ex2 + 1 - dx, ey + dy, 'K'); });
    } else if (mood === 'joy') {
      for (const ex of [ex1, ex2]) { px(ex, ey + 1, 'K'); px(ex + 1, ey, 'K'); px(ex + 2, ey + 1, 'K'); }
    } else {
      for (const ex of [ex1, ex2]) { rect(ex, ey, 2, 3, 'K'); px(ex, ey, 'W'); }
    }
    rect(ex1 - 1, ey + 3, 2, 1, 'P'); rect(ex2 + 1, ey + 3, 2, 1, 'P');
    const mx = x + w / 2 - 1;
    if (mood === 'happy' || mood === 'joy') {
      px(mx - 1, ey + 3, 'K'); px(mx, ey + 4, 'K'); px(mx + 1, ey + 4, 'K'); px(mx + 2, ey + 3, 'K');
    } else {
      rect(mx, ey + 4, 2, 1, 'K');
    }
    if (mood === 'worry' || mood === 'cross') sprite(x + w - 2, y - 3, SWEAT);
    if (badge) sprite(x + 5, y - 7, badge === 'ok' ? BADGE_OK : BADGE_NG);
  }

  // 결함 모양: 단계가 오를수록 작아짐
  // 진짜 결함 3종 + 결함처럼 보이는 양품(가짜) 3종
  const DEFECT_NAME = { pin: '핀홀', uncoat: '미코팅', crack: '크랙', glare: '빛 반사', dust: '먼지', stain: '얼룩' };
  const DEFECTS = ['pin', 'uncoat', 'crack'];
  const DUST = [[1, 0], [0, 1], [2, 1], [1, 2], [3, 2]];
  const STAIN = ['.ttt...', 't...tt.', 't.....t', '.t...t.', '..ttt..'];
  function defectBox(it) {
    if (it.defect === 'pin') { const s = [3, 2, 1][it.lvl]; return { x: it.dx, y: it.dy, w: s, h: s }; }
    if (it.defect === 'uncoat') { const [w, h] = [[6, 4], [4, 3], [2, 2]][it.lvl]; return { x: it.dx, y: it.dy, w, h }; }
    if (it.defect === 'crack') { const n = [9, 6, 4][it.lvl]; return { x: it.dx, y: it.dy, w: n, h: 2 }; }
    if (it.decoy === 'glare') return { x: it.dx, y: it.dy, w: 8, h: 4 };
    if (it.decoy === 'dust') return { x: it.dx, y: it.dy, w: 4, h: 3 };
    if (it.decoy === 'stain') return { x: it.dx, y: it.dy, w: 7, h: 5 };
    return null;
  }
  function drawDefect(it, bx, by) {
    if (it.boss) { it.parts.forEach(p => drawDefect(p, bx, by)); return; }
    const x = bx + it.dx, y = by + it.dy;
    if (it.decoy === 'dust') { DUST.forEach(([i, j]) => px(x + i, y + j, 'cream3')); return; }
    if (it.decoy === 'stain') { sprite(x, y, STAIN); return; }
    if (it.defect === 'pin') {
      if (it.lvl === 0) { rect(x, y, 3, 3, 'N'); px(x + 1, y + 1, 'Y'); }
      else if (it.lvl === 1) { rect(x, y, 2, 2, 'N'); px(x, y, 'Y'); }
      else px(x, y, 'Y');
    } else if (it.defect === 'uncoat') {
      const b = defectBox(it);
      rect(x, y, b.w, b.h, 'G');
      if (it.lvl === 0) rect(x, y + b.h - 1, b.w, 1, 'g');
    } else if (it.defect === 'crack') {
      const n = [9, 6, 4][it.lvl];
      for (let k = 0; k < n; k++) px(x + k, y + (k % 2), 'W');
    } else if (it.decoy === 'glare') {
      for (let k = 0; k < 8; k++) px(x + k, y + (k >> 1), 'glare');
    }
  }

  // 모니터 속 큰 전극 친구
  function bigBuddy(x, y, it, mood) {
    const w = 46, h = 46;
    const up = mood === 'joy';
    sprite(x - 5, y + (up ? 12 : 22), up ? ARM_UP_L : ARM_DOWN_L);
    sprite(x + w + 1, y + (up ? 12 : 18), up ? ARM_UP_L : ARM_DOWN_L, true);
    const col = it && it.gold ? BODY.gold : BODY.normal;
    rrect(x + 9, y + h - 1, 9, 5, col.body);
    rrect(x + w - 18, y + h - 1, 9, 5, col.body);
    rrect(x, y, w, h, col.side);
    rect(x + 1, y + 2, 2, h - 4, col.side2);
    rect(x + 7, y + 1, w - 14, h - 2, col.body);
    for (let j = y + 3; j < y + h - 2; j += 4) rect(x + 7, j, w - 14, 1, col.stripe);
    if (it) drawDefect(it, x, y);
    if (it && it.boss) sprite(x + 19, y - 6, CROWN);
    if (it && it.shiny && ((G.t * 4) | 0) % 2 === 0) { sprite(x - 9, y + 2, SPARK); sprite(x + w + 4, y + 30, SPARK); }
    // 눈
    const blink = mood !== 'joy' && mood !== 'cross' && (G.t % 3.3) < 0.12;
    if (mood === 'joy') {
      sprite(x + 12, y + 17, JOY_EYE); sprite(x + 27, y + 17, JOY_EYE);
    } else if (mood === 'cross') {
      sprite(x + 13, y + 15, CROSS_EYE); sprite(x + 27, y + 15, CROSS_EYE, true);
    } else if (blink) {
      rect(x + 12, y + 19, 7, 1, 'K'); rect(x + 27, y + 19, 7, 1, 'K');
    } else {
      for (const ex of [x + 12, x + 27]) {
        rrect(ex, y + 14, 7, 9, 'K', 'K');
        rect(ex + 1, y + 15, 2, 2, 'W');
        px(ex + 4, y + 19, 'W');
        rect(ex + 2, y + 21, 3, 1, 'l');
      }
    }
    if (mood === 'worry') {
      rect(x + 12, y + 11, 3, 1, 'O'); px(x + 15, y + 10, 'O');
      rect(x + 31, y + 11, 3, 1, 'O'); px(x + 30, y + 10, 'O');
      sprite(x + w - 4, y + 4, SWEAT);
    }
    rect(x + 9, y + 25, 5, 2, 'P');
    rect(x + 32, y + 25, 5, 2, 'P');
    if (mood === 'worry') sprite(x + 21, y + 25, MOUTH_O);
    else if (mood === 'joy') sprite(x + 20, y + 25, MOUTH_JOY);
    else if (mood === 'cross') { sprite(x + 20, y + 26, MOUTH_WAVY); sprite(x + w - 4, y + 4, SWEAT); }
    else if (mood === 'calm') rect(x + 21, y + 27, 4, 1, 'K');
    else sprite(x + 20, y + 26, MOUTH_SMILE);
  }

  function belt(y, phase) {
    rect(0, y, W, 9, 'O');
    rect(0, y + 1, W, 6, 'T');
    rect(0, y + 1, W, 1, 'L');
    const off = ((Math.round(-phase) % 8) + 8) % 8;
    for (let i = -8; i < W + 8; i += 8) rect(i + off, y + 4, 3, 1, 't');
    for (let i = 3; i < W; i += 10) sprite(i, y + 7, ROLLER);
  }

  function dashedBox(x, y, w, h, c) {
    for (let i = 0; i <= w; i += 2) { px(x + i, y, c); px(x + i, y + h, c); }
    for (let j = 0; j <= h; j += 2) { px(x, y + j, c); px(x + w, y + j, c); }
  }

  // ---------- 효과음 ----------
  let actx = null;
  let soundOn = store.get('dj_sound', '1') !== '0';
  function unlockAudio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
  }
  function beep(freq, dur, type = 'square', vol = 0.05, when = 0, slide = 0) {
    if (!soundOn || !actx) return;
    const t = actx.currentTime + when;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const SFX = {
    tap: () => beep(660, 0.05, 'square', 0.04),
    good: () => { beep(880, 0.07); beep(1320, 0.09, 'square', 0.04, 0.06); },
    perfect: () => [660, 880, 1100, 1320].forEach((f, i) => beep(f, 0.08, 'square', 0.045, i * 0.045)),
    miss: () => beep(240, 0.25, 'sawtooth', 0.05, 0, -130),
    stage: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.12, 'triangle', 0.07, i * 0.09)),
    over: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.2, 'triangle', 0.07, i * 0.17)),
    fever: () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.07, 'square', 0.045, i * 0.05)),
    rule: () => { beep(988, 0.08, 'square', 0.05); beep(988, 0.08, 'square', 0.05, 0.14); },
    power: () => [784, 988, 1175, 1568].forEach((f, i) => beep(f, 0.06, 'triangle', 0.07, i * 0.06)),
    hit: () => beep(1175, 0.06, 'square', 0.045),
    wrong: () => beep(180, 0.1, 'square', 0.04),
    beat: i => beep(i % 2 ? 196 : 131, 0.06, 'triangle', 0.06),
  };

  // ---------- 팀·날짜 ----------
  const TEAMS = ['', '코팅', '프레스', '슬리팅', '노칭', '조립', '검사', '설비', '연구'];
  const teamName = t => t ? t + '팀' : '무소속';
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------- 랭킹 (공유 저장소 → 없으면 이 기기) ----------
  // 한 사람 = 한 줄: 이름, 최고 점수, 꾸미기, 팀, 오늘의 판 기록
  function cleanRow(id, d) {
    if (!d) return null;
    const best = Number(d.best);
    if (!Number.isFinite(best) || best < 0) return null;
    const day = typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day) ? d.day : '';
    const dayBest = Number(d.dayBest !== undefined ? d.dayBest : d.day_best);
    return {
      id,
      nick: String(d.nick || '익명').slice(0, 8),
      best: Math.floor(best),
      stage: Math.max(1, Math.floor(Number(d.stage) || 1)),
      skin: Math.max(0, Math.min(99, Math.floor(Number(d.skin) || 0))),
      team: TEAMS.includes(d.team) ? d.team : '',
      day,
      dayBest: day && Number.isFinite(dayBest) && dayBest > 0 ? Math.floor(dayBest) : 0,
      at: Number(d.at) || 0,
    };
  }
  // 웹 공개용 공용 랭킹(Supabase). build.py가 supabase.json 내용으로 바꿔 넣음. null이면 사용 안 함
  const NET = /*NET*/null;
  function randHex(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }
  function newUuid() {
    const h = randHex(16);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-' +
      ((parseInt(h[16], 16) & 3) | 8).toString(16) + h.slice(17, 20) + '-' + h.slice(20, 32);
  }
  // Supabase REST 호출 (anon 키는 공개용 키)
  async function netCall(method, path, body) {
    const res = await fetch(NET.url.replace(/\/$/, '') + path, {
      method,
      headers: {
        apikey: NET.key,
        Authorization: 'Bearer ' + NET.key,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const Rank = {
    mode: 'local',     // 'shared' | 'local'
    status: 'ok',      // 'loading' | 'slow' | 'ok' | 'error'
    rows: [],
    local: [],
    uid: null,
    db: null,
    net: false,        // true: Supabase 사용
    secret: null,
    initNet() {
      this.uid = store.get('dj_uid', '');
      this.secret = store.get('dj_secret', '');
      if (!/^[0-9a-f-]{36}$/.test(this.uid) || this.secret.length < 32) {
        this.uid = newUuid(); this.secret = randHex(24);
        store.set('dj_uid', this.uid); store.set('dj_secret', this.secret);
      }
      this.net = true; this.mode = 'shared'; this.status = 'loading';
      this.refresh();
    },
    async refresh() {
      if (!this.net) return;
      const timer = setTimeout(() => { if (this.status === 'loading') this.status = 'slow'; }, 10000);
      try {
        const data = await netCall('GET',
          '/rest/v1/scores?select=id,nick,best,stage,skin,team,day,dayBest:day_best&order=best.desc,at.asc&limit=300');
        this.rows = (Array.isArray(data) ? data : []).map(d => cleanRow(String(d.id), d)).filter(Boolean);
        this.status = 'ok';
      } catch (e) {
        this.status = 'error';
      } finally { clearTimeout(timer); }
    },
    loadLocal() {
      try { this.local = JSON.parse(store.get('dj_local_rank', '[]')).map(r => cleanRow(null, r)).filter(Boolean); }
      catch (e) { this.local = []; }
    },
    saveLocal() {
      this.local.sort((a, b) => b.best - a.best);
      store.set('dj_local_rank', JSON.stringify(this.local.slice(0, 40)));
    },
    async init() {
      this.loadLocal();
      const cl = window.claude;
      if (!cl || typeof cl.use !== 'function') {
        if (NET && NET.url && NET.key) this.initNet();
        return;
      }
      this.status = 'loading';
      try {
        const [db, user] = await Promise.all([cl.use('db'), cl.use('user')]);
        const uid = user ? await user.id() : null;
        if (!db || !uid) { this.status = 'ok'; return; }
        this.db = db; this.uid = uid; this.mode = 'shared';
        const timer = setTimeout(() => { if (this.status === 'loading') this.status = 'slow'; }, 10000);
        db.collection('scores').orderBy('best', 'desc').limit(300).onSnapshot(snap => {
          this.rows = snap.docs.map(d => cleanRow(d.id, d.data())).filter(Boolean);
          if (!snap.metadata.fromCache) { clearTimeout(timer); this.status = 'ok'; }
        }, () => { clearTimeout(timer); this.status = 'error'; });
      } catch (e) {
        this.mode = 'local'; this.status = 'ok';
      }
    },
    all() { return this.mode === 'shared' ? this.rows : this.local; },
    // tab: 'me' 개인 | 'day' 오늘의 판 | 'team' 팀 합계
    list(tab) {
      const rows = this.all();
      if (tab === 'day') {
        const today = todayStr();
        return rows.filter(r => r.day === today && r.dayBest > 0)
          .map(r => Object.assign({}, r, { score: r.dayBest })).sort((a, b) => b.score - a.score);
      }
      if (tab === 'team') {
        const m = new Map();
        rows.forEach(r => {
          if (!r.team || r.best <= 0) return;
          const t = m.get(r.team) || { team: r.team, count: 0, score: 0 };
          t.count++; t.score += r.best; m.set(r.team, t);
        });
        return [...m.values()].sort((a, b) => b.score - a.score);
      }
      return rows.filter(r => r.best > 0).map(r => Object.assign({}, r, { score: r.best }));
    },
    mine() {
      if (this.mode === 'shared') return this.rows.find(r => r.id === this.uid) || null;
      return this.local.find(r => r.nick === G.nick) || null;
    },
    rankOf(tab, score) { return this.list(tab).filter(r => r.score > score).length + 1; },
    profile() { return { nick: G.nick, skin: G.skin, team: G.team }; },
    // 이 기기 기록 (이름 기준)
    addLocal(p, rec) {
      let ex = this.local.find(r => r.nick === p.nick);
      if (!ex) { ex = { id: null, nick: p.nick, best: 0, stage: 1, skin: 0, team: '', day: '', dayBest: 0, at: 0 }; this.local.push(ex); }
      ex.skin = p.skin; ex.team = p.team;
      if (rec && rec.mode === 'normal' && rec.score > ex.best) { ex.best = rec.score; ex.stage = rec.stage; ex.at = Date.now(); }
      if (rec && rec.mode === 'daily' && (ex.day !== rec.day || rec.score > ex.dayBest)) { ex.day = rec.day; ex.dayBest = rec.score; }
      this.saveLocal();
    },
    // 공유 저장소에 내 줄 쓰기. rec가 없으면 이름·꾸미기·팀만 바꿈
    async write(mine, p, rec) {
      if (this.net) {
        await netCall('POST', '/rest/v1/rpc/submit_score', {
          p_id: this.uid, p_secret: this.secret, p_nick: p.nick, p_skin: p.skin, p_team: p.team,
          p_best: rec && rec.mode === 'normal' ? rec.score : 0,
          p_stage: rec && rec.mode === 'normal' ? rec.stage : 1,
          p_day: rec && rec.mode === 'daily' ? rec.day : null,
          p_day_best: rec && rec.mode === 'daily' ? rec.score : 0,
        });
        await this.refresh();
        return;
      }
      const doc = {
        nick: p.nick, skin: p.skin, team: p.team,
        best: mine ? mine.best : 0, stage: mine ? mine.stage : 1, at: mine && mine.at ? mine.at : Date.now(),
        day: mine ? mine.day : '', dayBest: mine ? mine.dayBest : 0,
      };
      if (rec && rec.mode === 'normal') { doc.best = rec.score; doc.stage = rec.stage; doc.at = Date.now(); }
      if (rec && rec.mode === 'daily') { doc.day = rec.day; doc.dayBest = rec.score; }
      await this.db.doc('scores/' + this.uid).set(doc);
    },
    async submit(mode, score, stage) {
      const p = this.profile();
      const rec = { mode, score, stage, day: todayStr() };
      const tab = mode === 'daily' ? 'day' : 'me';
      this.addLocal(p, rec);
      if (this.mode !== 'shared') return { code: 'local', rank: this.rankOf(tab, score) };
      const mine = this.mine();
      const better = mode === 'daily'
        ? !(mine && mine.day === rec.day && mine.dayBest >= score)
        : !(mine && mine.best >= score);
      if (!better) {
        this.updateProfile();
        return { code: 'nobest', best: mode === 'daily' ? mine.dayBest : mine.best };
      }
      try {
        await this.write(mine, p, rec);
        return { code: 'saved', rank: this.rankOf(tab, score) };
      } catch (e) {
        return { code: e && e.code === 'invalid_argument' ? 'denied' : 'fail' };
      }
    },
    rename(oldNick, nick) {
      const ex = this.local.find(r => r.nick === oldNick);
      if (ex && !this.local.find(r => r.nick === nick)) { ex.nick = nick; this.saveLocal(); }
    },
    // 이름·팀·꾸미기가 바뀌면 내 줄에 반영 (기록이 있을 때만)
    async updateProfile() {
      const p = this.profile();
      const ex = this.local.find(r => r.nick === p.nick);
      if (ex) { ex.skin = p.skin; ex.team = p.team; this.saveLocal(); }
      if (this.mode !== 'shared') return;
      const mine = this.mine();
      if (!mine || (mine.nick === p.nick && mine.skin === p.skin && mine.team === p.team)) return;
      try { await this.write(mine, p, null); } catch (e) { /* 무시 */ }
    },
  };

  // ---------- 꾸미기 (누적 점수로 해금) ----------
  const HATS = [
    { name: '하늘', a: 'S', b: 'B', need: 0 }, { name: '분홍', a: 'P', b: 'p', need: 10000 },
    { name: '민트', a: 'M', b: 'm', need: 25000 }, { name: '노랑', a: 'Y', b: 'y', need: 50000 },
    { name: '보라', a: 'L', b: 'l', need: 80000 }, { name: '구리', a: 'Z', b: 'y', need: 120000 },
  ];
  const ACCS = [
    { name: '없음', need: 0 }, { name: '리본', need: 20000 }, { name: '안경', need: 60000 }, { name: '왕관', need: 100000 },
  ];
  const skinHat = s => HATS[s % 10] ? s % 10 : 0;
  const skinAcc = s => ACCS[Math.floor(s / 10)] ? Math.floor(s / 10) : 0;
  const inspCache = new Map();
  function inspectorRows(hat, blink) {
    const key = hat + (blink ? 'b' : '');
    let r = inspCache.get(key);
    if (!r) {
      const h = HATS[hat];
      r = (blink ? INSPECTOR_BLINK : INSPECTOR).map((row, j) => j <= 5 ? row.replace(/S/g, h.a).replace(/B/g, h.b) : row);
      inspCache.set(key, r);
    }
    return r;
  }
  function drawInspector(x, y, skin, blink) {
    sprite(x, y, inspectorRows(skinHat(skin), blink));
    const acc = skinAcc(skin);
    if (acc === 1) sprite(x + 14, y - 1, RIBBON);
    else if (acc === 2) sprite(x + 3, y + 9, GLASSES);
    else if (acc === 3) sprite(x + 7, y - 4, CROWN);
  }
  const headCache = new Map();
  function miniHead(x, y, skin) {
    const hat = skinHat(skin);
    let r = headCache.get(hat);
    if (!r) {
      const h = HATS[hat];
      r = ['.OOOOO.', 'OaaaaaO', 'ObbbbbO', 'OFFFFFO', 'OFKFKFO', '.OOOOO.'].map(s => s.replace(/a/g, h.a).replace(/b/g, h.b));
      headCache.set(hat, r);
    }
    sprite(x, y, r);
    if (skinAcc(skin) === 3) sprite(x + 1, y - 3, CROWN_S);
  }

  // ---------- 도감 ----------
  const DEX = [
    { k: 'pin', name: '핀홀' }, { k: 'uncoat', name: '미코팅' }, { k: 'crack', name: '크랙' },
    { k: 'dust', name: '먼지' }, { k: 'glare', name: '빛 반사' }, { k: 'stain', name: '얼룩' },
    { k: 'boss', name: '보스 시트' }, { k: 'claim', name: '반품 시트' }, { k: 'gold', name: '금색 전극' },
    { k: 'pw_heart', name: '하트' }, { k: 'pw_freeze', name: '시간 정지' }, { k: 'pw_loupe', name: '돋보기' },
  ];
  let dexSeen = new Set();
  try { dexSeen = new Set(JSON.parse(store.get('dj_dex', '[]')).filter(k => DEX.some(d => d.k === k))); } catch (e) { /* 무시 */ }
  function dexAdd(k) {
    if (dexSeen.has(k)) return;
    dexSeen.add(k);
    store.set('dj_dex', JSON.stringify([...dexSeen]));
    note('도감 등록!', 'L');
  }
  function dexSee(it) {
    if (it.boss) { dexAdd(it.claim ? 'claim' : 'boss'); it.parts.forEach(p => dexAdd(p.defect)); return; }
    if (it.defect) dexAdd(it.defect);
    if (it.decoy) dexAdd(it.decoy);
    if (it.gold) dexAdd('gold');
  }

  // ---------- 게임 상태 ----------
  const G = {
    state: 'boot', t: 0, st: 0,
    nick: store.get('dj_nick', ''),
    team: TEAMS.includes(store.get('dj_team', '')) ? store.get('dj_team', '') : '',
    skin: Math.max(0, Math.min(99, Number(store.get('dj_skin', '0')) || 0)),
    best: Number(store.get('dj_best', '0')) || 0,
    total: Number(store.get('dj_total', '0')) || 0,
    notes: [], noteCur: null, noteT: 0,
  };
  const rnd = n => Math.floor(Math.random() * n);
  function dayBestLocal() {
    try { const d = JSON.parse(store.get('dj_daybest', '{}')); return d.day === todayStr() ? Number(d.best) || 0 : 0; }
    catch (e) { return 0; }
  }

  // 시트마다 고정된 난수: 오늘의 판은 모두 같은 씨앗 → 같은 시트 순서
  function mulberry32(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function rngFor(idx, salt) {
    return mulberry32((G.seed ^ Math.imul(idx + 1, 0x9E3779B1) ^ Math.imul(salt + 7, 0x85EBCA77)) >>> 0);
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function placeDefect(it, r) {
    const b = defectBox(it) || { w: 1, h: 1 };
    it.dx = 9 + Math.floor(r() * Math.max(1, 29 - b.w));
    it.dy = r() < 0.5 ? 3 + Math.floor(r() * Math.max(1, 6 - b.h)) : 31 + Math.floor(r() * Math.max(1, 11 - b.h));
  }
  function makeItem(stage, idx) {
    const r = rngFor(idx, 1);
    const ri = n => Math.floor(r() * n);
    const lvl = stage <= 2 ? 0 : stage <= 4 ? 1 : 2;
    const defect = r() < 0.45 ? DEFECTS[ri(3)] : null;
    // 가짜 결함: 2단계 먼지, 3단계 빛 반사, 4단계 얼룩부터
    const pool = ['dust', 'glare', 'stain'].slice(0, Math.max(0, Math.min(3, stage - 1)));
    const decoyRoll = r(), decoyPick = ri(3);
    const decoy = !defect && pool.length && decoyRoll < 0.4 ? pool[decoyPick % pool.length] : null;
    const kind = r();
    const it = {
      idx, defect, decoy, lvl, mood: ['happy', 'calm', 'worry'][ri(3)], dx: 0, dy: 0, result: null,
      gold: kind < 0.025, shiny: kind >= 0.025 && kind < 0.095,
    };
    placeDefect(it, r);
    it.hintX = it.dx - 3 - ri(6); it.hintY = it.dy - 3 - ri(5);
    return it;
  }
  // 보스 시트: 결함 여러 개를 모두 터치해야 통과. claim=반품(도망친 불량 3마리)
  function makeBoss(stage, idx, claim) {
    const r = rngFor(idx, 2);
    const n = Math.min(4, 2 + Math.floor(stage / 3));
    const lvl = stage <= 4 ? 0 : 1;
    const parts = [];
    for (let guard = 0; parts.length < n && guard < 60; guard++) {
      const p = { defect: DEFECTS[Math.floor(r() * 3)], lvl, dx: 0, dy: 0, found: false };
      placeDefect(p, r);
      const b = defectBox(p);
      const near = parts.some(q => {
        const c = defectBox(q);
        return Math.abs(b.x + b.w / 2 - c.x - c.w / 2) < 11 && Math.abs(b.y + b.h / 2 - c.y - c.h / 2) < 9;
      });
      if (!near) parts.push(p);
    }
    return { idx, boss: true, claim: !!claim, parts, defect: null, decoy: null, lvl, mood: 'worry', dx: 0, dy: 0, result: null };
  }
  function timeLimit(stage) { return Math.max(1.15, 3.4 - 0.3 * (stage - 1)); }

  function newGame(mode) {
    mode = mode || G.mode || 'normal';
    Object.assign(G, {
      state: 'play', st: 0, mode, score: 0, combo: 0, maxCombo: 0, hearts: 3, correct: 0, stage: 1,
      seed: mode === 'daily' ? hashStr('dj-' + todayStr()) : (Math.random() * 4294967296) >>> 0,
      items: [], cur: 0, phase: 'scan', pt: 0, limit: timeLimit(1), left: timeLimit(1), lastRatio: 1,
      popup: null, gain: 0, gainT: 0, shake: 0, pressed: null, pressT: 0, newBest: false,
      overMsg: null, unlockMsg: '', frozen: false,
      fever: 0, beatT: 0, beatI: 0, rule: null, ruleCool: 4, escapes: 0,
      freezeT: 0, hintN: 0, taps: [], notes: [], noteCur: null, noteT: 0,
    });
    ensureItems();
  }
  function ensureItems() { while (G.items.length < G.cur + 4) G.items.push(makeItem(G.stage, G.items.length)); }
  function note(text, col) { G.notes.push({ text, col: col || 'Y' }); }

  // 반장 지시: 정해진 결함만 불량, 나머지 결함은 양품으로 통과
  function truthOf(it) {
    if (it.boss) return 'ng';
    if (!it.defect) return 'ok';
    if (G.rule && it.defect !== G.rule.type) return 'ok';
    return 'ng';
  }
  function sheetStart() {
    const it = G.items[G.cur];
    if (G.rule || it.boss || G.stage < 2) return;
    if (G.ruleCool > 0) { G.ruleCool--; return; }
    const r = rngFor(G.cur, 3);
    if (r() < 0.16) {
      G.rule = { type: DEFECTS[Math.floor(r() * 3)], left: 5, fresh: true };
      note('반장 지시!', 'P');
      if (!store.get('dj_rule_seen', '')) { note('다른 결함은 통과', 'P'); store.set('dj_rule_seen', '1'); }
      SFX.rule();
    }
  }
  function multiplier() { return G.fever > 0 ? 2 : 1; }

  function grantPower(it) {
    const k = ['heart', 'freeze', 'loupe'][Math.floor(rngFor(it.idx, 4)() * 3)];
    if (k === 'heart') {
      if (G.hearts < 3) { G.hearts++; note('하트 회복!', 'P'); }
      else { G.score += 500; note('보너스 +500', 'Y'); }
    } else if (k === 'freeze') { G.freezeT = 3; note('시간 정지!', 'S'); }
    else { G.hintN = 3; note('돋보기 x3', 'L'); }
    SFX.power();
    dexAdd('pw_' + k);
  }
  function afterCorrect() {
    if (G.fever > 0) { G.fever--; if (G.fever === 0) note('FEVER 끝', 'o'); }
    if (G.combo % 10 === 0 && G.fever <= 0) { G.fever = 8; note('FEVER! x2', 'Y'); SFX.fever(); }
  }
  function nextBoss(claim) {
    const i = G.cur + 1;
    if (G.items[i] && G.items[i].boss) return;
    G.items[i] = makeBoss(G.stage, i, claim);
  }

  function judge(answer) {
    if (G.state !== 'play' || G.phase !== 'judge') return;
    const it = G.items[G.cur];
    if (it.boss && answer !== null) { note('결함을 터치!', 'P'); return; }
    const truth = truthOf(it);
    it.ruled = !it.boss && G.rule && it.defect ? G.rule.type : null;
    const ok = answer === truth;
    const ratio = Math.max(0, G.left / G.limit);
    G.lastRatio = ratio;
    it.result = { answer, ok };
    if (ok) {
      G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.correct++;
      let gained = Math.round((100 + 100 * ratio) * (1 + Math.min(G.combo, 20) * 0.1) * multiplier() / 10) * 10;
      if (it.gold) { gained += 1000; note('금색 +1000', 'Y'); }
      G.score += gained; G.gain = gained; G.gainT = 0.8;
      G.popup = ratio > 0.6 ? 'PERFECT!' : 'GOOD!';
      (ratio > 0.6 ? SFX.perfect : SFX.good)();
      if (it.shiny) grantPower(it);
      afterCorrect();
      if (G.correct % 8 === 0) {
        G.stage++; note('STAGE ' + G.stage + '!', 'Y'); setTimeout(SFX.stage, 250);
        nextBoss(false); note('보스 등장!', 'P');
      }
    } else {
      G.combo = 0; G.hearts--; G.fever = 0;
      G.shake = reduceMotion ? 0 : 0.3;
      SFX.miss();
      if (answer === 'ok' && truth === 'ng') {
        // 불량을 통과시킴 → 도망. 3마리면 반품 시트가 돌아옴
        it.escaped = true; G.escapes++;
        G.popup = '도망! ' + G.escapes + '/3';
        if (G.escapes >= 3) { G.escapes = 0; nextBoss(true); note('고객 클레임!', 'P'); }
      } else G.popup = answer === null ? '시간 초과!' : 'MISS!';
    }
    if (!it.boss) {
      if (G.hintN > 0) G.hintN--;
      if (G.rule) { G.rule.fresh = false; if (--G.rule.left <= 0) { G.rule = null; G.ruleCool = 6; note('지시 끝!', 'M'); } }
    }
    dexSee(it);
    if (answer) { G.pressed = answer; G.pressT = 0.15; }
    G.phase = 'result'; G.pt = 0;
  }

  // 보스 시트: 모니터 속 결함 터치
  const MON = { x: 10, y: 38, w: 108, h: 70 };
  function bossTap(p) {
    const it = G.items[G.cur];
    const rx = p.x - 41, ry = p.y - 46;
    const hit = it.parts.find(q => {
      if (q.found) return false;
      const b = defectBox(q);
      return rx >= b.x - 5 && rx <= b.x + b.w + 5 && ry >= b.y - 5 && ry <= b.y + b.h + 5;
    });
    if (hit) {
      hit.found = true; SFX.hit();
      G.taps.push({ x: p.x, y: p.y, t: 0.4, ok: true });
      if (it.parts.every(q => q.found)) bossClear();
    } else {
      G.left = Math.max(0.01, G.left - 0.4); SFX.wrong();
      G.taps.push({ x: p.x, y: p.y, t: 0.4, ok: false });
    }
  }
  function bossClear() {
    const it = G.items[G.cur];
    const ratio = Math.max(0, G.left / G.limit);
    G.lastRatio = ratio;
    it.result = { answer: 'ng', ok: true };
    G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
    const gained = Math.round((300 * it.parts.length + 700 * ratio) * multiplier() / 10) * 10;
    G.score += gained; G.gain = gained; G.gainT = 0.8;
    G.popup = it.claim ? '반품 처리!' : 'BOSS CLEAR!';
    SFX.stage();
    afterCorrect();
    dexSee(it);
    G.phase = 'result'; G.pt = 0;
  }

  function gameOver() {
    G.state = 'over'; G.st = 0;
    const daily = G.mode === 'daily';
    if (daily) {
      const prev = dayBestLocal();
      G.newBest = G.score > prev;
      if (G.newBest) store.set('dj_daybest', JSON.stringify({ day: todayStr(), best: G.score }));
      G.shownBest = Math.max(prev, G.score);
    } else {
      G.newBest = G.score > G.best;
      if (G.newBest) { G.best = G.score; store.set('dj_best', String(G.best)); }
      G.shownBest = G.best;
    }
    // 누적 점수 → 꾸미기 해금
    const before = G.total;
    G.total += G.score; store.set('dj_total', String(G.total));
    const opened = [...HATS, ...ACCS].filter(o => o.need > before && o.need <= G.total);
    G.unlockN = opened.length;
    G.unlockMsg = opened.length ? '꾸미기 해금! (' + opened.map(o => o.name).join(', ') + ')' : '';
    G.overMsg = { code: 'pending' };
    SFX.over();
    const score = G.score;
    Rank.submit(G.mode, score, G.stage).then(r => { if (G.state === 'over' && G.score === score) G.overMsg = r; });
  }

  function update(dt) {
    G.t += dt; G.st += dt;
    if (G.state !== 'play' || G.frozen) return;
    G.gainT = Math.max(0, G.gainT - dt);
    G.shake = Math.max(0, G.shake - dt);
    G.pressT = Math.max(0, G.pressT - dt);
    G.taps = G.taps.filter(t => (t.t -= dt) > 0);
    // 오른쪽 알림: 하나씩 차례로
    G.noteT -= dt;
    if (G.noteT <= 0) { G.noteCur = G.notes.shift() || null; G.noteT = G.noteCur ? 1.3 : 0; }
    // 피버 중 쿵짝 박자
    if (G.fever > 0) { G.beatT -= dt; if (G.beatT <= 0) { G.beatT = 0.2; SFX.beat(G.beatI++); } }
    G.pt += dt;
    const it = G.items[G.cur];
    if (G.phase === 'scan') {
      if (G.pt >= 0.3) {
        G.phase = 'judge'; G.pt = 0;
        G.limit = it.boss ? 6 + it.parts.length * 0.8 : timeLimit(G.stage) + (G.rule && G.rule.fresh ? 1 : 0);
        G.left = G.limit;
      }
    } else if (G.phase === 'judge') {
      if (G.freezeT > 0) G.freezeT = Math.max(0, G.freezeT - dt);
      else G.left -= dt;
      if (G.left <= 0) { G.left = 0; judge(null); }
    } else if (G.phase === 'result') {
      if (G.pt >= 0.7) {
        G.popup = null;
        // 게임 끝 화면은 마지막 시트를 배경으로 그리므로 다음 시트로 넘기지 않음
        if (G.hearts <= 0) { gameOver(); return; }
        G.cur++;
        G.phase = 'scan'; G.pt = 0;
        ensureItems();
        sheetStart();
      }
    }
  }

  // ---------- 화면: 게임 ----------
  const OK_BTN = { x: 4, y: 180, w: 58, h: 42 };
  const NG_BTN = { x: 66, y: 180, w: 58, h: 42 };
  const ease = k => 1 - Math.pow(1 - k, 3);
  const RAINBOW = ['P', 'Y', 'M', 'S', 'L'];

  function drawPlay() {
    const sh = G.shake > 0 ? (rnd(3) - 1) : 0;
    ctx.save(); ctx.translate(sh, 0);
    ctx.drawImage(WALL, 0, 0);
    const it = G.items[G.cur];
    const fever = G.fever > 0;
    const rb = k => RAINBOW[(((G.t * 10) | 0) + k) % RAINBOW.length];

    // 상단: 점수, 목숨
    rrect(3, 3, 58, 15, 'W', 'O', 'cream3');
    sprite(6, 7, STAR);
    ptext(fmt(G.score), 16, 6, 'm', 'O', { edge: null });
    if (G.gainT > 0) ptext('+' + fmt(G.gain), 64, 7 - Math.round((0.8 - G.gainT) * 4), 's', 'm', { edge: 'W' });
    for (let i = 0; i < 3; i++) sprite(92 + i * 11, 6, i < G.hearts ? HEART : HEART_EMPTY);

    // 시간 막대 (정지 중 하늘색, 피버 중 무지개)
    const ratio = G.phase === 'judge' ? G.left / G.limit : G.phase === 'scan' ? 1 : G.lastRatio;
    rrect(3, 22, 122, 7, 'cream3');
    const tw = Math.max(5, Math.round(122 * ratio));
    const frozen = G.freezeT > 0 && G.phase === 'judge';
    rrect(3, 22, tw, 7, frozen ? 'S' : fever ? rb(0) : ratio < 0.3 ? 'P' : 'M');
    if (tw > 7) rect(5, 23, tw - 5, 1, 'W');
    if (frozen) sprite(Math.max(4, 3 + tw - 9), 22, CLOCK);

    // 모니터 (피버 중 테두리 무지개)
    rrect(4, 33, 120, 82, fever ? rb(1) : 'L', 'O', fever ? rb(3) : 'l');
    rect(6, 35, 2, 2, 'W');
    rrect(9, 38, 110, 70, 'N');
    for (let y = 40; y < 106; y += 3) rect(10, y, 108, 1, 'n');
    let mood = it.mood;
    if (G.phase === 'result') mood = it.result.ok ? 'joy' : 'cross';
    bigBuddy(41, 46, it, mood);
    // 돋보기: 결함 근처를 노란 모서리로 깜빡
    if (G.hintN > 0 && !it.boss && it.defect && G.phase === 'judge' && ((G.t * 4) | 0) % 2 === 0) {
      const hx = 41 + it.hintX, hy = 46 + it.hintY;
      for (const [bx, by, sx, sy] of [[hx, hy, 1, 1], [hx + 15, hy, -1, 1], [hx, hy + 13, 1, -1], [hx + 15, hy + 13, -1, -1]]) {
        rect(Math.min(bx, bx + 2 * sx), by, 3, 1, 'Y');
        rect(bx, Math.min(by, by + 2 * sy), 1, 3, 'Y');
      }
    }
    // 보스: 찾은 결함 표시
    if (it.boss && G.phase === 'judge') {
      it.parts.forEach(q => { if (q.found) { const b = defectBox(q); dashedBox(41 + b.x - 3, 46 + b.y - 3, b.w + 5, b.h + 5, 'M'); } });
    }
    if (G.phase === 'scan') {
      const sy = 39 + Math.round(68 * ease(Math.min(1, G.pt / 0.3)));
      rect(10, sy, 108, 107 - sy, 'N');
      for (let y = 40; y < 106; y += 3) if (y > sy) rect(10, y, 108, 1, 'n');
      rect(10, sy, 108, 1, 'S');
    }
    if (((G.t * 2) | 0) % 2 === 0) { px(114, 41, 'R'); px(115, 41, 'R'); }
    for (const [bx, by, sx, sy] of [[12, 41, 1, 1], [115, 41, -1, 1], [12, 104, 1, -1], [115, 104, -1, -1]]) {
      rect(Math.min(bx, bx + 3 * sx), by, 4, 1, 'S');
      rect(bx, Math.min(by, by + 3 * sy), 1, 4, 'S');
    }
    sprite(100, 109, KNOB); sprite(110, 109, KNOB);

    // 모니터 안에는 결함을 가리지 않는 작은 표시만: 왼쪽 위 카메라 이름, 오른쪽 위 콤보(몸통 밖 칸)
    ptext('CAM 1', 14, 42, 's', 'S', { edge: null });
    if (G.combo >= 2 || fever) {
      const label = 'x' + G.combo;
      const w = Math.max(18, textW(label, 's') + 6);
      rrect(116 - w, 42, w, 11, fever ? rb(2) : 'Y');
      ptext(label, 116 - w / 2, 43, 's', 'O', { edge: null, align: 'c' });
    }

    // 판정 결과: 결함 위치 공개 + 문구
    if (G.phase === 'result') {
      if (it.boss) {
        it.parts.forEach(q => { const b = defectBox(q); dashedBox(41 + b.x - 3, 46 + b.y - 3, b.w + 5, b.h + 5, q.found ? 'M' : 'P'); });
      } else {
        const b = defectBox(it);
        if (b) {
          const bx = 41 + b.x - 4, by = 46 + b.y - 4, bw = b.w + 7, bh = b.h + 7;
          const passed = it.defect && it.ruled && it.defect !== it.ruled;
          const bad = it.defect && !passed;
          dashedBox(bx, by, bw, bh, bad ? 'P' : 'M');
        }
      }
      // 글자는 모니터 밖(맨 아래 줄)에만: 결함 위치는 점선 상자로만 표시
    }
    // 터치 자국
    G.taps.forEach(t => {
      if (t.ok) sprite(t.x - 2, t.y - 2, SPARK);
      else { px(t.x - 1, t.y - 1, 'R'); px(t.x + 1, t.y + 1, 'R'); px(t.x + 1, t.y - 1, 'R'); px(t.x - 1, t.y + 1, 'R'); px(t.x, t.y, 'R'); }
    });

    // 카메라 + 컨베이어
    for (let k = 0; k < 5; k++) rect(62 - k, 125 + k, 4 + 2 * k, 1, k % 2 === 0 ? 'Y' : 'cream');
    sprite(56, 118, CAMERA);
    const shift = G.phase === 'result' ? ease(Math.min(1, G.pt / 0.35)) * 30 : 0;
    belt(148, shift);
    for (let k = -3; k <= 3; k++) {
      const idx = G.cur + k;
      if (idx < 0 || idx >= G.items.length) continue;
      const item = G.items[idx];
      let x = 56 + 30 * k - shift;
      // 도망친 불량: 깡충깡충 앞질러 감
      let hop = 0;
      if (item.escaped) { x += Math.min(26, (G.cur - idx) * 12 + shift * 0.4); hop = ((G.t * 8) | 0) % 2 ? -3 : 0; }
      if (x < -18 || x > W + 2) continue;
      const bob = Math.sin(G.t * 6 + idx * 1.7) > 0.7 ? -1 : 0;
      let m = item.mood;
      let badge = null;
      if (item.result) { m = item.result.ok ? 'joy' : 'cross'; badge = item.result.answer === 'ng' ? 'ng' : item.result.answer === 'ok' ? 'ok' : null; }
      if (item.escaped) { m = 'joy'; badge = null; }
      buddy(x, 133 + bob + hop, m, badge, { gold: item.gold, crown: item.boss, shiny: item.shiny && !item.result });
      if (item.escaped && x < W - 20) ptext('헤헤~', x + 8, 122 + hop, 's', 'p', { edge: 'W', align: 'c' });
    }
    if (G.phase !== 'result') {
      for (const [bx, by, sx, sy] of [[53, 129, 1, 1], [74, 129, -1, 1], [53, 149, 1, -1], [74, 149, -1, -1]]) {
        rect(Math.min(bx, bx + 2 * sx), by, 3, 1, 'y');
        rect(bx, Math.min(by, by + 2 * sy), 1, 3, 'y');
      }
    }

    // 검사원
    const jump = G.phase === 'result' && it.result.ok && G.pt < 0.25 ? -2 : 0;
    drawInspector(0, 108 + jump, G.skin, (G.t % 2.7) < 0.12);
    sprite(20, 122 + jump, LOUPE);
    if (G.phase === 'result' && !it.result.ok) sprite(19, 106, SWEAT);
    // 오른쪽 알림 칸: 화면을 가리지 않는 작은 알약 (없으면 스테이지 표시)
    if (G.noteCur) {
      const n = G.noteCur;
      const age = 1.3 - G.noteT;
      const hop = reduceMotion ? 0 : (age < 0.3 ? -Math.round(Math.abs(Math.sin(age * 20)) * 3) : 0);
      const w = textW(n.text, 's') + 6;
      const fg = n.col === 'Y' || n.col === 'M' || n.col === 'S' ? 'O' : 'W';
      rrect(127 - w, 117 + hop, w, 11, n.col, 'O', n.col === 'Y' ? 'y' : null);
      ptext(n.text, 127 - w / 2, 119 + hop, 's', fg, { edge: null, align: 'c' });
    } else ptext((G.mode === 'daily' ? '오늘 ' : '') + 'STAGE ' + G.stage, 106, 120, 's', 'l', { edge: null, align: 'c' });

    // 버튼 (보스 중에는 흐리게)
    drawJudgeButton(OK_BTN, 'M', 'm', CIRCLE_O, '양품', G.pressT > 0 && G.pressed === 'ok');
    drawJudgeButton(NG_BTN, 'P', 'p', CROSS_X, '불량', G.pressT > 0 && G.pressed === 'ng');
    if (it.boss && G.phase !== 'result') {
      ctx.fillStyle = 'rgba(255,244,224,0.6)'; ctx.fillRect(4, 180, 120, 44);
    }
    // 안내 줄(버튼 바로 위): 보스 / 반장 지시 / 판정 결과 / 기본 안내 (모니터를 가리지 않음)
    const foot = (label, fill, fg) => {
      const w = Math.min(124, textW(label, 'm') + 10);
      rrect(64 - w / 2, 163, w, 14, fill, 'O');
      ptext(label, 64, 165, 'm', fg, { edge: null, align: 'c' });
    };
    if (G.phase === 'result' && G.popup) {
      // 판정 결과: 문구 + 결함 이름 (예: PERFECT! 크랙 / MISS! 핀홀 / 크랙 통과)
      const good = it.result.ok;
      let name = '';
      if (!it.boss && (it.defect || it.decoy)) {
        const passed = it.defect && it.ruled && it.defect !== it.ruled;
        name = DEFECT_NAME[it.defect || it.decoy] + (passed ? ' 통과' : it.decoy ? '(양품)' : '');
      }
      foot(G.popup + (name ? ' ' + name : ''), good ? 'Y' : 'P', good ? 'O' : 'W');
      if (good && (G.popup === 'PERFECT!' || it.boss) && ((G.t * 8) | 0) % 2 === 0) { sprite(2, 167, SPARK); sprite(121, 167, SPARK); }
    } else if (it.boss && G.phase !== 'result') {
      const found = it.parts.filter(q => q.found).length;
      foot((it.claim ? '반품! ' : '') + '결함 터치 ' + found + '/' + it.parts.length, 'P', 'W');
    } else if (G.rule) {
      const blink = G.rule.fresh && G.phase !== 'judge' && ((G.t * 6) | 0) % 2 === 0;
      foot(DEFECT_NAME[G.rule.type] + '만 불량! (' + G.rule.left + ')', blink ? 'Y' : 'P', blink ? 'O' : 'W');
    } else if (fever) foot('FEVER 점수 x2', rb(2), 'O');
    else ptext('◀ 밀어서 판정 ▶', 64, 165, 'm', 'o', { edge: null, align: 'c' });
    ctx.restore();
  }
  function drawJudgeButton(b, fill, dark, icon, label, down) {
    const dy = down ? 2 : 0;
    if (down) rrect(b.x, b.y + 2, b.w, b.h, fill);
    else rrect(b.x, b.y, b.w, b.h, fill, 'O', dark);
    rect(b.x + 3, b.y + 2 + dy, 6, 1, 'W'); px(b.x + 2, b.y + 3 + dy, 'W');
    sprite(b.x + 22, b.y + 4 + dy, icon);
    ptext(label, b.x + 29, b.y + 19 + dy, 'b', 'W', { edge: dark, align: 'c' });
  }

  // ---------- 공통: 버튼 ----------
  function button(b, fill, dark, label, f, fg, edge) {
    rrect(b.x, b.y, b.w, b.h, fill, 'O', dark);
    ptext(label, b.x + b.w / 2, b.y + (b.h >= 16 ? 2 : 2), f, fg, { edge: edge === undefined ? null : edge, align: 'c' });
  }
  function header(label) {
    rrect(6, 5, 116, 20, 'S', 'O', 'B');
    sprite(11, 11, TROPHY); sprite(110, 11, TROPHY);
    ptext(label, 64, 8, 'b', 'W', { align: 'c' });
  }

  // ---------- 화면: 타이틀 ----------
  const T_START = { x: 6, y: 163, w: 60, h: 17 };
  const T_DAILY = { x: 69, y: 163, w: 53, h: 17 };
  const T_RANK = { x: 6, y: 184, w: 37, h: 14 };
  const T_DEX = { x: 45, y: 184, w: 37, h: 14 };
  const T_SKIN = { x: 84, y: 184, w: 38, h: 14 };
  const T_NAME = { x: 6, y: 202, w: 52, h: 14 };
  const T_SOUND = { x: 110, y: 2, w: 16, h: 12 };
  const T_CHAT = { x: 62, y: 202, w: 60, h: 14 };

  function drawTitle() {
    ctx.drawImage(WALL, 0, 0);
    rect(0, 0, W, 112, 'sky');
    const cl = [[8, 14, 3], [82, 8, 2], [104, 96, 4]];
    for (const [x0, y0, sp] of cl) sprite(((x0 + G.t * sp) % 150) - 16, y0, CLOUD);
    for (let x = 0; x < W; x += 16) sprite(x, 107, ROOF);
    rect(0, 112, W, 3, 'm');
    sprite(114, 4, soundOn ? SPEAKER : SPEAKER_OFF);

    rrect(10, 22, 108, 50, 'W', 'O', 'l');
    rect(14, 25, 6, 1, 'S');
    sprite(14, 62, SPARK);
    if (((G.t * 1.5) | 0) % 2 === 0) sprite(108, 26, SPARK);
    ptext('불량', 64, 28, 'b', 'P', { scale: 2, align: 'c', shadow: 'p' });
    rrect(34, 53, 60, 14, 'S');
    ptext('판정소', 64, 54, 'b', 'W', { align: 'c' });

    // 인사 말풍선
    const hello = G.nick ? `안녕, ${G.nick}!` : '어서 와요, 검사원!';
    // 긴 이름이면 인사말을 줄이고, 그래도 길면 이름 뒤를 .. 로 줄임
    const hfit = textW(hello, 'm') <= 104 ? { t: hello, f: 'm' } : fitText(G.nick + '!', 104);
    const hf = hfit.f;
    const hw = textW(hfit.t, hf) + 10;
    rrect(64 - hw / 2, 80, hw, 14, 'W');
    ptext(hfit.t, 64, hf === 'm' ? 82 : 83, hf, 'O', { edge: null, align: 'c' });
    sprite(Math.round(64 - hw / 2) + 10, 93, TAIL);

    // 걸어가는 전극 친구들
    belt(146, G.t * 14);
    const moods = ['happy', 'worry', 'calm', 'happy', 'joy'];
    for (let i = 0; i < 5; i++) {
      const x = 134 - ((G.t * 14 + i * 31) % 155);
      const bob = Math.sin(G.t * 8 + i) > 0.5 ? -1 : 0;
      buddy(x, 131 + bob, moods[i], null, { gold: i === 4, shiny: i === 1 });
    }
    drawInspector(6, 122, G.skin, (G.t % 2.7) < 0.12);
    sprite(27, 135, LOUPE);

    button(T_START, 'Y', 'y', '게임 시작', 'b', 'O');
    button(T_DAILY, 'P', 'p', '오늘의 판', 'm', 'W', 'p');
    button(T_RANK, 'S', 'B', '랭킹', 'm', 'W', 'B');
    button(T_DEX, 'M', 'm', '도감', 'm', 'W', 'm');
    button(T_SKIN, 'L', 'l', '꾸미기', 'm', 'W', 'l');
    button(T_NAME, 'W', 'cream3', '이름·팀', 'm', 'O');

    const best = Math.max(G.best, (Rank.mine() || {}).best || 0);
    if (Chat.enabled()) {
      // 채팅 버튼 + 새 글 수, BEST는 인사 말풍선 아래로
      button(T_CHAT, 'Y', 'y', '채팅', 'm', 'O');
      const n = Chat.unread();
      if (n > 0) {
        const label = n > 9 ? '9+' : String(n);
        const w = Math.max(12, textW(label, 's') + 6);
        rrect(124 - w, 198, w, 10, 'R', 'O');
        ptext(label, 124 - w / 2, 199, 's', 'W', { edge: null, align: 'c' });
      }
      const bt = 'BEST ' + fmt(best);
      const bw = textW(bt, 's');
      sprite(64 - bw / 2 - 9, 98, STAR);
      ptext(bt, 64 + 0, 98, 's', 'o', { edge: null, align: 'c' });
      return;
    }
    // 점수가 크면 BEST 글자를 빼서 이름·팀 버튼과 겹치지 않게
    const bt = textW('BEST ' + fmt(best), 's') <= 50 ? 'BEST ' + fmt(best) : fmt(best);
    const bw = textW(bt, 's');
    sprite(122 - bw - 9, 205, STAR);
    ptext(bt, 122, 205, 's', 'o', { edge: null, align: 'r' });
  }

  // ---------- 화면: 이름·팀 ----------
  const N_OK = { x: 16, y: 150, w: 46, h: 16 };
  const N_CANCEL = { x: 66, y: 150, w: 46, h: 16 };
  const NICK_BOX = { x: 16, y: 108, w: 96, h: 16 };
  const N_TL = { x: 14, y: 129, w: 16, h: 14 };
  const N_TR = { x: 98, y: 129, w: 16, h: 14 };

  function drawName() {
    ctx.drawImage(WALL, 0, 0);
    rrect(8, 36, 112, 138, 'W', 'O', 'cream3');
    drawInspector(53, 44 + (Math.sin(G.t * 3) > 0.6 ? -1 : 0), G.skin, false);
    ptext('이름을 알려 주세요!', 64, 74, 'm', 'O', { edge: null, align: 'c' });
    ptext('최대 8글자', 64, 88, 'm', 'l', { edge: null, align: 'c' });
    rrect(NICK_BOX.x - 2, NICK_BOX.y - 2, NICK_BOX.w + 4, NICK_BOX.h + 4, 'cream', 'O');
    // 팀 고르기
    rrect(N_TL.x, N_TL.y, N_TL.w, N_TL.h, 'Y', 'O'); sprite(N_TL.x + 6, N_TL.y + 3, ARROW_L);
    rrect(N_TR.x, N_TR.y, N_TR.w, N_TR.h, 'Y', 'O'); sprite(N_TR.x + 6, N_TR.y + 3, ARROW_R);
    rrect(32, 129, 64, 14, 'cream2', 'O');
    ptext(teamName(G.teamSel), 64, 131, 'm', 'O', { edge: null, align: 'c' });
    button(N_OK, 'M', 'm', '확인', 'b', 'W', 'm');
    button(N_CANCEL, 'cream3', 'o', '취소', 'b', 'o');
  }

  function openName(next) {
    G.state = 'name'; G.st = 0; G.nameNext = next;
    G.teamSel = G.team;
    nickEl.value = G.nick;
    nickEl.hidden = false;
    layout();
    setTimeout(() => { try { nickEl.focus(); nickEl.select(); } catch (e) { /* 무시 */ } }, 30);
  }
  function closeName(save) {
    if (G.state !== 'name') return;
    if (save) {
      let v = nickEl.value.replace(/\s+/g, ' ').trim().slice(0, 8);
      if (!v) v = '검사원' + (100 + rnd(900));
      const old = G.nick;
      G.nick = v;
      G.team = G.teamSel;
      store.set('dj_nick', v);
      store.set('dj_team', G.team);
      if (old && old !== v) Rank.rename(old, v);
      Rank.updateProfile();
    }
    nickEl.hidden = true;
    nickEl.blur();
    if (save && G.nameNext === 'play') newGame(G.pendingMode);
    else if (save && G.nameNext === 'chat') openChat();
    else { G.state = 'title'; G.st = 0; }
  }
  function cycleTeam(d) {
    const i = TEAMS.indexOf(G.teamSel);
    G.teamSel = TEAMS[(i + d + TEAMS.length) % TEAMS.length];
  }

  // ---------- 화면: 게임 끝 ----------
  const O_AGAIN = { x: 20, y: 162, w: 88, h: 16 };
  const O_RANK = { x: 20, y: 184, w: 42, h: 14 };
  const O_HOME = { x: 66, y: 184, w: 42, h: 14 };

  function overText() {
    const m = G.overMsg || {};
    const daily = G.mode === 'daily';
    switch (m.code) {
      case 'pending': return '랭킹 저장 중…';
      case 'saved': return `${daily ? '오늘의 판' : '랭킹'} ${m.rank}위 등록!`;
      case 'local': return `${daily ? '오늘의 판' : '이 기기 랭킹'} ${m.rank}위`;
      case 'nobest': return `내 최고 ${fmt(m.best)}점`;
      case 'denied': return '랭킹 등록 권한 없음';
      case 'fail': return '랭킹 저장 실패';
      default: return '';
    }
  }
  function drawOver() {
    drawPlay();
    ctx.fillStyle = 'rgba(74,48,84,0.7)';
    ctx.fillRect(0, 0, W, H);
    const pop = Math.round(Math.max(0, 0.2 - G.st) * 60);
    ctx.save(); ctx.translate(0, pop);
    rrect(10, 30, 108, 176, 'cream', 'O', 'cream3');
    ptext('게임 끝!', 64, 37, 'b', 'P', { scale: 2, align: 'c', shadow: 'p' });
    const daily = G.mode === 'daily';
    if (G.newBest || daily) {
      const label = daily ? (G.newBest ? '오늘의 판 최고!' : '오늘의 판') : '최고 기록!';
      const w = textW(label, 's') + 8;
      rrect(64 - w / 2, 64, w, 11, daily ? 'P' : 'Y');
      ptext(label, 64, 65, 's', daily ? 'W' : 'O', { edge: null, align: 'c' });
    }
    const rows = [['점수', fmt(G.score)], [daily ? '오늘 최고' : '최고', fmt(G.shownBest || 0)], ['스테이지', String(G.stage)], ['최대 콤보', String(G.maxCombo)]];
    rows.forEach(([k, v], i) => {
      const y = 79 + i * 12;
      ptext(k, 22, y, 'm', 'o', { edge: null });
      ptext(v, 106, y, 'm', 'O', { edge: null, align: 'r' });
      if (i < 3) for (let x = 22; x < 106; x += 2) px(x, y + 11, 'cream3');
    });
    ptext(overText(), 64, 129, 'm', 'l', { edge: null, align: 'c' });
    if (G.unlockMsg) {
      const u = textW(G.unlockMsg, 'm') <= 100 ? G.unlockMsg : '꾸미기 ' + G.unlockN + '개 해금!';
      ptext(u, 64, 144, 'm', 'p', { edge: null, align: 'c' });
    }
    button(O_AGAIN, 'Y', 'y', daily ? '오늘의 판 다시' : '다시 하기', 'b', 'O');
    button(O_RANK, 'S', 'B', '랭킹', 'm', 'W', 'B');
    button(O_HOME, 'W', 'cream3', '처음으로', 'm', 'O');
    ctx.restore();
  }

  // ---------- 화면: 랭킹 ----------
  const R_BACK = { x: 34, y: 205, w: 60, h: 15 };
  const R_TABS = [
    { k: 'me', label: '개인', x: 6 }, { k: 'team', label: '팀', x: 46 }, { k: 'day', label: '오늘', x: 86 },
  ].map(t => Object.assign(t, { y: 28, w: 36, h: 13 }));

  function drawRank() {
    ctx.drawImage(WALL, 0, 0);
    header(Rank.mode === 'shared' ? '모두의 랭킹' : '이 기기 랭킹');
    R_TABS.forEach(t => {
      const on = G.rankTab === t.k;
      rrect(t.x, t.y, t.w, t.h, on ? 'Y' : 'W', 'O', on ? 'y' : 'cream3');
      ptext(t.label, t.x + t.w / 2, t.y + 2, 'm', on ? 'O' : 'o', { edge: null, align: 'c' });
    });

    const tab = G.rankTab;
    const list = Rank.list(tab);
    const isMe = r => tab === 'team' ? r.team === G.team : Rank.mode === 'shared' ? r.id === Rank.uid : r.nick === G.nick;
    if (Rank.mode === 'shared' && (Rank.status === 'loading' || Rank.status === 'slow') && !list.length) {
      ptext(Rank.status === 'slow' ? '연결이 느려요. 잠시만요…' : '불러오는 중…', 64, 100, 'm', 'o', { edge: null, align: 'c' });
    } else if (Rank.status === 'error' && !list.length) {
      ptext('랭킹을 불러오지 못했어요', 64, 96, 'm', 'p', { edge: null, align: 'c' });
      ptext('잠시 뒤 다시 열어 주세요', 64, 110, 's', 'o', { edge: null, align: 'c' });
    } else if (!list.length) {
      const empty = tab === 'team' ? '팀 기록이 없어요' : tab === 'day' ? '오늘 기록이 없어요' : '아직 기록이 없어요';
      ptext(empty, 64, 96, 'm', 'o', { edge: null, align: 'c' });
      ptext(tab === 'team' ? '이름·팀에서 팀을 골라 보세요' : '첫 기록을 남겨 보세요!', 64, 110, 's', 'l', { edge: null, align: 'c' });
    } else {
      const row = (r, i, y) => {
        rrect(6, y, 116, 13, isMe(r) ? 'Y' : 'W');
        if (i < 3) {
          rrect(8, y + 2, 11, 9, ['Y', 'G', 'Z'][i]);
          ptext(String(i + 1), 13, y + 3, 's', 'O', { edge: null, align: 'c' });
        } else ptext(String(i + 1), 13, y + 3, 's', 'o', { edge: null, align: 'c' });
        if (tab === 'team') {
          ptext(teamName(r.team), 23, y + 2, 'm', 'O', { edge: null });
          ptext(r.count + '명', 23 + textW(teamName(r.team), 'm') + 2, y + 3, 's', 'o', { edge: null });
        } else {
          miniHead(21, y + 4, r.skin);
        }
        const sc = fmtShort(r.score);
        const sw = textW(sc, 'm');
        ptext(sc, 118, y + 2, 'm', 'O', { edge: null, align: 'r' });
        if (tab !== 'team') {
          // 이름은 점수 왼쪽까지만: 길면 작은 글꼴, 그래도 길면 … 로 줄임
          const n = fitText(r.nick, 118 - sw - 4 - 30);
          ptext(n.t, 30, y + 2, 'm', 'O', { edge: null });
        }
      };
      list.slice(0, 10).forEach((r, i) => row(r, i, 45 + i * 14));
      const myIdx = list.findIndex(isMe);
      if (myIdx >= 10) row(list[myIdx], myIdx, 188);
    }
    button(R_BACK, 'P', 'p', '돌아가기', 'b', 'W', 'p');
  }

  // ---------- 화면: 도감 ----------
  function drawDexIcon(d, x, y) {
    const k = d.k;
    if (DEFECTS.includes(k) || ['dust', 'glare', 'stain'].includes(k)) {
      rrect(x, y, 30, 18, 'G');
      rect(x + 3, y + 1, 24, 16, 'C');
      for (let j = y + 3; j < y + 17; j += 4) rect(x + 3, j, 24, 1, 'c');
      const it = DEFECTS.includes(k) ? { defect: k, lvl: 0, dx: 0, dy: 0 } : { decoy: k, lvl: 0, dx: 0, dy: 0 };
      const b = defectBox(it);
      it.dx = Math.round(15 - b.w / 2); it.dy = Math.round(9 - b.h / 2);
      drawDefect(it, x, y);
    } else if (k === 'boss') buddy(x + 7, y + 4, 'worry', null, { crown: true });
    else if (k === 'claim') buddy(x + 7, y + 4, 'cross', 'ng');
    else if (k === 'gold') buddy(x + 7, y + 4, 'happy', null, { gold: true });
    else if (k === 'pw_heart') sprite(x + 11, y + 5, HEART);
    else if (k === 'pw_freeze') sprite(x + 12, y + 5, CLOCK);
    else if (k === 'pw_loupe') sprite(x + 12, y + 6, LOUPE);
  }
  function drawDex() {
    ctx.drawImage(WALL, 0, 0);
    header('도감 ' + dexSeen.size + '/' + DEX.length);
    DEX.forEach((d, i) => {
      const x = 5 + (i % 3) * 40, y = 30 + Math.floor(i / 3) * 43;
      const known = dexSeen.has(d.k);
      rrect(x, y, 38, 40, known ? 'W' : 'cream3', 'O', known ? 'cream3' : 'o');
      if (known) {
        drawDexIcon(d, x + 4, y + 3);
        ptext(d.name, x + 19, y + 27, 's', 'O', { edge: null, align: 'c' });
      } else {
        ptext('?', x + 19, y + 6, 'b', 'o', { edge: null, align: 'c' });
        ptext('???', x + 19, y + 27, 's', 'o', { edge: null, align: 'c' });
      }
    });
    button(R_BACK, 'P', 'p', '돌아가기', 'b', 'W', 'p');
  }

  // ---------- 채팅 (웹 공개판 Supabase에서만) ----------
  // 줄바꿈: 띄어쓰기 단위로 나누고, 한 단어가 너무 길면 글자 단위로 자름
  function wrapText(t, maxW, f) {
    const lines = []; let cur = '';
    for (const word of t.split(' ')) {
      const tryLine = cur ? cur + ' ' + word : word;
      if (textW(tryLine, f) <= maxW) { cur = tryLine; continue; }
      if (cur) lines.push(cur);
      cur = '';
      for (const ch of Array.from(word)) {
        if (textW(cur + ch, f) > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  // 기본 비속어 가림 (화면에 보일 때 * 로 바꿈)
  const BAD_WORDS = ['씨발', '시발', '씨바', '시바', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '븅신', '개새', '새끼', '좆', '존나', '졸라', '미친놈', '미친년', '닥쳐', 'fuck', 'shit', 'bitch'];
  const BAD_RE = new RegExp(BAD_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  const maskBad = t => t.replace(BAD_RE, w => '*'.repeat(Array.from(w).length));
  function cleanChat(d) {
    if (!d) return null;
    const id = Number(d.id);
    if (!Number.isFinite(id)) return null;
    const at = new Date(d.at);
    return {
      id, uid: String(d.uid || ''),
      nick: String(d.nick || '익명').slice(0, 8),
      skin: Math.max(0, Math.min(99, Math.floor(Number(d.skin) || 0))),
      text: maskBad(String(d.text || '').slice(0, 40)),
      at: isNaN(at) ? '' : String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0'),
    };
  }
  const Chat = {
    rows: [], status: 'idle', lastPoll: 0, sending: false, err: '', errUntil: 0, fake: false,
    seen: Number(store.get('dj_chat_seen', '-1')),
    enabled() { return Rank.net || this.fake; },
    async poll() {
      if (this.fake || !Rank.net) return;
      if (!this.rows.length) this.status = 'loading';
      try {
        const d = await netCall('GET', '/rest/v1/chat?select=id,uid,nick,skin,text,at&order=id.desc&limit=60');
        this.rows = (Array.isArray(d) ? d : []).map(cleanChat).filter(Boolean).reverse();
        this.status = 'ok';
        // 처음 쓰는 기기는 지난 대화를 모두 읽은 것으로 시작
        if (this.seen < 0) this.markSeen(true);
      } catch (e) { if (!this.rows.length) this.status = 'error'; }
    },
    unread() { return this.seen < 0 ? 0 : this.rows.filter(r => r.id > this.seen && r.uid !== Rank.uid).length; },
    markSeen(force) {
      const m = this.rows.length ? this.rows[this.rows.length - 1].id : 0;
      if (force || m > this.seen) { this.seen = m; store.set('dj_chat_seen', String(m)); }
    },
    showErr(t) { this.err = t; this.errUntil = performance.now() + 2500; },
    async send() {
      const t = chatEl.value.replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!t || this.sending) return;
      if (this.fake) { this.rows.push({ id: Date.now(), uid: Rank.uid, nick: G.nick, skin: G.skin, text: maskBad(t), at: '지금' }); chatEl.value = ''; return; }
      this.sending = true;
      try {
        await netCall('POST', '/rest/v1/rpc/post_chat', { p_id: Rank.uid, p_secret: Rank.secret, p_nick: G.nick, p_skin: G.skin, p_text: t });
        chatEl.value = ''; G.chatScroll = 0;
        await this.poll(); this.markSeen();
      } catch (e) {
        this.showErr(String(e && e.message).indexOf('400') >= 0 ? '잠시 후 다시 보내 주세요' : '보내지 못했어요');
      } finally { this.sending = false; }
    },
  };
  // 채팅 화면이면 3초, 아니면 30초마다 새 글 확인 (새 글 표시용)
  setInterval(() => {
    if (!Chat.enabled() || document.hidden) return;
    const now = Date.now();
    if (now - Chat.lastPoll < (G.state === 'chat' ? 3000 : 30000)) return;
    Chat.lastPoll = now;
    Chat.poll().then(() => { if (G.state === 'chat') Chat.markSeen(); });
  }, 1000);

  const C_BOX = { x: 4, y: 187, w: 90, h: 16 };
  const C_SEND = { x: 97, y: 187, w: 27, h: 16 };
  const C_TOP = 29, C_BOTTOM = 183;
  function chatLayout() {
    // 아래(최신)부터 위로 쌓을 때 각 글의 높이
    return Chat.rows.map(m => {
      const lines = wrapText(m.text, 104, 'm');
      const bh = lines.length * 11 + 4;
      const bw = Math.max(...lines.map(l => textW(l, 'm'))) + 8;
      return { m, lines, bh, bw, h: bh + 13 };
    });
  }
  function drawChat() {
    ctx.drawImage(WALL, 0, 0);
    rrect(6, 5, 116, 20, 'Y', 'O', 'y');
    ptext('모두의 채팅', 64, 8, 'b', 'O', { edge: null, align: 'c' });
    const items = chatLayout();
    const total = items.reduce((a, it) => a + it.h, 0);
    G.chatScroll = Math.max(0, Math.min(Math.max(0, total - (C_BOTTOM - C_TOP - 4)), G.chatScroll || 0));
    if (!items.length) {
      const t = Chat.status === 'loading' ? '불러오는 중…' : Chat.status === 'error' ? '대화를 불러오지 못했어요' : '첫 인사를 남겨 보세요!';
      ptext(t, 64, 100, 'm', 'o', { edge: null, align: 'c' });
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, C_TOP, W, C_BOTTOM - C_TOP); ctx.clip();
    let y = C_BOTTOM - 2 + G.chatScroll;
    for (let i = items.length - 1; i >= 0; i--) {
      const { m, lines, bh, bw, h } = items[i];
      y -= h;
      if (y > C_BOTTOM) continue;
      if (y + h < C_TOP) break;
      const mine = m.uid && m.uid === Rank.uid;
      if (mine) {
        ptext('나 · ' + m.at, 122, y, 's', 'o', { edge: null, align: 'r' });
        rrect(122 - bw, y + 10, bw, bh, 'Y', 'O', 'y');
        lines.forEach((l, j) => ptext(l, 126 - bw, y + 12 + j * 11, 'm', 'O', { edge: null }));
      } else {
        miniHead(6, y + 1, m.skin);
        const nw = ptext(fitText(m.nick, 70).t, 15, y - 1, 'm', 'l', { edge: null });
        ptext(m.at, 15 + nw + 2, y, 's', 'o', { edge: null });
        rrect(6, y + 10, bw, bh, 'W', 'O', 'cream3');
        lines.forEach((l, j) => ptext(l, 10, y + 12 + j * 11, 'm', 'O', { edge: null }));
      }
    }
    ctx.restore();
    if (G.chatScroll > 0) {
      // 위로 올려 보는 중: 맨 아래로 돌아가기 표시
      rrect(50, C_BOTTOM - 14, 28, 11, 'S', 'O');
      ptext('▼', 64, C_BOTTOM - 13, 's', 'W', { edge: null, align: 'c' });
    }
    rect(0, C_BOTTOM, W, 1, 'cream3');
    rrect(C_BOX.x, C_BOX.y, C_BOX.w, C_BOX.h, 'W', 'O');
    rrect(C_SEND.x, C_SEND.y, C_SEND.w, C_SEND.h, Chat.sending ? 'cream3' : 'P', 'O', 'p');
    ptext('전송', C_SEND.x + C_SEND.w / 2, C_SEND.y + 2, 'm', 'W', { edge: null, align: 'c' });
    if (Chat.err && performance.now() < Chat.errUntil) {
      const w = textW(Chat.err, 'm') + 10;
      rrect(64 - w / 2, C_BOTTOM - 16, w, 14, 'P', 'O');
      ptext(Chat.err, 64, C_BOTTOM - 14, 'm', 'W', { edge: null, align: 'c' });
    }
    button(R_BACK, 'S', 'B', '돌아가기', 'b', 'W', 'B');
  }
  function openChat() {
    if (!G.nick) { openName('chat'); return; }
    G.state = 'chat'; G.st = 0; G.chatScroll = 0;
    chatEl.hidden = false;
    layout();
    Chat.lastPoll = Date.now();
    Chat.poll().then(() => Chat.markSeen());
  }
  function closeChat() {
    chatEl.hidden = true; chatEl.blur();
    Chat.markSeen();
    G.state = 'title'; G.st = 0;
  }

  // ---------- 화면: 꾸미기 ----------
  const K_HL = { x: 12, y: 108, w: 18, h: 18 }, K_HR = { x: 98, y: 108, w: 18, h: 18 };
  const K_AL = { x: 12, y: 154, w: 18, h: 18 }, K_AR = { x: 98, y: 154, w: 18, h: 18 };
  function nextNeed(list, total) { const n = list.find(o => o.need > total); return n ? n.need : 0; }
  function drawSkin() {
    ctx.drawImage(WALL, 0, 0);
    header('꾸미기');
    // 크게 보기 (2배)
    ctx.save(); ctx.translate(42, 30); ctx.scale(2, 2);
    drawInspector(0, 3, G.skin, (G.t % 2.7) < 0.12);
    ctx.restore();
    ptext('누적 점수 ' + fmt(G.total), 64, 84, 'm', 'O', { edge: null, align: 'c' });
    const sel = (label, y, name, need, bl, br) => {
      ptext(label, 64, y - 11, 'm', 'l', { edge: null, align: 'c' });
      rrect(32, y, 64, 18, 'W', 'O', 'cream3');
      ptext(name, 64, y + 4, 'm', 'O', { edge: null, align: 'c' });
      rrect(bl.x, bl.y, bl.w, bl.h, 'Y', 'O', 'y'); sprite(bl.x + 7, bl.y + 5, ARROW_L);
      rrect(br.x, br.y, br.w, br.h, 'Y', 'O', 'y'); sprite(br.x + 7, br.y + 5, ARROW_R);
      if (need) { sprite(36, y + 21, LOCK); ptext('다음: ' + fmt(need) + '점', 70, y + 21, 's', 'l', { edge: null, align: 'c' }); }
    };
    sel('모자 색', 108, HATS[skinHat(G.skin)].name, nextNeed(HATS, G.total), K_HL, K_HR);
    sel('장식', 154, ACCS[skinAcc(G.skin)].name, nextNeed(ACCS, G.total), K_AL, K_AR);
    button(R_BACK, 'P', 'p', '돌아가기', 'b', 'W', 'p');
  }
  function cycleSkin(part, d) {
    const list = part === 'hat' ? HATS : ACCS;
    const open = list.map((o, i) => i).filter(i => list[i].need <= G.total);
    const curI = part === 'hat' ? skinHat(G.skin) : skinAcc(G.skin);
    const pos = Math.max(0, open.indexOf(curI));
    const ni = open[(pos + d + open.length) % open.length];
    G.skin = part === 'hat' ? skinAcc(G.skin) * 10 + ni : ni * 10 + skinHat(G.skin);
    store.set('dj_skin', String(G.skin));
  }

  // ---------- 입력 ----------
  const inBox = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
  function toLogical(e) {
    const r = cvs.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * HV - OFF };
  }
  function goRank(back, tab) {
    G.rankBack = back; G.state = 'rank'; G.st = 0;
    G.rankTab = tab || (G.mode === 'daily' && back === 'over' ? 'day' : 'me');
    Rank.refresh();
  }
  function startGame(mode) {
    G.pendingMode = mode;
    if (!G.nick) openName('play'); else newGame(mode);
  }
  function backFromSub() { G.state = G.rankBack === 'over' ? 'over' : 'title'; G.st = 1; }

  function tap(p) {
    if (G.state === 'title') {
      if (inBox(p, T_SOUND)) { soundOn = !soundOn; store.set('dj_sound', soundOn ? '1' : '0'); SFX.tap(); return; }
      if (inBox(p, T_START)) { SFX.tap(); startGame('normal'); }
      else if (inBox(p, T_DAILY)) { SFX.tap(); startGame('daily'); }
      else if (inBox(p, T_RANK)) { SFX.tap(); goRank('title'); }
      else if (inBox(p, T_DEX)) { SFX.tap(); G.rankBack = 'title'; G.state = 'dex'; }
      else if (inBox(p, T_SKIN)) { SFX.tap(); G.rankBack = 'title'; G.state = 'skin'; }
      else if (inBox(p, T_NAME)) { SFX.tap(); openName('title'); }
      else if (Chat.enabled() && inBox(p, T_CHAT)) { SFX.tap(); openChat(); }
    } else if (G.state === 'name') {
      if (inBox(p, N_OK)) { SFX.tap(); closeName(true); }
      else if (inBox(p, N_CANCEL)) { SFX.tap(); closeName(false); }
      else if (inBox(p, N_TL)) { SFX.tap(); cycleTeam(-1); }
      else if (inBox(p, N_TR)) { SFX.tap(); cycleTeam(1); }
    } else if (G.state === 'over') {
      if (G.st < 0.6) return;
      if (inBox(p, O_AGAIN)) { SFX.tap(); newGame(G.mode); }
      else if (inBox(p, O_RANK)) { SFX.tap(); goRank('over'); }
      else if (inBox(p, O_HOME)) { SFX.tap(); G.state = 'title'; G.st = 0; }
    } else if (G.state === 'rank') {
      const t = R_TABS.find(t => inBox(p, t));
      if (t) { SFX.tap(); G.rankTab = t.k; }
      else if (inBox(p, R_BACK)) { SFX.tap(); backFromSub(); }
    } else if (G.state === 'dex') {
      if (inBox(p, R_BACK)) { SFX.tap(); backFromSub(); }
    } else if (G.state === 'chat') {
      if (inBox(p, C_SEND)) { SFX.tap(); Chat.send(); }
      else if (inBox(p, R_BACK)) { SFX.tap(); closeChat(); }
      else if (G.chatScroll > 0 && inBox(p, { x: 50, y: C_BOTTOM - 14, w: 28, h: 11 })) { G.chatScroll = 0; }
    } else if (G.state === 'skin') {
      if (inBox(p, K_HL)) { SFX.tap(); cycleSkin('hat', -1); }
      else if (inBox(p, K_HR)) { SFX.tap(); cycleSkin('hat', 1); }
      else if (inBox(p, K_AL)) { SFX.tap(); cycleSkin('acc', -1); }
      else if (inBox(p, K_AR)) { SFX.tap(); cycleSkin('acc', 1); }
      else if (inBox(p, R_BACK)) { SFX.tap(); Rank.updateProfile(); backFromSub(); }
    }
  }

  let down = null;
  cvs.addEventListener('pointerdown', e => {
    unlockAudio();
    const p = toLogical(e);
    down = { x: p.x, y: p.y, used: false };
    if (G.state === 'play') {
      const it = G.items[G.cur];
      if (it.boss) {
        if (G.phase === 'judge' && inBox(p, MON)) bossTap(p);
        down.used = true;
      } else if (inBox(p, OK_BTN)) { judge('ok'); down.used = true; }
      else if (inBox(p, NG_BTN)) { judge('ng'); down.used = true; }
    }
  });
  cvs.addEventListener('pointerup', e => {
    if (!down) return;
    const p = toLogical(e);
    const d0 = down; down = null;
    if (d0.used) return;
    if (G.state === 'play') {
      const dx = p.x - d0.x;
      if (Math.abs(dx) >= 12) judge(dx < 0 ? 'ok' : 'ng');
      return;
    }
    if (!d0.drag && Math.abs(p.x - d0.x) < 10 && Math.abs(p.y - d0.y) < 10) tap(p);
  });
  cvs.addEventListener('pointercancel', () => { down = null; });
  // 채팅: 끌어 올려 이전 글 보기
  cvs.addEventListener('pointermove', e => {
    if (!down || G.state !== 'chat') return;
    const p = toLogical(e);
    if (down.ly === undefined) down.ly = down.y;
    if (Math.abs(p.y - down.y) >= 6 || down.drag) {
      down.drag = true;
      G.chatScroll = (G.chatScroll || 0) + (p.y - down.ly);
      down.ly = p.y;
    }
  });
  cvs.addEventListener('wheel', e => {
    if (G.state !== 'chat') return;
    e.preventDefault();
    G.chatScroll = (G.chatScroll || 0) - e.deltaY / scale;
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (G.state === 'chat') {
      if (e.key === 'Enter') { e.preventDefault(); Chat.send(); }
      else if (e.key === 'Escape') closeChat();
      return;
    }
    if (G.state === 'name') {
      if (e.key === 'Enter') { e.preventDefault(); closeName(true); }
      else if (e.key === 'Escape') closeName(false);
      return;
    }
    unlockAudio();
    const k = e.key;
    if (G.state === 'play') {
      if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'j' || k === 'J') { judge('ok'); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'l' || k === 'L') { judge('ng'); e.preventDefault(); }
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (G.state === 'title') startGame('normal');
      else if (G.state === 'over' && G.st > 0.6) newGame(G.mode);
      else if (G.state === 'rank' || G.state === 'dex') backFromSub();
      else if (G.state === 'skin') { Rank.updateProfile(); backFromSub(); }
    } else if (k === 'Escape' && (G.state === 'rank' || G.state === 'dex' || G.state === 'skin')) {
      if (G.state === 'skin') Rank.updateProfile();
      backFromSub();
    }
  });

  // ---------- 화면 크기 ----------
  let scale = 3;
  let RES = 1;   // 캔버스 내부 배율
  let HV = H, OFF = 0;   // 실제 캔버스 높이(논리 픽셀)와 게임 내용 시작 위치
  function layout() {
    const cs = getComputedStyle(wrapEl);
    const aw = wrapEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = wrapEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    // 화면에 꽉 차게 (비율 유지, 소수 배율 허용). 정수 배율만 쓰면 휴대폰에서 여백이 크게 남음
    const s = Math.max(0.5, Math.min(aw / W, ah / H));
    scale = s;
    // 휴대폰처럼 세로가 더 길면 위아래를 배경으로 늘려 빈 띠가 없게 함 (게임 내용은 가운데 224줄)
    HV = Math.max(H, Math.min(320, Math.floor(ah / s)));
    OFF = Math.floor((HV - H) / 2);
    stageEl.style.width = Math.floor(W * s) + 'px';
    stageEl.style.height = Math.floor(HV * s) + 'px';
    // 내부 해상도는 기기 픽셀 기준 정수 배율로 그려서 도트 크기가 고르게 보이게 함
    const k = Math.max(1, Math.min(8, Math.ceil(s * (window.devicePixelRatio || 1))));
    if (k !== RES) {
      RES = k;
      cvs.width = W * k;
      ctx.imageSmoothingEnabled = false;
    }
    if (cvs.height !== HV * RES) { cvs.height = HV * RES; ctx.imageSmoothingEnabled = false; }
    const b = NICK_BOX;
    Object.assign(nickEl.style, {
      left: b.x * s + 'px', top: (b.y + OFF) * s + 'px', width: b.w * s + 'px', height: b.h * s + 'px',
      fontSize: Math.round(10 * s) + 'px',
    });
    const c = C_BOX;
    Object.assign(chatEl.style, {
      left: (c.x + 2) * s + 'px', top: (c.y + 2 + OFF) * s + 'px', width: (c.w - 4) * s + 'px', height: (c.h - 4) * s + 'px',
      fontSize: Math.round(10 * s) + 'px', paddingLeft: Math.round(2 * s) + 'px',
    });
  }
  window.addEventListener('resize', layout);

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 루프 ----------
  function draw() {
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (OFF > 0 || HV > H) {
      // 위아래 늘어난 띠: 시작 화면은 위쪽 하늘색, 나머지는 바둑판 배경
      ctx.drawImage(WALL, 0, 0); ctx.drawImage(WALL, 0, HV - H);
      if (G.state === 'title') rect(0, 0, W, OFF, 'sky');
    }
    ctx.translate(0, OFF);
    drawState();
    if (G.state === 'over' && (OFF > 0 || HV > H)) {
      ctx.setTransform(RES, 0, 0, RES, 0, 0);
      ctx.fillStyle = 'rgba(74,48,84,0.7)';
      ctx.fillRect(0, 0, W, OFF); ctx.fillRect(0, OFF + H, W, HV - OFF - H);
    }
  }
  function drawState() {
    if (G.state === 'title') drawTitle();
    else if (G.state === 'play') drawPlay();
    else if (G.state === 'over') drawOver();
    else if (G.state === 'name') drawName();
    else if (G.state === 'rank') drawRank();
    else if (G.state === 'dex') drawDex();
    else if (G.state === 'skin') drawSkin();
    else if (G.state === 'chat') drawChat();
  }
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0);
    last = ts;
    // 한 프레임에서 오류가 나도 루프가 멈추지 않게 다음 프레임을 먼저 예약
    requestAnimationFrame(frame);
    try { update(dt); draw(); } catch (e) { console.error(e); }
  }

  // 확인용 화면 (?shot=...). 게시 페이지에는 영향 없음
  function shotView(shot) {
    G.nick = G.nick || '테스트';
    const playAt = (it, extra) => {
      newGame('normal'); G.score = 12450; G.combo = 7; G.hearts = 2; G.stage = 3; G.t = 1;
      G.items[G.cur] = it || Object.assign(makeItem(1, 0), { defect: 'pin', decoy: null, lvl: 0, dx: 30, dy: 34, mood: 'worry', shiny: false, gold: false });
      G.phase = 'judge'; G.limit = 3; G.left = 2; G.frozen = true;
      if (extra) extra();
    };
    if (shot === 'play') playAt();
    else if (shot === 'stage') playAt(null, () => { G.noteCur = { text: 'STAGE 4!', col: 'Y' }; G.noteT = 1.0; });
    else if (shot === 'fever') playAt(null, () => { G.fever = 5; G.combo = 12; G.freezeT = 2; });
    else if (shot === 'rule') playAt(Object.assign(makeItem(3, 0), { defect: 'crack', decoy: null, lvl: 0, dx: 12, dy: 34, shiny: true, gold: false }),
      () => { G.rule = { type: 'uncoat', left: 4, fresh: false }; G.phase = 'result'; G.pt = 0.5; judgeShow('ok'); });
    else if (shot === 'boss') playAt(makeBoss(4, 0, false), () => { G.items[0].parts[0].found = true; G.taps.push({ x: 60, y: 70, t: 0.3, ok: false }); });
    else if (shot === 'gold') playAt(Object.assign(makeItem(2, 0), { gold: true, shiny: false, defect: null, decoy: 'dust', dx: 20, dy: 5 }),
      () => { G.hintN = 2; G.items.forEach((x, i) => { if (i === 1) x.shiny = true; }); });
    else if (shot === 'escape') playAt(null, () => { G.items[0].escaped = true; G.items[0].result = { answer: 'ok', ok: false }; G.phase = 'result'; G.pt = 0.6; G.popup = '도망! 2/3'; });
    else if (shot === 'over') { playAt(); G.maxCombo = 12; G.total = 15000; gameOver(); G.st = 1; G.unlockMsg = '꾸미기 해금! (분홍, 리본)'; }
    else if (shot === 'rank' || shot === 'team' || shot === 'day') {
      const today = todayStr();
      [['검사왕', 31800, 13, '코팅'], ['핀홀헌터', 22650, 2, '검사'], ['테스트', 12450, 31, '코팅'], ['초보', 3200, 0, '']]
        .forEach(([n, s, skin, team], i) => {
          Rank.addLocal({ nick: n, skin, team }, { mode: 'normal', score: s, stage: 3 });
          if (i < 3) Rank.addLocal({ nick: n, skin, team }, { mode: 'daily', score: s / 2, stage: 2, day: today });
        });
      G.team = '코팅';
      goRank('title', shot === 'rank' ? 'me' : shot);
    } else if (shot === 'name') { G.team = '검사'; openName('title'); }
    else if (shot === 'dex') { ['pin', 'uncoat', 'dust', 'glare', 'stain', 'boss', 'gold', 'pw_heart', 'pw_loupe'].forEach(k => dexSeen.add(k)); G.state = 'dex'; }
    else if (shot === 'skin') { G.total = 70000; G.skin = 21; G.state = 'skin'; }
    else if (shot === 'long' || shot === 'longtitle' || shot === 'longover') {   // 긴 이름·큰 점수 겹침 확인
      G.nick = '가나다라마바사아';
      [['가나다라마바사아', 1234560], ['WWWWWWWW', 987650], ['검사왕검사왕검사', 45210], ['ABCDEFGH', 3200]]
        .forEach(([n, s], i) => Rank.addLocal({ nick: n, skin: i * 11, team: '' }, { mode: 'normal', score: s, stage: 3 }));
      if (shot === 'long') goRank('title', 'me');
      if (shot === 'longover') { playAt(); G.total = 0; gameOver(); G.st = 1; G.unlockMsg = '꾸미기 해금! (분홍, 민트, 노랑, 보라, 리본, 안경, 왕관)'; G.unlockN = 7; }
    }
    else if (shot === 'chat' || shot === 'chattitle') {   // 가짜 대화로 화면 확인 (서버에 쓰지 않음)
      G.nick = '김성일'; G.skin = 21; Chat.fake = true; Rank.uid = 'me'; Chat.seen = 1; Chat.status = 'ok';
      [['시스템2팀 이동', 1, '오늘의 판 보스 너무 빠름 ㅠㅠ', 'x'], ['김성일', 21, '반장 지시 나오면 꼭 아래 글자 보세요', 'me'],
        ['핀홀헌터', 2, '금색 전극 처음 봄!! 1000점 개꿀', 'y'], ['검사왕', 33, '코팅팀 1등 가즈아 씨발', 'z'], ['김성일', 21, 'ㅋㅋ 검사팀이 따라잡는다', 'me']]
        .forEach(([nick, skin, text, uid], i) => Chat.rows.push({ id: i + 1, uid, nick, skin, text: maskBad(text), at: '14:0' + (i + 2) }));
      if (shot === 'chat') openChat();
    }
    else if (shot === 'auto') {   // 자동 플레이: 정답 위주 + 13번째마다 일부러 틀림 → 결과를 제목에 기록
      newGame('normal');
      const seen = {};
      for (let i = 0; i < 6000 && G.state === 'play'; i++) {
        const it = G.items[G.cur];
        if (G.phase === 'judge' && G.pt > 0.25) {
          if (it.boss) {
            it.parts.forEach(q => { if (!q.found && G.phase === 'judge') { const b = defectBox(q); bossTap({ x: 41 + b.x + b.w / 2, y: 46 + b.y + b.h / 2 }); } });
          } else {
            const t = truthOf(it);
            judge(G.cur % 13 === 5 ? (t === 'ng' ? 'ok' : 'ng') : t);
          }
        }
        if (G.fever) seen.fever = 1; if (G.rule) seen.rule = 1; if (it.boss) seen.boss = 1;
        if (it.claim) seen.claim = 1; if (it.gold) seen.gold = 1; if (it.shiny) seen.shiny = 1;
        if (it.escaped) seen.escape = 1; if (G.freezeT) seen.freeze = 1; if (G.hintN) seen.hint = 1;
        update(0.05);
      }
      document.title = JSON.stringify({ state: G.state, score: G.score, stage: G.stage, cur: G.cur, hearts: G.hearts, seen, dex: [...dexSeen], unlock: G.unlockMsg });
    }
    else if (shot === 'run') {   // 입력 없이 진행 → 시간 초과 3번으로 게임 끝까지
      newGame('normal');
      for (let i = 0; i < 400; i++) update(0.05);
    }
  }
  function judgeShow(answer) {
    const it = G.items[G.cur];
    it.ruled = G.rule ? G.rule.type : null;
    it.result = { answer, ok: truthOf(it) === answer };
    G.popup = it.result.ok ? 'PERFECT!' : 'MISS!';
  }

  async function boot() {
    layout();
    const loads = ['12px Galmuri11B', '10px Galmuri9', '8px Galmuri7'].map(f => document.fonts ? document.fonts.load(f, '가A') : null);
    await Promise.race([Promise.all(loads).catch(() => {}), new Promise(r => setTimeout(r, 2500))]);
    txtCache.clear();
    WALL = makeWall();
    G.state = 'title';
    const shot = new URLSearchParams(location.search).get('shot');
    // 확인용 화면은 공용 랭킹에 쓰지 않도록 이 기기 랭킹만 사용
    if (shot) Rank.loadLocal(); else Rank.init();
    if (shot) shotView(shot);
    requestAnimationFrame(frame);
  }
  boot();
})();
