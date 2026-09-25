// Автоматическая проверка игры в headless Chromium (dev-инструмент, игре не нужен).
// Запуск: node scripts/qa.js [папка-для-скриншотов]
// Требует Playwright (npm i -g playwright или локально).
const path = require('path');
const fs = require('fs');

function loadPlaywright() {
  const candidates = ['playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const c of candidates) { try { return require(c); } catch (_) { /* next */ } }
  throw new Error('Playwright не найден: npm i -g playwright');
}

(async () => {
  const { chromium } = loadPlaywright();
  const outDir = process.argv[2] || path.join(__dirname, '..', '.qa');
  fs.mkdirSync(outDir, { recursive: true });
  const url = 'file://' + path.join(__dirname, '..', 'index.html');
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

  // 2. Первый запуск: онбординг, листание стрелками, старт с последнего слайда
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  let onb = await page.evaluate(() => NP_DEBUG.onboarding);
  check('онбординг при первом запуске', onb.open && onb.i === 0, JSON.stringify(onb));
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  onb = await page.evaluate(() => NP_DEBUG.onboarding);
  check('онбординг листается стрелками', onb.i === 2, JSON.stringify(onb));
  await page.screenshot({ path: path.join(outDir, '18-onboarding.png') });
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
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

  // 7. Начальник смотрит, как работаешь — KPI растёт быстрее
  const watched = await page.evaluate(() => {
    const before = NP_DEBUG.state.usefulness;
    NP_DEBUG.setBoss(728, 228, 'look');
    return before;
  });
  await page.waitForTimeout(1500);
  st = await page.evaluate(() => NP_DEBUG.state);
  check('KPI ускоряется при начальнике', st.usefulness - watched > 4, `${watched.toFixed(1)} → ${st.usefulness.toFixed(1)}`);
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
  await page.evaluate(() => { NP_DEBUG.startInspection(); });
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

  // Второй ряд проёбывается — Д.Н. идёт отчитывать
  await page.evaluate(() => { NP_DEBUG.teleport(520, 260); NP_DEBUG.forceSlack('yerzhan', 'game'); NP_DEBUG.setBoss(728, 380, 'look', -Math.PI / 2); });
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
  await page.evaluate(() => { NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.startEvent('standup'); NP_DEBUG.teleport(306, 420); NP_DEBUG.set({ usefulness: 40 }); });
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
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ stealth: 90, usefulness: 60 }); NP_DEBUG.clearEvents();
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
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ stealth: 90, usefulness: 60 }); NP_DEBUG.clearEvents();
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
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ stealth: 90, usefulness: 60 }); NP_DEBUG.clearEvents();
    NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.skip(5); NP_DEBUG.startEvent('standup'); NP_DEBUG.teleport(306, 420); NP_DEBUG.interact();
    for (let i = 0; i < 30 && !(NP_DEBUG.choice && NP_DEBUG.choice.asked); i++) NP_DEBUG.skip(0.5);
    return { ...NP_DEBUG.choice, mode: NP_DEBUG.state.mode, clock: NP_DEBUG.state.clockMinutes, st: NP_DEBUG.state.stealth, k: NP_DEBUG.state.usefulness, boss: NP_DEBUG.state.boss.state };
  });
  await page.screenshot({ path: path.join(outDir, '20-standup-choice.png') });
  await page.keyboard.press('Digit2');
  const su2 = await page.evaluate(() => NP_DEBUG.choice);
  check('летучка: вопрос и ответ клавишей 2', su && su.asked && su2 && su2.done, JSON.stringify([su, su2]));
  await page.evaluate(() => NP_DEBUG.skip(20));

  // Стукач Ержан: видит, как ты сидишь в телефоне рядом, и сдаёт
  const sn = await page.evaluate(() => {
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ stealth: 90, usefulness: 60 }); NP_DEBUG.clearEvents();
    NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.teleport(728, 380); NP_DEBUG.togglePhone();
    for (let i = 0; i < 40 && !NP_DEBUG.state.stats.snitched; i++) NP_DEBUG.skip(0.5);
    const s = NP_DEBUG.state; NP_DEBUG.togglePhone();
    return { snitched: s.stats.snitched || 0, boss: s.boss.state };
  });
  check('стукач Ержан сдаёт Д.Н.', sn.snitched >= 1, JSON.stringify(sn));

  // Апгрейды реально работают: KPI в Excel с креслом и монитором, турка, лава, кактус, гитара
  const up = await page.evaluate(() => {
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ stealth: 90, usefulness: 60 }); NP_DEBUG.clearEvents();
    NP_DEBUG.clearEvents();
    const kpiRate = () => { NP_DEBUG.clearEvents(); NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.set({ usefulness: 20, stealth: 50, fun: 0 }); NP_DEBUG.teleport(728, 150); NP_DEBUG.interact(); NP_DEBUG.skip(5); const s = NP_DEBUG.state; return { k: s.usefulness - 20, st: s.stealth - 50, fun: s.fun }; };
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
  check('апгрейды: кактус ускоряет незаметность, гитара даёт кайф', up.gear.st > up.base.st * 1.8 && up.gear.fun > 1.5 && up.base.fun < 0.01, JSON.stringify(up));
  check('апгрейды: турка — кофе 24 с', up.coffee === 24, String(up.coffee));
  check('апгрейды: шумодав и вентилятор снимают штрафы', up.quiet > up.noisy * 1.3 && up.fan > up.hot * 1.3, JSON.stringify(up));

  // Камеры СБ: прокрастинация в конусе записывается и докладывается Д.Н.
  const sbr = await page.evaluate(() => {
    NP_DEBUG.setClock(11 * 60); NP_DEBUG.set({ stealth: 90, usefulness: 60 }); NP_DEBUG.clearEvents();
    NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.startEvent('sb');
    NP_DEBUG.teleport(470, 260); NP_DEBUG.togglePhone();
    for (let i = 0; i < 60 && !NP_DEBUG.state.stats.sbReports; i++) NP_DEBUG.skip(0.25);
    const s = NP_DEBUG.state; NP_DEBUG.togglePhone();
    return { reports: s.stats.sbReports || 0, stealth: Math.round(s.stealth), sus: Math.round(s.boss.suspicion) };
  });
  check('камеры СБ докладывают о прокрастинации', sbr.reports >= 1 && sbr.stealth <= 82, JSON.stringify(sbr));
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

  // Автопилот: Викентий сам играет, скорость времени
  const ap = await page.evaluate(() => {
    NP_DEBUG.setTimeScale(2);
    NP_DEBUG.startAutopilot();
    const x0 = NP_DEBUG.state.player.x;
    let moved = 0, acts = new Set();
    for (let i = 0; i < 120; i++) { NP_DEBUG.skip(0.5); const s = NP_DEBUG.state; moved = Math.max(moved, Math.abs(s.player.x - x0)); acts.add(s.player.action); }
    const r = { on: NP_DEBUG.auto.on, moved, acts: [...acts], ts: NP_DEBUG.timeScale };
    NP_DEBUG.stopAutopilot(); NP_DEBUG.setTimeScale(1);
    return r;
  });
  check('автопилот играет сам', ap.on && ap.moved > 100 && ap.acts.length >= 3 && ap.ts === 2, JSON.stringify(ap));
  await page.screenshot({ path: path.join(outDir, '19-autopilot.png') });

  // Маджикистан: посидеть в Excel — +KPI
  const mj = await page.evaluate(() => {
    NP_DEBUG.setBoss(706, 446, 'office'); NP_DEBUG.set({ usefulness: 40 }); NP_DEBUG.startEvent('majik');
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
  await page.evaluate(() => { for (let i = 0; i < 20; i++) { NP_DEBUG.set({ usefulness: 90, stealth: 90 }); NP_DEBUG.teleport(870, 230); NP_DEBUG.skip(10); } });
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

  check('нет ошибок в консоли', errors.length === 0, errors.join(' | '));
  await browser.close();

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.detail && !r.ok ? ' — ' + r.detail : ''}`);
  }
  console.log(`\n${results.length - failed}/${results.length} проверок пройдено. Скриншоты: ${outDir}`);
  process.exit(failed ? 1 : 0);
})();
