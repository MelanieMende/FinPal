import { screen, waitFor, within } from '@testing-library/react'
import { render } from '../../../../testing/test-utils'
import AssetsRoute from './AssetsRoute';

describe('AssetsRoute component', () => {

	it('renders', async() => {
    const {getAllById} = render(<AssetsRoute />) 
		await waitFor(() => {
			expect(getAllById('AssetsRoute').length).toEqual(1);
		})
	});

  it('renders assets', async() => {

    const assets = [
      {ID: 1, name: 'test1', symbol: 'test_symbol_1', isin: 'test_isin_1', current_shares: 1, price: 50, current_invest: -50},
      {ID: 2, name: 'test2', symbol: 'test_symbol_2', isin: 'test_isin_2', current_shares: 2, price: 100, current_invest: -50},
      {ID: 3, name: 'test3', symbol: 'test_symbol_3', isin: 'test_isin_3', current_shares: 3, price: 100, current_invest: -50},
    ] as Asset[]

    const {getAllById} = render(<AssetsRoute />, { preloadedState: { assets: assets } })

    await waitFor(() => {
      const { getByText } = within(getAllById('TableCellSumProfitLoss')[0])
      expect(getByText('400.00 €')).toBeDefined()
    })
  });

  it('sums current value from the shares and current price of every asset', () => {
    const assets = [
      {ID: 1, name: 'Asset 1', symbol: 'A1', isin: 'ISIN1', current_shares: 2, price: 50, current_invest: -80},
      {ID: 2, name: 'Asset 2', symbol: 'A2', isin: 'ISIN2', current_shares: 3, price: 25, current_invest: -60},
    ] as Asset[];

    render(<AssetsRoute />, { preloadedState: { assets } });

    expect(screen.getByTestId('TableCellCurrentValueSum')).toHaveTextContent(/175,00\s*€/);
  });

  it('renders correctly with empty assets', async () => {
    const assets: Asset[] = [];

    const { getAllById } = render(<AssetsRoute />, { preloadedState: { assets: assets } });

    await waitFor(() => {
      expect(getAllById('AssetsRoute').length).toEqual(1);
      expect(screen.queryByText('400.00 €')).toBeNull();
    });
  });

})
