// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
//import * as appState from './api/appStateAPI'
import { app, contextBridge, ipcRenderer, webUtils } from 'electron';

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
      const replyId = `async-db-reply-${Date.now()}-${Math.random()}`;
      ipcRenderer.send('async-db-message', { sql, replyId });
      ipcRenderer.once(replyId, (_, arg) => {
          resolve(arg);
      });
    });
  },
  sendToYahooFinanceAPI(args: { symbol:string, isin?:string, type?:Asset['type']}) {
    return ipcRenderer.invoke('yahoo-finance-api-message', args);
  },
  sendToDivvyDiaryAPI(args: { isin:string}) {
    return ipcRenderer.invoke('divvy-diary-api-message', args);
  },
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  parsePDF: (filePath: string) => ipcRenderer.invoke('pdf:parse', filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getTradeRepublicStatus: () => ipcRenderer.invoke('trade-republic:status'),
  syncTradeRepublic: (args: { phone?: string; pin?: string; remember?: boolean }) => ipcRenderer.invoke('trade-republic:sync', args),
  getTradeRepublicQuotes: () => ipcRenderer.invoke('trade-republic:quotes'),
  forgetTradeRepublicCredentials: () => ipcRenderer.invoke('trade-republic:forget'),
  getPortfolioAIStatus: () => ipcRenderer.invoke('portfolio-ai:status'),
  savePortfolioAIKey: (key: string) => ipcRenderer.invoke('portfolio-ai:save-key', key),
  forgetPortfolioAIKey: () => ipcRenderer.invoke('portfolio-ai:forget-key'),
  signInPortfolioChatGpt: (clientId?: string) => ipcRenderer.invoke('portfolio-ai:chatgpt-sign-in', clientId),
  cancelPortfolioChatGptSignIn: () => ipcRenderer.invoke('portfolio-ai:chatgpt-cancel'),
  signOutPortfolioChatGpt: () => ipcRenderer.invoke('portfolio-ai:chatgpt-sign-out'),
  getPortfolioChatGptModels: () => ipcRenderer.invoke('portfolio-ai:chatgpt-models'),
  getLastPortfolioAnalysis: () => ipcRenderer.invoke('portfolio-ai:last-result'),
  forgetLastPortfolioAnalysis: () => ipcRenderer.invoke('portfolio-ai:forget-result'),
  analyzePortfolio: (request: import('./app/utils/portfolioAnalysis').PortfolioAnalysisRequest, snapshot?: string) => ipcRenderer.invoke('portfolio-ai:analyze', request, snapshot),
  onPortfolioAnalysisProgress: (callback: (progress: import('./app/utils/portfolioAnalysis').PortfolioAnalysisProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: import('./app/utils/portfolioAnalysis').PortfolioAnalysisProgress) => callback(progress);
    ipcRenderer.on('portfolio-ai:progress', listener);
    return () => { ipcRenderer.removeListener('portfolio-ai:progress', listener); };
  },
  openPortfolioAnalysisSource: (url: string) => ipcRenderer.invoke('portfolio-ai:open-source', url),
})
