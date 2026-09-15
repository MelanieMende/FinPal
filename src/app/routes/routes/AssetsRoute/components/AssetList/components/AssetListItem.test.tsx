import { fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '../../../../../../../testing/test-utils'
import AssetListItem from './AssetListItem';
import AssetsRoute from './../../../AssetsRoute';

describe('AssetsListItem component', () => {

	it('renders', async() => {
    
    const asset = {ID: 1, type: 'Stock', name: 'test1', symbol: 'test_symbol_1', isin: 'test_isin_1', current_shares: 1, price: 50, current_invest: -50} as Asset

    const {getAllById} = render(<table><tbody><AssetListItem key={"asset-" + 1} i={1} asset={asset} /></tbody></table>) 
		
    await waitFor(() => {
			expect(getAllById('AssetListItem_1').length).toEqual(1);
		})
	});

  it('renders the overlay, after button click', async() => {

    const assets = [
      {ID: 1, type: 'Stock' as const, name: 'test1', symbol: 'test_symbol_1', isin: 'test_isin_1', current_shares: 1, price: 50, current_invest: -50, avg_price_paid: 20},   // current_profit_loss = 0
      {ID: 2, type: 'Stock' as const, name: 'test2', symbol: 'test_symbol_2', isin: 'test_isin_2', current_shares: 2, price: 100, current_invest: -50, avg_price_paid: 100}, // current_profit_loss = 150
      {ID: 3, type: 'Stock' as const, name: 'test3', symbol: 'test_symbol_3', isin: 'test_isin_3', current_shares: 3, price: 100, current_invest: -50, avg_price_paid: 150}, // current_profit_loss = 250
      {ID: 4, type: 'Stock' as const, name: 'test4', symbol: 'test_symbol_4', isin: 'test_isin_4', current_shares: 1, price: 50, current_invest: -150, avg_price_paid: 100}, // current_profit_loss = -100
    ]

    const {getAllById} = render(<AssetsRoute />, { preloadedState: { assets: assets } } )
    
    fireEvent.click(screen.getByTestId('openOverlayButton_1'));

    await waitFor(() => {
      expect(getAllById('AssetOverlay').length).toEqual(1);
		})
	});

	it('renders the current investment amount', () => {
		const asset = {ID: 1, type: 'Stock', name: 'test1', symbol: 'TST', isin: 'test_isin_1', current_shares: 1, price: 50, current_invest: -101, avg_price_paid: 50} as Asset;
		render(<table><tbody><AssetListItem i={1} asset={asset} /></tbody></table>);

		expect(screen.getByTestId('current-invest-1')).toHaveTextContent(/-101,00\s*€/);
	});

	it('toggles the transactions belonging to the asset when its row is clicked', () => {
		const asset = {ID: 1, type: 'Stock', name: 'test1', symbol: 'TST', isin: 'test_isin_1', current_shares: 1, price: 50, current_invest: -50, avg_price_paid: 50} as Asset;
		const transactions = [
			{ID: 10, date: '2026-09-15', type: 'Buy', asset_ID: 1, amount: 2, price_per_share: 50, fee: 1, solidarity_surcharge: 0, in_out: -101},
			{ID: 11, date: '2026-09-14', type: 'Buy', asset_ID: 2, amount: 3, price_per_share: 20, fee: 0, solidarity_surcharge: 0, in_out: -60},
		] as Transaction[];

		render(<table><tbody><AssetListItem i={1} asset={asset} /></tbody></table>, { preloadedState: { transactions } });
		const row = screen.getByTestId('asset-row-1');

		expect(screen.queryByTestId('asset-transactions-1')).not.toBeInTheDocument();
		fireEvent.click(row);
		expect(screen.getByTestId('asset-transactions-1')).toHaveTextContent('15.9.2026');
		expect(screen.getByTestId('asset-transactions-1')).toHaveTextContent(/-101,00\s*€/);
		expect(screen.getByTestId('asset-transactions-1')).not.toHaveTextContent(/-60,00\s*€/);
		expect(row).toHaveAttribute('aria-expanded', 'true');

		fireEvent.click(row);
		expect(screen.queryByTestId('asset-transactions-1')).not.toBeInTheDocument();
		expect(row).toHaveAttribute('aria-expanded', 'false');
	});

	it('does not toggle transactions when the edit button is clicked', () => {
		const asset = {ID: 1, type: 'Stock', name: 'test1', symbol: 'TST', isin: 'test_isin_1', current_shares: 1, price: 50, current_invest: -50, avg_price_paid: 50} as Asset;
		render(<table><tbody><AssetListItem i={1} asset={asset} /></tbody></table>);

		fireEvent.click(screen.getByTestId('openOverlayButton_1'));
		expect(screen.queryByTestId('asset-transactions-1')).not.toBeInTheDocument();
	});

  it('renders the formatted ex dividend date, if there is one', async() => {

    const assets = [
      {ID: 1, type: 'Stock' as const, name: 'test1', symbol: 'test_symbol_1', isin: 'test_isin_1', current_shares: 1, price: 50, current_invest: -50, avg_price_paid: 20, exDividendDate: "2024-11-15"}
    ]

    const {getAllById} = render(<AssetsRoute />, { preloadedState: { assets: assets } } )

    await waitFor(() => {
			expect(getAllById('AssetListItem_1_exDividendDate')[0].innerHTML).toEqual('15.11.2024');
		})
	});

  it('renders "" if there is no ex dividend date', async() => {

    const assets = [
      {ID: 1, type: 'Stock' as const, name: 'test1', symbol: 'test_symbol_1', isin: 'test_isin_1', current_shares: 1, price: 50, current_invest: -50, avg_price_paid: 20}
    ]

    const {getAllById} = render(<AssetsRoute />, { preloadedState: { assets: assets} })

    await waitFor(() => {
			expect(getAllById('AssetListItem_1_exDividendDate')[0].innerHTML).toEqual('');
		})
	});

  it('renders the formatted pay dividend date, if there is one', async() => {

    const assets = [
      {ID: 1, type: 'Stock' as const, name: 'test1', symbol: 'test_symbol_1', isin: 'test_isin_1', current_shares: 1, price: 50, current_invest: -50, avg_price_paid: 20, payDividendDate: "2024-11-15"}
    ]

    const {getAllById} = render(<AssetsRoute />, { preloadedState: { assets: assets } })

    await waitFor(() => {
			expect(getAllById('AssetListItem_1_payDividendDate')[0].innerHTML).toEqual('15.11.2024');
		})
	});

  it('renders "" if there is no pay dividend date', async() => {

    const assets = [
      {ID: 1, type: 'Stock' as const, name: 'test1', symbol: 'test_symbol_1', isin: 'test_isin_1', current_shares: 1, price: 50, current_invest: -50, avg_price_paid: 20}
    ]

    const {getAllById} = render(<AssetsRoute />, { preloadedState: { assets: assets } })

    await waitFor(() => {
			expect(getAllById('AssetListItem_1_payDividendDate')[0].innerHTML).toEqual('');
		})
	});

})
