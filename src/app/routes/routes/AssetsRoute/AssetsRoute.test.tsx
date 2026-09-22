import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { render } from '../../../../testing/test-utils'
import AssetsRoute from './AssetsRoute';

describe('AssetsRoute component', () => {

	it('groups current values by asset type with English labels', async () => {
		const assets = [
			{ ID: 1, type: 'Stock', current_shares: 2, price: 50 },
			{ ID: 2, type: 'Stock', current_shares: 3, price: 25 },
			{ ID: 3, type: 'ETF', current_shares: 4, price: 20 },
			{ ID: 4, type: 'Bond', current_shares: 2, price: 30 },
			{ ID: 5, type: 'Crypto', current_shares: 0.5, price: 200 },
			{ ID: 6, type: 'Commodity', current_shares: 3, price: 10 },
			{ ID: 7, type: 'RealEstate', current_shares: 2, price: 500 },
			{ ID: 8, type: 'CashEquivalent', current_shares: 5, price: 1 },
			{ ID: 9, type: 'Stock', current_shares: 0, price: 1000 },
			{ ID: 10, type: 'ETF', current_shares: 10 },
		].map(asset => ({ ...asset, name: `Asset ${asset.ID}`, symbol: `A${asset.ID}`, isin: `ISIN${asset.ID}` })) as Asset[];
		await act(async () => {
			render(<AssetsRoute />, { preloadedState: { assets } });
		});

		const expected = [
			['Stock', 'Stocks', 175, 'chart'], ['ETF', 'ETFs', 80, 'pie-chart'], ['Bond', 'Bonds', 60, 'bank-account'],
			['Crypto', 'Crypto', 100, null], ['Commodity', 'Commodities', 30, 'cube'],
			['RealEstate', 'Real Estate', 1000, 'home'], ['CashEquivalent', 'Cash Equivalents', 5, 'dollar'],
		] as const;
		for (const [type, label, value, icon] of expected) {
			const cardElement = screen.getByTestId(`asset-type-value-${type}`);
			const card = within(cardElement);
			expect(card.getByText(label)).toBeInTheDocument();
			expect(card.getByText(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value).replace(/\s/g, ' '))).toBeInTheDocument();
			if (icon) expect(cardElement.querySelector(`[data-icon="${icon}"]`)).toBeInTheDocument();
		}
		expect(screen.getByTestId('asset-type-symbol-Crypto')).toHaveTextContent('₿');
		expect(screen.queryByText('Total Gain/Loss')).not.toBeInTheDocument();
	});

	it('filters the asset list when an asset type card is toggled', async () => {
		const assets = [
			{ ID: 1, type: 'Stock', name: 'Stock Asset', symbol: 'STK', isin: 'STOCK', current_shares: 2, price: 50 },
			{ ID: 2, type: 'Crypto', name: 'Crypto Asset', symbol: 'CRY', isin: 'CRYPTO', current_shares: 1, price: 75 },
		] as Asset[];
		await act(async () => {
			render(<AssetsRoute />, { preloadedState: { assets } });
		});

		const cryptoCard = screen.getByTestId('asset-type-value-Crypto');
		await act(async () => {
			fireEvent.click(cryptoCard);
		});
		expect(cryptoCard).toHaveAttribute('aria-pressed', 'true');
		expect(screen.queryByTestId('asset-row-1')).not.toBeInTheDocument();
		expect(screen.getByTestId('asset-row-2')).toBeInTheDocument();
		expect(screen.getByText('1 Active')).toBeInTheDocument();

		await act(async () => {
			fireEvent.click(cryptoCard);
		});
		expect(cryptoCard).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByTestId('asset-row-1')).toBeInTheDocument();
		expect(screen.getByTestId('asset-row-2')).toBeInTheDocument();
	});

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
      expect(getByText(/\+400,00\s*€ \/ \+266\.67%/)).toBeDefined()
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

	 it('sums only realized gain/loss including dividends for every asset', () => {
		const assets = [
			{ID: 1, name: 'Asset 1', symbol: 'A1', isin: 'ISIN1', current_shares: 2, price: 500, current_sum_in_out: -80, current_invest: -100, dividends_earned: 10},
			{ID: 2, name: 'Asset 2', symbol: 'A2', isin: 'ISIN2', current_shares: 0, price: 25, current_sum_in_out: 25, current_invest: 0, dividends_earned: 5},
		] as Asset[];

		render(<AssetsRoute />, { preloadedState: { assets } });

		expect(screen.getByTestId('TableCellGainLossSum')).toHaveTextContent(/\+60,00\s*€/);
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
