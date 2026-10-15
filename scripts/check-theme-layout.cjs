// Renders the actual application with isolated data and no external requests.
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../.vite/theme-check');
async function render() {
  const {app, BrowserWindow} = require('electron');
  app.setPath('userData', path.join(output, 'profile'));
  app.disableHardwareAcceleration();
  await app.whenReady();
  const win = new BrowserWindow({show:false, width:1280, height:1000, webPreferences:{backgroundThrottling:false, offscreen:true}});
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (_details, callback) => callback({cancel:true}));
  try {
    await win.loadFile(path.join(output,'dist/index.html'));
    await win.webContents.executeJavaScript(`(async () => {
      for (let attempt=0;attempt<100 && !window.fixtureReady;attempt++) await new Promise(resolve=>setTimeout(resolve,50));
      if(!window.fixtureReady) throw new Error('Fixture did not initialize');
    })()`);
    await win.webContents.insertCSS('* { transition: none !important; animation: none !important; }');
    for (const zoom of [1,1.25]) for (const width of [900,1280]) {
      win.webContents.setZoomFactor(zoom);
      win.setContentSize(width,1000);
      for (const route of ['dashboard','assets','transactions','dividends','cash','import','analysis']) {
        await win.webContents.executeJavaScript(`window.themeStore.dispatch({type:'appState/setSelectedTab',payload:'${route}Tab'})`);
        await new Promise(resolve => setTimeout(resolve,route === 'dashboard' || route === 'dividends' ? 1800 : 350));
        const result = await win.webContents.executeJavaScript(`(() => {
          const errors = [...window.fixtureErrors];
          const nav=document.querySelector('nav'), content=document.querySelector('#rootContent');
          if(!content?.firstElementChild || !nav) return {errors:[...errors,'Route did not render']};
          if(content.getBoundingClientRect().top < nav.getBoundingClientRect().bottom) errors.push('Content overlaps navigation');
          const settings=document.querySelector('[data-testid="TopNavBarSettings"]').getBoundingClientRect();
          if(Math.abs(settings.width-settings.height)>0.5) errors.push('Settings is not square');
          if(getComputedStyle(content).backgroundColor !== 'rgb(17, 28, 41)') errors.push('Page does not use blue slate palette');
          if(document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) errors.push('Shell overflows viewport');
          return {errors};
        })()`);
        console.log(JSON.stringify({route,width,zoom,...result}));
        if(result.errors.length) throw new Error('Application theme check failed');
        fs.writeFileSync(path.join(output,`${route}-${width}-${zoom}.png`),(await win.webContents.capturePage()).toPNG());
      }
    }
    app.exit(0);
  } catch(error) {console.error(error);app.exit(1);}
}
async function build() {
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html><head><meta charset="utf-8"></head><body class="bp5-dark"><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
  fs.writeFileSync(path.join(output,'entry.tsx'),`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {Provider} from 'react-redux';
    import {Icons} from '@blueprintjs/icons';
    import {setupStore} from '../../src/app/store';
    import RootRoute from '../../src/app/routes/RootRoute';
    import '../../src/app/app.css';
    window.fixtureErrors=[];
    window.addEventListener('error',event=>window.fixtureErrors.push(event.message));
    window.addEventListener('unhandledrejection',event=>window.fixtureErrors.push(String(event.reason)));
    window.API={getConfig:async()=>null,saveSelectedTab:async()=>{},getDivvyDiaryStatus:async()=>({hasApiKey:false,secureStorageAvailable:true}),
      getTradeRepublicStatus:async()=>({runnerAvailable:true,hasSavedCredentials:false}),
      getPortfolioAIStatus:async()=>({hasApiKey:false,secureStorageAvailable:true,chatGpt:{connected:false,accounts:[]}})};
    const assets=[{ID:1,name:'Global Equity ETF',symbol:'ETF',isin:'IE00B4L5Y983',type:'ETF',currencySymbol:'€',price:120,current_shares:25,current_invest:2500,current_sum_in_out:-2500,avg_price_paid:100,dividends_earned:25,is_watched:false},
      {ID:2,name:'Example Stock',symbol:'EXM',isin:'US0000000001',type:'Stock',currencySymbol:'€',price:75,current_shares:10,current_invest:850,current_sum_in_out:-850,avg_price_paid:85,dividends_earned:0,is_watched:false}];
    const transactions=[{ID:1,date:'2026-01-15',type:'Buy',asset_ID:1,depot:'Trade Republic',rank:1,amount:25,shares_cumulated:25,price_per_share:100,fee:1,solidarity_surcharge:0,invest_cumulated:2500,in_out:-2501}];
    window.themeStore=setupStore({appState:{...setupStore().getState().appState,selectedTab:'dashboardTab',theme:'bp5-dark'},assets,transactions,
      dividends:[{ID:1,asset_ID:1,date:'2026-09-01',income:25,tax:0,fee:0}],
      cash:[{ID:1,date:'2026-01-01',type:'Deposit',amount:5000,fee:0,description:'Beispieldaten'}]});
    Icons.loadAll().then(()=>{createRoot(document.getElementById('root')).render(<Provider store={window.themeStore}><RootRoute/></Provider>);window.fixtureReady=true;});
  `);
  const {build}=await import('vite');
  await build({configFile:path.resolve(__dirname,'../config/vite/vite.renderer.config.mjs'),root:output,base:'./',logLevel:'error',build:{outDir:path.join(output,'dist'),emptyOutDir:true}});
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const result=require('node:child_process').spawnSync(require('electron'),[__filename,'--render'],{encoding:'utf8',windowsHide:true,env});
  process.stdout.write(result.stdout||'');
  if(result.status!==0) throw new Error(result.stderr||'Theme renderer failed');
}
(process.argv.includes('--render')?render():build()).catch(error=>{console.error(error);process.exit(1);});
