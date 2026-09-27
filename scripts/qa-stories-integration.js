'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const release = '0.27.0';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sources = new Map();
const source = file => {
  if (!sources.has(file)) sources.set(file, read(file));
  return sources.get(file);
};

const features = [
  { name: '01–02 · snapshot v3 и миграция v2', module: 'js/save-schema.js', refs: [['js/save-schema.js', 'SAVE_SCHEMA_EXTENSIONS'], ['js/core.js', 'migrateSaveV2('], ['js/core.js', 'makeSaveSnapshot(']], tests: ['qa-plan-01.js', 'qa-plan-02.js'] },
  { name: '03–04 · обязательная цель и нужда', module: 'js/config.js', refs: [['js/config.js', 'TASK_EVENT_PREREQUISITES'], ['js/events.js', 'requiredEventEntries'], ['js/player.js', 'day.pee']], tests: ['qa-plan-03.js', 'qa-plan-04.js'] },
  { name: '06 · итог и moments', module: 'js/moments.js', refs: [['js/player.js', 'calculateShiftResult('], ['js/interact.js', 'awardMoment(']], tests: ['qa-plan-06.js'] },
  { name: '08 · отношения', module: 'js/relationships.js', refs: [['js/core.js', 'ensureRelationshipsExtension'], ['js/interact.js', 'applyRelationshipEvent(']], tests: ['qa-plan-08.js'] },
  { name: '09 · единый выбор', module: 'js/action-choice.js', refs: [['js/interact.js', 'registerActionChoiceHandler('], ['js/render-choice.js', 'drawActionChoice']], tests: ['qa-plan-09.js'] },
  { name: '10–12 · телефон, инсайд и варианты отдыха', module: 'js/activities.js', refs: [['js/interact.js', 'startYoutubeVariant('], ['js/player.js', 'tickActivityVariant('], ['js/render-phone.js', 'drawPhone']], tests: ['qa-plan-10.js', 'qa-plan-11.js', 'qa-plan-12.js'] },
  { name: '14–15 · отвлечения и папка', module: 'js/distractions.js', refs: [['js/interact.js', 'beginBossDistraction('], ['js/interact.js', 'beginDisguise('], ['js/boss.js', 'tickDisguiseAdapter(']], tests: ['qa-plan-14.js', 'qa-plan-15.js'] },
  { name: '16–17 · холодильник и история йогурта', module: 'js/story-yogurt.js', refs: [['js/interact.js', 'startYogurtCoffeeGift('], ['js/interact.js', 'tickYogurtStoryAdapter('], ['js/player.js', 'tickYogurtStoryAdapter(']], tests: ['qa-plan-16.js', 'qa-plan-17.js'] },
  { name: '18 · помощь Сиргею', module: 'js/event-autoshka.js', refs: [['js/interact.js', 'applyAutoshkaTransition('], ['js/player.js', "endAction('shift_ended')"]], tests: ['qa-plan-18.js'] },
  { name: '19–21 · покупки и два слота', module: 'js/equipment.js', refs: [['js/meta.js', 'purchaseEquipment('], ['js/meta.js', 'equipItem('], ['js/boss.js', 'resolveAutoclickerInspectionElsewhere(']], tests: ['qa-plan-19.js', 'qa-plan-20.js', 'qa-plan-21.js'] },
  { name: '22 · память Д.Н.', module: 'js/boss-memory.js', refs: [['js/boss.js', 'recordBossMemoryIncident('], ['js/boss.js', 'saveExtensions.bossMemory']], tests: ['qa-plan-22.js'] },
  { name: '23–24 · темы и недельный итог', module: 'js/week-scenarios.js', refs: [['js/meta.js', 'applyWeekScenarioToPlan('], ['js/player.js', 'createNextWeeklyOutcomeStates('], ['js/interact.js', 'recordWeekFact(']], tests: ['qa-plan-23.js', 'qa-plan-24.js'] },
  { name: '26 · локальные рекорды', module: 'js/records.js', refs: [['js/meta.js', 'addCompletedShiftRecord('], ['js/player.js', 'addCompletedShiftRecord('], ['index.html', 'records-open']], tests: ['qa-plan-26.js'] },
  { name: '27 · уменьшение эффектов', module: 'js/accessibility.js', refs: [['js/meta.js', 'toggleReducedEffects('], ['js/render.js', 'getEffectPresentation('], ['js/render-fx.js', 'drawDanger(effectPresentation)']], tests: ['qa-plan-27.js', 'qa-parallel-b4.js'] },
];

function staticAudit() {
  const index = source('index.html');
  const versionDoc = source('VERSION.md');
  const core = source('js/core.js');
  const releaseInDoc = versionDoc.match(/Текущая версия: `([^`]+)`/);
  assert.equal(releaseInDoc && releaseInDoc[1], release, 'VERSION.md release');

  const scriptRefs = [...index.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  const scriptPaths = scriptRefs.map(ref => ref.split('?')[0]);
  const requiredScripts = [
    'js/world.js', 'js/lines.js', 'js/art.js', 'js/config.js', 'js/core.js', 'js/accessibility.js',
    'js/equipment.js', 'js/save-schema.js', 'js/moments.js', 'js/relationships.js', 'js/activities.js',
    'js/story-yogurt.js', 'js/event-autoshka.js', 'js/distractions.js', 'js/disguise.js', 'js/boss-memory.js',
    'js/week-scenarios.js', 'js/week-outcomes.js', 'js/records.js', 'js/meta.js', 'js/events.js',
    'js/action-choice.js', 'js/interact.js', 'js/boss.js', 'js/autopilot.js', 'js/player.js', 'js/render.js',
    'js/render-office.js', 'js/render-actors.js', 'js/render-fx.js', 'js/render-hud.js', 'js/render-phone.js',
    'js/render-choice.js', 'js/render-guide.js', 'game.js',
  ];
  for (const file of requiredScripts) {
    assert.equal(scriptPaths.filter(ref => ref === file).length, 1, `${file} is loaded exactly once`);
    assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`);
  }
  const order = file => scriptPaths.indexOf(file);
  for (const [before, after] of [
    ['js/core.js', 'js/accessibility.js'], ['js/accessibility.js', 'js/meta.js'],
    ['js/records.js', 'js/meta.js'], ['js/events.js', 'js/action-choice.js'],
    ['js/action-choice.js', 'js/interact.js'], ['js/render.js', 'js/render-office.js'],
    ['js/render-fx.js', 'game.js'], ['js/render-guide.js', 'game.js'],
  ]) assert.ok(order(before) >= 0 && order(before) < order(after), `script order ${before} before ${after}`);

  const cacheRefs = [index.match(/<link rel="stylesheet" href="([^"]+)"/)[1], ...scriptRefs];
  for (const ref of cacheRefs) {
    const version = ref.match(/[?&]v=([^&]+)/);
    assert.ok(version, `cache query exists: ${ref}`);
    assert.equal(version[1], release, `cache query matches release: ${ref}`);
  }
  const assetVersion = core.match(/const ASSET_V = '([^']+)'/);
  assert.equal(assetVersion && assetVersion[1], release, 'asset cache version matches release');

  const schema = source('js/save-schema.js');
  const extensionList = schema.match(/const SAVE_SCHEMA_EXTENSIONS = new Set\(\[([^\]]+)\]\)/);
  assert.ok(extensionList, 'snapshot extension allowlist exists');
  const extensionIds = [...extensionList[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const id of [
    'moments', 'relationships', 'activities', 'distractions', 'disguise', 'equipment', 'bossMemory',
    'yogurt', 'autoshka', 'weekScenario', 'weekOutcomes', 'tigranSecret',
  ]) assert.ok(extensionIds.includes(id), `snapshot allowlist includes ${id}`);

  for (const feature of features) {
    assert.ok(scriptPaths.includes(feature.module), `${feature.name}: module is connected`);
    for (const [file, marker] of feature.refs) {
      assert.ok(source(file).includes(marker), `${feature.name}: integration point ${file} → ${marker}`);
    }
    for (const test of feature.tests) assert.ok(fs.existsSync(path.join(__dirname, test)), `${feature.name}: ${test} exists`);
    console.log(`✓ ${feature.name}`);
  }
  const deferred = ['qa-plan-28.js', 'qa-plan-29.js', 'qa-plan-30.js', 'qa-plan-31.js', 'qa-plan-32.js', 'qa-plan-33.js'];
  assert.ok(deferred.every(test => !fs.existsSync(path.join(__dirname, test))), 'deferred cards 28–33 are outside this wave');
  console.log(`Static integration audit: ${features.length} feature groups; ${extensionIds.length} save extensions; release ${release}.`);
}

function regressionSuite() {
  const plans = ['01', '02', '03', '04', '06', '08', '09', '10', '11', '12', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '26', '27'];
  const parallel = ['b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3', 'c4', 'd1', 'd2', 'd3', 'd4', 'd5'];
  const tests = [
    'qa-plan-34.js',
    ...plans.map(id => `qa-plan-${id}.js`),
    ...parallel.map(id => `qa-parallel-${id}.js`),
    'qa.js',
  ];
  for (const test of tests) {
    const result = spawnSync(process.execPath, [path.join(__dirname, test)], {
      cwd: root, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      process.stderr.write(`\nFAIL ${test} (status ${result.status}, signal ${result.signal || 'none'})\n`);
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exitCode = result.status || 1;
      return;
    }
    const output = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
    const detail = output.at(-1) || 'exit 0';
    console.log(`✓ ${test}: ${detail}`);
  }
  console.log(`Integration regression suite: ${tests.length}/${tests.length} scripts passed.`);
}

try {
  staticAudit();
  regressionSuite();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
