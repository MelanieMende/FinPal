// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
//import * as appState from './api/appStateAPI'
import { app, contextBridge, ipcRenderer } from 'electron';

declare global {
  interface Window {
    API: { 
      selectFolder?():any,
      getConfig?():any,
      dbFileExists?():boolean,
      saveSelectedTab?(selectedTab:string):any,
      saveTransactionsAssetFilter?(transactions_AssetFilter:any):any,
      sendToDB?(sql:string):any,
      sendToFinanceAPI?(args:{symbol:string}):any,
      quit?():any
    }
  }
}

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
  sendToFinanceAPI(args: { symbol:string}) {
    return new Promise((resolve) => {
      ipcRenderer.send('finance-api-message', args);
      ipcRenderer.once('finance-api-reply', (_, arg) => {
          resolve(arg);
      });
    });
  },
})