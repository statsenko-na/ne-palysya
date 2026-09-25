// Автоматическая проверка игры в headless Chromium (dev-инструмент, игре не нужен).
// Запуск: node scripts/qa.js [папка-для-скриншотов]
// Требует Playwright (npm i -g playwright или локально).
const path = require('path');
const fs = require('fs');

const { loadPlaywright } = require('./pw');

(async () => {
  const { chromium } = loadPlaywright();
  const outDir = process.argv[2] || path.join(__dirname, '..', '.qa');
  fs.mkdirSync(outDir, { recursive: true });
  const url = require('url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? {} : {});
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts\.g/.test(m.text())) errors.push(m.text()); });

  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); };

  await page.goto(url);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, '00-menu.png') });

  // 1. Раскладки: физические коды и кириллица
  const layout = await page.evaluate(() => {
    const f = window.NP_getControlKey;
    const cases = [
      [{ code: 'KeyW', key: 'w' }, 'w'], [{ code: 'KeyW', key: 'ц' }, 'w'], [{ code: '', key: 'ц' }, 'w'],
      [{ code: 'KeyA', key: 'ф' }, 'a'], [{ code: 'KeyS', key: 'ы' }, 's'], [{ code: 'KeyD', key: 'в' }, 'd'],
      [{ code: 'KeyE', key: 'у' }, 'e'], [{ code: '', key: 'у' }, 'e'], [{ code: 'KeyH', key: 'р' }, 'h'],
      [{ code: '', key: 'р' }, 'h'], [{ code: 'KeyP', key: 'з' }, 'p'], [{ code: '', key: 'з' }, 'p'],
      [{ code: 'Space', key: ' ' }, 'e'], [{ code: 'KeyQ', key: 'й' }, 'q'], [{ code: '', key: 'й' }, 'q'], [{ code: 'Tab', key: 'Tab' }, 'q'], [{ code: 'KeyU', key: 'г' }, 'u'], [{ code: 'KeyI', key: 'ш' }, 'i'], [{ code: '', key: 'ш' }, 'i'],
      [{ code: 'KeyB', key: 'и' }, 'b'], [{ code: 'KeyN', key: 'т' }, 'n'], [{ code: '', key: 'т' }, 'n'], [{ code: '', key: 'и' }, 'b'], [{ code: 'KeyB', key: 'b' }, 'b'],
      [{ code: 'KeyM', key: 'ь' }, 'm'], [{ code: '', key: 'ь' }, 'm'], [{ code: 'KeyU', key: 'u' }, 'u'], [{ code: 'KeyI', key: 'i' }, 'i'],
      [{ code: 'Digit1', key: '1' }, '1'], [{ code: 'Digit2', key: '"' }, '2'], [{ code: 'Digit3', key: '№' }, '3'], [{ code: 'Numpad1', key: '1' }, '1'],
      [{ code: 'KeyE', key: 'e' }, 'e'], [{ code: 'KeyH', key: 'h' }, 'h'], [{ code: 'KeyQ', key: 'q' }, 'q'], [{ code: 'KeyP', key: 'p' }, 'p'], [{ code: '', key: 'г' }, 'u'], [{ code: 'ArrowUp', key: 'ArrowUp' }, 'arrowup'], [{ code: 'Enter', key: 'Enter' }, 'enter'],
    ];
    return cases.map(([ev, want]) => ({ ev, want, got: f(ev) })).filter(c => c.got !== c.want);
  });
  check('раскладки EN/RU', layout.length === 0, JSON.stringify(layout));

  // Для большинства проверок вся неделя открыта (прогрессию проверяем отдельно в конце)
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('nepalsya.weekDone', 'true');
  });

  // 2. Первый запуск: онбординг, листание стрелками, старт с последнего слайда
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  let onb = await page.evaluate(() => NP_DEBUG.onboarding);
  check('онбординг при первом запуске', onb.open && onb.i === 0, JSON.stringify(onb));
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  onb = await page.evaluate(() => NP_DEBUG.onboarding);
  check('онбординг листается стрелками', onb.i === 2, JSON.stringify(onb));
  await page.screenshot({ path: path.join(outDir, '18-onboarding.png') });
  await page.keyboard.press('ArrowRight'); // первый запуск: 3 ключевых слайда
  await page.waitForTimeout(200);
  let st = await page.evaluate(() => ({ ...NP_DEBUG.state, onbOpen: NP_DEBUG.onboarding.open }));
  check('старт по Enter после онбординга', st.mode === 'playing' && !st.onbOpen, st.mode);

  // 3. Движение с русской раскладкой (код KeyD, символ «в»)
  const x0 = st.player.x;
  await page.keyboard.down('KeyD'); await page.waitForTimeout(350); await page.keyboard.up('KeyD');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('движение D', st.player.x > x0 + 10, `${x0} → ${st.player.x}`);

  // 4. Стены: идём в стену балкона и не проходим
  await page.evaluate(() => NP_DEBUG.teleport(770, 290));
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(900); await page.keyboard.up('ArrowRight');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('стена не пропускает', st.player.x < 787, `x=${st.player.x.toFixed(1)}`);

  // 5. Навигация начальника: путь из кабинета на кухню существует и не проходит сквозь стены
  const navOk = await page.evaluate(() => {
    const p = NP_DEBUG.findPath({ x: 706, y: 446 }, { x: 110, y: 172 });
    return { len: p.length, clear: p.every(pt => !NP_DEBUG.blocked(pt.x, pt.y, 4)) };
  });
  check('путь начальника', navOk.len > 2 && navOk.clear, JSON.stringify(navOk));
  const isolated = await page.evaluate(() => NP_DEBUG.nav.filter(n => n.edges.length === 0).map(n => [n.x, n.y]));
  check('нет изолированных узлов навигации', isolated.length === 0, JSON.stringify(isolated));

  // 6. Сесть за стол и работать (E)
  await page.evaluate(() => NP_DEBUG.teleport(728, 150));
  await page.keyboard.press('KeyE');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('Excel за столом', st.player.action === 'work');
  await page.screenshot({ path: path.join(outDir, '01-work.png') });

  // 6b. Стол доступен и спереди из прохода; пустое E не перекрывает экран тостом
  const deskFront = await page.evaluate(() => {
    NP_DEBUG.clearEvents();
    NP_DEBUG.teleport(500, 250);
    NP_DEBUG.interact();
    const emptyToast = document.getElementById('toast').classList.contains('show');
    NP_DEBUG.teleport(728, 215);
    NP_DEBUG.interact();
    const sitAction = NP_DEBUG.state.player.action;
    NP_DEBUG.interact();
    const standY = NP_DEBUG.state.player.y;
    const toastTop = parseInt(getComputedStyle(document.getElementById('toast')).top);
    NP_DEBUG.teleport(728, 150);
    NP_DEBUG.interact();
    return { emptyToast, sitAction, standY, toastTop };
  });
  check('стол доступен из прохода и пустое E не спамит тостом', !deskFront.emptyToast && deskFront.sitAction === 'work' && deskFront.standY > 200 && deskFront.toastTop <= 60, JSON.stringify(deskFront));

  // 7. Начальник смотрит, как работаешь — KPI растёт быстрее
  const watched = await page.evaluate(() => {
    const before = NP_DEBUG.state.usefulness;
    NP_DEBUG.setBoss(728, 228, 'look');
    return before;
  });
  await page.waitForTimeout(1500);
  st = await page.evaluate(() => NP_DEBUG.state);
  check('работа к плану ускоряется при начальнике (×2)', st.usefulness - watched > 2.5, `${watched.toFixed(1)} → ${st.usefulness.toFixed(1)}`);
  await page.screenshot({ path: path.join(outDir, '02-watched.png') });

  // 8. Болтовня с коллегой
  await page.evaluate(() => { NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.teleport(520, 222); });
  await page.keyboard.press('KeyE');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('болтовня стартует', st.player.action === 'chat', st.player.action);
  await page.waitForTimeout(3800);
  await page.screenshot({ path: path.join(outDir, '03-chat.png') });
  await page.waitForTimeout(3200);
  st = await page.evaluate(() => NP_DEBUG.state);
  check('болтовня даёт бонус', st.stats.chats === 1, JSON.stringify(st.stats));

  // 9. Подозрение и поимка: курим на балконе у начальника на виду
  await page.evaluate(() => { NP_DEBUG.teleport(870, 230); });
  await page.keyboard.press('KeyE');
  await page.evaluate(() => { NP_DEBUG.setBoss(830, 300, 'look'); });
  await page.waitForTimeout(2600);
  st = await page.evaluate(() => NP_DEBUG.state);
  check('поимка при курении на виду', st.stats.catches >= 1 || st.coverTokens === 0, `catches=${st.stats.catches}`);
  await page.screenshot({ path: path.join(outDir, '04-caught.png') });

  // 10. Укрытие в растении — не видно
  await page.evaluate(() => { NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.teleport(254, 256); });
  await page.keyboard.press('KeyH');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('укрытие H в растении', st.player.action === 'plant_hide', st.player.action);
  await page.evaluate(() => NP_DEBUG.setBoss(300, 250, 'look'));
  await page.waitForTimeout(800);
  st = await page.evaluate(() => NP_DEBUG.state);
  check('в растении не видно', !st.boss.seesPlayer, `sees=${st.boss.seesPlayer}`);

  // 11. Пауза с русской «з»
  await page.keyboard.press('KeyP');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('пауза P', st.mode === 'paused');
  await page.keyboard.press('KeyP');

  // 12. Проверка начальника доходит до стола
  await page.evaluate(() => { NP_DEBUG.teleport(728, 150); NP_DEBUG.setBoss(706, 446, 'office'); });
  await page.keyboard.press('KeyE');
  await page.evaluate(() => { NP_DEBUG.startInspection(true); });
  await page.screenshot({ path: path.join(outDir, '05-alarm.png') });
  await page.evaluate(() => NP_DEBUG.skip(14));
  st = await page.evaluate(() => NP_DEBUG.state);
  check('проверка пройдена в Excel', st.stats.inspectPass >= 1 || st.boss.mode === 'raid', `pass=${st.stats.inspectPass} mode=${st.boss.mode}`);

  // 12b. Телефон (Tab) — открывается и считается прокрастинацией
  await page.evaluate(() => { NP_DEBUG.teleport(520, 260); NP_DEBUG.setBoss(706, 446, 'office'); });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => NP_DEBUG.state);
  check('телефон по Tab', st.player.action === 'phone', st.player.action);
  await page.screenshot({ path: path.join(outDir, '08-phone.png') });
  await page.keyboard.press('KeyQ');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('телефон закрывается Q', st.player.action === 'none', st.player.action);

  // 13. Офисные события: угощение, ксерокс, созвон
  await page.evaluate(() => { NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.startEvent('food'); NP_DEBUG.teleport(120, 244); });
  await page.keyboard.press('KeyE');
  st = await page.evaluate(() => ({ ...NP_DEBUG.state, ev: NP_DEBUG.event }));
  check('событие «угощение»', st.ev && st.ev.used === true && st.player.action === 'eat', JSON.stringify(st.ev));
  await page.screenshot({ path: path.join(outDir, '07-food.png') });
  await page.evaluate(() => { NP_DEBUG.set({ usefulness: 40 }); NP_DEBUG.startEvent('jam'); NP_DEBUG.teleport(460, 456); });
  const kBefore = await page.evaluate(() => NP_DEBUG.state.usefulness);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(3300);
  st = await page.evaluate(() => NP_DEBUG.state);
  check('событие «ксерокс» даёт KPI', st.usefulness > kBefore + 5, `${kBefore.toFixed(1)} → ${st.usefulness.toFixed(1)}`);
  await page.evaluate(() => { NP_DEBUG.setBoss(470, 452, 'look'); NP_DEBUG.startEvent('call'); NP_DEBUG.skip(10); });
  st = await page.evaluate(() => NP_DEBUG.state);
  check('событие «созвон» уводит Д.Н. в кабинет', ['return', 'office'].includes(st.boss.state), st.boss.state);


  // 13b. Новые механики v0.10
  // Туалет: сначала очередь, потом внутрь
  await page.evaluate(() => { NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.teleport(270, 516); });
  await page.keyboard.press('KeyE');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('туалет: сначала очередь', st.player.action === 'queue', st.player.action);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '10-queue.png') });
  await page.evaluate(() => NP_DEBUG.skip(14));
  st = await page.evaluate(() => NP_DEBUG.state);
  check('туалет после очереди', st.stats.toilet === 1, `toilet=${st.stats.toilet} action=${st.player.action}`);

  // Второй ряд отвлекается — Д.Н. идёт отчитывать
  await page.evaluate(() => { NP_DEBUG.teleport(520, 260); NP_DEBUG.forceSlack('aljazira', 'game'); NP_DEBUG.setBoss(728, 380, 'look', -Math.PI / 2); });
  await page.evaluate(() => NP_DEBUG.skip(0.2));
  st = await page.evaluate(() => NP_DEBUG.state);
  check('Д.Н. идёт отчитывать соседа', st.boss.state === 'scold', st.boss.state);
  await page.evaluate(() => NP_DEBUG.skip(5));
  st = await page.evaluate(() => NP_DEBUG.state);
  check('сосед отчитан', st.stats.scolds >= 1, `scolds=${st.stats.scolds}`);
  await page.screenshot({ path: path.join(outDir, '11-scold.png') });

  // Сбор на ДР: минус кайф, KPI не меняется
  const bd = await page.evaluate(() => { NP_DEBUG.set({ fun: 50, usefulness: 50 }); NP_DEBUG.startEvent('bday'); const s = NP_DEBUG.state; return { fun: s.fun, kpi: s.usefulness }; });
  check('сбор на ДР: −кайф, 0 KPI', bd.fun === 40 && bd.kpi === 50, JSON.stringify(bd));
  await page.screenshot({ path: path.join(outDir, '12-bday.png') });

  // Летучка: стоишь у доски — +KPI
  await page.evaluate(() => { NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.clearEvents(); NP_DEBUG.set({ usefulness: 40, adhocDone: true }); NP_DEBUG.startEvent('standup'); NP_DEBUG.teleport(306, 420); });
  await page.keyboard.press('KeyE');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('летучка: встал у доски', st.player.action === 'standup', st.player.action);
  await page.evaluate(() => NP_DEBUG.skip(6));
  await page.screenshot({ path: path.join(outDir, '13-standup.png') });
  await page.evaluate(() => NP_DEBUG.skip(16));
  st = await page.evaluate(() => NP_DEBUG.state);
  check('летучка даёт KPI', st.usefulness > 44, st.usefulness.toFixed(1));

  // Пожарная тревога: эвакуация у выхода
  await page.evaluate(() => { NP_DEBUG.startEvent('drill'); NP_DEBUG.teleport(40, 302); });
  await page.keyboard.press('KeyE');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('тревога: эвакуация', st.player.action === 'evac', st.player.action);
  await page.evaluate(() => NP_DEBUG.skip(26));
  st = await page.evaluate(() => ({ ...NP_DEBUG.state, away: NP_DEBUG.coworkers.filter(c => c.away).length }));
  check('после тревоги вернулся', st.player.action === 'none' && st.away === 0, `${st.player.action} away=${st.away}`);

  // Обед в «Мюнхене»
  await page.evaluate(() => { NP_DEBUG.setClock(13 * 60 + 10); NP_DEBUG.skip(0.2); NP_DEBUG.teleport(40, 302); });
  await page.keyboard.press('KeyE');
  st = await page.evaluate(() => NP_DEBUG.state);
  check('обед: ушёл в «Мюнхен»', st.player.action === 'lunch', st.player.action);
  await page.screenshot({ path: path.join(outDir, '14-lunch.png') });
  await page.evaluate(() => NP_DEBUG.skip(10));
  st = await page.evaluate(() => ({ ...NP_DEBUG.state, flags: NP_DEBUG.flags }));
  check('обед засчитан', st.stats.lunch === 1 && st.flags.fed, JSON.stringify(st.flags));

  // Магазин апгрейдов
  const shop = await page.evaluate(() => { NP_DEBUG.setCoins(100); const ok = NP_DEBUG.buyUpgrade('guitar'); return { ok, coins: NP_DEBUG.coins, owned: NP_DEBUG.owned }; });
  check('апгрейд покупается', shop.ok && shop.coins === 70 && shop.owned.guitar, JSON.stringify(shop));
  await page.evaluate(() => { NP_DEBUG.buyUpgrade('monitor'); NP_DEBUG.buyUpgrade('lava'); NP_DEBUG.teleport(728, 200); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, '15-desk-upgrades.png') });

  // Реальные нажатия: русская раскладка через keyboard.down с кодом клавиши (E/У, H/Р, B/И)
  const rus = await page.evaluate(() => {
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ reprimands: 0, misses: 0, usefulness: 20 }); NP_DEBUG.clearEvents();
    NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.teleport(728, 150);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'у', code: '' }));
    const a1 = NP_DEBUG.state.player.action;
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'у', code: '' }));
    NP_DEBUG.teleport(870, 436);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'у', code: 'KeyE' }));
    const a2 = NP_DEBUG.state.player.action;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'и', code: '' }));
    const a3 = NP_DEBUG.state.player.action;
    return { a1, a2, a3 };
  });
  check('русская раскладка: У — Excel, У — YouTube, И — альт-таб', rus.a1 === 'work' && rus.a2 === 'youtube' && rus.a3 === 'fake', JSON.stringify(rus));

  // Альт-таб спасает, когда Д.Н. уже подозревает
  const at = await page.evaluate(() => {
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ reprimands: 0, misses: 0, usefulness: 20 }); NP_DEBUG.clearEvents();
    NP_DEBUG.skip(11); NP_DEBUG.teleport(870, 436); NP_DEBUG.interact();
    NP_DEBUG.setBoss(830, 436, 'look', 0); NP_DEBUG.skip(0.9);
    const before = NP_DEBUG.state.boss.suspicion;
    const ok = NP_DEBUG.bossKey();
    const s = NP_DEBUG.state;
    return { before, ok, after: s.boss.suspicion, action: s.player.action };
  });
  check('альт-таб сбрасывает подозрение', at.ok && at.before > 0 && at.after === 0 && at.action === 'fake', JSON.stringify(at));

  // Летучка: выбор ответа клавишей 2
  const su = await page.evaluate(() => {
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ reprimands: 0, misses: 0, usefulness: 20 }); NP_DEBUG.clearEvents();
    NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.skip(5); NP_DEBUG.startEvent('standup'); NP_DEBUG.teleport(306, 420); NP_DEBUG.interact();
    for (let i = 0; i < 30 && !(NP_DEBUG.choice && NP_DEBUG.choice.asked); i++) NP_DEBUG.skip(0.5);
    return { ...NP_DEBUG.choice, mode: NP_DEBUG.state.mode, clock: NP_DEBUG.state.clockMinutes, rep: NP_DEBUG.state.reprimands, k: NP_DEBUG.state.usefulness, boss: NP_DEBUG.state.boss.state };
  });
  await page.screenshot({ path: path.join(outDir, '20-standup-choice.png') });
  await page.keyboard.press('Digit2');
  const su2 = await page.evaluate(() => NP_DEBUG.choice);
  check('летучка: вопрос и ответ клавишей 2', su && su.asked && su2 && su2.done, JSON.stringify([su, su2]));
  await page.evaluate(() => NP_DEBUG.skip(20));

  // Стукача больше нет
  check('стукач вырезан', await page.evaluate(() => !window.NP_LINES.snitch));

  // Апгрейды реально работают: KPI в Excel с креслом и монитором, турка, лава, кактус, гитара
  const up = await page.evaluate(() => {
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ reprimands: 0, misses: 0, usefulness: 20 }); NP_DEBUG.clearEvents();
    NP_DEBUG.clearEvents();
    const kpiRate = () => { NP_DEBUG.clearEvents(); NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.set({ usefulness: 20, reprimands: 0, fun: 0 }); NP_DEBUG.teleport(728, 150); NP_DEBUG.interact(); NP_DEBUG.skip(5); const s = NP_DEBUG.state; return { k: s.usefulness - 20, fun: s.fun }; };
    NP_DEBUG.setUpgrades({});
    const base = kpiRate();
    NP_DEBUG.setUpgrades({ chair: true, monitor: true, cactus: true, guitar: true });
    const gear = kpiRate();
    NP_DEBUG.setUpgrades({ turka: true });
    NP_DEBUG.teleport(125, 165); NP_DEBUG.interact();
    const coffee = NP_DEBUG.state.player.coffeeBoost;
    NP_DEBUG.skip(3);
    // шумодав: перфоратор не режет Excel; вентилятор: жара не режет кайф
    NP_DEBUG.setUpgrades({});
    const noiseRate = () => { NP_DEBUG.clearEvents(); NP_DEBUG.startEvent('noise'); NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.set({ usefulness: 20 }); NP_DEBUG.teleport(728, 150); NP_DEBUG.interact(); NP_DEBUG.skip(5); return { k: NP_DEBUG.state.usefulness - 20 }; };
    const noisy = noiseRate();
    NP_DEBUG.setUpgrades({ headphones: true });
    const quiet = noiseRate();
    const funRate = () => { NP_DEBUG.clearEvents(); NP_DEBUG.startEvent('heat'); NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.set({ fun: 0 }); NP_DEBUG.teleport(870, 436); NP_DEBUG.interact(); NP_DEBUG.skip(3); return NP_DEBUG.state.fun; };
    NP_DEBUG.startEvent('heat'); NP_DEBUG.setUpgrades({});
    const hot = funRate();
    NP_DEBUG.skip(6); NP_DEBUG.setUpgrades({ fan: true });
    const fan = funRate();
    NP_DEBUG.skip(6); NP_DEBUG.setUpgrades({});
    return { base, gear, coffee, noisy: noisy.k, quiet: quiet.k, hot, fan };
  });
  check('апгрейды: кресло+монитор ускоряют KPI (×1.38)', Math.abs(up.gear.k / up.base.k - 1.38) < 0.05, JSON.stringify(up));
  check('апгрейды: гитара даёт кайф в Excel', up.gear.fun > 1.5 && up.base.fun < 0.01, JSON.stringify(up));
  check('апгрейды: турка — кофе 24 с', up.coffee === 24, String(up.coffee));
  check('апгрейды: шумодав и вентилятор снимают штрафы', up.quiet > up.noisy * 1.3 && up.fan > up.hot * 1.3, JSON.stringify(up));

  // Камеры СБ: прокрастинация в конусе записывается и докладывается Д.Н.
  const sbr = await page.evaluate(() => {
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ reprimands: 0, misses: 0, usefulness: 20 }); NP_DEBUG.clearEvents();
    NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.startEvent('sb');
    NP_DEBUG.teleport(470, 260); NP_DEBUG.togglePhone();
    for (let i = 0; i < 60 && !NP_DEBUG.state.stats.sbReports; i++) NP_DEBUG.skip(0.25);
    const s = NP_DEBUG.state; NP_DEBUG.togglePhone();
    return { reports: s.stats.sbReports || 0, rep: s.reprimands, sus: Math.round(s.boss.suspicion) };
  });
  check('камеры СБ: доклад = выговор', sbr.reports >= 1 && sbr.rep >= 1, JSON.stringify(sbr));
  await page.screenshot({ path: path.join(outDir, '21-sb-cameras.png') });
  // Музыку можно выключить отдельно от звуков (N / Т и кнопка)
  const mus = await page.evaluate(() => {
    const b = document.querySelector('.music-toggle');
    const t0 = b.textContent;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'т', code: '' }));
    const t1 = b.textContent;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN' }));
    return { t0, t1, t2: b.textContent, stored: localStorage.getItem('nepalsya.music') };
  });
  check('музыка выключается и включается (N / Т)', /вкл/.test(mus.t0) && /выкл/.test(mus.t1) && /вкл \(/.test(mus.t2) && mus.stored === 'true', JSON.stringify(mus));

  // Выговоры и «не застал на месте»
  const wd = await page.evaluate(() => {
    const r = {};
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.clearEvents(); NP_DEBUG.setUpgrades({}); NP_DEBUG.set({ reprimands: 0, misses: 0, usefulness: 20 });
    // 1) нет на месте → Д.Н. ждёт; вернулся вовремя → без промаха
    NP_DEBUG.setBoss(728, 222, 'inspect'); NP_DEBUG.teleport(470, 260); NP_DEBUG.deskCheck();
    r.state = NP_DEBUG.state.boss.state; r.wait = NP_DEBUG.state.boss.waitT;
    NP_DEBUG.teleport(728, 150); NP_DEBUG.interact(); NP_DEBUG.skip(0.3);
    r.back = { misses: NP_DEBUG.state.misses, boss: NP_DEBUG.state.boss.state };
    // 2) не вернулся → промах
    NP_DEBUG.setBoss(728, 222, 'inspect'); NP_DEBUG.teleport(470, 260); NP_DEBUG.deskCheck(); NP_DEBUG.skip(5);
    r.missed = NP_DEBUG.state.misses;
    // 3) 5-й промах на «Сотруднике» → выговор
    NP_DEBUG.set({ misses: 4 });
    NP_DEBUG.setBoss(728, 222, 'inspect'); NP_DEBUG.teleport(470, 260); NP_DEBUG.deskCheck(); NP_DEBUG.skip(5);
    r.afterLimit = { misses: NP_DEBUG.state.misses, rep: NP_DEBUG.state.reprimands };
    // 4) кактус: Д.Н. ждёт дольше
    NP_DEBUG.setUpgrades({ cactus: true }); NP_DEBUG.setBoss(728, 222, 'inspect'); NP_DEBUG.deskCheck(); r.cactusWait = NP_DEBUG.state.boss.waitT;
    NP_DEBUG.setUpgrades({}); NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.set({ reprimands: 0, misses: 0 });
    return r;
  });
  check('пустой стол: Д.Н. ждёт у стола', wd.state === 'waitDesk' && wd.wait === 2.5, JSON.stringify(wd));
  check('успел вернуться — без промаха', wd.back.misses === 0 && wd.back.boss !== 'waitDesk', JSON.stringify(wd.back));
  check('не вернулся — «не застал» +1', wd.missed === 1, String(wd.missed));
  check('лимит 5 «не застал» → выговор', wd.afterLimit.misses === 0 && wd.afterLimit.rep === 1, JSON.stringify(wd.afterLimit));
  check('апгрейд кактус: Д.Н. ждёт дольше', wd.cactusWait === 4, String(wd.cactusWait));
  await page.evaluate(() => { NP_DEBUG.setBoss(728, 222, 'inspect'); NP_DEBUG.teleport(470, 260); NP_DEBUG.deskCheck(); NP_DEBUG.skip(1); });
  await page.screenshot({ path: path.join(outDir, '22-where-is-bykentiy.png') });
  await page.evaluate(() => { NP_DEBUG.teleport(728, 150); NP_DEBUG.interact(); NP_DEBUG.skip(0.5); NP_DEBUG.set({ misses: 0 }); });

  // План: сверх плана работа идёт с отдачей ×0.25
  const pl = await page.evaluate(() => {
    const t = NP_DEBUG.state.planTarget;
    NP_DEBUG.set({ usefulness: t - 2 }); NP_DEBUG.addWork(10);
    return { t, after: NP_DEBUG.state.usefulness };
  });
  check('сверх плана — отдача ×0.25', Math.abs(pl.after - (pl.t + 2)) < 0.01, JSON.stringify(pl));

  // Маджикистан: посидеть в Excel — +KPI
  const mj = await page.evaluate(() => {
    NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.set({ usefulness: 40, adhocDone: true }); NP_DEBUG.startEvent('majik');
    NP_DEBUG.teleport(728, 150); NP_DEBUG.interact(); NP_DEBUG.skip(5);
    return { used: NP_DEBUG.event && NP_DEBUG.event.used, k: NP_DEBUG.state.usefulness };
  });
  check('Маджикистан поднят из Excel', mj.used && mj.k > 48, JSON.stringify(mj));

  // 14. Прогон всей смены
  await page.evaluate(() => NP_DEBUG.skip(260));
  await page.waitForTimeout(300);
  st = await page.evaluate(() => NP_DEBUG.state);
  check('смена завершается', st.mode === 'ended', st.mode);
  await page.screenshot({ path: path.join(outDir, '06-end.png') });
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(200);
  check('магазин открывается по U', await page.evaluate(() => !document.getElementById('shop-overlay').classList.contains('hidden')));
  await page.screenshot({ path: path.join(outDir, '16-shop.png') });
  await page.keyboard.press('Escape');

  // 15. Пятница: после 17:00 Директор уезжает
  await page.evaluate(() => NP_DEBUG.setDay(4));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.evaluate(() => { for (let i = 0; i < 20; i++) { NP_DEBUG.set({ usefulness: 90, reprimands: 0, misses: 0 }); NP_DEBUG.teleport(870, 230); NP_DEBUG.skip(10); } });
  st = await page.evaluate(() => NP_DEBUG.state);
  check('пятница: Д.Н. уезжает после 17:00', ['leaving', 'gone'].includes(st.boss.state), `${st.boss.state} @ ${Math.round(st.clockMinutes)}`);
  await page.screenshot({ path: path.join(outDir, '09-friday.png') });

  // 16. Пятничное пиво в «Мюнхене» завершает неделю
  const beer = await page.evaluate(() => {
    if (NP_DEBUG.state.mode !== 'playing') return 'not playing: ' + NP_DEBUG.state.mode;
    NP_DEBUG.forceBeer(); NP_DEBUG.setClock(17 * 60 + 20); NP_DEBUG.skip(0.2);
    NP_DEBUG.teleport(40, 302); NP_DEBUG.interact();
    return NP_DEBUG.state.mode;
  });
  check('пятничное пиво завершает смену', beer === 'ended', beer);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, '17-munich.png') });

  // Три выговора → увольнение; план не сделан к 19:30 → выговор
  const fin = await page.evaluate(() => {
    NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    NP_DEBUG.set({ usefulness: 0, reprimands: 1 }); NP_DEBUG.finish('win');
    const a = { mode: NP_DEBUG.state.mode, rep: NP_DEBUG.state.reprimands };
    NP_DEBUG.restart(); NP_DEBUG.clearEvents(); NP_DEBUG.reprimand('тест', 'тест'); NP_DEBUG.reprimand('тест', 'тест'); NP_DEBUG.reprimand('тест', 'тест');
    return { a, rep3: NP_DEBUG.state.reprimands };
  });
  await page.waitForTimeout(1200);
  const firedMode = await page.evaluate(() => NP_DEBUG.state.mode);
  check('план не сделан → выговор', fin.a.mode === 'ended' && fin.a.rep === 2, JSON.stringify(fin));
  check('3 выговора → уволен', fin.rep3 === 3 && firedMode === 'ended', firedMode);
  await page.screenshot({ path: path.join(outDir, '23-fired.png') });

  // Прогрессия по неделе: в понедельник только ядро, в четверг открыто больше
  const prog = await page.evaluate(() => {
    localStorage.setItem('nepalsya.weekDone', 'false');
    NP_DEBUG.setDay(0); NP_DEBUG.restart();
    const mon = { u: NP_DEBUG.unlocked, q: NP_DEBUG.eventQueue.length, remote: NP_DEBUG.coworkers.filter(c => c.away).length, statists: NP_DEBUG.coworkers.filter(c => ['asel', 'aljazira', 'stazy'].includes(c.id) && !c.away).length, todo: NP_DEBUG.state.todo.map(t => t.id) };
    NP_DEBUG.setDay(3); NP_DEBUG.restart();
    const thu = { u: NP_DEBUG.unlocked, q: NP_DEBUG.eventQueue.length, away: NP_DEBUG.coworkers.filter(c => c.away).length, todo: NP_DEBUG.state.todo.map(t => t.id) };
    localStorage.setItem('nepalsya.weekDone', 'true');
    return { mon, thu };
  });
  check('понедельник: только ядро (без событий, коллег, обеда, второго ряда)', prog.mon.q === 0 && !prog.mon.u.coworkers && !prog.mon.u.lunch && prog.mon.remote === 1 && prog.mon.statists === 3 && prog.mon.todo.includes('coffee1'), JSON.stringify(prog.mon));
  check('четверг: второй ряд, летучка, события открыты', prog.thu.u.row2 && prog.thu.u.standup && prog.thu.q > 3 && prog.thu.away === 0 && prog.thu.todo.includes('majik'), JSON.stringify(prog.thu));
  await page.screenshot({ path: path.join(outDir, '24-thursday-card.png') });

  // Тигран — дух офиса: сидит всегда, не отвлекается, «Поехали!» обнуляет подозрение
  const tig = await page.evaluate(() => {
    NP_DEBUG.setDay(0); NP_DEBUG.restart();
    const mon = NP_DEBUG.coworkers.find(c => c.id === 'tigran');
    NP_DEBUG.startEvent('drill');
    const t = NP_DEBUG.coworkers.find(c => c.id === 'tigran');
    NP_DEBUG.setSuspicion(70); NP_DEBUG.chatPerk('tigran');
    const sus = NP_DEBUG.state.boss.suspicion;
    const desk = window.NP_WORLD ? NP_WORLD.desks.find(d => d.id === 'r2_1').owner : 'tigran';
    return { monAway: mon.away, slack: t.slack, sus, desk, title: document.title };
  });
  await new Promise(r => setTimeout(r, 1500));
  const tigDrill = await page.evaluate(() => NP_DEBUG.coworkers.find(c => c.id === 'tigran').away);
  check('Тигран: сидит с понедельника, на учениях не уходит', !tig.monAway && !tigDrill && !tig.slack, JSON.stringify(tig) + ' drill:' + tigDrill);
  check('Тигран: «Поехали!» обнуляет подозрение', tig.sus === 0, String(tig.sus));
  await page.evaluate(() => { NP_DEBUG.clearEvents && NP_DEBUG.clearEvents(); });
  await new Promise(r => setTimeout(r, 600));
  { const box = await page.$eval('#game', el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width }; });
    const k = box.w / 960; await page.screenshot({ path: path.join(outDir, '25-tigran.png'), clip: { x: box.x + 340 * k, y: box.y + 230 * k, width: 160 * k, height: 130 * k } }); }
  check('стол r2_1 — Тиграна, в заголовке «Не пались»', tig.desk === 'tigran' && tig.title.startsWith('Не пались'), JSON.stringify(tig));

  // Асель и Альджазира — статисты: сидят всегда, болтать с ними нельзя; соседи перекидываются фразами
  const stat = await page.evaluate(() => {
    NP_DEBUG.setDay(0); NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    const zones = NP_DEBUG.zones;
    const talk = NP_DEBUG.banterNow();
    return { noChat: !zones.includes('chat_asel') && !zones.includes('chat_aljazira') && !zones.includes('chat_stazy'), sirgeyChat: zones.includes('chat_sirgey'), banter: window.NP_LINES.banter.length, talk };
  });
  check('Асель, Альджазира и Штази — статисты без болтовни', stat.noChat && stat.sirgeyChat, JSON.stringify(stat));
  check('перепалка соседей: реплика и ответ', stat.banter >= 10 && stat.talk.length >= 2, JSON.stringify(stat.talk));

  // 17:00: подсказка про план, если отстаёшь
  const pw = await page.evaluate(async () => {
    NP_DEBUG.setDay(1); NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    NP_DEBUG.setClock(17 * 60 + 2);
    await new Promise(r => setTimeout(r, 200));
    return { warned: NP_DEBUG.planWarned, toast: document.getElementById('toast').textContent };
  });
  // Проверки по замечаниям код-ревью (P1/P2):
  // 1. Лимит кайфа 100 (включая пятничное пиво)
  const funCap = await page.evaluate(() => {
    NP_DEBUG.set({ fun: 95 });
    NP_DEBUG.set({ fun: 150 });
    const directCap = NP_DEBUG.state.fun;
    // Пятничное пиво при 90 кайфа должно дать максимум 100, а не 115
    NP_DEBUG.setDay(4); NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    NP_DEBUG.set({ fun: 90 });
    NP_DEBUG.forceBeer(); NP_DEBUG.setClock(17 * 60 + 20); NP_DEBUG.skip(0.2);
    NP_DEBUG.teleport(40, 302); NP_DEBUG.interact();
    const beerFun = NP_DEBUG.state.fun;
    return { directCap, beerFun, mode: NP_DEBUG.state.mode };
  });
  check('кайф ограничен максимумом 100 (включая пятничное пиво)', funCap.directCap <= 100 && funCap.beerFun <= 100 && funCap.mode === 'ended', JSON.stringify(funCap));

  // 2. Кулер: лимит 4 стакана, +6 кайфа в жару, перезарядка синхронна игровым часам (30 минут)
  const waterTests = await page.evaluate(() => {
    NP_DEBUG.setDay(0); NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    // 2a. В жару вода даёт +6 кайфа
    NP_DEBUG.startEvent('heat');
    NP_DEBUG.set({ fun: 50, waterCups: 4 });
    NP_DEBUG.teleport(193, 235);
    NP_DEBUG.interact();
    NP_DEBUG.skip(2.0); // завершить питьё (1.8 с)
    const heatGain = NP_DEBUG.state.fun - 50;
    // 2b. Опустошение кулера (4 стакана) и перезарядка
    NP_DEBUG.clearEvents();
    NP_DEBUG.set({ waterCups: 1, waterRecharge: 0 });
    NP_DEBUG.teleport(193, 235);
    NP_DEBUG.interact(); // пьём последний 4-й стакан
    NP_DEBUG.skip(2.0);
    const emptyCups = NP_DEBUG.state.waterCups;
    const startRecharge = NP_DEBUG.state.waterRecharge; // 30 игровых минут
    // 6 секунд игры = 16 игровых минут
    NP_DEBUG.skip(6.0);
    const midRecharge = NP_DEBUG.state.waterRecharge;
    // Ещё 6 секунд (> 11.25 с реального времени = 30 игровых минут)
    NP_DEBUG.skip(6.0);
    const endCups = NP_DEBUG.state.waterCups;
    const endRecharge = NP_DEBUG.state.waterRecharge;
    return { heatGain, emptyCups, startRecharge, midRecharge, endCups, endRecharge };
  });
  check('кулер: в жару +6 кайфа, опустошение на 4 стаканах и перезарядка 30 игровых минут', waterTests.heatGain === 6 && waterTests.emptyCups === 0 && Math.abs(waterTests.startRecharge - 30) < 6 && waterTests.midRecharge > 5 && waterTests.midRecharge < 20 && waterTests.endCups === 4 && waterTests.endRecharge <= 0, JSON.stringify(waterTests));

  // 3. Кофемашина: ремонт требует 2.8 с, не даёт награды преждевременно, отмена не даёт KPI
  const coffeeTiming = await page.evaluate(() => {
    NP_DEBUG.setDay(0); NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    NP_DEBUG.set({ usefulness: 10, fun: 50, coffeeJammed: true, coffeeQueueTimer: 0 });
    NP_DEBUG.teleport(125, 165);
    NP_DEBUG.interact(); // старт fix_coffee (2.8 с)
    const startAction = NP_DEBUG.state.player.action;
    const startJammed = NP_DEBUG.state.coffeeJammed;
    const startKpi = NP_DEBUG.state.usefulness;
    // Отмена через 1 секунду (отойти от зоны кофемашины)
    NP_DEBUG.skip(1.0);
    NP_DEBUG.teleport(200, 200);
    const cancelJammed = NP_DEBUG.state.coffeeJammed;
    const cancelKpi = NP_DEBUG.state.usefulness;
    // Полный ремонт
    NP_DEBUG.teleport(125, 165);
    NP_DEBUG.interact();
    NP_DEBUG.skip(3.0);
    const doneJammed = NP_DEBUG.state.coffeeJammed;
    const doneKpi = NP_DEBUG.state.usefulness;
    const doneFun = NP_DEBUG.state.fun;
    return { startAction, startJammed, startKpi, cancelJammed, cancelKpi, doneJammed, doneKpi, doneFun };
  });
  check('кофемашина: ремонт длится 2.8 с, преждевременно не начисляет KPI, завершается корректно', coffeeTiming.startAction === 'fix_coffee' && coffeeTiming.startJammed && coffeeTiming.startKpi === 10 && coffeeTiming.cancelJammed && coffeeTiming.cancelKpi === 10 && !coffeeTiming.doneJammed && coffeeTiming.doneKpi === 13 && coffeeTiming.doneFun === 53, JSON.stringify(coffeeTiming));

  // 4. Альджазира (Начальник Маджикистана): визит и проверка катастрофы аудита
  const alj = await page.evaluate(() => {
    NP_DEBUG.setDay(0); NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    NP_DEBUG.set({ fun: 50, usefulness: 50 });
    NP_DEBUG.triggerAljazira(true); // форсируем катастрофу аудита
    for (let i = 0; i < 40; i++) NP_DEBUG.skip(0.1);
    const s = NP_DEBUG.state;
    return { fun: s.fun, kpi: s.usefulness };
  });
  check('Альджазира: аудит Маджикистана сбрасывает кайф и план в 0', alj.fun === 0 && alj.kpi === 0, JSON.stringify(alj));

  // 5. Сверхурочные: ~30 с Excel после плана снимают сегодняшний выговор, раз в смену
  const otThreshold = await page.evaluate(() => {
    NP_DEBUG.setDay(0); NP_DEBUG.clearSavedProgress(); NP_DEBUG.restart(); NP_DEBUG.clearEvents(); NP_DEBUG.setUpgrades({});
    NP_DEBUG.setBoss(706, 446, 'office');
    NP_DEBUG.set({ usefulness: 60, reprimands: 1, weekReprimands: 1, fun: 50, overtimeWork: 0 });
    NP_DEBUG.teleport(728, 150); NP_DEBUG.interact();
    NP_DEBUG.skip(10);
    const midRep = NP_DEBUG.state.reprimands, midWork = NP_DEBUG.state.overtimeWork;
    NP_DEBUG.set({ overtimeWork: 29 }); NP_DEBUG.skip(2);
    const endRep = NP_DEBUG.state.reprimands, endWRep = NP_DEBUG.state.weekReprimands;
    NP_DEBUG.set({ reprimands: 1, overtimeWork: 29 }); NP_DEBUG.skip(2);
    const secondRep = NP_DEBUG.state.reprimands;
    NP_DEBUG.set({ reprimands: 0, weekReprimands: 0 });
    return { midRep, midWork, endRep, endWRep, secondRep };
  });
  check('сверхурочные: 30 с после плана снимают выговор, раз в смену', otThreshold.midRep === 1 && otThreshold.midWork > 5 && otThreshold.endRep === 0 && otThreshold.endWRep === 0 && otThreshold.secondRep === 1, JSON.stringify(otThreshold));

  // Приспичило: шкала растёт, туалет снимает, не дотерпел — минус кайф
  const pee = await page.evaluate(() => {
    NP_DEBUG.setDay(2); NP_DEBUG.clearSavedProgress(); NP_DEBUG.restart(); NP_DEBUG.clearEvents(); NP_DEBUG.hideBanner();
    NP_DEBUG.setBoss(706, 446, 'office');
    const plan = NP_DEBUG.pee.left;
    NP_DEBUG.forcePee(10); NP_DEBUG.teleport(470, 260); NP_DEBUG.skip(5);
    const rose = NP_DEBUG.pee.pee;
    NP_DEBUG.set({ fun: 50 }); NP_DEBUG.forcePee(99); NP_DEBUG.skip(1);
    const failFun = NP_DEBUG.state.fun, afterFail = NP_DEBUG.pee.active;
    NP_DEBUG.forcePee(40); NP_DEBUG.teleport(267, 518); NP_DEBUG.interact(); NP_DEBUG.skip(20);
    return { plan, rose, failFun, afterFail, relieved: !NP_DEBUG.pee.active };
  });
  check('приспичило: 2–3 раза, шкала растёт, туалет снимает, конфуз −15 кайфа', pee.plan >= 2 && pee.plan <= 3 && pee.rose > 15 && pee.failFun === 35 && !pee.afterFail && pee.relieved, JSON.stringify(pee));

  // Сохранение: флаги дня, список дел и счётчики восстанавливаются
  const sv = await page.evaluate(() => {
    NP_DEBUG.setDay(2); NP_DEBUG.clearSavedProgress(); NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    NP_DEBUG.setClock(14 * 60 + 10); NP_DEBUG.skip(0.1); NP_DEBUG.set({ usefulness: 33, fun: 44, reprimands: 1, weekReprimands: 2, waterCups: 1 });
    const todoIds = NP_DEBUG.state.todo.map(t => t.id).join();
    NP_DEBUG.saveProgress(); NP_DEBUG.restart();
    const s = NP_DEBUG.state;
    const r = { clock: s.clockMinutes, u: s.usefulness, f: s.fun, rep: s.reprimands, w: s.weekReprimands, water: s.waterCups, sameTodo: s.todo.map(t => t.id).join() === todoIds, lunchCalled: NP_DEBUG.flags.lunchCalled };
    NP_DEBUG.clearSavedProgress(); NP_DEBUG.set({ reprimands: 0, weekReprimands: 0 });
    return r;
  });
  check('сохранение восстанавливает время, счётчики, флаги дня и список дел', Math.abs(sv.clock - 850.27) < 0.1 && sv.u === 33 && sv.f === 44 && sv.rep === 1 && sv.w === 2 && sv.water === 1 && sv.sameTodo && sv.lunchCalled, JSON.stringify(sv));

  // Укрытие не бесконечное: через 25 с «хвостик торчит», потом 20 с нельзя прятаться
  const hd = await page.evaluate(() => {
    NP_DEBUG.setDay(0); NP_DEBUG.clearSavedProgress(); NP_DEBUG.restart(); NP_DEBUG.clearEvents(); NP_DEBUG.setBoss(706, 446, 'office');
    const p = NP_DEBUG.state; NP_DEBUG.teleport(776, 276); NP_DEBUG.quickHide();
    const hid = NP_DEBUG.state.player.action; NP_DEBUG.skip(26);
    const out = NP_DEBUG.state.player.action; NP_DEBUG.quickHide();
    return { hid, out, again: NP_DEBUG.state.player.action };
  });
  check('укрытие: через 25 с выгоняет, повторно сразу нельзя', hd.hid === 'plant_hide' && hd.out === 'none' && hd.again === 'none', JSON.stringify(hd));

  // Альджазира ходит по навигационному графу, не сквозь столы
  const aw = await page.evaluate(() => {
    NP_DEBUG.setDay(3); NP_DEBUG.clearSavedProgress(); NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.teleport(470, 260);
    NP_DEBUG.triggerAljazira(false);
    let inWall = 0, arrived = false;
    for (let i = 0; i < 400; i++) { NP_DEBUG.skip(0.05); const a = NP_DEBUG.aljazira; if (a.walking && NP_DEBUG.blocked(a.x, a.y, 3)) inWall++; if (a.phase === 'confront') arrived = true; if (!a.visiting && arrived) break; }
    return { inWall, arrived, back: !NP_DEBUG.aljazira.visiting };
  });
  check('Альджазира ходит в обход мебели и возвращается', aw.inWall === 0 && aw.arrived && aw.back, JSON.stringify(aw));

  // 6. Сложность игры: конфигурация и фактическая проверка лимита выговоров
  const diffs = await page.evaluate(async () => {
    const cfg = NP_DEBUG.diffConfig;
    // Фактическая проверка лёгкой сложности: 3 выговора не увольняют, 4-й увольняет
    NP_DEBUG.setDay(0); NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    NP_DEBUG.setDifficulty('easy');
    NP_DEBUG.reprimand('тест1', 'тест1');
    NP_DEBUG.reprimand('тест2', 'тест2');
    NP_DEBUG.reprimand('тест3', 'тест3');
    await new Promise(r => setTimeout(r, 1100));
    const after3Mode = NP_DEBUG.state.mode;
    const after3Rep = NP_DEBUG.state.reprimands;
    NP_DEBUG.reprimand('тест4', 'тест4');
    await new Promise(r => setTimeout(r, 1100));
    const after4Mode = NP_DEBUG.state.mode;
    const after4Rep = NP_DEBUG.state.reprimands;
    NP_DEBUG.setDifficulty('normal'); // вернуть normal

    return {
      easy: { dMax: cfg.easy.dayReprimandsMax, wMax: cfg.easy.weekReprimandsMax },
      norm: { dMax: cfg.normal.dayReprimandsMax, wMax: cfg.normal.weekReprimandsMax },
      hard: { dMax: cfg.hard.dayReprimandsMax, wMax: cfg.hard.weekReprimandsMax },
      after3Mode, after3Rep, after4Mode, after4Rep
    };
  });
  check('сложность игры: настраивает лимиты выговоров и на лёгкой 3 выговора не увольняют, а 4-й увольняет', diffs.easy.dMax === 4 && diffs.easy.wMax === 7 && diffs.norm.dMax === 3 && diffs.norm.wMax === 5 && diffs.hard.dMax === 2 && diffs.hard.wMax === 4 && diffs.after3Mode === 'playing' && diffs.after3Rep === 3 && diffs.after4Mode === 'ended' && diffs.after4Rep === 4, JSON.stringify(diffs));

  // 7. Автосохранение: время shiftTime и состояние полностью восстанавливаются без сброса на 08:50
  const autosaveSync = await page.evaluate(() => {
    NP_DEBUG.setDay(1); NP_DEBUG.restart(); NP_DEBUG.clearEvents();
    NP_DEBUG.setClock(14 * 60 + 30); // 14:30
    NP_DEBUG.set({ usefulness: 45, fun: 70, reprimands: 1, weekReprimands: 2, waterCups: 2, waterRecharge: 15, coffeeCups: 1, coffeeJammed: true, adhocDone: true, misses: 2, overtimeWork: 8, excelWorkAcc: 6, excelPoolTasks: 1 });
    NP_DEBUG.saveProgress();
    // Перезапуск восстанавливает сохранённый прогресс
    NP_DEBUG.restart();
    const afterLoadClock = NP_DEBUG.state.clockMinutes;
    // Тик игры: проверяем, что shiftTime не сброшен на 08:50
    NP_DEBUG.skip(0.2);
    const afterTickClock = NP_DEBUG.state.clockMinutes;
    const s = NP_DEBUG.state;
    NP_DEBUG.clearSavedProgress();
    return {
      afterLoadClock,
      afterTickClock,
      clockPreserved: Math.abs(afterTickClock - 870) < 5,
      usefulness: s.usefulness,
      fun: s.fun,
      reprimands: s.reprimands,
      weekReprimands: s.weekReprimands,
      waterCups: s.waterCups,
      waterRecharge: s.waterRecharge,
      coffeeCups: s.coffeeCups,
      coffeeJammed: s.coffeeJammed,
      adhocDone: s.adhocDone,
      misses: s.misses,
      overtimeWork: s.overtimeWork,
      excelWorkAcc: s.excelWorkAcc,
      excelPoolTasks: s.excelPoolTasks,
    };
  });
  check('автосохранение: время shiftTime и состояние полностью восстанавливаются', autosaveSync.clockPreserved && autosaveSync.usefulness === 45 && autosaveSync.fun === 70 && autosaveSync.reprimands === 1 && autosaveSync.weekReprimands === 2 && autosaveSync.waterCups === 2 && Math.abs(autosaveSync.waterRecharge - 15) < 1 && autosaveSync.coffeeJammed && autosaveSync.adhocDone && autosaveSync.overtimeWork === 8, JSON.stringify(autosaveSync));

  check('нет ошибок в консоли', errors.length === 0, errors.join(' | '));

  // Небольшие экраны: крупный интерфейс в Canvas, меню прокручивается, кнопка старта достижима
  for (const [name, vp, mobile] of [['iPhone 13 альбом', { width: 844, height: 390 }, true], ['ноутбук 1280×720', { width: 1280, height: 609 }, false]]) {
    const ctx2 = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 3 : 1, hasTouch: mobile, isMobile: mobile });
    const p2 = await ctx2.newPage();
    const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
    await p2.goto(url); await p2.waitForTimeout(500);
    const r = await p2.evaluate(() => {
      const ov = document.getElementById('screen-overlay');
      const btn = document.getElementById('start-btn');
      btn.scrollIntoView({ block: 'nearest' });
      const b = btn.getBoundingClientRect();
      const box = document.getElementById('game').getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(document.querySelector('.title-card p')).fontSize);
      return { ui: NP_DEBUG.ui, overflow: getComputedStyle(ov).overflowY, btnVisible: b.top >= 0 && b.bottom <= innerHeight, canvasH: Math.round(Math.min(box.height, box.width * 9 / 16)), fs };
    });
    const minCss = 8.5 * r.ui.UI * r.ui.unitPx;
    check(`${name}: основной текст Canvas ≥ 12 px, меню прокручивается`, minCss >= 11.9 && r.overflow === 'auto' && r.btnVisible && r.fs >= 13 && errs2.length === 0, JSON.stringify({ ...r, minCss: +minCss.toFixed(1), errs2 }));
    await p2.screenshot({ path: path.join(outDir, `26-${mobile ? 'phone' : 'laptop'}-menu.png`) });
    await ctx2.close();
  }
  await browser.close();

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.detail && !r.ok ? ' — ' + r.detail : ''}`);
  }
  console.log(`\n${results.length - failed}/${results.length} проверок пройдено. Скриншоты: ${outDir}`);
  process.exit(failed ? 1 : 0);
})();
