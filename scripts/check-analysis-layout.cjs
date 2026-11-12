// Real Chromium layout check: node scripts/check-analysis-layout.cjs
// Renders actual analysis and asset-form components with production CSS and isolated data.
const fs = require('node:fs');
const path = require('node:path');

async function checkInChromium(html, output) {
  const { app, BrowserWindow } = require('electron');
  const settingsFixture = html.includes('-settings.');
  const assetOverlayFixture = html.includes('-asset-overlay.');
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
          const root = document.querySelector('[data-testid="portfolio-analysis"]') || document.querySelector('[data-testid="ai-connection-settings"]') || document.querySelector('[data-testid="asset-overlay-layout"]');
          const fields = [...root.querySelectorAll('input,select,textarea,button')];
          const errors = [];
          if (main.getBoundingClientRect().right > innerWidth + 1) errors.push('Container exceeds viewport');
          if (root.getBoundingClientRect().right > main.getBoundingClientRect().right + 1) errors.push('Form exceeds parent');
          if (main.scrollWidth > main.clientWidth + 1) errors.push('Form exceeds its container: ' + main.scrollWidth + '/' + main.clientWidth);
          if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
            const overflowing = [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1)
              .slice(0, 6).map(el => el.tagName.toLowerCase() + '.' + el.className + ':' + Math.round(el.getBoundingClientRect().right));
            errors.push('Page exceeds its container: ' + document.documentElement.scrollWidth + '/' + document.documentElement.clientWidth + ' ' + overflowing.join('; '));
          }
          const allocation = root.querySelector('[aria-label="Berechnete Zielgewichtung"]');
          if (allocation && allocation.scrollWidth > allocation.clientWidth + 1) errors.push('Allocation exceeds its container');
          const forecasts = root.querySelector('[aria-label="Prognosebasierte Optimierung"]');
          if (forecasts && forecasts.scrollWidth > forecasts.clientWidth + 1) errors.push('Forecast inputs exceed their container');
          const robustness = root.querySelector('[aria-label="Robustheit und Entscheidungsprüfung"]');
          if (robustness && robustness.scrollWidth > robustness.clientWidth + 1) errors.push('Robustness review exceeds its container');
          const decisionFields = root.querySelector('[data-testid="decision-profile-fields"]');
          if (decisionFields && decisionFields.scrollWidth > decisionFields.clientWidth + 1) errors.push('Decision profile exceeds its container');
          const decisionLabels = [...(decisionFields?.querySelectorAll('.decision-fields > label') || [])];
          for (let index = 1; index < decisionLabels.length; index++) {
            const previous = decisionLabels[index - 1], current = decisionLabels[index];
            if (Math.abs(previous.getBoundingClientRect().top - current.getBoundingClientRect().top) < 1
              && Math.abs(previous.querySelector('input,select').getBoundingClientRect().bottom - current.querySelector('input,select').getBoundingClientRect().bottom) > 1)
              errors.push('Decision profile controls in the same row are not aligned');
          }
          const modelValidation = root.querySelector('[data-testid="model-validation-review"]');
          if (modelValidation && modelValidation.scrollWidth > modelValidation.clientWidth + 1) errors.push('Model validation review exceeds its container');
          root.querySelectorAll('[aria-label^="Prognose und Zielgewichtung "]').forEach(assetAnalysis => {
            if (assetAnalysis.scrollWidth > assetAnalysis.clientWidth + 1) errors.push('Combined asset analysis exceeds its container');
          });
          document.querySelectorAll('[data-testid="asset-research-status"]').forEach(status => {
            if (status.scrollWidth > status.clientWidth + 1) errors.push('Asset research status exceeds its container');
          });
          root.querySelectorAll('[data-testid="candidate-market-quote"]').forEach(quote => {
            if (quote.scrollWidth > quote.clientWidth + 1) errors.push('Candidate quote exceeds its container');
          });
          root.querySelectorAll('[role="tablist"][aria-label="Analysehinweise"]').forEach(tablist => {
            const tabs = [...tablist.querySelectorAll('[role="tab"]')];
            if (tabs.length !== 2) errors.push('Analysis messages do not have two tabs');
            if (tabs[0]?.textContent.includes('Warnungen') !== true || tabs[0]?.getAttribute('aria-selected') !== 'true')
              errors.push('Warnings are not the initial analysis message tab');
            if (tablist.scrollWidth > tablist.clientWidth + 1) errors.push('Analysis message tabs exceed their container');
          });
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
          const visibleRect = el => {
            const rect = el.getBoundingClientRect();
            const visible = { left: Math.max(0, rect.left), right: Math.min(innerWidth, rect.right),
              top: Math.max(0, rect.top), bottom: Math.min(innerHeight, rect.bottom) };
            for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              const bounds = ancestor.getBoundingClientRect();
              if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                visible.left = Math.max(visible.left, bounds.left);
                visible.right = Math.min(visible.right, bounds.right);
              }
              if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
                visible.top = Math.max(visible.top, bounds.top);
                visible.bottom = Math.min(visible.bottom, bounds.bottom);
              }
            }
            return visible;
          };
          const rects = fields.map(el => ({ el, rect: visibleRect(el) }));
          for (const { el, rect } of rects) {
            const parent = el.closest('label') || el.parentElement;
            const bounds = parent.getBoundingClientRect();
            if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
              errors.push('Field exceeds parent: ' + (el.getAttribute('aria-label') || parent.textContent.trim().slice(0, 70)) +
                ' field=' + Math.round(rect.left) + ',' + Math.round(rect.right) +
                ' parent=' + Math.round(bounds.left) + ',' + Math.round(bounds.right));
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
        if (width === 900 && !settingsFixture && !assetOverlayFixture) {
          const suffix = zoom === 1 ? '' : '-125';
          const screenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'analysis-900' + suffix + '.png'), screenshot.toPNG());
          await scrollToSection('[data-testid="decision-profile-fields"]');
          const decisionScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'decision-profile-900' + suffix + '.png'), decisionScreenshot.toPNG());
          await scrollToSection('[data-testid="investor-facts-1"]');
          const assetScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'asset-fields-900' + suffix + '.png'), assetScreenshot.toPNG());
          await scrollToSection('[aria-label="Berechnete Zielgewichtung"]');
          const allocationScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'allocation-900' + suffix + '.png'), allocationScreenshot.toPNG());
          await scrollToSection('[aria-label="Robustheit und Entscheidungsprüfung"]');
          const robustnessScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'robustness-900' + suffix + '.png'), robustnessScreenshot.toPNG());
          await scrollToSection('[data-testid="model-validation-review"]');
          const validationScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'model-validation-900' + suffix + '.png'), validationScreenshot.toPNG());
          await scrollToSection('[aria-label^="Prognose und Zielgewichtung "]');
          const assetAnalysisScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'asset-analysis-900' + suffix + '.png'), assetAnalysisScreenshot.toPNG());
          await scrollToSection('[aria-label="Steuerlicher Kontext je Depot"]');
          const depotScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'depot-tax-900' + suffix + '.png'), depotScreenshot.toPNG());
          await scrollToSection('[aria-label="Analyseergebnis"]');
          const messagesScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'analysis-messages-900' + suffix + '.png'), messagesScreenshot.toPNG());
          await scrollToSection('[aria-label="Webrecherche Layoutprüfung"]');
          const researchScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'research-900' + suffix + '.png'), researchScreenshot.toPNG());
          await scrollToSection('[aria-label="Neue Kaufideen"]');
          const candidateScreenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'candidate-quote-900' + suffix + '.png'), candidateScreenshot.toPNG());
          await window.webContents.executeJavaScript('scrollTo(0, 0)');
        }
        if (width === 900 && settingsFixture) {
          const suffix = zoom === 1 ? '' : '-125';
          const screenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'ai-settings-900' + suffix + '.png'), screenshot.toPNG());
        }
        if (width === 900 && assetOverlayFixture) {
          const suffix = zoom === 1 ? '' : '-125';
          const screenshot = await window.webContents.capturePage();
          fs.writeFileSync(path.join(output, 'real-estate-fields-900' + suffix + '.png'), screenshot.toPNG());
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
    import { AssetResearchIndicator } from './src/app/routes/routes/AnalysisRoute/components/PortfolioAnalysis';
    import CreateAndEditAssetOverlay from './src/app/routes/routes/AssetsRoute/components/CreateAndEditAssetOverlay';
    import * as appStateReducer from './src/app/store/appState/appState.reducer';
    import * as assetCreationReducer from './src/app/store/assetCreation/assetCreation.reducer';
    import { readInvestorFacts, saveInvestorFacts } from './src/app/utils/investorFacts';
    import { buildRobustForecastAllocation as buildForecastAllocation } from './src/app/utils/robustForecastModel';
    import { robustReturnForecastFixture as returnForecastFixture } from './src/testing/fixtures/robustForecast';
    import { buildAnalysisPositions } from './src/app/utils/portfolioAnalysis';
    import { etfReturnForecastFixture } from './src/testing/fixtures/etfHistory';
    export function render(provider) {
      localStorage.setItem('finpal.portfolioAnalysis.profile.v1', JSON.stringify({ goal: 'growth', risk: 'high', horizonYears: '10', buyBudget: '1000',
        decisionDetails: { reserveEUR: '300', plannedWithdrawalsEUR: '200', externalAssetsEUR: '123456789.99', liabilitiesEUR: '12345678', monthlySurplusEUR: '-100.50',
          lossCapacityUnit: 'percent', lossCapacityPercent: '100', tolerableDrawdownPercent: '25', experience: 'experienced', notes: 'LongPersonalPlanningNote'.repeat(30), confirmedAt: new Date().toISOString() } }));
      const assets = [{ ID: 1, name: 'LongAssetName'.repeat(12), type: 'Crypto', symbol: 'BTC',
        isin: '', price: 100, current_shares: 1, currencySymbol: 'EUR' }];
      const transactions = [{ ID: 1, asset_ID: 1, date: '2025-01-01', type: 'Buy', amount: 1, price_per_share: 80, depot: 'Trade Republic' }];
      const facts = readInvestorFacts('layout-fixture', assets);
      facts.assets[1].custody.provider = 'LongCustodyProvider'.repeat(8);
      facts.defaultCustody.provider = facts.assets[1].custody.provider;
      saveInvestorFacts('layout-fixture', facts);
      const state = setupStore().getState();
      const allocationPositions = buildAnalysisPositions(assets.map(a => ({ ...a, currencySymbol: '€', price: 1000 })));
      allocationPositions.push({ ...allocationPositions[0], id: 2, name: 'LongUnmodeledAssetName'.repeat(8), symbol: 'NO-FORECAST', type: 'Stock' });
      const etfForecast = etfReturnForecastFixture('new:IE00BF4RFH31');
      const candidate = { name: 'iShares MSCI World Small Cap UCITS ETF USD (Acc)', isin: 'IE00BF4RFH31', symbol: 'WSML', type: 'ETF', action: 'Prüfen',
        rationale: 'Lokales Historienmodell und gemeinsame Budgetrechnung vorhanden; Risikoprüfung bleibt erforderlich.', risk: 'Small-Cap-Marktrisiko', sourceIndexes: [],
        marketQuote: { isin: 'IE00BF4RFH31', symbol: 'IUSN.DE', price: etfForecast.referencePrice, currency: 'EUR', exchange: 'XETR', kind: 'last-trade',
          quoteAsOf: new Date(Date.now() - 60000).toISOString(), fetchedAt: new Date().toISOString(),
          source: { title: 'Deutsche Börse: EUR-Börsenkurs IE00BF4RFH31', url: 'https://api.boerse-frankfurt.de/v1/data/price_information/single?isin=IE00BF4RFH31' } } };
      const allocationPlan = buildForecastAllocation({ provider: 'api', priceUpdatedAt: new Date(Date.now()).toISOString(),
        positions: allocationPositions,
        profile: { goal: 'growth', risk: 'high', horizonYears: 10, buyBudget: 1000 } },
        [returnForecastFixture('1', { targetPrice: 1500, referencePrice: 1000,
          uncertainty: { method: 'historical-bootstrap', historyYears: 5 },
          scenarioReturns: { p10: -45, median: 200, p90: 300 },
          publisher: 'SyntheticPublisher'.repeat(20), assumptions: 'Synthetic assumptions for layout verification. '.repeat(15) }), etfForecast], [candidate], undefined, undefined, ['2']);
      const recommendations = allocationPositions.map(position => ({ assetId: position.id, action: 'Prüfen',
        rationale: 'Ausführliche KI-Begründung für die zusammengeführte Asset-Kachel. '.repeat(5),
        risk: 'Risikoangabe für die Layoutprüfung.', sourceIndexes: [] }));
      const result = { summary: 'Layout fixture', infos: ['Zusätzliche Information für die Layoutprüfung.'], warnings: ['Warnung mit einem längeren Text für die Layoutprüfung.'], sources: [], recommendations, generatedAt: '2026-10-12T10:00:00Z',
        priceUpdatedAt: null, model: 'fixture', allocationPlan,
        newAssetRecommendations: [candidate] };
      const store = setupStore({ ...state, assets, transactions,
        appState: { ...state.appState, database: 'layout-fixture' },
        portfolioAnalysis: { ...state.portfolioAnalysis, provider, result } });
      const loaded = Date.now() - 3600000;
      return renderToStaticMarkup(<Provider store={store}><PortfolioAnalysis standalone priceUpdatedAt={null} />
        <section aria-label="Webrecherche Layoutprüfung" className="min-w-0 space-y-3 rounded-lg border border-white/10 p-4">
          <AssetResearchIndicator status={{ assetId: 1, fetchedAt: new Date(loaded).toISOString(), expiresAt: new Date(loaded + 86400000).toISOString() }} now={Date.now()} />
          <AssetResearchIndicator status={{ assetId: 2, fetchedAt: null, expiresAt: null }} now={Date.now()} />
        </section>
      </Provider>);
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
    export function renderAssetOverlay() {
      const store = setupStore();
      store.dispatch(appStateReducer.setShowAssetOverlay(true));
      store.dispatch(assetCreationReducer.setTypeInput('RealEstate'));
      store.dispatch(assetCreationReducer.setNameInput('Long family property name '.repeat(3)));
      store.dispatch(assetCreationReducer.setPropertyLocationInput('Long property location value '.repeat(3)));
      store.dispatch(assetCreationReducer.setPropertyMarketValueInput('450000'));
      store.dispatch(assetCreationReducer.setPropertyOwnershipShareInput('50'));
      store.dispatch(assetCreationReducer.setPropertyMortgageBalanceInput('125000'));
      store.dispatch(assetCreationReducer.setPropertyPurchaseDateInput('2020-05-01'));
      store.dispatch(assetCreationReducer.setPropertyPurchasePriceInput('400000'));
      store.dispatch(assetCreationReducer.setPropertyMonthlyRentInput('1200'));
      store.dispatch(assetCreationReducer.setPropertyMonthlyCostsInput('350'));
      return renderToStaticMarkup(<Provider store={store}><section data-testid="asset-overlay-layout">
        <CreateAndEditAssetOverlay />
      </section></Provider>);
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
  const assetOverlayHtml = path.join(output, 'real-estate-asset-overlay.html');
  fs.writeFileSync(assetOverlayHtml, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body class="bp5-dark"><main style="padding:16px">${fixture.renderAssetOverlay()}</main></body></html>`);
  const assetOverlayEnv = { ...process.env }; delete assetOverlayEnv.ELECTRON_RUN_AS_NODE;
  const assetOverlayRun = spawnSync(require('electron'), [__filename, '--render', assetOverlayHtml, output], { encoding: 'utf8', windowsHide: true, env: assetOverlayEnv });
  process.stdout.write(assetOverlayRun.stdout || '');
  if (assetOverlayRun.status !== 0) throw new Error(assetOverlayRun.stderr || `Property form layout failed: ${assetOverlayRun.status}`);
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
