import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import UpcomingDividends from './UpcomingDividends';
const mockStore = configureStore([]);
const today = '2026-10-08';
const asset = { ID: 1, type: 'Stock', name: 'Asset 1', symbol: undefined, isin: 'US5801351017', current_shares: 10,
  current_shares_before_ex_date: 0, next_estimated_dividend_per_share: 0, payDividendDate: '2026-01-01', exDividendDate: '2026-01-01',
  dividends: [{ payDate: today, exDate: '2026-10-01', amount: 1.5, amountEUR: 1.5, currency: 'EUR', eligibleShares: 10 }] } as Asset;
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-08T12:00:00Z')); });
afterEach(() => { jest.useRealTimers(); });
function show(assets: Asset[]) { return render(<Provider store={mockStore({ assets, appState: { theme: 'bp5-dark' } })}><UpcomingDividends /></Provider>); }
it('shows todays payment despite stale summary fields and a missing ticker', () => {
  show([asset]);
  expect(screen.getByText('Asset 1')).toBeInTheDocument();
  expect(screen.getByText('15,00 \u20ac')).toBeInTheDocument();
  expect(screen.getByText('08.10.2026')).toBeInTheDocument();
  expect(screen.getAllByRole('columnheader')).toHaveLength(5);
});
it('uses each payment amount and sorts independent upcoming events', () => {
  show([{ ...asset, dividends: [{ payDate: '2026-11-01', exDate: '2026-10-20', amount: 2, amountEUR: 2, eligibleShares: 10 }, ...asset.dividends!, { payDate: '2026-01-01', amount: 99 }] }]);
  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getByText('15,00 \u20ac')).toBeInTheDocument();
  expect(within(rows[2]).getByText('20,00 \u20ac')).toBeInTheDocument();
});
it('uses current holdings for future ex-dates instead of an outdated zero ex-date balance', () => {
  show([{ ...asset, exDividendDate: '2026-10-20', dividends: [{ payDate: '2026-11-01', exDate: '2026-10-20', amount: 2, currency: 'USD' }] }]);
  expect(screen.getByText(/20,00/)).toHaveTextContent('$');
});
it('preserves a sold positions entitlement after the ex-date', () => {
  show([{ ...asset, current_shares: 0 }]);
  expect(screen.getByText('15,00 \u20ac')).toBeInTheDocument();
});
it.each([[], [{ ...asset, dividends: [] }], [{ ...asset, dividends: [{ payDate: '2026-10-07', amount: 1, eligibleShares: 10 }] }], [{ ...asset, dividends: [{ payDate: today, amount: 1, eligibleShares: 0 }] }]].map(assets => [assets]))('shows a clear empty state without guessing payouts', assets => {
  show(assets as Asset[]);
  expect(screen.getByText('Keine kommenden Zahlungen geladen.')).toBeInTheDocument();
  expect(screen.queryByText('Asset 1')).not.toBeInTheDocument();
});
