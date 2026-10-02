import { act, screen, within } from '@testing-library/react';
import { render } from '../../../../testing/test-utils';
import DashboardRoute from './DashboardRoute';

jest.mock('../../../components/Charts/AssetAllocationChart', () => function MockAllocationChart(): null { return null; });

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
