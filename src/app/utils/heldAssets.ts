export function realEstateEquityEUR(asset: Pick<Asset, 'type' | 'property_market_value' | 'property_ownership_share' | 'property_mortgage_balance'>): number | null {
  if (asset.type !== 'RealEstate') return null;
  const marketValue = asset.property_market_value;
  const ownershipShare = asset.property_ownership_share ?? 100;
  const mortgage = asset.property_mortgage_balance ?? 0;
  if (![marketValue, ownershipShare, mortgage].every(value => typeof value === 'number' && Number.isFinite(value))) return null;
  return marketValue! * ownershipShare / 100 - mortgage;
}

export function isCurrentlyHeldAsset(asset: Pick<Asset, 'type' | 'current_shares' | 'property_market_value' | 'property_ownership_share'>): boolean {
  if (asset.type === 'RealEstate') return typeof asset.property_market_value === 'number' && asset.property_market_value > 0
    && (asset.property_ownership_share ?? 100) > 0;
  return typeof asset.current_shares === 'number' && asset.current_shares > 0;
}
