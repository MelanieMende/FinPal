// Real renderer check using the production navigation and stylesheet, isolated from user data.
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../.vite/navigation-check');
async function render() {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', path.join(output, 'profile'));
  app.disableHardwareAcceleration();
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1280, height: 500, webPreferences: { backgroundThrottling: false } });
  try {
    await win.loadFile(path.join(output, 'dist/index.html'));
    // Hidden Chromium windows may suspend transition frames; inspect the settled styles.
    await win.webContents.insertCSS('#TopNavBar * { transition: none !important; animation: none !important; }');
    for (const theme of ['bp5-dark', 'bp5-body']) {
      await win.webContents.executeJavaScript(`window.setNavTheme('${theme}')`);
      for (const zoom of [1, 1.25]) for (const width of [320, 640, 849, 850, 900, 1099, 1100, 1280, 1600]) {
        win.webContents.setZoomFactor(zoom);
        win.setContentSize(width, 500);
        await new Promise(resolve => setTimeout(resolve, 250));
        const result = await win.webContents.executeJavaScript(`(async () => {
          await document.fonts.ready;
          const nav = document.querySelector('nav');
          const controls = [...nav.querySelectorAll('button,[role="tab"],.finpal-wordmark')];
          const errors = [];
          const rects = controls.map(el => ({ el, r: el.getBoundingClientRect() }));
          if (nav.scrollWidth > nav.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1) errors.push('Overflow');
          for (const {el,r} of rects) if (r.left < 0 || r.right > innerWidth + 1) errors.push('Control outside viewport: ' + el.textContent);
          for (let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++) {
            const a=rects[i].r,b=rects[j].r;
            if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) errors.push('Overlapping controls');
          }
          const more = nav.querySelector('.finpal-nav-more');
          if (more) {
            more.click();
            await new Promise(resolve => setTimeout(resolve, 200));
            const cash = [...document.querySelectorAll('.bp5-menu-item')].find(el => el.textContent === 'Cash');
            if (!cash) errors.push('Cash missing from overflow');
            else { cash.click(); await new Promise(resolve => setTimeout(resolve, 100));
              if (window.navStore.getState().appState.selectedTab !== 'cashTab') errors.push('Overflow navigation failed'); }
          }
          document.querySelector('[data-testid="importTab"]').click();
          await new Promise(resolve => setTimeout(resolve, 100));
          if (window.navStore.getState().appState.selectedTab !== 'importTab') errors.push('Import navigation failed');
          window.navStore.dispatch({type:'appState/setSelectedTab',payload:'transactionsTab'});
          await new Promise(resolve => setTimeout(resolve, 350));
          const active = nav.querySelector('[aria-selected="true"], .finpal-nav-more.is-active');
          if (!active || getComputedStyle(active).backgroundColor === 'rgba(0, 0, 0, 0)') {
            const matches = [];
            const walk = rules => [...rules].forEach(rule => {
              if (rule.selectorText && active?.matches(rule.selectorText) && rule.style?.cssText.includes('background')) matches.push(rule.cssText);
              if (rule.cssRules) walk(rule.cssRules);
            });
            [...document.styleSheets].forEach(sheet => walk(sheet.cssRules));
            errors.push('Active section has no background: ' + JSON.stringify(matches));
          }
          return { viewport: innerWidth, errors };
        })()`);
        console.log(JSON.stringify({theme, width, zoom, ...result}));
        if(result.errors.length) throw new Error('Navigation layout failed');
        if ([320,900,1280].includes(width)) fs.writeFileSync(path.join(output, `navigation-${theme}-${width}-${zoom}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
    app.exit(0);
  } catch(error) { console.error(error); app.exit(1); }
}
async function build() {
  fs.mkdirSync(output, {recursive:true});
  fs.writeFileSync(path.join(output,'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
  fs.writeFileSync(path.join(output,'entry.tsx'), `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {Provider} from 'react-redux';
    import {setupStore} from '../../src/app/store';
    import TopNavBar from '../../src/app/routes/components/TopNavBar/TopNavBar';
    import '../../src/app/app.css';
    window.API = {saveSelectedTab: async () => {}, getPortfolioAIStatus: async () => ({chatGpt:{accounts:[]}})};
    window.navStore = setupStore({appState:{selectedTab:'transactionsTab',theme:'bp5-dark'}});
    window.setNavTheme = theme => {document.body.className=theme;window.navStore.dispatch({type:'appState/setTheme',payload:theme});};
    createRoot(document.getElementById('root')).render(<Provider store={window.navStore}><TopNavBar/><div id="Title" className="bg-linear-to-l from-indigo-500 via-sky-500 to-emerald-500" /></Provider>);
  `);
  const {build} = await import('vite');
  await build({configFile:path.resolve(__dirname,'../config/vite/vite.renderer.config.mjs'),root:output,base:'./',logLevel:'error',build:{outDir:path.join(output,'dist'),emptyOutDir:true}});
  const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const result=require('node:child_process').spawnSync(require('electron'),[__filename,'--render'],{encoding:'utf8',windowsHide:true,env});
  process.stdout.write(result.stdout || '');
  if(result.status !== 0) throw new Error(result.stderr || `Renderer exited ${result.status}`);
}
(process.argv.includes('--render') ? render() : build()).catch(error => {console.error(error);process.exit(1);});
