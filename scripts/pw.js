// Поиск Playwright: локальный node_modules, глобальная установка (npm i -g playwright) или облачный контейнер.
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_PATH) candidates.push(process.env.PLAYWRIGHT_PATH);
  candidates.push('playwright');
  candidates.push(path.join(process.cwd(), 'node_modules', 'playwright'));

  try {
    const root = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim();
    if (root) candidates.push(path.join(root, 'playwright'));
  } catch (_) { /* npm недоступен или таймаут */ }

  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'playwright'));
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'npm', 'node_modules', 'playwright'));
  if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'nodejs', 'node_modules', 'playwright'));
  candidates.push('C:\\Program Files\\nodejs\\node_modules\\playwright');

  candidates.push('/opt/node22/lib/node_modules/playwright');
  candidates.push('/usr/lib/node_modules/playwright');
  candidates.push('/usr/local/lib/node_modules/playwright');
  candidates.push('/opt/homebrew/lib/node_modules/playwright');
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) {
    candidates.push(path.join(home, '.npm-global', 'lib', 'node_modules', 'playwright'));
    candidates.push(path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'playwright'));
  }

  for (const c of candidates) {
    if (!c) continue;
    try { return require(c); } catch (_) { /* следующий */ }
  }
  throw new Error('Playwright не найден. Установи: npm i -g playwright && npx playwright install chromium');
}

module.exports = { loadPlaywright };

