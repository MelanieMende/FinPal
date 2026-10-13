// Real Chromium layout check: node scripts/check-analysis-layout.cjs
// Renders the actual analysis components with production CSS, without user data or API calls.
const fs = require('node:fs');
const path = require('node:path');

async function checkInChromium(html, output) {
  const { app, BrowserWindow } = require('electron');
  const settingsFixture = html.includes('-settings.');
  const profile = path.join(output, 'profile', `${process.pid}-${path.basename(html, '.html')}`);
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  app.disableHardwareAcceleration();
  await app.whenReady();
  const window = new BrowserWindow({ show: false, width: 1280, height: 1100 });
  const scrollToSection = async selector => window.webContents.executeJavaScript(`(async () => {
    document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ behavior: 'instant', block: 'start' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise(resolve => setTimeout(resolve, 150));
  })()`);
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
          const availableWidth = document.documentElement.clientWidth;
          main.style.width = (innerWidth >= 800 ? availableWidth - 240 : availableWidth) + 'px';
          document.querySelectorAll('details').forEach(el => el.open = true);
          document.querySelectorAll('select').forEach(el => {
            el.selectedIndex = [...el.options].reduce((longest, option, index) =>
              option.text.length > el.options[longest].text.length ? index : longest, 0);
          });
          await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const root = document.querySelector('[data-testid="portfolio-analysis"]') || document.querySelector('[data-testid="ai-connection-settings"]');
          const fields = [...root.querySelectorAll('input,select,textarea,button')];
          const errors = [];
          if (main.getBoundingClientRect().right > innerWidth + 1) errors.push('Container exceeds viewport');
          if (root.getBoundingClientRect().right > main.getBoundingClientRect().right + 1) errors.push('Form exceeds parent');
          if (main.scrollWidth > main.clientWidth + 1) errors.push('Form exceeds its container');
          if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) errors.push('Page exceeds its container');
          const allocation = root.querySelector('[aria-label="Berechnete Zielgewichtung"]');
          if (allocation && allocation.scrollWidth > allocation.clientWidth + 1) errors.push('Allocation exceeds its container');
          const forecasts = root.querySelector('[aria-label="Prognosebasierte Optimierung"]');
          if (forecasts && forecasts.scrollWidth > forecasts.clientWidth + 1) errors.push('Forecast inputs exceed their container');
          const profileFields = root.querySelector('[data-testid="analysis-profile-fields"]');
          if (profileFields) {
            const profileControls = [...profileFields.querySelectorAll('input,select')];
            const heights = profileControls.map(el => el.getBoundingClientRect().height);
            if (Math.max(...heights) - Math.min(...heights) > 0.5) errors.push('Profile fields have inconsistent heights');
            const profileSelect = profileFields.querySelector('select');
            const profileInput = profileFields.querySelector('input');
            const selectStyle = getComputedStyle(profileSelect);
            const inputStyle = getComputedStyle(profileInput);
            if (selectStyle.backgroundColor !== inputStyle.backgroundColor) errors.push('Select and input colors differ');
            if (Number.parseFloat(selectStyle.paddingRight) < 36) errors.push('Select arrow has insufficient right padding');
            if (selectStyle.appearance !== 'none') errors.push('Select still uses the native arrow');
          }
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
        if (width === 900 && !settingsFixture) {
          const suffix = zoom === 1 ? '' : '-125';
          const screenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'analysis-900' + suffix + '.png'), screenshot.toPNG());
          await scrollToSection('[data-testid="investor-facts-1"]');
          const assetScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'asset-fields-900' + suffix + '.png'), assetScreenshot.toPNG());
          await scrollToSection('[aria-label="Berechnete Zielgewichtung"]');
          const allocationScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'allocation-900' + suffix + '.png'), allocationScreenshot.toPNG());
          await scrollToSection('[aria-label="Steuerlicher Kontext je Depot"]');
          const depotScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'depot-tax-900' + suffix + '.png'), depotScreenshot.toPNG());
          await window.webContents.executeJavaScript('scrollTo(0, 0)');
        }
        if (width === 900 && settingsFixture) {
          const suffix = zoom === 1 ? '' : '-125';
          const screenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'ai-settings-900' + suffix + '.png'), screenshot.toPNG());
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
    import { AIConnectionSettings } from './src/app/routes/routes/AnalysisRoute/components/PortfolioAnalysis';
    import { readInvestorFacts, saveInvestorFacts } from './src/app/utils/investorFacts';
    import { buildForecastAllocation } from './src/app/utils/portfolioForecastOptimization';
    import { returnForecastFixture } from './src/testing/fixtures/returnForecast';
    import { buildAnalysisPositions } from './src/app/utils/portfolioAnalysis';
    export function render(provider) {
      const assets = [{ ID: 1, name: 'LongAssetName'.repeat(12), type: 'Crypto', symbol: 'BTC',
        isin: '', price: 100, current_shares: 1, currencySymbol: 'EUR' }];
      const transactions = [{ ID: 1, asset_ID: 1, date: '2025-01-01', type: 'Buy', amount: 1, price_per_share: 80, depot: 'Trade Republic' }];
      const facts = readInvestorFacts('layout-fixture', assets);
      facts.assets[1].custody.provider = 'LongCustodyProvider'.repeat(8);
      facts.defaultCustody.provider = facts.assets[1].custody.provider;
      saveInvestorFacts('layout-fixture', facts);
      const state = setupStore().getState();
      const allocationPlan = buildForecastAllocation({ provider: 'api', priceUpdatedAt: new Date(Date.now()).toISOString(),
        positions: buildAnalysisPositions(assets.map(a => ({ ...a, currencySymbol: '€', price: 1000 }))),
        profile: { goal: 'growth', risk: 'high', horizonYears: 10, buyBudget: 1000 } },
        [returnForecastFixture('1', { targetPrice: 1100, referencePrice: 1000,
          publisher: 'SyntheticPublisher'.repeat(20), assumptions: 'Synthetic assumptions for layout verification. '.repeat(15) })]);
      const result = { summary: 'Layout fixture', warnings: [], sources: [], recommendations: [], generatedAt: '2026-10-12T10:00:00Z',
        priceUpdatedAt: null, model: 'fixture', allocationPlan };
      const store = setupStore({ ...state, assets, transactions,
        appState: { ...state.appState, database: 'layout-fixture' },
        portfolioAnalysis: { ...state.portfolioAnalysis, provider, result } });
      return renderToStaticMarkup(<Provider store={store}><PortfolioAnalysis standalone priceUpdatedAt={null} /></Provider>);
    }
    export function renderSettings(provider) {
      const chatGpt = { connected: true, activeClientId: 'layout-account', accounts: [{ clientId: 'layout-account', label: 'Very Long Connected Account Name For Layout Validation', connected: true }] };
      return renderToStaticMarkup(<section style={{ width: 'min(560px, calc(100vw - 32px))' }}><AIConnectionSettings
        provider={provider} setProvider={() => {}} busy={false} secureStorage={true} chatGpt={chatGpt}
        models={[{ slug: 'layout-model', displayName: 'Very Long ChatGPT Model Display Name For Layout Validation' }]}
        model="layout-model" selectModel={() => {}} signIn={() => {}} signingIn={true} signOut={() => {}}
        cancelSignIn={() => {}} hasKey={true} apiKey="sk-layout-validation-placeholder" setApiKey={() => {}}
        saveApiKey={() => {}} forgetApiKey={() => {}} openUsage={() => {}} /></section>);
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
    const settingsHtml = path.join(output, `${provider}-settings.html`);
    fs.writeFileSync(settingsHtml, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body class="bp5-dark"><main style="padding:16px">${fixture.renderSettings(provider)}</main></body></html>`);
    const settingsRun = spawnSync(require('electron'), [__filename, '--render', settingsHtml, output], { encoding: 'utf8', windowsHide: true, env });
    process.stdout.write(settingsRun.stdout || '');
    if (settingsRun.status !== 0) throw new Error(settingsRun.stderr || `Settings layout process failed: ${settingsRun.status}`);
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
