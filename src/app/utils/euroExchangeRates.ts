import type { EuroExchangeRates } from './quoteMetadata';

export async function fetchEuroExchangeRates(fetcher: typeof fetch = fetch): Promise<EuroExchangeRates> {
  const response = await fetcher('https://open.er-api.com/v6/latest/EUR', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Wechselkurse konnten nicht geladen werden.');
  const data = await response.json();
  if (data.result !== 'success' || data.base_code !== 'EUR' || !data.rates
    || !Number.isFinite(data.time_last_update_unix) || data.time_last_update_unix <= 0) {
    throw new Error('Ungültige Wechselkursdaten.');
  }
  const rates: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(data.rates)) {
    if (/^[A-Z]{3}$/.test(currency) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
      rates[currency] = 1 / rate; // EUR per unit of the quote currency.
    }
  }
  if (rates.EUR !== 1) throw new Error('Ungültige Wechselkursbasis.');
  return { rates, source: 'ExchangeRate-API', asOf: new Date(data.time_last_update_unix * 1000).toISOString(), fetchedAt: new Date().toISOString() };
}
