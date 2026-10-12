import type { TradeRepublicQuote } from './tradeRepublicSync';

// Only exact broker instrument identities and explicit product types are evidence.
export function brokerProduct(asset: Pick<Asset, 'isin'>, quotes: TradeRepublicQuote[]): Asset['brokerProduct'] {
  const id = asset.isin?.trim().toUpperCase();
  if (!id) return undefined;
  const matches = quotes.filter(q => q.isin?.trim().toUpperCase() === id);
  if (matches.length !== 1) return undefined;
  const type = matches[0].instrumentType?.toLowerCase();
  const kind = type === 'crypto' ? 'direct-crypto'
    : ['stock', 'fund', 'etf', 'bond', 'etp', 'etc', 'etn'].includes(type ?? '') ? 'security' : undefined;
  return kind ? { kind, source: 'trade-republic', instrumentId: id, instrumentType: type! } : undefined;
}
