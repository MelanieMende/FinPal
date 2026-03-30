interface AssetCreation {
  ID: number,
  typeInput: 'Stock' | 'ETF' | 'Bond' | 'Crypto' | 'Commodity' | 'RealEstate' | 'CashEquivalent',
  nameInput: string,
  symbolInput: string,
  isinInput: string,
  kgvInput: string,
}