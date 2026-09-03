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
      sendToDB(sql:string):any,
      sendToYahooFinanceAPI?(args:{symbol:string}):any,
      sendToDivvyDiaryAPI?(args:{isin:string}):any,
      openFiles?():Promise<string[]>,
      parsePDF?(filePath:string):Promise<string>,
      getPathForFile?: (file: File) => string,
      getTradeRepublicStatus?():Promise<{runnerAvailable:boolean; hasSavedCredentials:boolean}>,
      syncTradeRepublic?(args:{phone?:string; pin?:string; remember?:boolean}):Promise<{records:import('./app/utils/tradeRepublicSync').TradeRepublicRecord[]; skipped:number}>,
      forgetTradeRepublicCredentials?():Promise<boolean>,
      quit?():any
    }
  }
}
