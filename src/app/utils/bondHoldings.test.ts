import { summarizeBondHolding } from './bondHoldings';

const rows = [
  { ID: 112, date: '2025-11-03', type: 'Buy', isin: 'US912810SQ22', nominal: 0.19, currency: 'USD', accrued_interest_eur: 0, source: 'user-confirmed' },
  { ID: 113, date: '2025-11-03', type: 'Buy', isin: 'US912810SQ22', nominal: 79.81, currency: 'USD', accrued_interest_eur: -0.17, source: 'user-confirmed' },
];
it('sums confirmed nominal amounts and keeps historical accrued interest separate', () => {
  expect(summarizeBondHolding(rows, 'US912810SQ22')).toMatchObject({ nominal: 80, currency: 'USD', purchaseAccruedInterestEUR: -0.17 });
});
it('does not use incomplete or mismatched details after another trade or an edit', () => {
  expect(summarizeBondHolding([...rows, { ID: 114, type: 'Buy' }], 'US912810SQ22')).toBeUndefined();
  expect(summarizeBondHolding(rows, 'OTHER')).toBeUndefined();
  expect(summarizeBondHolding([rows[0], { ...rows[1], currency: 'EUR' }], 'US912810SQ22')).toBeUndefined();
});
it('deducts confirmed sales from nominal holdings', () => {
  expect(summarizeBondHolding([...rows, { ...rows[0], ID: 114, type: 'Sell', nominal: 10 }], 'US912810SQ22')?.nominal).toBe(70);
});
