import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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

  it('renders correctly with empty assets', async () => {
    const assets: Asset[] = [];

    const { getAllById } = render(<AssetsRoute />, { preloadedState: { assets: assets } });

    await waitFor(() => {
      expect(getAllById('AssetsRoute').length).toEqual(1);
      expect(screen.queryByText('400.00 €')).toBeNull();
    });
  });

})