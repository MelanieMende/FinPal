interface State {
  appState?: AppState,
  transactions?: Transactions[],
  transactionCreation?: TransactionCreation,
  transactionFilter?: TransactionFilter,
  assets?: Asset[],
  assetCreation?: AssetCreation,
  dividends?: Dividends,
  dividendCreation?: DividendCreation,
  dividendsFilter?: DividendsFilter
}