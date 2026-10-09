// Real Chromium layout check: node scripts/check-analysis-layout.cjs
// Renders the actual analysis components with production CSS, without user data or API calls.
const fs = require('node:fs');
const path = require('node:path');

async function checkInChromium(html, output) {
  const { app, BrowserWindow } = require('electron');
  const profile = path.join(output, 'profile');
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  app.disableHardwareAcceleration();
  await app.whenReady();
  const window = new BrowserWindow({ show: false, width: 1280, height: 1100 });
  try {
    await window.loadFile(html);
    for (const zoom of [1, 1.25]) {
      window.webContents.setZoomFactor(zoom);
      for (const width of [320, 480, 640, 900, 1280]) {
        window.setContentSize(width, 1100);
        const result = await window.webContents.executeJavaScript(`(async () => {
          for (let attempt = 0; attempt < 40 && Math.abs(innerWidth - ${width / zoom}) > 2; attempt++)
            await new Promise(resolve => setTimeout(resolve, 25));
          if (Math.abs(innerWidth - ${width / zoom}) > 2) throw new Error('Viewport resize did not settle');
          const main = document.querySelector('main');
          main.style.width = (innerWidth >= 800 ? innerWidth - 240 : innerWidth) + 'px';
          document.querySelectorAll('details').forEach(el => el.open = true);
          document.querySelectorAll('select').forEach(el => {
            el.selectedIndex = [...el.options].reduce((longest, option, index) =>
              option.text.length > el.options[longest].text.length ? index : longest, 0);
          });
          await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const root = document.querySelector('[data-testid="portfolio-analysis"]');
          const fields = [...root.querySelectorAll('input,select,textarea,button')];
          const errors = [];
          if (main.getBoundingClientRect().right > innerWidth + 1) errors.push('Container exceeds viewport');
          if (root.getBoundingClientRect().right > main.getBoundingClientRect().right + 1) errors.push('Form exceeds parent');
          if (main.scrollWidth > main.clientWidth + 1) errors.push('Form exceeds its container');
          const rects = fields.map(el => ({ el, rect: el.getBoundingClientRect() }));
          for (const { el, rect } of rects) {
            const parent = el.closest('label') || el.parentElement;
            const bounds = parent.getBoundingClientRect();
            if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
              errors.push('Field exceeds parent: ' + (el.getAttribute('aria-label') || parent.textContent.trim().slice(0, 70)));
          }
          for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i].rect, b = rects[j].rect;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) errors.push('Fields overlap');
          }
          return { viewport: innerWidth, container: main.clientWidth, fields: fields.length, errors };
        })()`);
        console.log(JSON.stringify({ width, zoom, ...result }));
        if (result.errors.length) throw new Error('Responsive analysis layout failed');
        if (width === 900 && zoom === 1) {
          const screenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'analysis-900.png'), screenshot.toPNG());
          await window.webContents.executeJavaScript(`document.querySelector('[data-testid="investor-facts-1"]').scrollIntoView(); new Promise(resolve => requestAnimationFrame(resolve))`);
          const assetScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'asset-fields-900.png'), assetScreenshot.toPNG());
          await window.webContents.executeJavaScript('scrollTo(0, 0)');
        }
      }
    }
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
}

async function buildAndCheck() {
  const root = path.resolve(__dirname, '..');
  process.chdir(root);
  const output = path.join(root, '.vite', 'layout-check');
  fs.mkdirSync(output, { recursive: true });
  const { build } = await import('vite');
  await build({ configFile: path.join(root, 'config/vite/vite.renderer.config.mjs'), logLevel: 'error',
    build: { outDir: path.join(output, 'renderer'), emptyOutDir: true } });
  const bundle = path.join(output, 'fixture.cjs');
  await require('esbuild').build({ stdin: { contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Provider } from 'react-redux';
    import { setupStore } from './src/app/store';
    import PortfolioAnalysis from './src/app/routes/routes/AnalysisRoute/components/PortfolioAnalysis';
    import { readInvestorFacts, saveInvestorFacts } from './src/app/utils/investorFacts';
    export function render(provider) {
      const assets = [{ ID: 1, name: 'LongAssetName'.repeat(12), type: 'Crypto', symbol: 'BTC',
        isin: '', price: 100, current_shares: 1, currencySymbol: 'EUR' }];
      const transactions = [{ ID: 1, asset_ID: 1, date: '2025-01-01', type: 'Buy', amount: 1, price_per_share: 80, depot: 'Trade Republic' }];
      const facts = readInvestorFacts('layout-fixture', assets);
      facts.assets[1].custody.provider = 'LongCustodyProvider'.repeat(8);
      facts.defaultCustody.provider = facts.assets[1].custody.provider;
      saveInvestorFacts('layout-fixture', facts);
      const state = setupStore().getState();
      const store = setupStore({ ...state, assets, transactions,
        appState: { ...state.appState, database: 'layout-fixture' },
        portfolioAnalysis: { ...state.portfolioAnalysis, provider } });
      return renderToStaticMarkup(<Provider store={store}><PortfolioAnalysis standalone priceUpdatedAt={null} /></Provider>);
    }
  `, resolveDir: root, loader: 'jsx' }, outfile: bundle, bundle: true, packages: 'external', platform: 'node', format: 'cjs' });
  global.window = { API: {} };
  const storage = new Map();
  global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const cssDir = path.join(output, 'renderer', 'assets');
  const css = fs.readdirSync(cssDir).filter(file => file.endsWith('.css')).map(file => fs.readFileSync(path.join(cssDir, file), 'utf8')).join('\n');
  const fixture = require(bundle);
  const { spawnSync } = require('node:child_process');
  for (const provider of ['api', 'chatgpt']) {
    const html = path.join(output, `${provider}.html`);
    fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body class="bp5-dark"><main style="padding:16px">${fixture.render(provider)}</main></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const run = spawnSync(require('electron'), [__filename, '--render', html, output], { encoding: 'utf8', windowsHide: true, env });
    process.stdout.write(run.stdout || '');
    if (run.status !== 0) throw new Error(run.stderr || `Layout process failed: ${run.status}`);
  }
  if (process.argv.includes('--verify-guard')) {
    const html = path.join(output, 'unprotected.html');
    fs.writeFileSync(html, fs.readFileSync(path.join(output, 'api.html'), 'utf8').replace('glass-card analysis-form mb-6', 'glass-card mb-6'));
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const run = spawnSync(require('electron'), [__filename, '--render', html, output], { encoding: 'utf8', windowsHide: true, env });
    if (run.status !== 1 || !run.stdout.includes('Field exceeds parent')) throw new Error('Regression guard failed to detect unconstrained fields');
    console.log('Regression guard correctly detected fields exceeding their container.');
  }
}

(process.argv.includes('--render') ? checkInChromium(process.argv[3], process.argv[4]) : buildAndCheck())
  .catch(error => { console.error(error); process.exit(1); });
