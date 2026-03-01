import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../../../testing/test-utils'
import CashRoute from './CashRoute'

describe('CashRoute component', () => {
  it('renders header and table', () => {
    render(<CashRoute />, { preloadedState: { cash: [] } })
    expect(screen.getByText('Cash Management')).toBeInTheDocument()
    expect(screen.getByTestId('CashRoute')).toBeInTheDocument()
  })

  it('shows existing cash entries', () => {
    const entries = [
      { ID:1, date:'2022-01-01', type:'Deposit', amount:100, comment:'foo' },
      { ID:2, date:'2022-01-02', type:'Withdrawal', amount:50, comment:'bar' }
    ]
    render(<CashRoute />, { preloadedState: { cash: entries } })
    expect(screen.getByTestId('cash-item-1')).toBeInTheDocument()
    expect(screen.getByTestId('cash-item-2')).toBeInTheDocument()
  })
})
