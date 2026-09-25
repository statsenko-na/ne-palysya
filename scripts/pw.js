// Поиск Playwright: локальный node_modules, глобальная установка (npm i -g playwright) или облачный контейнер.
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright() {
  const candidates = ['playwright'];
  try { candidates.push(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'playwright')); } catch (_) { /* npm недоступен */ }
  candidates.push('/opt/node22/lib/node_modules/playwright');
  for (const c of candidates) { try { return require(c); } catch (_) { /* следующий */ } }
  throw new Error('Playwright не найден. Установи: npm i -g playwright && npx playwright install chromium');
}

module.exports = { loadPlaywright };
