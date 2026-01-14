// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
//import * as appState from './api/appStateAPI'
import { app, contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('API', {
  quit: () => app.quit(),
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  getConfig: () => ipcRenderer.invoke('get-config').then((result) => {
    console.log('getConfig result:', result);
    return result;
  }),
  dbFileExists() {
    return new Promise((resolve) => {
      ipcRenderer.send('check-if-db-file-exists');
      ipcRenderer.once('check-if-db-file-exists', (_, arg) => {
          resolve(arg);
      });
    });
  },
  saveTheme(theme:string) {
    return new Promise((resolve) => {
      ipcRenderer.send('save-theme', theme);
      ipcRenderer.once('save-theme', (_, arg) => {
          resolve(arg);
      });
    });
  },
  saveDatabase(database:string) {
    return new Promise((resolve) => {
      ipcRenderer.send('save-database', database);
      ipcRenderer.once('save-database', (_, arg) => {
          resolve(arg);
      });
    });
  },
  saveSelectedTab(selectedTab:string) {
    return new Promise((resolve) => {
      ipcRenderer.send('save-selected-tab', selectedTab);
      ipcRenderer.once('save-selected-tab', (_, arg) => {
          resolve(arg);
      });
    });
  },
  saveTransactionsAssetFilter(assetIDs:number[]) {
    return new Promise((resolve) => {
      ipcRenderer.send('save-transactions-assetfilter', assetIDs);
      ipcRenderer.once('save-transactions-assetfilter', (_, arg) => {
          resolve(arg);
      });
    });
  },
  sendToDB(sql:any) {
    console.log(sql)
    return new Promise((resolve) => {
      ipcRenderer.send('async-db-message', sql);
      ipcRenderer.once('async-db-reply', (_, arg) => {
          resolve(arg);
      });
    });
  },
  sendToYahooFinanceAPI(args: { symbol:string}) {
    return new Promise((resolve) => {
      ipcRenderer.send('yahoo-finance-api-message', args);
      ipcRenderer.once('yahoo-finance-api-reply', (_, arg) => {
          resolve(arg);
      });
    });
  },
  sendToDivvyDiaryAPI(args: { isin:string}) {
    return new Promise((resolve) => {
      ipcRenderer.send('divvy-diary-api-message', args);
      ipcRenderer.once('divvy-diary-api-reply', (_, arg) => {
          resolve(arg);
      });
    });
  },
})