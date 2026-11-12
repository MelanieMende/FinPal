import { act, screen, within } from '@testing-library/react';
import { render } from '../../../../testing/test-utils';
import DashboardRoute from './DashboardRoute';

jest.mock('../../../components/Charts/AssetAllocationChart', () => function MockAllocationChart(): null { return null; });

it('excludes an unconvertible position rather than substituting its cost basis for market value', async () => {
  render(<DashboardRoute />, { preloadedState: {
    assets: [{ ID: 1, name: 'Unknown FX', current_shares: 2, current_invest: -500,
      quote: { valuationCurrency: 'unknown' } } as Asset],
    transactions: [], dividends: [], cash: [],
  } });
  await act(async () => {});
  expect(screen.getByRole('status')).toHaveTextContent('EUR-Summen und Allokationen sind unvollständig');
  const card = screen.getByText('Total Net Worth').closest('.glass-card')!;
  expect(within(card as HTMLElement).getByText('0,00 €')).toBeInTheDocument();
});

it('includes cash interest as income in the dashboard balance and net worth', async () => {
  render(<DashboardRoute />, { preloadedState: {
    assets: [], transactions: [], dividends: [],
    cash: [
      { ID: 1, date: '2026-10-01', type: 'Deposit', amount: 100, fee: 5 },
      { ID: 2, date: '2026-10-01', type: 'Withdrawal', amount: 50, fee: 2 },
      { ID: 3, date: '2026-10-01', type: 'Interest', amount: 10 },
    ],
  } });
  await act(async () => {});
  for (const label of ['Cash Balance', 'Total Net Worth']) {
    const card = screen.getByText(label).closest('.glass-card')!;
    expect(within(card as HTMLElement).getByText('53,00 €')).toBeInTheDocument();
  }
});

it('shows net worth change against net personal contributions instead of a fixed percentage', async () => {
  render(<DashboardRoute />, { preloadedState: {
    assets: [{ ID: 1, current_shares: 1, current_invest: -100, price: 120 } as Asset],
    transactions: [{ in_out: -100 } as Transaction], dividends: [],
    cash: [
      { ID: 1, date: '2026-10-01', type: 'Deposit', amount: 100 },
      { ID: 2, date: '2026-10-02', type: 'Credit', amount: 5 },
      { ID: 3, date: '2026-10-03', type: 'Tax Refund', amount: 10 },
      { ID: 4, date: '2026-10-04', type: 'Interest', amount: 2 },
    ],
  } });
  await act(() => Promise.resolve());

  const card = screen.getByText('Total Net Worth').closest('.glass-card')!;
  expect(within(card as HTMLElement).getByText('+37,00 € (+37.0%)')).toBeInTheDocument();
  expect(within(card as HTMLElement).queryByText(/vs\. net contributions/)).not.toBeInTheDocument();
  expect(within(card as HTMLElement).queryByText('+2.4%')).not.toBeInTheDocument();
});

it('shows performance against net contributions after withdrawals', async () => {
  render(<DashboardRoute />, { preloadedState: {
    assets: [], transactions: [], dividends: [],
    cash: [
      { ID: 1, date: '2026-10-01', type: 'Deposit', amount: 100 },
      { ID: 2, date: '2026-10-02', type: 'Withdrawal', amount: 20 },
      { ID: 3, date: '2026-10-03', type: 'Credit', amount: 5 },
    ],
  } });
  await act(() => Promise.resolve());

  const card = screen.getByText('Total Net Worth').closest('.glass-card')!;
  expect(within(card as HTMLElement).getByText('+5,00 € (+6.3%)')).toBeInTheDocument();
});

it('does not present a performance percentage when no personal contributions were recorded', async () => {
  render(<DashboardRoute />, { preloadedState: {
    assets: [{ ID: 1, current_shares: 1, current_invest: -100, price: 120 } as Asset],
    transactions: [], dividends: [], cash: [],
  } });
  await act(() => Promise.resolve());

  const card = screen.getByText('Total Net Worth').closest('.glass-card')!;
  expect(within(card as HTMLElement).getByText('No net contributions recorded')).toBeInTheDocument();
});

it('matches cash management liquidity and includes IPO reservations in total assets', async () => {
  render(<DashboardRoute />, { preloadedState: {
    assets: [{ ID: 7, type: 'IPO', reserved_amount: 201 } as Asset],
    transactions: [], dividends: [],
    cash: [{ ID: 1, date: '2026-11-01', type: 'Deposit', amount: 268.24 }],
  } });
  await act(() => Promise.resolve());

  const cashCard = screen.getByText('Cash Balance').closest('.glass-card')!;
  expect(within(cashCard as HTMLElement).getByText('67,24 €')).toBeInTheDocument();
  const assetsCard = screen.getByText('Total Assets').closest('.glass-card')!;
  expect(within(assetsCard as HTMLElement).getByText('201,00 €')).toBeInTheDocument();
  const netWorthCard = screen.getByText('Total Net Worth').closest('.glass-card')!;
  expect(within(netWorthCard as HTMLElement).getByText('268,24 €')).toBeInTheDocument();
});
