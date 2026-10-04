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
      sendToYahooFinanceAPI?(args:{symbol:string, isin?:string, type?:Asset['type']}):any,
      sendToDivvyDiaryAPI?(args:{isin:string}):any,
      openFiles?():Promise<string[]>,
      parsePDF?(filePath:string):Promise<string>,
      getPathForFile?: (file: File) => string,
      getTradeRepublicStatus?():Promise<{runnerAvailable:boolean; hasSavedCredentials:boolean; lastSyncAt?:string}>,
      syncTradeRepublic?(args:{phone?:string; pin?:string; remember?:boolean}):Promise<{records:import('./app/utils/tradeRepublicSync').TradeRepublicRecord[]; cashRecords:import('./app/utils/tradeRepublicSync').TradeRepublicCashRecord[]; skipped:number; quotes:import('./app/utils/tradeRepublicSync').TradeRepublicQuote[]; quotesFetchedAt?:string; quoteError?:string; lastSyncAt?:string}>,
      getTradeRepublicQuotes?():Promise<import('./app/utils/tradeRepublicSync').TradeRepublicQuoteCache>,
      getEuroExchangeRates?():Promise<import('./app/utils/quoteMetadata').EuroExchangeRates>,
      forgetTradeRepublicCredentials?():Promise<boolean>,
      getPortfolioAIStatus?():Promise<{hasApiKey:boolean; secureStorageAvailable:boolean; model:string; chatGpt:import('./app/utils/chatGptAuth').ChatGptStatus}>,
      savePortfolioAIKey?(key:string):Promise<boolean>,
      forgetPortfolioAIKey?():Promise<boolean>,
      signInPortfolioChatGpt?(clientId?:string):Promise<import('./app/utils/chatGptAuth').ChatGptStatus>,
      cancelPortfolioChatGptSignIn?():Promise<boolean>,
      signOutPortfolioChatGpt?():Promise<{revoked:boolean}>,
      getPortfolioChatGptModels?():Promise<import('./app/utils/chatGptAuth').ChatGptModel[]>,
      getLastPortfolioAnalysis?():Promise<import('./app/utils/portfolioAnalysis').SavedPortfolioAnalysis|null>,
      forgetLastPortfolioAnalysis?():Promise<boolean>,
      analyzePortfolio?(request:import('./app/utils/portfolioAnalysis').PortfolioAnalysisRequest,snapshot?:string):Promise<import('./app/utils/portfolioAnalysis').PortfolioAnalysisResult>,
      onPortfolioAnalysisProgress?(callback:(progress:import('./app/utils/portfolioAnalysis').PortfolioAnalysisProgress)=>void):()=>void,
      openPortfolioAnalysisSource?(url:string):Promise<void>,
      quit?():any
    }
  }
}
