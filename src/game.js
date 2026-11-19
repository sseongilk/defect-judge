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
  function buddy(x, y, mood, badge) {
    const w = 16, h = 13;
    x = Math.round(x); y = Math.round(y);
    rect(x + 3, y + h - 1, 4, 3, 'O'); rect(x + 4, y + h - 1, 2, 1, 'C');
    rect(x + w - 7, y + h - 1, 4, 3, 'O'); rect(x + w - 6, y + h - 1, 2, 1, 'C');
    rrect(x, y, w, h, 'G');
    rect(x + 3, y + 1, w - 6, h - 2, 'C');
    rect(x + 3, y + 1, w - 6, 1, 'c');
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
  const DEFECT_NAME = { pin: '핀홀', uncoat: '미코팅', crack: '크랙' };
  function defectBox(it) {
    if (it.defect === 'pin') { const s = [3, 2, 1][it.lvl]; return { x: it.dx, y: it.dy, w: s, h: s }; }
    if (it.defect === 'uncoat') { const [w, h] = [[6, 4], [4, 3], [2, 2]][it.lvl]; return { x: it.dx, y: it.dy, w, h }; }
    if (it.defect === 'crack') { const n = [9, 6, 4][it.lvl]; return { x: it.dx, y: it.dy, w: n, h: 2 }; }
    if (it.decoy) return { x: it.dx, y: it.dy, w: 8, h: 4 };
    return null;
  }
  function drawDefect(it, bx, by) {
    const x = bx + it.dx, y = by + it.dy;
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
    } else if (it.decoy) {
      for (let k = 0; k < 8; k++) px(x + k, y + (k >> 1), 'glare');
    }
  }

  // 모니터 속 큰 전극 친구
  function bigBuddy(x, y, it, mood) {
    const w = 46, h = 46;
    const up = mood === 'joy';
    sprite(x - 5, y + (up ? 12 : 22), up ? ARM_UP_L : ARM_DOWN_L);
    sprite(x + w + 1, y + (up ? 12 : 18), up ? ARM_UP_L : ARM_DOWN_L, true);
    rrect(x + 9, y + h - 1, 9, 5, 'C');
    rrect(x + w - 18, y + h - 1, 9, 5, 'C');
    rrect(x, y, w, h, 'G');
    rect(x + 1, y + 2, 2, h - 4, 'g');
    rect(x + 7, y + 1, w - 14, h - 2, 'C');
    for (let j = y + 3; j < y + h - 2; j += 4) rect(x + 7, j, w - 14, 1, 'c');
    if (it) drawDefect(it, x, y);
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
  };

  // ---------- 랭킹 (공유 저장소 → 없으면 이 기기) ----------
  function cleanRow(id, d) {
    if (!d) return null;
    const best = Number(d.best);
    if (!Number.isFinite(best) || best < 0) return null;
    return {
      id,
      nick: String(d.nick || '익명').slice(0, 8),
      best: Math.floor(best),
      stage: Math.max(1, Math.floor(Number(d.stage) || 1)),
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
        const data = await netCall('GET', '/rest/v1/scores?select=id,nick,best,stage&order=best.desc,at.asc&limit=200');
        this.rows = (Array.isArray(data) ? data : []).map(d => cleanRow(String(d.id), d)).filter(Boolean);
        this.status = 'ok';
      } catch (e) {
        this.status = 'error';
      } finally { clearTimeout(timer); }
    },
    async netWrite(nick, best, stage) {
      await netCall('POST', '/rest/v1/rpc/submit_score',
        { p_id: this.uid, p_secret: this.secret, p_nick: nick, p_best: best, p_stage: stage });
    },
    loadLocal() {
      try { this.local = JSON.parse(store.get('dj_local_rank', '[]')).map(r => cleanRow(null, r)).filter(Boolean); }
      catch (e) { this.local = []; }
    },
    saveLocal() { store.set('dj_local_rank', JSON.stringify(this.local.slice(0, 30))); },
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
        db.collection('scores').orderBy('best', 'desc').limit(200).onSnapshot(snap => {
          this.rows = snap.docs.map(d => cleanRow(d.id, d.data())).filter(Boolean);
          if (!snap.metadata.fromCache) { clearTimeout(timer); this.status = 'ok'; }
        }, () => { clearTimeout(timer); this.status = 'error'; });
      } catch (e) {
        this.mode = 'local'; this.status = 'ok';
      }
    },
    list() { return this.mode === 'shared' ? this.rows : this.local; },
    mine() {
      if (this.mode === 'shared') return this.rows.find(r => r.id === this.uid) || null;
      return this.local.find(r => r.nick === G.nick) || null;
    },
    rankOf(score) { return this.list().filter(r => r.best > score).length + 1; },
    addLocal(nick, score, stage) {
      const ex = this.local.find(r => r.nick === nick);
      if (ex) { if (score > ex.best) { ex.best = score; ex.stage = stage; } }
      else this.local.push({ id: null, nick, best: score, stage });
      this.local.sort((a, b) => b.best - a.best);
      this.saveLocal();
    },
    async submit(nick, score, stage) {
      this.addLocal(nick, score, stage);
      if (this.mode !== 'shared') return { code: 'local', rank: this.rankOf(score) };
      const mine = this.mine();
      if (this.net) {
        if (mine && mine.best >= score) {
          if (mine.nick !== nick) { try { await this.netWrite(nick, 0, 1); await this.refresh(); } catch (e) { /* 무시 */ } }
          return { code: 'nobest', best: mine.best };
        }
        try {
          await this.netWrite(nick, score, stage);
          await this.refresh();
          return { code: 'saved', rank: this.rankOf(score) };
        } catch (e) { return { code: 'fail' }; }
      }
      if (mine && mine.best >= score) {
        if (mine.nick !== nick) { try { await this.db.doc('scores/' + this.uid).update({ nick }); } catch (e) { /* 무시 */ } }
        return { code: 'nobest', best: mine.best };
      }
      try {
        await this.db.doc('scores/' + this.uid).set({ nick, best: score, stage, at: Date.now() });
        return { code: 'saved', rank: this.rankOf(score) };
      } catch (e) {
        return { code: e && e.code === 'invalid_argument' ? 'denied' : 'fail' };
      }
    },
    async rename(oldNick, nick) {
      const ex = this.local.find(r => r.nick === oldNick);
      if (ex && !this.local.find(r => r.nick === nick)) { ex.nick = nick; this.saveLocal(); }
      if (this.mode === 'shared') {
        const mine = this.rows.find(r => r.id === this.uid);
        if (mine && mine.nick !== nick) {
          try {
            if (this.net) { await this.netWrite(nick, 0, 1); await this.refresh(); }
            else await this.db.doc('scores/' + this.uid).update({ nick });
          } catch (e) { /* 무시 */ }
        }
      }
    },
  };

  // ---------- 게임 상태 ----------
  const G = {
    state: 'boot', t: 0, st: 0,
    nick: store.get('dj_nick', ''),
    best: Number(store.get('dj_best', '0')) || 0,
  };
  const rnd = n => Math.floor(Math.random() * n);
  const pick = a => a[rnd(a.length)];

  function makeItem(stage) {
    const lvl = stage <= 2 ? 0 : stage <= 4 ? 1 : 2;
    let defect = null;
    if (Math.random() < 0.45) defect = pick(['pin', 'uncoat', 'crack']);
    const decoy = !defect && stage >= 3 && Math.random() < 0.35;
    const it = { defect, decoy, lvl, mood: pick(['happy', 'calm', 'worry']), dx: 0, dy: 0, result: null };
    const b = defectBox(it) || { w: 1, h: 1 };
    it.dx = 9 + rnd(Math.max(1, 29 - b.w));
    it.dy = Math.random() < 0.5 ? 3 + rnd(Math.max(1, 6 - b.h)) : 31 + rnd(Math.max(1, 11 - b.h));
    return it;
  }
  function timeLimit(stage) { return Math.max(1.15, 3.4 - 0.3 * (stage - 1)); }

  function newGame() {
    Object.assign(G, {
      state: 'play', st: 0, score: 0, combo: 0, maxCombo: 0, hearts: 3, correct: 0, stage: 1,
      items: [], cur: 0, phase: 'scan', pt: 0, limit: timeLimit(1), left: timeLimit(1), lastRatio: 1,
      popup: null, gain: 0, gainT: 0, stageT: 0, shake: 0, pressed: null, pressT: 0, newBest: false,
      overMsg: null,
    });
    ensureItems();
  }
  function ensureItems() { while (G.items.length < G.cur + 4) G.items.push(makeItem(G.stage)); }

  function judge(answer) {
    if (G.state !== 'play' || G.phase !== 'judge') return;
    const it = G.items[G.cur];
    const truth = it.defect ? 'ng' : 'ok';
    const ok = answer === truth;
    const ratio = Math.max(0, G.left / G.limit);
    G.lastRatio = ratio;
    it.result = { answer, ok };
    if (ok) {
      G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.correct++;
      const gained = Math.round((100 + 100 * ratio) * (1 + Math.min(G.combo, 20) * 0.1) / 10) * 10;
      G.score += gained; G.gain = gained; G.gainT = 0.8;
      G.popup = ratio > 0.6 ? 'PERFECT!' : 'GOOD!';
      (ratio > 0.6 ? SFX.perfect : SFX.good)();
      if (G.correct % 8 === 0) { G.stage++; G.stageT = 1.6; setTimeout(SFX.stage, 250); }
    } else {
      G.combo = 0; G.hearts--;
      G.popup = answer === null ? '시간 초과!' : 'MISS!';
      G.shake = reduceMotion ? 0 : 0.3;
      SFX.miss();
    }
    if (answer) { G.pressed = answer; G.pressT = 0.15; }
    G.phase = 'result'; G.pt = 0;
  }

  function gameOver() {
    G.state = 'over'; G.st = 0;
    G.newBest = G.score > G.best;
    if (G.newBest) { G.best = G.score; store.set('dj_best', String(G.best)); }
    G.overMsg = { code: 'pending' };
    SFX.over();
    const score = G.score;
    Rank.submit(G.nick, score, G.stage).then(r => { if (G.state === 'over' && G.score === score) G.overMsg = r; });
  }

  function update(dt) {
    G.t += dt; G.st += dt;
    if (G.state !== 'play' || G.frozen) return;
    G.gainT = Math.max(0, G.gainT - dt);
    G.stageT = Math.max(0, G.stageT - dt);
    G.shake = Math.max(0, G.shake - dt);
    G.pressT = Math.max(0, G.pressT - dt);
    G.pt += dt;
    if (G.phase === 'scan') {
      if (G.pt >= 0.3) { G.phase = 'judge'; G.pt = 0; G.limit = timeLimit(G.stage); G.left = G.limit; }
    } else if (G.phase === 'judge') {
      G.left -= dt;
      if (G.left <= 0) { G.left = 0; judge(null); }
    } else if (G.phase === 'result') {
      if (G.pt >= 0.7) {
        G.popup = null;
        // 게임 끝 화면은 마지막 시트를 배경으로 그리므로 다음 시트로 넘기지 않음
        if (G.hearts <= 0) { gameOver(); return; }
        G.cur++;
        G.phase = 'scan'; G.pt = 0;
        ensureItems();
      }
    }
  }

  // ---------- 화면: 게임 ----------
  const OK_BTN = { x: 4, y: 164, w: 58, h: 42 };
  const NG_BTN = { x: 66, y: 164, w: 58, h: 42 };
  const ease = k => 1 - Math.pow(1 - k, 3);

  function drawPlay() {
    const sh = G.shake > 0 ? (rnd(3) - 1) : 0;
    ctx.save(); ctx.translate(sh, 0);
    ctx.drawImage(WALL, 0, 0);

    // 상단: 점수, 목숨
    rrect(3, 3, 58, 15, 'W', 'O', 'cream3');
    sprite(6, 7, STAR);
    ptext(fmt(G.score), 16, 6, 'm', 'O', { edge: null });
    if (G.gainT > 0) ptext('+' + fmt(G.gain), 64, 7 - Math.round((0.8 - G.gainT) * 4), 's', 'm', { edge: 'W' });
    for (let i = 0; i < 3; i++) sprite(92 + i * 11, 6, i < G.hearts ? HEART : HEART_EMPTY);

    // 시간 막대
    const ratio = G.phase === 'judge' ? G.left / G.limit : G.phase === 'scan' ? 1 : G.lastRatio;
    rrect(3, 22, 122, 7, 'cream3');
    const tw = Math.max(5, Math.round(122 * ratio));
    rrect(3, 22, tw, 7, ratio < 0.3 ? 'P' : 'M');
    if (tw > 7) rect(5, 23, tw - 5, 1, 'W');

    // 모니터
    rrect(4, 33, 120, 82, 'L', 'O', 'l');
    rect(6, 35, 2, 2, 'W');
    rrect(9, 38, 110, 70, 'N');
    for (let y = 40; y < 106; y += 3) rect(10, y, 108, 1, 'n');
    const it = G.items[G.cur];
    let mood = it.mood;
    if (G.phase === 'result') mood = it.result.ok ? 'joy' : 'cross';
    bigBuddy(41, 46, it, mood);
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
    ptext('CAM 1', 14, 42, 's', 'S', { edge: null });
    if (G.combo >= 2) {
      const label = G.combo + '콤보!';
      const w = textW(label, 's') + 6;
      rrect(116 - w, 42, w, 11, 'Y');
      ptext(label, 116 - w / 2, 43, 's', 'O', { edge: null, align: 'c' });
    }

    // 판정 결과: 결함 위치 공개 + 문구
    if (G.phase === 'result') {
      const b = defectBox(it);
      if (b) {
        const bx = 41 + b.x - 4, by = 46 + b.y - 4, bw = b.w + 7, bh = b.h + 7;
        const col = it.defect ? 'P' : 'M';
        dashedBox(bx, by, bw, bh, col);
        const name = it.defect ? DEFECT_NAME[it.defect] : '빛 반사';
        const lw = textW(name, 's') + 6;
        const lx = Math.max(12, Math.min(116 - lw, bx + bw / 2 - lw / 2));
        const ly = b.y < 20 ? by + bh + 2 : by - 13;
        rrect(lx, ly, lw, 11, 'W');
        ptext(name, lx + lw / 2, ly + 1, 's', it.defect ? 'p' : 'm', { edge: null, align: 'c' });
      }
      if (G.popup) {
        const good = it.result.ok;
        const yy = 94 - Math.round(Math.max(0, 0.12 - G.pt) * 30);
        ptext(G.popup, 64, yy, 'b', good ? 'Y' : 'P', { align: 'c', shadow: good ? 'p' : 'O' });
        if (good && G.popup === 'PERFECT!') { sprite(22, 94, SPARK); sprite(101, 92, SPARK); }
      }
    }

    // 카메라 + 컨베이어
    for (let k = 0; k < 5; k++) rect(62 - k, 125 + k, 4 + 2 * k, 1, k % 2 === 0 ? 'Y' : 'cream');
    sprite(56, 118, CAMERA);
    const shift = G.phase === 'result' ? ease(Math.min(1, G.pt / 0.35)) * 30 : 0;
    belt(148, shift);
    for (let k = -3; k <= 3; k++) {
      const idx = G.cur + k;
      if (idx < 0 || idx >= G.items.length) continue;
      const item = G.items[idx];
      const x = 56 + 30 * k - shift;
      if (x < -18 || x > W + 2) continue;
      const bob = Math.sin(G.t * 6 + idx * 1.7) > 0.7 ? -1 : 0;
      let m = item.mood;
      let badge = null;
      if (item.result) { m = item.result.ok ? 'joy' : 'cross'; badge = item.result.answer === 'ng' ? 'ng' : item.result.answer === 'ok' ? 'ok' : null; }
      buddy(x, 133 + bob, m, badge);
    }
    if (G.phase !== 'result') {
      for (const [bx, by, sx, sy] of [[53, 129, 1, 1], [74, 129, -1, 1], [53, 149, 1, -1], [74, 149, -1, -1]]) {
        rect(Math.min(bx, bx + 2 * sx), by, 3, 1, 'y');
        rect(bx, Math.min(by, by + 2 * sy), 1, 3, 'y');
      }
    }

    // 검사원
    const jump = G.phase === 'result' && it.result.ok && G.pt < 0.25 ? -2 : 0;
    sprite(0, 108 + jump, (G.t % 2.7) < 0.12 ? INSPECTOR_BLINK : INSPECTOR);
    sprite(20, 122 + jump, LOUPE);
    if (G.phase === 'result' && !it.result.ok) sprite(19, 106, SWEAT);
    if (G.stageT > 0) {
      // 스테이지 상승: 화면을 가리지 않게 오른쪽 작은 표시만 노란 알약으로 통통 튀게
      const hop = reduceMotion ? 0 : Math.round(Math.abs(Math.sin(G.stageT * 9)) * -3 * Math.min(1, G.stageT));
      rrect(85, 117 + hop, 42, 11, 'Y', 'O', 'y');
      ptext('STAGE ' + G.stage, 106, 119 + hop, 's', 'O', { edge: null, align: 'c' });
      if ((G.stageT * 6 | 0) % 2 === 0) { sprite(82, 113 + hop, SPARK); }
    } else ptext('STAGE ' + G.stage, 106, 120, 's', 'l', { edge: null, align: 'c' });

    // 버튼
    drawJudgeButton(OK_BTN, 'M', 'm', CIRCLE_O, '양품', G.pressT > 0 && G.pressed === 'ok');
    drawJudgeButton(NG_BTN, 'P', 'p', CROSS_X, '불량', G.pressT > 0 && G.pressed === 'ng');
    ptext('◀ 밀어서 판정 ▶', 64, 211, 'm', 'o', { edge: null, align: 'c' });
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

  // ---------- 화면: 타이틀 ----------
  const T_START = { x: 22, y: 172, w: 84, h: 16 };
  const T_RANK = { x: 14, y: 194, w: 48, h: 13 };
  const T_NAME = { x: 66, y: 194, w: 48, h: 13 };
  const T_SOUND = { x: 110, y: 2, w: 16, h: 12 };

  function drawTitle() {
    ctx.drawImage(WALL, 0, 0);
    rect(0, 0, W, 120, 'sky');
    const cl = [[8, 14, 3], [82, 8, 2], [104, 100, 4]];
    for (const [x0, y0, sp] of cl) sprite(((x0 + G.t * sp) % 150) - 16, y0, CLOUD);
    for (let x = 0; x < W; x += 16) sprite(x, 112, ROOF);
    rect(0, 117, W, 3, 'm');
    sprite(114, 4, soundOn ? SPEAKER : SPEAKER_OFF);

    rrect(10, 26, 108, 50, 'W', 'O', 'l');
    rect(14, 29, 6, 1, 'S');
    sprite(14, 66, SPARK);
    if (((G.t * 1.5) | 0) % 2 === 0) sprite(108, 30, SPARK);
    ptext('불량', 64, 32, 'b', 'P', { scale: 2, align: 'c', shadow: 'p' });
    rrect(34, 57, 60, 14, 'S');
    ptext('판정소', 64, 58, 'b', 'W', { align: 'c' });

    // 인사 말풍선
    const hello = G.nick ? `안녕, ${G.nick}!` : '어서 와요, 검사원!';
    const hf = textW(hello, 'm') <= 110 ? 'm' : 's';
    const hw = textW(hello, hf) + 10;
    rrect(64 - hw / 2, 87, hw, 14, 'W');
    ptext(hello, 64, hf === 'm' ? 89 : 90, hf, 'O', { edge: null, align: 'c' });
    sprite(Math.round(64 - hw / 2) + 10, 100, TAIL);

    // 걸어가는 전극 친구들
    belt(158, G.t * 14);
    const moods = ['happy', 'worry', 'calm', 'happy', 'joy'];
    for (let i = 0; i < 5; i++) {
      const x = 134 - ((G.t * 14 + i * 31) % 155);
      const bob = Math.sin(G.t * 8 + i) > 0.5 ? -1 : 0;
      buddy(x, 143 + bob, moods[i]);
    }
    sprite(6, 135, (G.t % 2.7) < 0.12 ? INSPECTOR_BLINK : INSPECTOR);
    sprite(27, 148, LOUPE);

    rrect(T_START.x, T_START.y, T_START.w, T_START.h, 'Y', 'O', 'y');
    if ((G.t % 1.2) < 0.85) ptext('터치해서 시작!', 64, T_START.y + 2, 'b', 'O', { edge: null, align: 'c' });
    rrect(T_RANK.x, T_RANK.y, T_RANK.w, T_RANK.h, 'S', 'O', 'B');
    ptext('랭킹', T_RANK.x + 24, T_RANK.y + 2, 'm', 'W', { edge: 'B', align: 'c' });
    rrect(T_NAME.x, T_NAME.y, T_NAME.w, T_NAME.h, 'L', 'O', 'l');
    ptext('이름 변경', T_NAME.x + 24, T_NAME.y + 2, 'm', 'W', { edge: 'l', align: 'c' });

    const best = Math.max(G.best, (Rank.mine() || {}).best || 0);
    const bt = `BEST ${fmt(best)}`;
    const bw = textW(bt, 's');
    sprite(64 - bw / 2 - 9, 212, STAR);
    ptext(bt, 64 + 0, 212, 's', 'o', { edge: null, align: 'c' });
  }

  // ---------- 화면: 이름 ----------
  const N_OK = { x: 16, y: 146, w: 46, h: 16 };
  const N_CANCEL = { x: 66, y: 146, w: 46, h: 16 };
  const NICK_BOX = { x: 16, y: 110, w: 96, h: 16 };

  function drawName() {
    ctx.drawImage(WALL, 0, 0);
    rrect(8, 40, 112, 132, 'W', 'O', 'cream3');
    sprite(53, 50 + (Math.sin(G.t * 3) > 0.6 ? -1 : 0), INSPECTOR);
    ptext('이름을 알려 주세요!', 64, 80, 'm', 'O', { edge: null, align: 'c' });
    ptext('랭킹에 올라갈 이름', 64, 94, 'm', 'l', { edge: null, align: 'c' });
    rrect(NICK_BOX.x - 2, NICK_BOX.y - 2, NICK_BOX.w + 4, NICK_BOX.h + 4, 'cream', 'O');
    ptext('최대 8글자', 64, 131, 'm', 'o', { edge: null, align: 'c' });
    rrect(N_OK.x, N_OK.y, N_OK.w, N_OK.h, 'M', 'O', 'm');
    ptext('확인', N_OK.x + 23, N_OK.y + 2, 'b', 'W', { edge: 'm', align: 'c' });
    rrect(N_CANCEL.x, N_CANCEL.y, N_CANCEL.w, N_CANCEL.h, 'cream3', 'O', 'o');
    ptext('취소', N_CANCEL.x + 23, N_CANCEL.y + 2, 'b', 'o', { edge: null, align: 'c' });
  }

  function openName(next) {
    G.state = 'name'; G.st = 0; G.nameNext = next;
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
      store.set('dj_nick', v);
      if (old && old !== v) Rank.rename(old, v);
    }
    nickEl.hidden = true;
    nickEl.blur();
    if (save && G.nameNext === 'play') newGame();
    else { G.state = 'title'; G.st = 0; }
  }

  // ---------- 화면: 게임 끝 ----------
  const O_AGAIN = { x: 20, y: 160, w: 88, h: 16 };
  const O_RANK = { x: 20, y: 184, w: 42, h: 14 };
  const O_HOME = { x: 66, y: 184, w: 42, h: 14 };

  function overText() {
    const m = G.overMsg || {};
    switch (m.code) {
      case 'pending': return '랭킹 저장 중…';
      case 'saved': return `랭킹 ${m.rank}위 등록!`;
      case 'local': return `이 기기 랭킹 ${m.rank}위`;
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
    rrect(10, 34, 108, 172, 'cream', 'O', 'cream3');
    ptext('게임 끝!', 64, 42, 'b', 'P', { scale: 2, align: 'c', shadow: 'p' });
    if (G.newBest) {
      rrect(38, 70, 52, 11, 'Y');
      ptext('최고 기록!', 64, 71, 's', 'O', { edge: null, align: 'c' });
    }
    const rows = [['점수', fmt(G.score)], ['최고', fmt(G.best)], ['스테이지', String(G.stage)], ['최대 콤보', String(G.maxCombo)]];
    rows.forEach(([k, v], i) => {
      const y = 86 + i * 13;
      ptext(k, 22, y, 'm', 'o', { edge: null });
      ptext(v, 106, y, 'm', 'O', { edge: null, align: 'r' });
      if (i < 3) for (let x = 22; x < 106; x += 2) px(x, y + 11, 'cream3');
    });
    ptext(overText(), 64, 141, 'm', 'l', { edge: null, align: 'c' });
    rrect(O_AGAIN.x, O_AGAIN.y, O_AGAIN.w, O_AGAIN.h, 'Y', 'O', 'y');
    ptext('다시 하기', 64, O_AGAIN.y + 2, 'b', 'O', { edge: null, align: 'c' });
    rrect(O_RANK.x, O_RANK.y, O_RANK.w, O_RANK.h, 'S', 'O', 'B');
    ptext('랭킹', O_RANK.x + 21, O_RANK.y + 2, 'm', 'W', { edge: 'B', align: 'c' });
    rrect(O_HOME.x, O_HOME.y, O_HOME.w, O_HOME.h, 'W', 'O', 'cream3');
    ptext('처음으로', O_HOME.x + 21, O_HOME.y + 2, 'm', 'O', { edge: null, align: 'c' });
    ctx.restore();
  }

  // ---------- 화면: 랭킹 ----------
  const R_BACK = { x: 34, y: 205, w: 60, h: 15 };
  function drawRank() {
    ctx.drawImage(WALL, 0, 0);
    rrect(14, 5, 100, 20, 'S', 'O', 'B');
    sprite(22, 11, TROPHY); sprite(99, 11, TROPHY);
    ptext('랭킹', 64, 8, 'b', 'W', { align: 'c' });
    ptext(Rank.mode === 'shared' ? '모두의 랭킹' : '이 기기 랭킹', 64, 28, 'm', 'l', { edge: null, align: 'c' });

    const list = Rank.list();
    const isMe = r => Rank.mode === 'shared' ? r.id === Rank.uid : r.nick === G.nick;
    if (Rank.mode === 'shared' && (Rank.status === 'loading' || Rank.status === 'slow') && !list.length) {
      ptext(Rank.status === 'slow' ? '연결이 느려요. 잠시만요…' : '불러오는 중…', 64, 100, 'm', 'o', { edge: null, align: 'c' });
    } else if (Rank.status === 'error' && !list.length) {
      ptext('랭킹을 불러오지 못했어요', 64, 96, 'm', 'p', { edge: null, align: 'c' });
      ptext('잠시 뒤 다시 열어 주세요', 64, 110, 's', 'o', { edge: null, align: 'c' });
    } else if (!list.length) {
      ptext('아직 기록이 없어요', 64, 96, 'm', 'o', { edge: null, align: 'c' });
      ptext('첫 기록을 남겨 보세요!', 64, 110, 's', 'l', { edge: null, align: 'c' });
    } else {
      const top = list.slice(0, 10);
      top.forEach((r, i) => {
        const y = 40 + i * 15;
        const me = isMe(r);
        rrect(6, y, 116, 13, me ? 'Y' : 'W');
        if (i < 3) {
          rrect(8, y + 2, 11, 9, ['Y', 'G', 'Z'][i]);
          ptext(String(i + 1), 13, y + 3, 's', 'O', { edge: null, align: 'c' });
        } else ptext(String(i + 1), 13, y + 3, 's', 'o', { edge: null, align: 'c' });
        ptext(r.nick, 23, y + 2, 'm', 'O', { edge: null });
        ptext(fmt(r.best), 118, y + 2, 'm', 'O', { edge: null, align: 'r' });
      });
      const myIdx = list.findIndex(isMe);
      if (myIdx >= 10) {
        const r = list[myIdx];
        const y = 190;
        rrect(6, y, 116, 13, 'Y');
        ptext(String(myIdx + 1), 13, y + 3, 's', 'O', { edge: null, align: 'c' });
        ptext(r.nick, 23, y + 2, 'm', 'O', { edge: null });
        ptext(fmt(r.best), 118, y + 2, 'm', 'O', { edge: null, align: 'r' });
      }
    }
    rrect(R_BACK.x, R_BACK.y, R_BACK.w, R_BACK.h, 'P', 'O', 'p');
    ptext('돌아가기', 64, R_BACK.y + 2, 'b', 'W', { edge: 'p', align: 'c' });
  }

  // ---------- 입력 ----------
  const inBox = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
  function toLogical(e) {
    const r = cvs.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  function goRank(back) { G.rankBack = back; G.state = 'rank'; G.st = 0; Rank.refresh(); }
  function startGame() { if (!G.nick) openName('play'); else newGame(); }

  function tap(p) {
    if (G.state === 'title') {
      if (inBox(p, T_SOUND)) { soundOn = !soundOn; store.set('dj_sound', soundOn ? '1' : '0'); SFX.tap(); return; }
      if (inBox(p, T_RANK)) { SFX.tap(); goRank('title'); return; }
      if (inBox(p, T_NAME)) { SFX.tap(); openName('title'); return; }
      SFX.tap(); startGame();
    } else if (G.state === 'name') {
      if (inBox(p, N_OK)) { SFX.tap(); closeName(true); }
      else if (inBox(p, N_CANCEL)) { SFX.tap(); closeName(false); }
    } else if (G.state === 'over') {
      if (G.st < 0.6) return;
      if (inBox(p, O_AGAIN)) { SFX.tap(); newGame(); }
      else if (inBox(p, O_RANK)) { SFX.tap(); goRank('over'); }
      else if (inBox(p, O_HOME)) { SFX.tap(); G.state = 'title'; G.st = 0; }
    } else if (G.state === 'rank') {
      if (inBox(p, R_BACK)) { SFX.tap(); G.state = G.rankBack === 'over' ? 'over' : 'title'; G.st = 1; }
    }
  }

  let down = null;
  cvs.addEventListener('pointerdown', e => {
    unlockAudio();
    const p = toLogical(e);
    down = { x: p.x, y: p.y, used: false };
    if (G.state === 'play') {
      if (inBox(p, OK_BTN)) { judge('ok'); down.used = true; }
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
    if (Math.abs(p.x - d0.x) < 10 && Math.abs(p.y - d0.y) < 10) tap(p);
  });
  cvs.addEventListener('pointercancel', () => { down = null; });

  window.addEventListener('keydown', e => {
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
      if (G.state === 'title') startGame();
      else if (G.state === 'over' && G.st > 0.6) newGame();
      else if (G.state === 'rank') { G.state = G.rankBack === 'over' ? 'over' : 'title'; G.st = 1; }
    } else if (k === 'Escape' && G.state === 'rank') {
      G.state = G.rankBack === 'over' ? 'over' : 'title'; G.st = 1;
    }
  });

  // ---------- 화면 크기 ----------
  let scale = 3;
  function layout() {
    const cs = getComputedStyle(wrapEl);
    const aw = wrapEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = wrapEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    let s = Math.min(aw / W, ah / H);
    s = s >= 2 ? Math.floor(s) : Math.max(1, s);
    scale = s;
    stageEl.style.width = W * s + 'px';
    stageEl.style.height = H * s + 'px';
    const b = NICK_BOX;
    Object.assign(nickEl.style, {
      left: b.x * s + 'px', top: b.y * s + 'px', width: b.w * s + 'px', height: b.h * s + 'px',
      fontSize: Math.round(10 * s) + 'px',
    });
  }
  window.addEventListener('resize', layout);

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 루프 ----------
  function draw() {
    if (G.state === 'title') drawTitle();
    else if (G.state === 'play') drawPlay();
    else if (G.state === 'over') drawOver();
    else if (G.state === 'name') drawName();
    else if (G.state === 'rank') drawRank();
  }
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0);
    last = ts;
    // 한 프레임에서 오류가 나도 루프가 멈추지 않게 다음 프레임을 먼저 예약
    requestAnimationFrame(frame);
    try { update(dt); draw(); } catch (e) { console.error(e); }
  }

  async function boot() {
    layout();
    const loads = ['12px Galmuri11B', '10px Galmuri9', '8px Galmuri7'].map(f => document.fonts ? document.fonts.load(f, '가A') : null);
    await Promise.race([Promise.all(loads).catch(() => {}), new Promise(r => setTimeout(r, 2500))]);
    txtCache.clear();
    WALL = makeWall();
    G.state = 'title';
    Rank.init();
    // 로컬 확인용 화면 (?shot=play|over|rank|name|run). 게시 페이지에는 영향 없음
    const shot = new URLSearchParams(location.search).get('shot');
    if (shot) {
      G.nick = G.nick || '테스트';
      if (shot === 'stage') { newGame(); G.stage = 2; G.stageT = 1.0; G.frozen = true; G.phase = 'judge'; G.limit = 3; G.left = 3; }
      else if (shot === 'play' || shot === 'over') {
        newGame(); G.score = 12450; G.combo = 7; G.hearts = 2; G.stage = 3;
        G.items[G.cur] = Object.assign(makeItem(1), { defect: 'pin', lvl: 0, dx: 30, dy: 34, mood: 'worry' });
        G.phase = 'judge'; G.limit = 3; G.left = 2; G.frozen = shot === 'play'; G.t = 1;
        if (shot === 'over') { G.maxCombo = 12; gameOver(); G.st = 1; }
      } else if (shot === 'rank') {
        [['검사왕', 31800], ['핀홀헌터', 22650], ['테스트', 12450], ['초보', 3200]].forEach(([n, s]) => Rank.addLocal(n, s, 3));
        goRank('title');
      } else if (shot === 'name') openName('title');
      else if (shot === 'run') {   // 입력 없이 20초 진행 → 시간 초과 3번으로 게임 끝까지
        newGame();
        for (let i = 0; i < 400; i++) update(0.05);
        draw();
      }
    }
    requestAnimationFrame(frame);
  }
  boot();
})();
