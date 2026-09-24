// Процедурный арт офиса: пол, стены, окна и мебель рисуются один раз в offscreen-холсты 2×.
// Мебель — отдельные спрайты с baseY для сортировки по глубине вместе с персонажами.
(() => {
  'use strict';

  const WD = window.NP_WORLD;
  const S = 2; // масштаб рендера
  const FONT = '"Space Mono", "DejaVu Sans Mono", "Consolas", monospace';
  const FONT_SANS = '"Arial Narrow", "Roboto Condensed", "DejaVu Sans", Arial, sans-serif';

  // Окна северной стены (стекло рисуется динамически, здесь только геометрия).
  const GLASS_Y = 58;
  const GLASS_H = 62;
  const windowPanes = [264, 394, 524, 654].map((x, i) => ({ x, y: GLASS_Y, w: 112, h: GLASS_H, src: i }));
  const balconyView = { x: 794, y: GLASS_Y, w: 152, h: GLASS_H };

  let seed = 1337;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function rr(a, b) { return a + rnd() * (b - a); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * S);
    c.height = Math.ceil(h * S);
    const g = c.getContext('2d');
    g.scale(S, S);
    g.imageSmoothingEnabled = false;
    return { c, g };
  }

  function R(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function O(g, x, y, w, h, c, lw = 1) { g.strokeStyle = c; g.lineWidth = lw; g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); }
  function E(g, x, y, rx, ry, c) { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  function T(g, text, x, y, size, color, align = 'center', weight = 700, font = FONT) {
    g.font = `${weight} ${size}px ${font}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, x, y);
  }
  function fitText(g, text, maxW, size, weight = 700, font = FONT_SANS) {
    let s = size;
    g.font = `${weight} ${s}px ${font}`;
    while (s > 4 && g.measureText(text).width > maxW) { s -= 0.25; g.font = `${weight} ${s}px ${font}`; }
    return s;
  }
  // Бумажка на скотче с читаемым текстом
  function note(g, x, y, w, h, lines, opts = {}) {
    const bg = opts.bg || '#f3eedf';
    const fg = opts.fg || '#1c1c1c';
    const tilt = opts.tilt || 0;
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate(tilt);
    R(g, -w / 2 + 0.6, -h / 2 + 0.8, w, h, 'rgba(0,0,0,0.28)');
    R(g, -w / 2, -h / 2, w, h, bg);
    if (opts.border) O(g, -w / 2, -h / 2, w, h, opts.border, 0.6);
    if (!opts.noTape) {
      R(g, -w / 2 - 1, -h / 2 - 1.2, 5, 2.4, 'rgba(230,220,170,0.75)');
      R(g, w / 2 - 4, -h / 2 - 1.2, 5, 2.4, 'rgba(230,220,170,0.75)');
    }
    const lh = h / lines.length;
    lines.forEach((ln, i) => {
      const s = fitText(g, ln, w - 2, Math.min(opts.size || 6, lh * 0.95), 700, opts.font || FONT_SANS);
      T(g, ln, 0, -h / 2 + lh * (i + 0.5) + 0.3, s, fg, 'center', 700, opts.font || FONT_SANS);
    });
    g.restore();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt)); gg = Math.max(0, Math.min(255, gg + amt)); b = Math.max(0, Math.min(255, b + amt));
    return `rgb(${r},${gg},${b})`;
  }

  // ---------- ПОЛ ----------
  function carpet(g, x0, y0, w, h) {
    const tile = 16;
    const base = ['#6c7570', '#697370', '#6f7873', '#666f6b'];
    for (let y = y0; y < y0 + h; y += tile) {
      for (let x = x0; x < x0 + w; x += tile) {
        const c = pick(base);
        R(g, x, y, tile, tile, c);
        // ворс: мелкий шум
        for (let k = 0; k < 10; k++) R(g, x + rr(0, tile), y + rr(0, tile), 0.5, 0.5, rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)');
        // направление ворса — полосы через плитку
        if ((x / tile + y / tile) % 2 === 0) R(g, x, y, tile, tile, 'rgba(255,255,255,0.018)');
        R(g, x, y, tile, 0.5, 'rgba(0,0,0,0.16)');
        R(g, x, y, 0.5, tile, 'rgba(0,0,0,0.16)');
      }
    }
  }
  function stain(g, x, y, r, color) {
    g.fillStyle = color;
    g.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const rad = r * rr(0.7, 1.2);
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * 0.7;
      if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }
  function linoleum(g, x0, y0, w, h, a, b, size = 12) {
    for (let y = y0, j = 0; y < y0 + h; y += size, j++) {
      for (let x = x0, i = 0; x < x0 + w; x += size, i++) {
        R(g, x, y, size, size, (i + j) % 2 ? a : b);
        R(g, x, y, size, 0.5, 'rgba(0,0,0,0.12)');
        R(g, x, y, 0.5, size, 'rgba(0,0,0,0.12)');
        R(g, x + 1, y + 1, size - 2, 1, 'rgba(255,255,255,0.08)');
      }
    }
  }
  function crack(g, x, y, len, color = 'rgba(40,30,20,0.45)') {
    g.strokeStyle = color;
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(x, y);
    let cx = x, cy = y;
    for (let i = 0; i < 5; i++) { cx += rr(-len / 3, len / 3); cy += rr(1, len / 4); g.lineTo(cx, cy); }
    g.stroke();
  }
  function planks(g, x0, y0, w, h, colors, pw = 30, ph = 6, gapColor = 'rgba(0,0,0,0.35)') {
    for (let y = y0, j = 0; y < y0 + h; y += ph, j++) {
      const off = (j * 13) % pw;
      for (let x = x0 - off; x < x0 + w; x += pw) {
        const c = pick(colors);
        const xs = Math.max(x, x0), xe = Math.min(x + pw, x0 + w);
        R(g, xs, y, xe - xs, ph, c);
        R(g, xs, y, xe - xs, 0.5, gapColor);
        R(g, xs, y, 0.5, ph, gapColor);
        for (let k = 0; k < 2; k++) R(g, rr(xs, xe), y + rr(1, ph - 1), rr(3, 9), 0.5, 'rgba(0,0,0,0.12)');
      }
    }
  }

  function drawFloors(g) {
    const { FLOOR_TOP: FT, FLOOR_BOTTOM: FB } = WD;
    R(g, 0, 0, WD.W, WD.H, '#1b2224');

    // Опенспейс: выцветший ковролин
    carpet(g, 244, FT, 542, FB - FT);
    // Протоптанная дорожка в проходе и к кухне
    R(g, 244, 214, 542, 30, 'rgba(210,205,180,0.07)');
    R(g, 244, 286, 20, 42, 'rgba(210,205,180,0.06)');
    // Заплатка-ковролин не того цвета
    R(g, 432, 250, 16, 16, '#7d6d55'); R(g, 432, 250, 16, 0.5, 'rgba(0,0,0,0.3)');
    R(g, 624, 360, 16, 16, '#5d6b77');
    // Скотч на швах
    for (const [x, y, w] of [[300, 244, 38], [510, 212, 26], [700, 352, 30], [410, 382, 22]]) {
      R(g, x, y, w, 3, 'rgba(170,170,160,0.85)'); R(g, x, y, w, 0.6, 'rgba(255,255,255,0.3)');
    }
    // Пятна от кофе, жвачка
    for (let i = 0; i < 26; i++) stain(g, rr(250, 780), rr(FT + 6, FB - 6), rr(2, 6), `rgba(${rr(50, 80) | 0},${rr(35, 50) | 0},20,${rr(0.12, 0.3)})`);
    for (let i = 0; i < 30; i++) E(g, rr(250, 780), rr(FT + 4, FB - 4), 0.8, 0.6, 'rgba(30,30,30,0.5)');
    // Провода, примотанные скотчем, тянутся к столам
    g.strokeStyle = '#1a1d1f'; g.lineWidth = 1;
    WD.desks.forEach(d => {
      g.beginPath();
      g.moveTo(d.x + d.w / 2 + 6, d.y + d.h);
      g.bezierCurveTo(d.x + d.w / 2 + 20, d.y + d.h + 10, d.x + d.w + 4, d.y + d.h + 4, d.x + d.w + 8, d.y + d.h + 18);
      g.stroke();
    });
    R(g, 688, 222, 10, 3, 'rgba(170,170,160,0.9)');

    // Кухня: линолеум «под плитку», потрескавшийся
    linoleum(g, WD.LEFT, FT, 222, 134, '#c7b38c', '#a99367');
    for (let i = 0; i < 7; i++) crack(g, rr(20, 230), rr(FT + 20, 250), 12);
    stain(g, 70, 234, 8, 'rgba(120,90,40,0.25)');
    stain(g, 196, 190, 6, 'rgba(90,130,160,0.3)'); // лужа от кулера
    R(g, 118, 176, 12, 12, '#8f7a52'); // отвалившаяся плитка

    // Коридор: серый линолеум с полосой
    R(g, WD.LEFT, 282, 230, 40, '#8d918a');
    for (let x = WD.LEFT; x < 244; x += 24) R(g, x, 282, 0.5, 40, 'rgba(0,0,0,0.15)');
    R(g, WD.LEFT, 300, 230, 3, '#6f746f');
    for (let i = 0; i < 6; i++) stain(g, rr(20, 240), rr(286, 318), rr(2, 5), 'rgba(40,40,30,0.18)');

    // Архив: старый паркет с выпавшими плашками
    planks(g, WD.LEFT, 342, 222, FB - 342, ['#6a4b31', '#5f422a', '#735237', '#58402b'], 22, 7);
    for (const [x, y] of [[120, 356], [64, 474], [200, 404], [160, 500]]) R(g, x, y, 11, 7, '#2e241b');
    R(g, WD.LEFT, 342, 222, FB - 342, 'rgba(90,80,60,0.12)'); // пыль

    // Балкон: доска-терраса с щелями и окурками
    planks(g, 794, FT, 152, 194, ['#8b6a47', '#7f5f3f', '#94724c'], 152, 8, 'rgba(20,12,6,0.6)');
    for (let i = 0; i < 18; i++) {
      const x = rr(800, 940), y = rr(FT + 8, 316);
      g.save(); g.translate(x, y); g.rotate(rr(0, 3.1));
      R(g, 0, 0, 3, 1, '#e8e2d2'); R(g, 3, 0, 1.2, 1, '#c9833f');
      g.restore();
    }
    stain(g, 900, 300, 9, 'rgba(60,80,100,0.35)');

    // Серверная: фальшпол с перфорацией
    for (let y = 342; y < FB; y += 20) {
      for (let x = 794; x < WD.RIGHT; x += 20) {
        R(g, x, y, 20, 20, '#4b5559');
        R(g, x + 0.5, y + 0.5, 19, 19, '#556064');
        if ((x + y) % 60 === 2 || (x * 3 + y) % 7 === 0) {
          for (let py = 3; py < 18; py += 2.5) for (let px = 3; px < 18; px += 2.5) R(g, x + px, y + py, 1, 1, '#2c3438');
        }
      }
    }

    // Кабинет начальника: паркет + советский красный ковёр
    planks(g, 580, 420, 206, FB - 420, ['#7a5433', '#6d4a2c', '#835b37'], 26, 7);
    const rx = 604, ry = 432, rw = 160, rh = 86;
    R(g, rx, ry, rw, rh, '#7b1c1f');
    R(g, rx + 3, ry + 3, rw - 6, rh - 6, '#9c2a2a');
    O(g, rx + 6, ry + 6, rw - 12, rh - 12, '#d8a54a', 1.5);
    O(g, rx + 11, ry + 11, rw - 22, rh - 22, '#2a4a78', 1);
    for (let i = 0; i < 5; i++) {
      const cx = rx + 30 + i * 25, cy = ry + rh / 2;
      g.fillStyle = i % 2 ? '#d8a54a' : '#2a4a78';
      g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx + 9, cy); g.lineTo(cx, cy + 12); g.lineTo(cx - 9, cy); g.fill();
      E(g, cx, cy, 3, 3, '#f0d9a0');
    }
    for (let x = rx; x < rx + rw; x += 3) { R(g, x, ry - 2, 1, 2, '#e8d8b0'); R(g, x, ry + rh, 1, 2, '#e8d8b0'); }

    // Зона МФУ: серый линолеум
    R(g, 382, 438, 150, FB - 438, '#9aa09a');
    for (let x = 382; x < 532; x += 30) R(g, x, 438, 0.5, FB - 438, 'rgba(0,0,0,0.14)');
    for (let i = 0; i < 8; i++) {
      g.save(); g.translate(rr(390, 525), rr(446, 524)); g.rotate(rr(-0.6, 0.6));
      R(g, 0, 0, 6, 8, '#f2f0e8'); R(g, 1, 2, 4, 0.5, '#999'); R(g, 1, 4, 3, 0.5, '#999');
      g.restore();
    }

    // Порожки в дверных проёмах
    R(g, 150, 276, 54, 4, '#5b5147'); R(g, 168, 336, 54, 4, '#5b5147');
    R(g, 600, 414, 44, 4, '#5b5147'); R(g, 790, 186, 4, 60, '#9aa3a6'); R(g, 788, 410, 6, 48, '#5b5147');
  }

  // ---------- СЕВЕРНАЯ СТЕНА ----------
  function drawNorthWall(g) {
    const top = WD.HUD_H;
    const bottom = WD.FLOOR_TOP;
    // Грязно-бежевая стена с подтёками
    R(g, 0, top, WD.W, bottom - top, '#b7aa8a');
    for (let i = 0; i < 40; i++) R(g, rr(0, WD.W), rr(top, bottom - 20), rr(2, 6), rr(6, 30), 'rgba(110,90,60,0.08)');
    R(g, 0, top, WD.W, 4, '#2c2a26');
    R(g, 0, top + 4, WD.W, 1.5, '#d4c9a8');

    // --- Кухня: навесные шкафы и фартук из плитки ---
    const kx = WD.LEFT;
    for (let y = 86; y < bottom; y += 6) {
      for (let x = kx; x < 236; x += 8) {
        const cracked = rnd() < 0.05;
        R(g, x, y, 8, 6, cracked ? '#cfc6ae' : pick(['#e3dcc6', '#ddd5bd', '#e6e0cc']));
        R(g, x, y, 8, 0.5, '#9a927d'); R(g, x, y, 0.5, 6, '#9a927d');
        if (cracked) crack(g, x + 2, y + 1, 5);
      }
    }
    // отсутствующие плитки
    R(g, 150, 98, 8, 6, '#8d8574'); R(g, 62, 110, 8, 6, '#8d8574');
    // навесные шкафчики
    for (let i = 0; i < 5; i++) {
      const x = 60 + i * 34;
      const crooked = i === 3;
      g.save();
      if (crooked) { g.translate(x + 30, 58); g.rotate(0.08); g.translate(-(x + 30), -58); }
      R(g, x, 56, 32, 28, '#8e7a5c');
      R(g, x + 1.5, 57.5, 29, 25, '#a88f69');
      R(g, x + 15.5, 57.5, 1, 25, '#6f5d43');
      R(g, x + 12, 68, 1.5, 5, '#d8d0bc'); R(g, x + 19, 68, 1.5, 5, '#d8d0bc');
      g.restore();
    }
    note(g, 84, 90, 64, 13, ['ПОСУДУ МОЕМ', 'ЗА СОБОЙ!!!'], { tilt: -0.04, size: 6.5, fg: '#b3261e' });
    note(g, 164, 91, 44, 12, ['ЧАЙ ЛИЧНЫЙ', '— ГЛЕБ'], { tilt: 0.06, size: 5.5, bg: '#fbe98f' });
    // табличка КУХНЯ над дверцами
    R(g, 20, 58, 36, 12, '#1f4f46'); T(g, 'КУХНЯ', 38, 64.5, 7, '#f1e7c9');
    R(g, 20, 72, 36, 10, '#f1e7c9'); T(g, '8:00–19:30', 38, 77.3, 4.8, '#333', 'center', 700, FONT_SANS);

    // --- Опенспейс: 4 окна на горы и столбы ---
    const pillars = [246, 376, 506, 636, 766];
    pillars.forEach((x, i) => {
      R(g, x, top + 5, 18, bottom - top - 5, '#a89b7c');
      R(g, x + 1, top + 5, 2, bottom - top - 5, 'rgba(255,255,255,0.12)');
      R(g, x + 15, top + 5, 3, bottom - top - 5, 'rgba(0,0,0,0.14)');
      // облезлая краска
      for (let k = 0; k < 4; k++) R(g, x + rr(3, 12), rr(top + 12, bottom - 18), rr(2, 4), rr(2, 6), '#8a7f64');
      if (i === 0) { // огнетушитель
        R(g, x + 5, 92, 8, 20, '#b8201b'); R(g, x + 6, 93, 2, 18, '#d8453e'); R(g, x + 6.5, 88, 5, 4, '#222');
        note(g, x + 1, 78, 16, 8, ['ОУ-2'], { noTape: true, size: 5, bg: '#fff' });
      }
      if (i === 1) { R(g, x + 1, 64, 16, 16, '#3a3a3a'); E(g, x + 9, 72, 7, 7, '#f4f1e6'); for (let h = 0; h < 12; h++) R(g, x + 9 + Math.cos(h / 12 * 6.283) * 5.6 - 0.4, 72 + Math.sin(h / 12 * 6.283) * 5.6 - 0.4, 0.8, 0.8, '#333'); }
      if (i === 2) { // выключатель + розетка с тройником
        R(g, x + 5, 100, 8, 10, '#eee8d8'); R(g, x + 7, 103, 4, 4, '#bbb');
        R(g, x + 3, 112, 12, 6, '#f2efe6'); R(g, x + 5, 118, 1, 8, '#222'); R(g, x + 11, 118, 1, 8, '#222');
      }
      if (i === 3) note(g, x + 1, 88, 16, 20, ['НЕ', 'ОТКР.', 'ОКНО!'], { tilt: 0.05, size: 5, fg: '#a02020' });
      if (i === 4) { // кондиционер-«сплит» с подтёком
        R(g, x - 2, 64, 22, 10, '#eeeae0'); R(g, x - 1, 71, 20, 1.5, '#9a9a90'); R(g, x + 8, 74, 1, 30, 'rgba(90,120,140,0.5)');
      }
    });
    // Подоконник с хламом и батареи под окнами
    R(g, 244, 120, 542, 4, '#d8d2c0'); R(g, 244, 123.5, 542, 1, '#8c8672');
    windowPanes.forEach((p, i) => {
      for (let x = p.x + 8; x < p.x + p.w - 8; x += 4) {
        R(g, x, 124.5, 3, 3.5, '#d9d6cc'); R(g, x + 2.5, 124.5, 0.5, 3.5, '#9d9a90');
      }
      if (i === 1) { R(g, p.x + 70, 116, 6, 5, '#b25b36'); R(g, p.x + 71.5, 111, 3, 6, '#6b7d3a'); R(g, p.x + 72, 109, 1, 3, '#8a6a3a'); } // сухой кактус
      if (i === 2) { R(g, p.x + 12, 113, 18, 7, '#3a6fa0'); R(g, p.x + 13, 111, 16, 3, '#c9a13a'); R(g, p.x + 34, 115, 5, 5, '#f0efe8'); }
      if (i === 0) { R(g, p.x + 88, 114, 12, 6, '#e8e4d8'); T(g, 'NPL', p.x + 94, 117, 3.8, '#333', 'center', 700, FONT_SANS); }
      if (i === 3) { R(g, p.x + 40, 116.5, 26, 1.5, '#7a3e20'); R(g, p.x + 62, 114, 8, 5, '#a0382c'); } // мухобойка
    });

    // --- Балкон: перила поверх вида ---
    R(g, 794, top + 5, 152, 6, '#7a847e');
  }

  // Прозрачная накладка поверх стекла: жалюзи, рамы, блики (рисуется над панорамой)
  function buildWindowOverlay() {
    const { c, g } = mk(WD.W, WD.FLOOR_TOP);
    windowPanes.forEach((p, i) => {
      // рама
      O(g, p.x - 1.5, p.y - 1.5, p.w + 3, p.h + 3, '#5c6164', 2);
      R(g, p.x + p.w / 2 - 1, p.y, 2, p.h, '#5c6164');
      // жалюзи сверху; в третьем окне — перекошенные и сломанные
      const slats = i === 2 ? 9 : pick([3, 4, 5]);
      for (let s = 0; s < slats; s++) {
        const y = p.y + 1 + s * 2.6;
        if (i === 2) {
          g.save(); g.translate(p.x, y); g.rotate(0.05 + s * 0.012);
          R(g, 0, 0, p.w * (s === 6 ? 0.55 : 1), 2, '#e6e2d6');
          R(g, 0, 1.6, p.w * (s === 6 ? 0.55 : 1), 0.5, '#a9a594');
          g.restore();
        } else {
          R(g, p.x, y, p.w, 2, '#e6e2d6'); R(g, p.x, y + 1.6, p.w, 0.5, '#a9a594');
        }
      }
      R(g, p.x + 18, p.y, 0.6, 14 + i * 3, '#9c998d'); // шнурок
      E(g, p.x + 18.3, p.y + 15 + i * 3, 1, 1.5, '#9c998d');
      // блики на стекле
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.beginPath(); g.moveTo(p.x + 70, p.y + p.h); g.lineTo(p.x + 90, p.y + p.h); g.lineTo(p.x + 110, p.y + 18); g.lineTo(p.x + 98, p.y + 18); g.fill();
      // грязь по нижнему краю стекла
      R(g, p.x, p.y + p.h - 4, p.w, 4, 'rgba(120,110,80,0.18)');
    });
    // Балкон: перила из нержавейки с сеткой
    const b = balconyView;
    R(g, b.x, b.y + b.h - 22, b.w, 3, '#b8c4c6');
    R(g, b.x, b.y + b.h - 3, b.w, 3, '#7e8a8c');
    for (let x = b.x + 4; x < b.x + b.w; x += 8) R(g, x, b.y + b.h - 20, 1.5, 18, '#9aa6a8');
    R(g, b.x, b.y - 2, 2, b.h + 4, '#5c6164');
    // сушится полотенце на перилах
    R(g, b.x + 104, b.y + b.h - 22, 18, 12, '#c34b4b'); R(g, b.x + 104, b.y + b.h - 13, 18, 1.5, '#f0e0d0');
    return c;
  }

  // ---------- ПЕРЕГОРОДКИ ----------
  function drawWalls(g) {
    for (const w of WD.walls) {
      if (w.kind === 'north' || w.kind === 'outer') continue;
      if (w.kind === 'h') {
        // верхняя кромка ДСП + лицевая грань
        R(g, w.x, w.y, w.w, 8, '#39342c');
        R(g, w.x, w.y, w.w, 1.5, '#6e6554');
        R(g, w.x, w.y + 8, w.w, w.h - 8, '#b9ab8a');
        for (let i = 0; i < w.w / 14; i++) R(g, w.x + rr(0, w.w - 6), w.y + rr(10, w.h - 3), rr(3, 8), 1, 'rgba(70,55,35,0.25)'); // потёртости
        R(g, w.x, w.y + w.h - 2, w.w, 2, '#6d624c'); // плинтус
        if (w.label) {
          const tw = Math.min(w.w - 8, w.label.length * 5 + 14);
          R(g, w.x + w.w / 2 - tw / 2, w.y + 9.5, tw, 9, '#1f2e33');
          R(g, w.x + w.w / 2 - tw / 2 + 1, w.y + 10.5, tw - 2, 7, '#e9e1c8');
          const s = fitText(g, w.label, tw - 6, 6.2, 700, FONT_SANS);
          T(g, w.label, w.x + w.w / 2, w.y + 14.2, s, '#1f2e33', 'center', 700, FONT_SANS);
        }
      } else if (w.kind === 'v') {
        R(g, w.x, w.y, w.w, w.h, '#39342c');
        R(g, w.x + 1, w.y, 1.5, w.h, '#6e6554');
        R(g, w.x, w.y + w.h - 12, w.w, 12, '#b9ab8a');
        R(g, w.x, w.y + w.h - 2, w.w, 2, '#6d624c');
      } else if (w.kind === 'glass') {
        R(g, w.x, w.y, w.w, w.h, 'rgba(150,200,215,0.35)');
        R(g, w.x, w.y, 2, w.h, '#8a969a'); R(g, w.x + w.w - 2, w.y, 2, w.h, '#8a969a');
        for (let y = w.y + 10; y < w.y + w.h; y += 24) R(g, w.x + 2, y, w.w - 4, 1, 'rgba(255,255,255,0.5)');
      }
    }
    // Табличка «ВЫХОД» у западной двери и сама дверь
    R(g, 2, 286, 12, 32, '#4a3a2a'); R(g, 3, 287, 10, 30, '#6b5238'); R(g, 10, 300, 2, 4, '#d8c890');
    R(g, 16, 285, 34, 11, '#1e8a3c'); T(g, 'ВЫХОД', 33, 290.8, 6.4, '#ffffff', 'center', 700, FONT_SANS);
    R(g, 16, 297, 34, 7, '#e9e1c8'); T(g, 'ЛИФТ →', 33, 300.6, 4.8, '#333', 'center', 700, FONT_SANS);
    // Дверь серверной с кодовым замком
    R(g, 787, 410, 6, 48, 'rgba(60,70,75,0.6)');
    R(g, 796, 402, 36, 7, '#b3261e'); T(g, 'ВХОД IT', 814, 405.7, 5, '#fff', 'center', 700, FONT_SANS);
    // Табличка на двери кабинета
    R(g, 604, 404, 36, 9, '#c9a640'); R(g, 605, 405, 34, 7, '#e8cf7a'); T(g, 'Д.Н.', 622, 408.8, 5.6, '#3b2a10');
    // Вешалка у входа в опенспейс с чьим-то пуховиком
    R(g, 250, 132, 2, 26, '#3b3b3b'); R(g, 246, 132, 10, 2, '#3b3b3b');
  }

  // ---------- СТОЙКА КУХНИ (плоский слой) ----------
  function drawCounter(g) {
    const y = WD.FLOOR_TOP;
    R(g, WD.LEFT, y - 6, 222, 22, '#7f7a70');
    R(g, WD.LEFT, y - 6, 222, 16, '#a6a196');
    for (let i = 0; i < 20; i++) R(g, rr(20, 230), rr(y - 5, y + 8), rr(1, 3), 0.5, 'rgba(0,0,0,0.12)');
    R(g, WD.LEFT, y + 10, 222, 12, '#8a7458');
    for (let x = 60; x < 236; x += 30) { R(g, x, y + 11, 29, 10, '#9c8462'); R(g, x + 13, y + 14, 3, 1.5, '#d8d0bc'); }
    R(g, 150, y + 11, 29, 10, '#7a6448'); // оторванная дверца
    // Раковина с грязной посудой
    R(g, 60, y - 4, 30, 12, '#8b9496'); R(g, 62, y - 3, 26, 10, '#5d686b');
    E(g, 70, y + 1, 5, 3.5, '#e8e4d8'); E(g, 70, y + 1, 3, 2, '#c7b89a');
    E(g, 80, y + 2, 4, 3, '#d9e6ea'); R(g, 66, y - 11, 2.5, 8, '#c9d0d2');
    // Кофемашина (старая, с наклейкой)
    R(g, 104, y - 20, 30, 24, '#23292c'); R(g, 106, y - 18, 26, 8, '#3c4448');
    R(g, 108, y - 17, 10, 5, '#0d1a14'); T(g, 'ОК', 113, y - 14.3, 3.5, '#58e08a');
    R(g, 112, y - 8, 12, 2, '#aaa'); R(g, 114, y - 4, 7, 6, '#f2efe6');
    note(g, 120, y - 18, 11, 6, ['200₸'], { noTape: true, size: 4, bg: '#fbe98f' });
    // Банка «НА КОФЕ»
    R(g, 138, y - 12, 10, 12, 'rgba(210,230,235,0.6)'); R(g, 139, y - 4, 8, 4, '#c9a13a');
    note(g, 134, y - 10, 18, 6, ['НА КОФЕ'], { noTape: true, size: 4.2 });
    // Чайник
    R(g, 154, y - 12, 12, 12, '#dcdcd0'); R(g, 164, y - 9, 3, 6, '#bcbcb0'); R(g, 157, y - 14, 6, 2, '#333');
    // Микроволновка с запиской
    R(g, 178, y - 20, 50, 26, '#3a3f41'); R(g, 180, y - 18, 34, 22, '#1b2022');
    R(g, 216, y - 18, 10, 22, '#555c5f'); R(g, 218, y - 16, 6, 3, '#50e080');
    note(g, 182, y - 16, 30, 14, ['НЕ ГРЕТЬ', 'РЫБУ!!!'], { tilt: -0.05, size: 5.4, fg: '#b3261e', bg: '#fbe98f' });
  }

  // ---------- СПРАЙТЫ МЕБЕЛИ ----------
  const props = [];
  function prop(x, y, w, h, baseY, drawFn, id) {
    const { c, g } = mk(w, h);
    g.translate(-x, -y);
    drawFn(g);
    props.push({ id, canvas: c, x, y, w, h, baseY });
  }

  function monitorBack(g, x, y, w, h, color = '#2a2f33') {
    R(g, x + w / 2 - 2, y + h - 1, 4, 5, '#1d2124');
    R(g, x + w / 2 - 7, y + h + 3, 14, 2.5, '#1d2124');
    R(g, x, y, w, h, color);
    R(g, x + 1, y + 1, w - 2, 2, shade(color, 24));
    R(g, x + w / 2 - 4, y + h / 2 - 3, 8, 6, shade(color, -10));
  }
  function crtBack(g, x, y) {
    R(g, x, y, 30, 24, '#cfc6ae'); R(g, x + 3, y + 22, 24, 6, '#b8ae95');
    for (let i = 0; i < 5; i++) R(g, x + 6 + i * 4, y + 5, 2, 10, '#a79d84');
    R(g, x + 1, y + 1, 28, 2, '#e3dcc6');
  }
  function mug(g, x, y, c = '#f0ede4') { R(g, x, y, 5, 6, c); R(g, x + 5, y + 1.5, 1.5, 3, c); E(g, x + 2.5, y + 0.8, 2, 0.8, '#4b2e1a'); }
  function papers(g, x, y, n = 4) {
    for (let i = 0; i < n; i++) {
      g.save(); g.translate(x + i * 1.5, y - i * 1.2); g.rotate(rr(-0.2, 0.2));
      R(g, 0, 0, 12, 9, '#f5f2e8'); for (let k = 2; k < 8; k += 2) R(g, 1.5, k, rr(5, 9), 0.5, '#999');
      g.restore();
    }
  }

  function drawDesk(g, d) {
    const x = d.x, y = d.y, w = d.w;
    // Столешница ДСП «под бук», сколы, кружки от чашек
    R(g, x - 1, y + 1, w + 2, 27, 'rgba(0,0,0,0.3)');
    R(g, x, y, w, 26, '#9a7a52');
    R(g, x, y, w, 2, '#b8966a');
    for (let i = 0; i < 5; i++) R(g, x + rr(2, w - 12), y + rr(3, 23), rr(6, 16), 0.5, 'rgba(60,40,20,0.2)');
    for (let i = 0; i < 2; i++) { g.strokeStyle = 'rgba(80,50,20,0.35)'; g.lineWidth = 0.6; g.beginPath(); g.arc(x + rr(8, w - 8), y + rr(8, 22), 2.6, 0, 6.28); g.stroke(); }
    R(g, x + w - 7, y + 24, 6, 2, '#5d4a33'); // скол кромки
    // Фасад с тумбой
    R(g, x, y + 26, w, 16, '#6f5638');
    R(g, x + 2, y + 27, w - 4, 1, '#86683f');
    R(g, x + w - 26, y + 27, 22, 14, '#7c5f3e');
    R(g, x + w - 24, y + 29, 18, 5, '#8a6a45'); R(g, x + w - 24, y + 35, 18, 5, '#8a6a45');
    R(g, x + w - 17, y + 31, 4, 1, '#cfc2a4'); R(g, x + w - 17, y + 37, 4, 1, '#cfc2a4');
    R(g, x + 3, y + 40, 3, 2, '#2b2218'); R(g, x + w - 6, y + 40, 3, 2, '#2b2218');
    // Перегородка-экран с тканью сверху стола (кубикл)
    R(g, x, y - 3, w, 3, '#5b646a'); R(g, x, y - 3, w, 1, '#848f95');

    const st = d.style;
    if (st === 'crt') {
      crtBack(g, x + 26, y - 14);
      note(g, x + 6, y + 6, 18, 12, ['ПК НЕ', 'ВКЛ.'], { tilt: -0.1, size: 4.6, bg: '#fbe98f' });
      mug(g, x + 62, y + 12, '#a0382c');
    } else if (st === 'boxes') {
      R(g, x + 8, y - 12, 34, 26, '#b08a58'); R(g, x + 8, y - 12, 34, 3, '#c69c64'); R(g, x + 24, y - 12, 2, 26, '#d8c49a');
      note(g, x + 12, y - 4, 26, 8, ['ПЕРЕЕЗД'], { noTape: true, size: 4.8, bg: '#e8dcc0' });
      R(g, x + 48, y - 6, 26, 18, '#9c7a4c'); note(g, x + 50, y, 22, 6, ['NPL 2023'], { noTape: true, size: 3.8, bg: '#e8dcc0' });
    } else if (st === 'broken') {
      monitorBack(g, x + 24, y - 16, 34, 22, '#2e3337');
      g.strokeStyle = '#ddd'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x + 30, y - 14); g.lineTo(x + 38, y - 6); g.lineTo(x + 34, y); g.stroke();
      note(g, x + 60, y + 4, 20, 14, ['НЕ', 'РАБОТАЕТ'], { tilt: 0.08, size: 4.6, fg: '#b3261e' });
    } else if (st === 'empty') {
      papers(g, x + 12, y + 10, 3);
      R(g, x + 50, y + 8, 18, 12, '#3a3a3a'); R(g, x + 51, y + 9, 16, 10, '#4a4a4a'); // забытая клавиатура
      mug(g, x + 72, y + 6);
    } else if (st === 'intern') {
      monitorBack(g, x + 22, y - 14, 30, 20, '#343a3f');
      note(g, x + 56, y + 3, 24, 12, ['МЕСТО', 'СТАЖЁРА'], { size: 4.4, bg: '#bfe3f0' });
      R(g, x + 8, y + 12, 12, 8, '#e04a8a'); // розовый пенал
    } else {
      // занятые столы первого ряда
      // Мониторы по углам стола — лицо сотрудника остаётся видно
      const dual = st === 'dev' || st === 'tidy' || st === 'calc';
      monitorBack(g, x + 2, y - 12, 24, 17);
      if (dual) monitorBack(g, x + w - 26, y - 12, 24, 17);
      if (st === 'tidy') { R(g, x + 6, y + 12, 6, 8, '#3a6e4a'); E(g, x + 9, y + 11, 4, 3, '#58a060'); papers(g, x + 64, y + 14, 2); mug(g, x + 58, y + 16, '#2aa0a8'); }
      if (st === 'hoodie') { R(g, x + 6, y + 12, 8, 10, '#f2efe6'); R(g, x + 7, y + 14, 6, 3, '#8a4a2a'); R(g, x + 64, y + 4, 14, 16, '#c43a3a'); T(g, 'Red', x + 71, y + 12, 3.6, '#fff'); R(g, x + 62, y + 20, 18, 3, '#9a2a2a'); }
      if (st === 'papers') { papers(g, x + 4, y + 12, 6); papers(g, x + 64, y + 12, 5); R(g, x + 76, y + 2, 6, 10, '#2a5aa0'); }
      if (st === 'calc') { R(g, x + 6, y + 10, 12, 14, '#2b2f33'); for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 3; c2++) R(g, x + 7.5 + c2 * 3.5, y + 14 + r * 3, 2.5, 2, '#bbb'); mug(g, x + 60, y + 16); }
      if (st === 'dev') {
        R(g, x + 4, y + 10, 10, 12, '#e8c23a'); R(g, x + 5, y + 11, 8, 10, '#f3d65a'); // жёлтые стикеры
        note(g, x + 60, y + 10, 18, 10, ['GIT', 'PUSH'], { noTape: true, size: 4.6, bg: '#9be08a' });
        R(g, x + 48, y + 16, 7, 7, '#2b2b2b'); E(g, x + 51.5, y + 16, 3.5, 1.3, '#3b2616'); // кружка «>_»
      }
      // клавиатура и мышь (со стороны сотрудника)
      R(g, x + 28, y + 16, 28, 6, '#23272a'); for (let k = 0; k < 7; k++) R(g, x + 29.5 + k * 3.7, y + 17.5, 2.8, 1.5, '#4a5054');
      E(g, x + 60, y + 19, 2.2, 2.6, '#23272a');
    }
    // Табличка с именем на фасаде
    if (d.owner) {
      const cw = WD.coworkers.find(c => c.id === d.owner);
      const name = cw ? cw.name.toUpperCase() : 'ВИКЕНТИЙ';
      R(g, x + 6, y + 29, 44, 10, '#e9e1c8'); O(g, x + 6, y + 29, 44, 10, '#3a2e20', 0.8);
      const s = fitText(g, name, 40, 6, 700, FONT_SANS);
      T(g, name, x + 28, y + 34.3, s, '#1f2e33', 'center', 700, FONT_SANS);
    }
  }

  function drawChair(g, cx, cy, variant) {
    // Офисное кресло, повёрнутое к камере: спинка + сиденье + крестовина
    const broken = variant === 'broken';
    g.save();
    if (broken) { g.translate(cx, cy); g.rotate(0.35); g.translate(-cx, -cy); }
    R(g, cx - 1.5, cy + 6, 3, 8, '#222');
    R(g, cx - 11, cy + 13, 22, 2, '#222');
    E(g, cx - 11, cy + 15, 2, 1.5, '#111'); E(g, cx + 11, cy + 15, 2, 1.5, '#111');
    if (!broken) E(g, cx, cy + 16, 2, 1.5, '#111');
    R(g, cx - 12, cy - 2, 24, 9, '#2c3236'); R(g, cx - 11, cy - 1, 22, 3, '#3d454a');
    R(g, cx - 11, cy - 26, 22, 24, '#262c30'); R(g, cx - 10, cy - 25, 20, 22, '#353d42');
    R(g, cx - 13, cy - 8, 3, 10, '#1d2226'); R(g, cx + 10, cy - 8, 3, 10, '#1d2226');
    if (variant === 'tape') { R(g, cx - 8, cy - 20, 16, 4, 'rgba(180,180,170,0.95)'); R(g, cx - 2, cy - 23, 4, 14, 'rgba(180,180,170,0.95)'); }
    if (variant === 'jacket') { R(g, cx - 12, cy - 26, 24, 12, '#6a4a8a'); R(g, cx - 12, cy - 16, 6, 12, '#6a4a8a'); }
    g.restore();
  }

  function drawPlant(g, p) {
    const x = p.x, y = p.y;
    E(g, x, y + 3, 12, 4, 'rgba(0,0,0,0.3)');
    // горшок (облезлый пластик)
    R(g, x - 9, y - 12, 18, 15, '#9a5a3a'); R(g, x - 10, y - 14, 20, 4, '#b06a44'); R(g, x - 8, y - 13, 16, 2, '#3b2618');
    R(g, x - 6, y - 8, 4, 6, 'rgba(255,255,255,0.12)');
    const leaf = { monstera: ['#2f6b3a', '#3f8a4a', '#1f4a28'], ficus: ['#4a7a34', '#5f9442', '#2f5a24'], palm: ['#4f8a3a', '#6aa24a', '#35652a'], laurel: ['#3a6a44', '#4f8756', '#264a2e'] }[p.kind];
    const n = p.kind === 'palm' ? 9 : 14;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rr(-1.4, 1.4);
      const len = p.kind === 'palm' ? rr(18, 26) : rr(10, 20);
      const lx = x + Math.cos(a) * len * 0.8, ly = y - 16 + Math.sin(a) * len;
      g.fillStyle = leaf[i % 3];
      g.save(); g.translate(lx, ly); g.rotate(a + Math.PI / 2);
      g.beginPath(); g.ellipse(0, 0, p.kind === 'palm' ? 2.5 : 5, p.kind === 'palm' ? 11 : 7, 0, 0, 6.28); g.fill();
      if (p.kind === 'monstera') { R(g, -4, -1, 3, 1, leaf[2]); R(g, 1, 2, 3, 1, leaf[2]); }
      g.restore();
    }
    // пара жёлтых листьев — растение живёт впроголодь
    E(g, x + 6, y - 20, 3, 2, '#c7b04a'); E(g, x - 8, y - 12, 2.5, 1.8, '#b89a3a');
    R(g, x - 1, y - 20, 2, 8, '#2b4a24');
  }

  function buildProps() {
    const FT = WD.FLOOR_TOP;
    // Холодильник «Бирюса» с наклейками
    prop(14, FT - 44, 44, 64, FT + 18, g => {
      const x = 18, y = FT - 40;
      R(g, x - 1, y + 56, 38, 3, 'rgba(0,0,0,0.3)');
      R(g, x, y, 36, 58, '#d8d2c0'); R(g, x + 1, y + 1, 34, 2, '#eeeade');
      R(g, x, y + 22, 36, 1.5, '#8a8676');
      R(g, x + 30, y + 6, 2.5, 12, '#7a7666'); R(g, x + 30, y + 28, 2.5, 18, '#7a7666');
      R(g, x + 2, y + 50, 6, 5, '#b07a4a'); R(g, x + 26, y + 48, 7, 6, '#a86a3a'); // ржавчина
      R(g, x + 4, y + 4, 5, 5, '#e04a3a'); R(g, x + 12, y + 3, 6, 4, '#2a8ad0'); R(g, x + 20, y + 5, 4, 5, '#f0c030');
      note(g, x + 3, y + 25, 25, 11, ['НЕ ТРОГАТЬ!', '— ВЛАД'], { tilt: -0.06, size: 4.6, fg: '#b3261e' });
      note(g, x + 3, y + 38, 25, 9, ['РАЗМОРОЗКА', 'В ПЯТНИЦУ'], { tilt: 0.05, size: 3.8, bg: '#bfe3f0' });
      T(g, 'БИРЮСА', x + 16, y + 17, 4, '#8a8676', 'center', 700, FONT_SANS);
    }, 'fridge');

    // Кухонный стол с разномастными табуретками
    prop(76, 172, 88, 64, 228, g => {
      const x = 84, y = 196;
      R(g, 92, 184, 12, 10, '#8a5a34'); R(g, 94, 186, 8, 6, '#a06a3e'); // табурет сверху
      R(g, 136, 184, 12, 10, '#3a6ea0'); R(g, 138, 186, 8, 6, '#4a82b8');
      R(g, x - 1, y + 2, 74, 28, 'rgba(0,0,0,0.25)');
      R(g, x, y, 72, 20, '#c9c2ae'); R(g, x, y, 72, 2, '#e0dac8'); R(g, x, y + 20, 72, 6, '#8a846f');
      R(g, x + 2, y + 26, 3, 4, '#555'); R(g, x + 67, y + 26, 3, 4, '#555');
      for (let i = 0; i < 12; i++) R(g, x + rr(4, 68), y + rr(3, 17), 0.8, 0.8, '#8a6a3a'); // крошки
      R(g, x + 10, y + 6, 12, 8, '#f0ede4'); E(g, x + 16, y + 9, 4, 2.5, '#d8b060'); // тарелка с печеньем
      mug(g, x + 30, y + 7, '#2a7ab0'); mug(g, x + 44, y + 9, '#d0d0c8');
      R(g, x + 54, y + 5, 10, 7, '#e8e0cc'); T(g, 'САХАР', x + 59, y + 8.8, 2.8, '#6a4a2a', 'center', 700, FONT_SANS);
      // табуретки снизу, одна с дыркой
      R(g, 96, 228, 12, 6, '#8a5a34'); R(g, 136, 228, 12, 6, '#8a8a8a'); E(g, 142, 230, 2, 1.2, '#333');
    }, 'kitchen_table');

    // Кулер с водой
    prop(200, 190, 36, 58, 244, g => {
      const x = 206, y = 214;
      E(g, x + 12, y + 29, 13, 3, 'rgba(0,0,0,0.3)');
      R(g, x, y, 24, 30, '#e8e8e0'); R(g, x + 1, y + 1, 22, 2, '#fff');
      R(g, x + 4, y + 10, 16, 8, '#b8b8b0'); R(g, x + 6, y + 13, 3, 3, '#d33'); R(g, x + 15, y + 13, 3, 3, '#36c');
      g.fillStyle = 'rgba(80,170,220,0.75)';
      g.beginPath(); g.ellipse(x + 12, y - 10, 10, 13, 0, 0, 6.28); g.fill();
      R(g, x + 6, y - 2, 12, 3, 'rgba(60,140,190,0.9)');
      E(g, x + 8, y - 16, 2, 5, 'rgba(255,255,255,0.4)');
      note(g, x + 5, y - 13, 14, 6, ['ВОДА'], { noTape: true, size: 4.2, bg: '#e8f6ff', fg: '#1d5a8a' });
      R(g, x + 26, y + 6, 5, 18, '#f0f0ea'); for (let k = 0; k < 5; k++) R(g, x + 26, y + 7 + k * 3.5, 5, 0.5, '#bbb'); // стаканчики
    }, 'cooler');

    // Архив: шкафы вдоль западной стены (по секциям, чтобы сортировка по глубине работала)
    for (let i = 0; i < 4; i++) {
      const y0 = 350 + i * 43;
      prop(WD.LEFT, y0 - 26, 40, 72, y0 + 42, g => {
        const x = WD.LEFT;
        R(g, x, y0 - 24, 34, 24, '#5d6a6e'); R(g, x, y0 - 24, 34, 2, '#7d8a8e'); // верх шкафа
        R(g, x, y0, 34, 42, '#6d7a7e');
        for (let k = 0; k < 3; k++) {
          R(g, x + 2, y0 + 2 + k * 13.3, 30, 12, '#7f8c90');
          R(g, x + 18, y0 + 8 + k * 13.3, 10, 2, '#c8ced0');
          note(g, x + 3, y0 + 2.5 + k * 13.3, 12, 5.5, [String(2014 + i * 3 + k)], { noTape: true, size: 4.6, bg: '#fff' });
        }
        if (i === 1) { R(g, x + 2, y0 + 15.5, 30, 12, '#4d5a5e'); R(g, x + 3, y0 + 16, 28, 4, '#e8e2d0'); } // выдвинутый ящик
        // на шкафу — коробки и папки
        R(g, x + 4, y0 - 22, 12, 10, '#b08a58'); R(g, x + 18, y0 - 20, 12, 8, '#2a5aa0');
      }, `cabinet_${i}`);
    }
    // Стеллаж-остров с папками (3 секции)
    for (let i = 0; i < 3; i++) {
      const y0 = 378 + i * 31;
      prop(90, y0 - 30, 64, 64, y0 + 31, g => {
        R(g, 92, y0 - 26, 60, 26, '#4a3a2a'); R(g, 92, y0 - 26, 60, 2, '#6a5238');
        for (let k = 0; k < 13; k++) {
          const c = pick(['#2a5aa0', '#a03a2a', '#3a7a4a', '#c9a13a', '#6a4a8a', '#e8e0cc']);
          R(g, 94 + k * 4.4, y0 - 24 + rr(0, 4), 3.8, 20, c);
          R(g, 94.5 + k * 4.4, y0 - 16, 2.8, 3, '#f0ead8');
        }
        R(g, 92, y0, 60, 31, '#5a4630');
        R(g, 94, y0 + 2, 56, 27, '#3a2e22');
        for (let k = 0; k < 4; k++) { R(g, 96 + k * 13, y0 + 5, 11, 20, pick(['#b08a58', '#a07a4a', '#c49a64'])); }
        note(g, 100, y0 + 10, 40, 8, [['ДЕФОЛТЫ', 'КРЕДИТЫ', 'СУДЫ'][i]], { noTape: true, size: 5, bg: '#f0e6c8' });
      }, `shelf_${i}`);
    }
    // Коробки «НЕ ВЫБРАСЫВАТЬ»
    prop(172, 456, 64, 72, 526, g => {
      R(g, 176, 494, 30, 30, '#b08a58'); R(g, 176, 494, 30, 3, '#c69c64');
      R(g, 206, 490, 26, 34, '#a07a4a'); R(g, 206, 490, 26, 3, '#b88c58');
      R(g, 180, 466, 28, 28, '#c49a64'); R(g, 180, 466, 28, 3, '#d8ae78');
      note(g, 178, 504, 26, 12, ['НЕ', 'ВЫБРАСЫВАТЬ'], { noTape: true, size: 4.2, bg: '#f0e6c8', fg: '#b3261e' });
      note(g, 208, 500, 22, 8, ['NPL 2019'], { noTape: true, size: 3.8, bg: '#f0e6c8' });
      note(g, 183, 474, 22, 8, ['ГОДОВЫЕ'], { noTape: true, size: 3.8, bg: '#f0e6c8' });
    }, 'boxes');
    // Календарь на стене архива (на фасаде северной перегородки)
    // МФУ «Ксерокс» с табличкой
    prop(398, 438, 60, 84, 518, g => {
      const x = 404, y = 474;
      R(g, x - 1, y + 42, 52, 3, 'rgba(0,0,0,0.3)');
      R(g, x, y - 26, 50, 26, '#cfd3cf'); R(g, x + 2, y - 24, 46, 14, '#3a4a4e'); R(g, x + 2, y - 24, 46, 2, '#5a6a6e');
      R(g, x, y, 50, 44, '#dfe3df'); R(g, x + 2, y + 2, 46, 2, '#f0f2f0');
      R(g, x + 4, y + 8, 42, 7, '#bfc4bf'); R(g, x + 4, y + 18, 42, 7, '#bfc4bf'); R(g, x + 4, y + 28, 42, 7, '#bfc4bf');
      R(g, x + 36, y - 8, 12, 6, '#2b3a3e'); R(g, x + 38, y - 7, 3, 3, '#4f4'); R(g, x + 43, y - 7, 3, 3, '#fa3');
      R(g, x + 6, y - 6, 26, 4, '#f5f2e8'); // лист в лотке
      note(g, x + 6, y + 36, 38, 8, ['РАБОТАЕТ (ИНОГДА)'], { noTape: true, size: 4.2, bg: '#fbe98f' });
      // зачёркнутое «НЕ РАБОТАЕТ»
      note(g, x + 8, y + 8, 34, 8, ['НЕ РАБОТАЕТ'], { tilt: -0.04, size: 5, fg: '#b3261e' });
      g.strokeStyle = '#222'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + 9, y + 12); g.lineTo(x + 41, y + 11); g.stroke();
    }, 'copier');
    // Стеллаж с бумагой
    prop(456, 470, 70, 56, 522, g => {
      R(g, 460, 492, 62, 30, '#6a6e70'); R(g, 460, 492, 62, 2, '#8a8e90');
      for (let k = 0; k < 5; k++) { R(g, 463 + k * 11.5, 478, 10, 14, '#f5f2e8'); R(g, 463 + k * 11.5, 484, 10, 3, '#3a7ab0'); }
      note(g, 464, 498, 54, 10, ['БУМАГУ ДОМОЙ', 'НЕ БРАТЬ!'], { size: 4.8, fg: '#b3261e' });
      R(g, 466, 510, 20, 8, '#b08a58');
    }, 'paper_shelf');
    // Ведро под протечкой + знак «Мокрый пол»
    prop(300, 416, 64, 40, 452, g => {
      E(g, 324, 450, 10, 3, 'rgba(0,0,0,0.3)');
      R(g, 316, 438, 16, 12, '#3a6ab0'); E(g, 324, 438, 8, 2.5, '#2a4a80'); E(g, 324, 438, 6, 1.6, '#6aa0d0');
      g.strokeStyle = '#ccc'; g.lineWidth = 0.6; g.beginPath(); g.arc(324, 440, 8, Math.PI, 0); g.stroke();
      // жёлтый знак-домик
      g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(336, 452); g.lineTo(341, 424); g.lineTo(346, 452); g.fill();
      T(g, '!', 341, 441, 7, '#222');
      note(g, 318, 418, 44, 8, ['МОКРЫЙ ПОЛ!'], { noTape: true, size: 5, bg: '#f2c230' });
    }, 'bucket');
    // Маркерная доска на колёсиках
    prop(266, 350, 84, 56, 402, g => {
      R(g, 272, 396, 2, 6, '#555'); R(g, 342, 396, 2, 6, '#555'); R(g, 270, 400, 76, 2, '#555');
      R(g, 270, 354, 76, 42, '#9aa0a4'); R(g, 272, 356, 72, 38, '#f4f5f0');
      T(g, 'ДЕДЛАЙН: ВЧЕРА', 308, 362, 5.6, '#c02a2a', 'center', 700, FONT_SANS);
      T(g, 'NPL 7,8% (ПЛАН 5%)', 308, 370, 5, '#1f3a8a', 'center', 700, FONT_SANS);
      T(g, 'ПРЕМИЯ — ?', 308, 378, 5, '#1f7a3a', 'center', 700, FONT_SANS);
      g.strokeStyle = '#1f3a8a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(278, 391); g.lineTo(290, 386); g.lineTo(300, 389); g.lineTo(314, 382); g.lineTo(326, 388); g.lineTo(338, 384); g.stroke();
      R(g, 272, 394, 72, 2, '#bbb'); R(g, 300, 393, 6, 1.5, '#c02a2a'); R(g, 310, 393, 6, 1.5, '#1f3a8a');
    }, 'whiteboard');

    // Кабинет начальника: кресло, стол, шкаф с грамотами
    prop(684, 414, 44, 50, 460, g => {
      const cx = 706, cy = 450;
      R(g, cx - 15, cy - 34, 30, 34, '#3a1e14'); R(g, cx - 13, cy - 32, 26, 30, '#5a2e1e');
      for (let k = 0; k < 3; k++) R(g, cx - 12, cy - 28 + k * 9, 24, 0.8, '#3a1e14');
      R(g, cx - 17, cy - 10, 5, 14, '#3a1e14'); R(g, cx + 12, cy - 10, 5, 14, '#3a1e14');
      R(g, cx - 14, cy, 28, 8, '#4a2616');
    }, 'boss_chair');
    prop(654, 438, 104, 58, 492, g => {
      const x = 660, y = 462;
      R(g, x - 2, y + 2, 96, 30, 'rgba(0,0,0,0.3)');
      R(g, x, y, 92, 18, '#5a3a20'); R(g, x, y, 92, 2, '#7a5230');
      R(g, x + 20, y + 2, 52, 14, '#2f5a3a'); R(g, x + 21, y + 3, 50, 12, '#3a6e48'); // зелёное сукно
      R(g, x, y + 18, 92, 12, '#4a2e18'); R(g, x + 4, y + 20, 26, 8, '#5a3a20'); R(g, x + 62, y + 20, 26, 8, '#5a3a20');
      // лампа «зелёная», телефон, подстаканник
      R(g, x + 6, y - 12, 14, 7, '#1f6a3a'); R(g, x + 12, y - 5, 2, 7, '#c9a640'); R(g, x + 8, y + 1, 10, 2, '#c9a640');
      R(g, x + 74, y - 2, 14, 9, '#2a2a2a'); R(g, x + 75, y - 4, 12, 3, '#3a3a3a');
      R(g, x + 58, y + 4, 6, 8, 'rgba(200,120,50,0.7)'); R(g, x + 57, y + 4, 8, 2, '#c9a640'); R(g, x + 64, y + 6, 2, 4, '#c9a640');
      R(g, x + 30, y + 22, 32, 7, '#c9a640'); R(g, x + 31, y + 23, 30, 5, '#e8cf7a');
      T(g, 'Д.Н.', x + 46, y + 25.6, 4.6, '#3b2a10');
      papers(g, x + 26, y + 6, 3);
    }, 'boss_desk');
    prop(584, 450, 48, 76, 524, g => {
      R(g, 588, 460, 40, 64, '#5a3a20'); R(g, 590, 462, 36, 28, 'rgba(180,210,220,0.35)');
      R(g, 594, 470, 8, 12, '#c9a640'); E(g, 598, 469, 4, 3, '#e8cf7a'); // кубок
      note(g, 604, 466, 20, 14, ['ЛУЧШИЙ', 'ОТДЕЛ', '2011'], { noTape: true, size: 3.4, bg: '#f5e8c0' });
      R(g, 590, 494, 36, 28, '#6a4628'); R(g, 606, 504, 4, 2, '#c9a640');
    }, 'boss_cabinet');

    // Серверные стойки (LED мигают динамически)
    for (const [ry, id] of [[374, 'rack_row1'], [480, 'rack_row2']]) {
      prop(824, ry - 30, 120, ry === 480 ? 76 : 56, ry + (ry === 480 ? 42 : 22), g => {
        for (let i = 0; i < 4; i++) {
          const x = 828 + i * 28;
          R(g, x, ry - 20, 26, 20, '#1c2427'); R(g, x, ry - 20, 26, 2, '#3a464a');
          R(g, x, ry, 26, ry === 480 ? 42 : 22, '#141b1e');
          for (let y = ry + 2; y < ry + (ry === 480 ? 40 : 20); y += 5) { R(g, x + 2, y, 22, 4, '#222c30'); R(g, x + 3, y + 1.5, 10, 1, '#3e4c52'); }
        }
        // кабели-спагетти
        g.strokeStyle = '#2a6ab0'; g.lineWidth = 0.8;
        for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(830 + k * 18, ry - 18); g.quadraticCurveTo(840 + k * 16, ry - 26, 850 + k * 14, ry - 16); g.stroke(); }
        g.strokeStyle = '#e0a020';
        for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(835 + k * 30, ry - 15); g.quadraticCurveTo(850 + k * 28, ry - 24, 870 + k * 24, ry - 13); g.stroke(); }
        if (ry === 374) note(g, 836, ry + 4, 44, 12, ['НЕ ВЫКЛЮЧАТЬ!!!', 'ПРОД'], { size: 4.6, fg: '#b3261e' });
      }, id);
    }
    // Балкон: скамейка, пепельница-урна, табличка «Не курить», засохшее растение
    prop(870, 240, 74, 48, 284, g => {
      R(g, 876, 262, 62, 5, '#6a4a2a'); R(g, 876, 268, 62, 5, '#7a5634'); R(g, 876, 274, 62, 5, '#6a4a2a');
      R(g, 878, 256, 58, 5, '#5a3e22'); R(g, 880, 279, 3, 5, '#333'); R(g, 931, 279, 3, 5, '#333');
      R(g, 910, 264, 10, 6, '#e0d8c4'); T(g, 'Курсив', 915, 267, 2.6, '#333', 'center', 700, FONT_SANS); // газета
    }, 'bench');
    prop(812, 140, 28, 44, 180, g => {
      E(g, 826, 179, 7, 2, 'rgba(0,0,0,0.3)');
      R(g, 820, 152, 12, 26, '#4a5256'); R(g, 818, 150, 16, 4, '#8a9498'); E(g, 826, 151, 6, 1.6, '#555');
      for (let k = 0; k < 7; k++) { R(g, 820 + rr(0, 10), 148 + rr(-2, 1), 3, 1, '#eee'); } // гора окурков
    }, 'ashtray');
    prop(838, 138, 24, 40, 176, g => {
      R(g, 849, 150, 2, 26, '#666');
      R(g, 840, 138, 20, 16, '#fff'); O(g, 840, 138, 20, 16, '#c02a2a', 1.2);
      g.strokeStyle = '#c02a2a'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(850, 146, 5.5, 0, 6.28); g.stroke();
      R(g, 845.5, 145.5, 8, 1.6, '#555'); R(g, 853, 145.5, 1.2, 1.6, '#e0602a');
      g.beginPath(); g.moveTo(846, 142); g.lineTo(854, 150); g.stroke();
      R(g, 836, 155, 28, 9, '#f5f2e8'); T(g, 'НЕ КУРИТЬ!', 850, 158, 3.6, '#c02a2a', 'center', 700, FONT_SANS); T(g, 'ШТРАФ 5000₸', 850, 162, 3.2, '#222', 'center', 700, FONT_SANS);
    }, 'no_smoke_sign');
    prop(906, 128, 36, 40, 162, g => {
      R(g, 914, 148, 18, 14, '#7a4a30'); R(g, 912, 146, 22, 4, '#8a5a3a');
      g.strokeStyle = '#6a5a30'; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(923, 147); g.lineTo(923 + rr(-10, 10), 130 + rr(0, 8)); g.stroke(); }
      E(g, 918, 138, 2, 1, '#9a8a4a'); E(g, 929, 136, 2, 1, '#9a8a4a');
    }, 'dead_plant');

    // Столы, кресла, растения
    WD.desks.forEach(d => {
      const variant = d.row === 2 ? ['tape', 'normal', 'broken', 'jacket', 'normal'][WD.desks.indexOf(d) - 5] : 'normal';
      // Кресло позади стола (его частично закрывает столешница)
      prop(d.seatX - 16, d.y - 32, 32, 52, d.y - 2, g => drawChair(g, d.seatX, d.y - 4, variant), `chair_${d.id}`);
      prop(d.x - 4, d.y - 22, d.w + 8, 66, d.y + d.h, g => drawDesk(g, d), d.id);
    });
    WD.plants.forEach(p => prop(p.x - 32, p.y - 48, 64, 56, p.y + 4, g => drawPlant(g, p), p.id));
  }

  // Статичный слой
  function buildStatic() {
    const { c, g } = mk(WD.W, WD.H);
    drawFloors(g);
    drawNorthWall(g);
    drawCounter(g);
    drawWalls(g);
    // Стекло окон делаем прозрачным: под ним динамическая панорама
    windowPanes.forEach(p => g.clearRect(p.x, p.y, p.w, p.h));
    g.clearRect(balconyView.x, balconyView.y, balconyView.w, balconyView.h);
    return c;
  }

  function build() {
    seed = 1337;
    props.length = 0;
    const staticLayer = buildStatic();
    const windowOverlay = buildWindowOverlay();
    buildProps();
    return { staticLayer, windowOverlay, props: props.slice(), windowPanes, balconyView, S };
  }

  window.NP_ART = { build, S, FONT, FONT_SANS };
})();
