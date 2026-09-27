'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadPlaywright } = require('./pw');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  const output = path.join(__dirname, '..', '.qa');
  const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
  page.on('pageerror', error => errors.push(error.message));

  try {
    fs.mkdirSync(output, { recursive: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.NP_DEBUG);
    await page.evaluate(() => {
      localStorage.clear();
      store.set('coins', 0);
      owned = { chair: true, turka: true };
      store.set('upgrades', owned);
      equipmentMenuState = createEquipmentState();
    });
    assert.strictEqual(await page.evaluate(() => mode), 'menu');
    assert.deepStrictEqual(await page.evaluate(() => equipmentMenuState.ownedEquipment), [], 'старые апгрейды не становятся оснащением');
    assert.deepStrictEqual(await page.evaluate(() => equipmentMenuState.loadout), [null, null]);

    await page.evaluate(() => openShop());
    assert.strictEqual(await page.locator('#shop-list .shop-item').count(), await page.evaluate(() => UPGRADES.length), 'старый каталог остался целиком');
    assert.strictEqual(await page.locator('#equipment-slots .equipment-slot').count(), 2);
    assert.strictEqual(await page.locator('#equipment-list [data-buy-equipment]').count(), 0, 'предметы не показываются до подключения эффектов 20/21');
    await page.screenshot({ path: path.join(output, '19-equipment-shop-960x540.png') });

    const readyCatalog = await page.evaluate(() => {
      for (const id of ['thermos', 'mirror', 'autoclicker']) EQUIPMENT_SHOP_AVAILABLE_IDS.add(id);
      renderShop();
      return { count: document.querySelectorAll('#equipment-list .equipment-item').length, ids: [...EQUIPMENT_SHOP_AVAILABLE_IDS] };
    });
    assert.strictEqual(readyCatalog.count, 3);
    assert.deepStrictEqual(readyCatalog.ids.sort(), ['autoclicker', 'mirror', 'thermos']);
    await page.locator('#equipment-slots').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, '19-equipment-catalog-960x540.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('[data-buy-equipment="autoclicker"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, '19-equipment-catalog-mobile-844x390.png') });

    const insufficient = await page.evaluate(() => {
      NP_DEBUG.setCoins(17);
      const result = buyEquipmentItem('thermos');
      return { result, coins: NP_DEBUG.coins };
    });
    assert.strictEqual(insufficient.result.reason, 'insufficient_coins');
    assert.strictEqual(insufficient.coins, 17, 'недостаток средств не меняет кошелёк');

    await page.evaluate(() => { NP_DEBUG.setCoins(66); renderShop(); });
    for (const [id, expected] of [['thermos', 48], ['mirror', 30], ['autoclicker', 0]]) {
      await page.locator(`[data-buy-equipment="${id}"]`).click();
      assert.strictEqual(await page.evaluate(() => NP_DEBUG.coins), expected, `${id}: списана ровно цена из каталога`);
    }
    const duplicate = await page.evaluate(() => buyEquipmentItem('thermos'));
    assert.strictEqual(duplicate.reason, 'already_owned');
    assert.strictEqual(await page.evaluate(() => NP_DEBUG.coins), 0, 'повторная покупка не списывает монеты');
    assert.deepStrictEqual(await page.evaluate(() => equipmentMenuState.ownedEquipment.slice().sort()), ['autoclicker', 'mirror', 'thermos']);

    assert.strictEqual((await page.evaluate(() => equipOwnedEquipment('thermos', 0))).ok, true);
    assert.strictEqual((await page.evaluate(() => equipOwnedEquipment('mirror', 1))).ok, true);
    const duplicateSlot = await page.evaluate(() => equipOwnedEquipment('mirror', 0));
    assert.strictEqual(duplicateSlot.reason, 'duplicate_loadout_item');
    assert.deepStrictEqual(await page.evaluate(() => equipmentMenuState.loadout), ['thermos', 'mirror']);
    assert.strictEqual(await page.evaluate(() => clearEquipmentSlot(0)), true);
    assert.deepStrictEqual(await page.evaluate(() => equipmentMenuState.loadout), [null, 'mirror']);
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('nepalsya.upgrades')), JSON.stringify({ chair: true, turka: true }), 'старые покупки не переписываются');

    // Покупка при нерабочем хранилище остаётся доступной в памяти и не выбрасывает исключение.
    const storageFallback = await page.evaluate(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
      equipmentMenuState = createEquipmentState();
      NP_DEBUG.setCoins(18);
      const result = buyEquipmentItem('thermos');
      Storage.prototype.setItem = originalSetItem;
      return { ok: result.ok, coins: NP_DEBUG.coins, owned: equipmentMenuState.ownedEquipment };
    });
    assert.strictEqual(storageFallback.ok, true);
    assert.strictEqual(storageFallback.coins, 0);
    assert.deepStrictEqual(storageFallback.owned, ['thermos']);

    // Настраиваем два разных слота и проверяем их снимок новой смены.
    await page.evaluate(() => {
      persistEquipmentLoadout(createEquipmentState({ ownedEquipment: ['thermos', 'mirror'], loadout: ['thermos', 'mirror'] }));
      NP_DEBUG.setCoins(0);
      NP_DEBUG.restart(1901);
    });
    let equipment = await page.evaluate(() => saveExtensions.equipment);
    assert.deepStrictEqual(equipment.activeLoadout, ['thermos', 'mirror']);
    assert.strictEqual(equipment.shiftId, await page.evaluate(() => NP_DEBUG.persistence.shiftId));
    const locked = await page.evaluate(() => equipOwnedEquipment('mirror', 0));
    assert.strictEqual(locked.reason, 'equipment_locked', 'экипировку нельзя менять в активной смене');
    assert.deepStrictEqual(await page.evaluate(() => saveExtensions.equipment.activeLoadout), ['thermos', 'mirror']);

    const saved = await page.evaluate(() => NP_DEBUG.saveProgress());
    assert.strictEqual(saved.ok, true);
    assert.deepStrictEqual(saved.snapshot.extensions.equipment.activeLoadout, ['thermos', 'mirror']);
    await page.evaluate(() => { location.hash = 'play'; });
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.loadResult)).status, 'resumed');
    equipment = await page.evaluate(() => saveExtensions.equipment);
    assert.deepStrictEqual(equipment.activeLoadout, ['thermos', 'mirror'], 'resume сохраняет снимок экипировки смены');

    // Старый v3-снимок без extension.equipment безопасно получает loadout из постоянного состояния.
    await page.evaluate(() => {
      const result = NP_DEBUG.saveProgress();
      delete result.snapshot.extensions.equipment;
      store.set('currentSave', result.snapshot);
    });
    await page.reload();
    await page.waitForFunction(() => !!window.NP_DEBUG);
    assert.strictEqual((await page.evaluate(() => NP_DEBUG.loadResult)).status, 'resumed');
    equipment = await page.evaluate(() => saveExtensions.equipment);
    assert.deepStrictEqual(equipment.activeLoadout, ['thermos', 'mirror']);
    assert.strictEqual(errors.length, 0, `ошибки страницы: ${errors.join('; ')}`);
    console.log('qa-plan-19: старый магазин, отдельные слоты, покупки, storage fallback, новый shift и resume — OK');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
