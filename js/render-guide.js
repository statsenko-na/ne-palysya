'use strict';
// «Не пались» — обучение, выбор ответа на летучке, значок автопилота, строка задания.
// Общие переменные и функции объявлены на верхнем уровне и видны из других скриптов игры (без обёртки и модулей).
// Порядок подключения — в index.html; см. docs/PLAN_SPLIT_GAME_JS.md.

  // ---------- ПОДСКАЗКИ ----------
  // Обучение: подсказки со стрелкой на первых минутах, пока игрок не освоится
  const TUTORIAL = [
    { text: 'Подойди к своему столу (из прохода или от окна) и нажми E — это Excel', target: () => ({ x: SEAT.x, y: SEAT.y - 58 }), done: () => player.action === 'work' },
    { text: coarsePointer ? '📱 — телефон: там список дел, бонусы и чат' : 'Tab / Q — телефон: там список дел, бонусы и чат', target: null, done: () => player.action === 'phone' },
    { text: 'Поболтай с коллегой: встань перед его столом и жми E', target: () => ({ x: coworkers[1].x, y: coworkers[1].desk.y - 60 }), done: () => player.action === 'chat' || stats.chats > 0 },
    { text: 'Жёлтый конус — взгляд Д.Н. Прокрастинируешь в нём — растёт «?»', target: () => ({ x: boss.x, y: boss.y - 84 }), done: () => tutorial.t > 7 },
  ];
  function updateTutorial(dt) {
    if (tutorial.step >= TUTORIAL.length) return;
    tutorial.t += dt;
    const cur = TUTORIAL[tutorial.step];
    if (tutorial.step === 3 && (boss.state === 'office' || boss.state === 'gone')) { tutorial.t = 0; return; }
    if (cur.done()) {
      tutorial.step++;
      tutorial.t = 0;
      if (tutorial.step >= TUTORIAL.length) store.set('tutorialDone', true);
    }
  }
  function drawTutorial() {
    if (mode !== 'playing' || tutorial.step >= TUTORIAL.length) return;
    const cur = TUTORIAL[tutorial.step];
    if (tutorial.step === 3 && boss.state === 'office') return;
    const bounce = Math.sin(performance.now() / 180) * 3;
    if (cur.target) {
      const p = cur.target();
      ctx.fillStyle = '#f2bb38';
      ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - 10 + bounce); ctx.lineTo(p.x + 6, p.y - 10 + bounce); ctx.lineTo(p.x, p.y + bounce); ctx.fill();
      ctx.strokeStyle = '#172027'; ctx.lineWidth = 1; ctx.stroke();
    }
    const k = uiK(1.55);
    const { VW, VH } = uiSpace(k);
    const lines = wrap(`💡 ${cur.text}`, coarsePointer ? VW * 0.55 : VW - 60, 10);
    ctx.font = `700 10px ${FONT_SANS}`;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 22;
    const h = 7 + lines.length * 12;
    const y = Math.min(promptTop / k, VH - 24) - 4 - h;
    ctx.fillStyle = 'rgba(242,187,56,0.95)'; roundRect(VW / 2 - w / 2, y, w, h, 4); ctx.fill();
    lines.forEach((l, i) => T(l, VW / 2, y + 9.9 + i * 12, 10, '#172027', 'center', 700, FONT_SANS));
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }

  // Выбор ответа на летучке: 1 / 2 / 3 или тап
  const choiceRects = [];
  function drawChoice() {
    choiceRects.length = 0;
    if (!choice || !choice.asked || choice.done || player.action !== 'standup' || mode !== 'playing') return;
    const k = uiK(1.65);
    choiceK = k;
    const { VW, VH } = uiSpace(k);
    const w = 420, h = 74, x = VW / 2 - w / 2, y = Math.min(VH - 150, VH - h - 40);
    ctx.fillStyle = 'rgba(8,16,20,0.94)'; roundRect(x, y, w, h, 4); ctx.fill();
    ctx.strokeStyle = '#f2bb38'; ctx.lineWidth = 1; ctx.stroke();
    T('Д.Н.: «Что по твоему направлению?» — выбери ответ', W / 2, y + 10, 9, '#f2bb38', 'center', 700, FONT_SANS);
    STANDUP_CHOICES.forEach((c, i) => {
      const bx = x + 10 + i * 134, by = y + 22, bw = 126, bh = 44;
      choiceRects.push({ x: bx, y: by, w: bw, h: bh, i });
      ctx.fillStyle = '#16303a'; roundRect(bx, by, bw, bh, 3); ctx.fill();
      T(c.key, bx + 12, by + bh / 2, 14, '#f2bb38', 'center', 900);
      const lines = wrap(c.text, bw - 30, 8.5);
      lines.forEach((l, n) => T(l, bx + 24, by + bh / 2 - (lines.length - 1) * 5 + n * 10, 8.5, '#fff', 'left', 700, FONT_SANS));
    });
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }
  let choiceK = 1;
  let autoBadgeRect = null;
  canvas.addEventListener('pointerdown', e => {
    const r = canvasBox();
    if (autoBadgeRect && mode === 'playing') {
      const ax = (e.clientX - r.left) / r.width * W / autoBadgeK, ay = (e.clientY - r.top) / r.height * H / autoBadgeK;
      const b = autoBadgeRect;
      if (ax >= b.x && ax <= b.x + b.w && ay >= b.y - 3 && ay <= b.y + b.h + 3) { e.preventDefault(); toggleAutopilot(); return; }
    }
    if (!choiceRects.length) return;
    const gx = (e.clientX - r.left) / r.width * W / choiceK, gy = (e.clientY - r.top) / r.height * H / choiceK;
    const hit = choiceRects.find(c => gx >= c.x && gx <= c.x + c.w && gy >= c.y && gy <= c.y + c.h);
    if (hit) { e.preventDefault(); answerStandup(hit.i); }
  });
  let autoBadgeK = 1;
  function drawAutoBadge() {
    screenRects.auto = null;
    if (mode !== 'playing') return;
    const blink = Math.floor(performance.now() / 700) % 2 === 0;
    const key = coarsePointer ? '' : ' (O)';
    const text = auto.on
      ? `🍿 АВТОПИЛОТ ×${+timeScale.toFixed(2)} · ${auto.goal ? AUTO_LABELS[auto.goal.kind] || '' : 'думает…'} · ${coarsePointer ? 'тап — выключить' : 'WASD / O — взять управление'}`
      : `🍿 Автопилот${key}`;
    const k = uiK(1.6);
    autoBadgeK = k;
    const { VW, VH } = uiSpace(k);
    ctx.font = `700 8.5px ${FONT_SANS}`;
    const w = Math.min(ctx.measureText(text).width + 14, VW * 0.55);
    const y = compactHud() ? hudBottom() / k + 4 : VH - 20;
    ctx.fillStyle = auto.on ? 'rgba(8,16,20,0.88)' : 'rgba(8,16,20,0.62)'; roundRect(6, y, w, 15, 3); ctx.fill();
    screenRects.auto = { x: 6 * k, y: y * k, w: w * k, h: 15 * k };
    autoBadgeRect = { x: 6, y, w, h: 15 };
    R(6, y, 3, 15, auto.on ? (blink ? '#f2bb38' : '#c76ad8') : '#6d8a96');
    TE(text, 13, y + 7.8, 8.5, w - 12, auto.on ? '#f5edd9' : '#c8d6ca');
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }
  const AUTO_LABELS = { desk: 'идёт работать', coffee: 'за кофе', smoke: 'на перекур', server: 'в серверную', fridge: 'к холодильнику', water: 'к кулеру', printer: 'печатать мем', toilet: 'в биотуалет', phone: 'залипает в телефон', chat: 'болтать', hide: 'прячется!', exit: 'к выходу', standup: 'на летучку', feast: 'за едой' };
  function drawObjective() {
    screenRects.obj = null;
    if (mode !== 'playing' || player.action === 'phone') return;
    if (compactHud() && banner) return; // на маленьком экране не спорим с баннером дня
    const next = todo.find(t => !t.done);
    const done = todo.filter(t => t.done).length;
    const text = next ? `📋 ${next.text}${next.goal > 1 ? ` ${Math.min(next.goal, todoProgress(next))}/${next.goal}` : ''}  ·  ${done}/${todo.length}` : `📋 Все дела сделаны! ${done}/${todo.length}`;
    const k = uiK(1.6);
    const { VW, VH } = uiSpace(k);
    const buzz = phoneBuzz > 0 && Math.floor(performance.now() / 200) % 2 === 0;
    const tab = buzz ? '📱 Tab ●' : '📱 Tab';
    ctx.font = `700 8.5px ${FONT_SANS}`;
    const tabW = coarsePointer ? 0 : ctx.measureText(tab).width + 8;
    const w = Math.min(ctx.measureText(text).width + 14 + tabW, VW * 0.5);
    const x = VW - w - 6;
    const y = compactHud() ? hudBottom() / k + 4 : VH - 20;
    ctx.fillStyle = 'rgba(8,16,20,0.85)'; roundRect(x, y, w, 15, 3); ctx.fill();
    screenRects.obj = { x: x * k, y: y * k, w: w * k, h: 15 * k };
    TE(text, x + 6, y + 7.8, 8.5, w - 12 - tabW, '#e8f2ee');
    if (tabW) T(tab, x + w - 6, y + 7.8, 8.5, buzz ? '#f2bb38' : '#9ab', 'right', 700, FONT_SANS);
    else if (buzz) T('●', x + w - 4, y + 3, 7, '#f2bb38');
    ctx.setTransform(S, 0, 0, S, 0, 0);
  }
