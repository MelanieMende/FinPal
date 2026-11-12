import { act, fireEvent, screen, within } from '@testing-library/react'
import { render } from '../../../../testing/test-utils'
import CashRoute from './CashRoute'

describe('CashRoute component', () => {
  it('renders header and table', async () => {
    render(<CashRoute />, { preloadedState: { cash: [] } })
    await act(async () => {})
    expect(screen.getByText('Cash Management')).toBeInTheDocument()
    expect(screen.getByTestId('CashRoute')).toBeInTheDocument()
  })

  it('shows existing cash entries and totals', async () => {
    const entries = [
      { ID:1, date:'2022-01-01', type:'Deposit', amount:100, fee:5, comment:'foo' },
      { ID:2, date:'2022-01-02', type:'Withdrawal', amount:50, fee:2, comment:'bar' }
    ]
    render(<CashRoute />, { preloadedState: { cash: entries } })
    await act(async () => {})
    expect(screen.getByTestId('cash-item-1')).toBeInTheDocument()
    expect(screen.getByTestId('cash-item-2')).toBeInTheDocument()
    const totals = screen.getByTestId('cash-totals-row')
    expect(totals).toBeInTheDocument()
    expect(totals).toHaveTextContent('150') // sum amount
    expect(totals).toHaveTextContent('7')   // sum fee
  })

  it('offers interest as a separate type and adds it to liquidity without counting it as a deposit', async () => {
    const { store } = render(<CashRoute />, { preloadedState: {
      cash: [
        { ID: 1, date: '2026-10-01', type: 'Deposit', amount: 100, fee: 5 },
        { ID: 2, date: '2026-10-01', type: 'Withdrawal', amount: 50, fee: 2 },
        { ID: 3, date: '2026-10-01', type: 'Interest', amount: 10 },
      ],
      transactions: [], dividends: [],
    } })
    await act(async () => {})
    const typeSelect = screen.getByRole('combobox', { name: 'Cash transaction type' })
    fireEvent.change(typeSelect, { target: { value: 'Interest' } })
    expect(store.getState().cashTransactionCreation.typeInput).toBe('Interest')
    expect(screen.getByTestId('cash-item-3')).toHaveTextContent('Interest')
    const expectTotal = (label: string, amount: string) => {
      expect(within(screen.getByText(label).parentElement!).getByText(amount)).toBeInTheDocument()
    }
    expectTotal('Total Deposits', '100,00 €')
    expectTotal('Total Interest', '10,00 €')
    expectTotal('Verfügbares Cash', '53,00 €')
  })

  it('shows IPO reservations separately and subtracts them from available cash', async () => {
    render(<CashRoute />, { preloadedState: {
      cash: [{ ID: 1, date: '2026-11-01', type: 'Deposit', amount: 1000 }],
      assets: [{ ID: 7, type: 'IPO', name: 'Anthropic', symbol: 'ANTH', isin: 'US03703U1079', reserved_amount: 201 } as Asset],
      transactions: [], dividends: [],
    } })
    await act(async () => {})
    expect(within(screen.getByText('Verfügbares Cash').parentElement!).getByText('799,00 €')).toBeInTheDocument()
    expect(within(screen.getByText('Für IPOs reserviert').parentElement!).getByText('201,00 €')).toBeInTheDocument()
  })
})
