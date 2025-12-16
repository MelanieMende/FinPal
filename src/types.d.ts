export {};

declare global {
  interface Window {
    API: { 
      selectFolder?():any,
      getConfig?():any,
      dbFileExists?():boolean,
      saveTheme?(theme:string):any,
      saveDatabase?(database:string):any,
      saveSelectedTab?(selectedTab:string):any,
      saveTransactionsAssetFilter?(transactions_AssetFilter:any):any,
      sendToDB?(sql:string):any,
      sendToFinanceAPI?(args:{symbol:string}):any,
      quit?():any
    }
  }
}