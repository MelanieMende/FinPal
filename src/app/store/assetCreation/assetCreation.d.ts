interface AssetCreation {
  ID: number,
  typeInput: 'Stock' | 'ETF' | 'Fund' | 'Bond' | 'Crypto' | 'Commodity' | 'RealEstate' | 'CashEquivalent',
  nameInput: string,
  symbolInput: string,
  isinInput: string,
  kgvInput: string,
}