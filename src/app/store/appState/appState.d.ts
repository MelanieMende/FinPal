export default interface AppState {
  selectedTab: "databaseTab" | "assetsTab" | "analysisTab" | "transactionsTab" | "dividendsTab" | "dashboardTab" | "cashTab",
  theme?: string,
  database?: string,
  assetOverlayType?: AssetOverlayType,
  showAssetOverlay?: boolean,
  transactions_AssetFilter?: integer[],
  dividends_AssetFilter?: integer[]
}
