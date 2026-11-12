interface AssetCreation {
  ID: number,
  typeInput: 'Stock' | 'ETF' | 'Fund' | 'Bond' | 'Crypto' | 'Commodity' | 'RealEstate' | 'CashEquivalent' | 'IPO',
  nameInput: string,
  symbolInput: string,
  isinInput: string,
  kgvInput: string,
}
