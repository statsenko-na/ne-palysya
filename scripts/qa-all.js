'use strict';
// Все автотесты подряд: сверка версии в кэш-параметрах, затем scripts/qa-plan-*.js, qa-parallel-*.js и qa.js.
// Запуск: node scripts/qa-all.js

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function versionAudit() {
  const release = read('VERSION.md').match(/Текущая версия: `([^`]+)`/)[1];
  const index = read('index.html');
  const refs = [index.match(/<link rel="stylesheet" href="([^"]+)"/)[1], ...[...index.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])];
  for (const ref of refs) {
    assert.ok(fs.existsSync(path.join(root, ref.split('?')[0])), `${ref}: файл существует`);
    assert.equal((ref.match(/[?&]v=([^&]+)/) || [])[1], release, `${ref}: версия в кэш-параметре`);
  }
  assert.equal((read('js/core.js').match(/const ASSET_V = '([^']+)'/) || [])[1], release, 'ASSET_V совпадает с версией');
  console.log(`✓ версия ${release}: ${refs.length} файлов в index.html`);
}

function runAll() {
  const names = fs.readdirSync(__dirname).filter(name => /^qa-(plan|parallel)-.+\.js$/.test(name)).sort();
  const tests = [...names, 'qa.js'];
  for (const test of tests) {
    const result = spawnSync(process.execPath, [path.join(__dirname, test)], { cwd: root, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
    if (result.error || result.status !== 0) {
      process.stderr.write(`\nFAIL ${test} (status ${result.status})\n${result.stdout || ''}${result.stderr || ''}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`✓ ${test}: ${(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1) || 'ok'}`);
  }
  console.log(process.exitCode ? 'Есть упавшие тесты.' : `Все ${tests.length} тестовых скриптов прошли.`);
}

versionAudit();
runAll();
