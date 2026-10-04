/** @jest-environment node */
import { fetchEuroExchangeRates } from './euroExchangeRates';

it('inverts one EUR snapshot and retains its provider timestamp', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
    result: 'success', base_code: 'EUR', time_last_update_unix: 1791000000,
    rates: { EUR: 1, USD: 1.25, DKK: 7.5, CHF: 0.9, BAD: 0 },
  }) });
  const result = await fetchEuroExchangeRates(fetcher);
  expect(result.rates).toEqual({ EUR: 1, USD: 0.8, DKK: 1 / 7.5, CHF: 1 / 0.9 });
  expect(result.asOf).toBe(new Date(1791000000 * 1000).toISOString());
  expect(result.source).toBe('ExchangeRate-API');
});

it.each([
  { result: 'error' },
  { result: 'success', base_code: 'USD', time_last_update_unix: 1791000000, rates: { EUR: 1 } },
  { result: 'success', base_code: 'EUR', rates: { EUR: 1 } },
])('rejects an unsuccessful, mismatched or undated snapshot', async data => {
  await expect(fetchEuroExchangeRates(jest.fn().mockResolvedValue({ ok: true, json: async () => data }))).rejects.toThrow();
});
