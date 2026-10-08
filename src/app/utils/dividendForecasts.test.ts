import { upcomingForecasts, selectUpcomingPayments } from './dividendForecasts';
it('finds the nearest future payment regardless of provider ordering and includes today', () => {
  const input = [{ payDate: '2026-01-01', amount: 1 }, { payDate: '2026-12-01', amount: 3 }, { payDate: '2026-10-08', amount: 2 }, { payDate: '2026-02-30', amount: 4 }];
  expect(upcomingForecasts(input, '2026-10-08').map(d => d.amount)).toEqual([2, 3]);
  expect(input[0].amount).toBe(1);
});
it('keeps original currency when FX is missing instead of labelling foreign amounts as EUR', () => {
  const asset = { current_shares: 2, dividends: [{ payDate: '2026-10-10', amount: 1.5, currency: 'USD' }] } as Asset;
  expect(selectUpcomingPayments([asset], '2026-10-08')[0]).toMatchObject({ value: 3, currency: 'USD' });
});
