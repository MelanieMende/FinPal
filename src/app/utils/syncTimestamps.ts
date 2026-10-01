export const MARKET_PRICE_UPDATED_AT_KEY = 'finpal.marketPriceUpdatedAt.v1';
export const MARKET_PRICE_UPDATED_EVENT = 'finpal:market-price-updated';

export function formatSyncTime(value?: string | null): string | null {
	if (!value || !Number.isFinite(Date.parse(value))) return null;
	return new Intl.DateTimeFormat('de-DE', {
		dateStyle: 'short', timeStyle: 'short',
	}).format(new Date(value));
}

export function recordMarketPriceUpdate(): void {
	const timestamp = new Date().toISOString();
	localStorage.setItem(MARKET_PRICE_UPDATED_AT_KEY, timestamp);
	window.dispatchEvent(new CustomEvent(MARKET_PRICE_UPDATED_EVENT, { detail: timestamp }));
}
