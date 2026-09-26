'use strict';
// «Не пались» — компактный экран короткого выбора.

const actionChoiceRects = [];
let actionChoiceScale = 1;

function drawActionChoice() {
  actionChoiceRects.length = 0;
  const view = getActionChoiceView();
  if (!view) return;

  const k = uiK(1.8);
  actionChoiceScale = k;
  const { VW, VH } = uiSpace(k);
  const touchButtons = document.querySelector('.touch-btns');
  const compact = !!(touchButtons && touchButtons.getBoundingClientRect().width > 0);
  const w = compact ? Math.min(300, VW - 20) : Math.min(620, VW - 20);
  const h = compact ? 184 : 114;
  const x = (VW - w) / 2;
  const y = Math.max(8, VH - h - (compact ? 12 : 84));
  ctx.fillStyle = 'rgba(8,16,20,0.96)'; roundRect(x, y, w, h, 5); ctx.fill();
  ctx.strokeStyle = '#f2bb38'; ctx.lineWidth = 1.4; ctx.stroke();
  R(x + 1, y + 1, w - 2, 24, '#18313a');
  TE(`${view.ownerLabel} · ${view.title}`, x + 12, y + 13, 10, w - 82, '#f2bb38', 'left', 800);
  T(`${Math.max(1, Math.ceil(view.remaining))} с`, x + w - 12, y + 13, 9, '#cbd8d5', 'right', 700, FONT_SANS);

  const gap = compact ? 4 : 7;
  const cardW = compact ? w - 20 : (w - 20 - gap * (view.options.length - 1)) / view.options.length;
  const cardY = y + (compact ? 28 : 29);
  const cardH = compact ? 42 : 64;
  view.options.forEach((option, index) => {
    const bx = compact ? x + 10 : x + 10 + index * (cardW + gap);
    const by = compact ? cardY + index * (cardH + gap) : cardY;
    const disabled = !!option.disabledReason;
    actionChoiceRects.push({ x: bx, y: by, w: cardW, h: cardH, i: index });
    ctx.fillStyle = disabled ? '#253035' : '#16303a'; roundRect(bx, by, cardW, cardH, 4); ctx.fill();
    ctx.strokeStyle = disabled ? '#526066' : '#54747b'; ctx.lineWidth = 1; ctx.stroke();
    T(String(index + 1), bx + 13, by + (compact ? 11 : 13), 10, disabled ? '#8f9a9c' : '#f2bb38', 'center', 900);
    if (compact) {
      TE(option.label, bx + 30, by + 9, 10, cardW - 38, disabled ? '#b5bebd' : '#fff', 'left', 700);
      TE(option.detail, bx + 30, by + 21, 9.5, cardW - 38, '#b2c5c8', 'left', 600);
      if (disabled) TE(`Недоступно: ${option.disabledReason}`, bx + 30, by + 33, 9.5, cardW - 38, '#ff9c84', 'left', 700);
    } else {
      const labelLines = wrap(option.label, cardW - 32, 10).slice(0, 2);
      labelLines.forEach((line, lineIndex) => T(line, bx + cardW / 2 + 7, by + 12 + lineIndex * 11, 10, disabled ? '#b5bebd' : '#fff', 'center', 700, FONT_SANS));
      TE(option.detail, bx + cardW / 2, by + 43, 10, cardW - 14, '#b2c5c8', 'center', 600);
      if (disabled) TE(`Недоступно: ${option.disabledReason}`, bx + cardW / 2, by + 56, 9.5, cardW - 12, '#ff9c84', 'center', 700);
    }
  });
  T('Esc — закрыть · движение отменит выбор', VW / 2, y + (compact ? 170 : 103), 9.5, '#91a6a8', 'center', 600, FONT_SANS);
  ctx.setTransform(S, 0, 0, S, 0, 0);
}

function actionChoiceIndexAtClient(clientX, clientY) {
  if (!actionChoiceState || !actionChoiceRects.length) return -1;
  const r = canvasBox();
  const gx = (clientX - r.left) / r.width * W / actionChoiceScale;
  const gy = (clientY - r.top) / r.height * H / actionChoiceScale;
  const hit = actionChoiceRects.find(box => gx >= box.x && gx <= box.x + box.w && gy >= box.y && gy <= box.y + box.h);
  return hit ? hit.i : -1;
}

function actionChoiceHitboxDebug() {
  return { scale: actionChoiceScale, boxes: actionChoiceRects.map(box => ({ ...box })) };
}
