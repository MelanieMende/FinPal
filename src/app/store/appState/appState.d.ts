export default interface AppState {
  selectedTab: "databaseTab" | "assetsTab" | "transactionsTab" | "dividendsTab",
  theme?: string,
  database?: string,
  assetOverlayType?: AssetOverlayType,
  showAssetOverlay?: boolean,
  transactions_AssetFilter?: integer[],
  dividends_AssetFilter?: integer[]
}
