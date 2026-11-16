export default interface AppState {
  selectedTab: "databaseTab" | "assetsTab" | "realEstateTab" | "analysisTab" | "transactionsTab" | "dividendsTab" | "dashboardTab" | "cashTab" | "importTab",
  theme?: string,
  database?: string,
  assetOverlayType?: AssetOverlayType,
  showAssetOverlay?: boolean,
  transactions_AssetFilter?: integer[],
  dividends_AssetFilter?: integer[]
}
