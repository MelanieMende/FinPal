import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { render } from '../../../../testing/test-utils'
import AssetsRoute, { ASSET_TYPE_FILTER_KEY } from './AssetsRoute';
import { MARKET_PRICE_UPDATED_AT_KEY, MARKET_PRICE_UPDATED_EVENT } from '../../../utils/syncTimestamps';

describe('AssetsRoute component', () => {
	const originalSaveSelectedTab = window.API.saveSelectedTab;
	beforeEach(() => localStorage.removeItem(ASSET_TYPE_FILTER_KEY));
	afterEach(() => {
		localStorage.removeItem(ASSET_TYPE_FILTER_KEY);
		window.API.saveSelectedTab = originalSaveSelectedTab;
	});

	it.each(['click', 'Enter', ' '])('opens the Cash tab via %s without changing the asset filter', async (activation) => {
		window.API.saveSelectedTab = jest.fn().mockResolvedValue(undefined);
		localStorage.setItem(ASSET_TYPE_FILTER_KEY, 'Stock');
		const { store } = render(<AssetsRoute />, { preloadedState: {
			assets: [], transactions: [], dividends: [],
			cash: [{ ID: 1, date: '2026-10-09', type: 'Deposit', amount: 125 }],
		} });
		const card = screen.getByRole('link', { name: /Cash/ });
		expect(card).toHaveTextContent(/125,00/);
		expect(card.parentElement?.lastElementChild).toBe(card);
		await act(async () => {
			if (activation === 'click') fireEvent.click(card);
			else fireEvent.keyDown(card, { key: activation });
		});
		expect(store.getState().appState.selectedTab).toBe('cashTab');
		expect(window.API.saveSelectedTab).toHaveBeenCalledWith('cashTab');
		expect(localStorage.getItem(ASSET_TYPE_FILTER_KEY)).toBe('Stock');
		expect(screen.getByTestId('asset-type-value-Stock')).toHaveAttribute('aria-pressed', 'true');
	});

	it('shows total wealth first, including liquidity and cash equivalent positions once, regardless of the filter', async () => {
		const assets = [
			{ ID: 1, type: 'Stock', name: 'Stock', symbol: 'STK', isin: 'STOCK', current_shares: 2, price: 50 },
			{ ID: 2, type: 'CashEquivalent', name: 'Cash equivalent', symbol: 'CE', isin: 'CASH', current_shares: 5, price: 10 },
		] as Asset[];
		await act(async () => {
			render(<AssetsRoute />, { preloadedState: {
				assets,
				cash: [
					{ ID: 1, date: '2026-10-09', type: 'Deposit', amount: 300, fee: 2 },
					{ ID: 2, date: '2026-10-09', type: 'Withdrawal', amount: 20 },
					{ ID: 3, date: '2026-10-09', type: 'Interest', amount: 5 },
				],
				transactions: [{ ID: 1, asset_ID: 1, in_out: -100 }] as Transaction[],
				dividends: [{ ID: 1, asset_ID: 1, income: 7 }] as Dividend[],
			} });
		});
		// Positions 150 + liquidity (300 - 2 - 20 + 5 - 100 + 7) = 340.
		const total = screen.getByTestId('asset-total-wealth');
		expect(total.parentElement?.firstElementChild).toBe(total);
		expect(total).toHaveTextContent('Total Wealth');
		expect(total).toHaveTextContent(/340,00/);
		await act(async () => fireEvent.click(screen.getByTestId('asset-type-value-Stock')));
		expect(total).toHaveTextContent(/340,00/);
		expect(screen.getByTestId('TableCellCurrentValueSum')).toHaveTextContent(/100,00/);
	});

	it('includes negative liquidity even when there are no positions', async () => {
		await act(async () => {
			render(<AssetsRoute />, { preloadedState: {
				assets: [], transactions: [], dividends: [],
				cash: [{ ID: 1, date: '2026-10-09', type: 'Withdrawal', amount: 25 }],
			} });
		});
		expect(screen.getByTestId('asset-total-wealth')).toHaveTextContent(/-25,00/);
	});

	it('shows a saved market price time and updates it when a new quote arrives', async () => {
		localStorage.setItem(MARKET_PRICE_UPDATED_AT_KEY, '2026-10-01T10:30:00.000Z');
		await act(async () => {
			render(<AssetsRoute />, { preloadedState: { assets: [] } });
		});
		expect(screen.getByTestId('market-price-updated-at')).toHaveTextContent('01.10.26');
		act(() => window.dispatchEvent(new CustomEvent(MARKET_PRICE_UPDATED_EVENT, { detail: '2026-10-02T10:30:00.000Z' })));
		expect(screen.getByTestId('market-price-updated-at')).toHaveTextContent('02.10.26');
		localStorage.removeItem(MARKET_PRICE_UPDATED_AT_KEY);
	});

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
			{ ID: 32, type: 'Fund', current_shares: 0.1, price: 109 },
		].map(asset => ({ ...asset, name: `Asset ${asset.ID}`, symbol: `A${asset.ID}`, isin: `ISIN${asset.ID}` })) as Asset[];
		await act(async () => {
			render(<AssetsRoute />, { preloadedState: { assets } });
		});

		const expected: [string, string, number, string | null][] = [
			['Stock', 'Stocks', 175, 'chart'], ['ETF', 'ETFs', 80, 'pie-chart'], ['Bond', 'Bonds', 60, 'bank-account'],
			['Fund', 'Funds', 10.9, 'briefcase'],
			['Crypto', 'Crypto', 100, null], ['Commodity', 'Commodities', 30, 'cube'],
			['RealEstate', 'Real Estate', 1000, 'home'], ['CashEquivalent', 'Cash Equivalents', 5, 'dollar'],
		];
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
		expect(localStorage.getItem(ASSET_TYPE_FILTER_KEY)).toBe('Crypto');
		expect(cryptoCard).toHaveClass('!bg-indigo-500/30', '!border-indigo-400/70');
		expect(screen.queryByTestId('asset-row-1')).not.toBeInTheDocument();
		expect(screen.getByTestId('asset-row-2')).toBeInTheDocument();
		expect(screen.getByText('1 Active')).toBeInTheDocument();

		await act(async () => {
			fireEvent.click(cryptoCard);
		});
		expect(cryptoCard).toHaveAttribute('aria-pressed', 'false');
		expect(localStorage.getItem(ASSET_TYPE_FILTER_KEY)).toBeNull();
		expect(cryptoCard).not.toHaveClass('!bg-indigo-500/30', '!border-indigo-400/70');
		expect(screen.getByTestId('asset-row-1')).toBeInTheDocument();
		expect(screen.getByTestId('asset-row-2')).toBeInTheDocument();
	});


	it('restores the saved filter, rows and totals when the view is reopened', async () => {
		const assets = [
			{ ID: 1, type: 'Stock', name: 'Stock Asset', symbol: 'STK', isin: 'STOCK', current_shares: 2, price: 50 },
			{ ID: 2, type: 'Crypto', name: 'Crypto Asset', symbol: 'CRY', isin: 'CRYPTO', current_shares: 1, price: 75 },
		] as Asset[];
		const first = render(<AssetsRoute />, { preloadedState: { assets } });
		await act(async () => {
			fireEvent.keyDown(screen.getByTestId('asset-type-value-Crypto'), { key: 'Enter' });
		});
		first.unmount();
		await act(async () => {
			render(<AssetsRoute />, { preloadedState: { assets } });
		});
		expect(screen.getByTestId('asset-type-value-Crypto')).toHaveAttribute('aria-pressed', 'true');
		expect(screen.queryByTestId('asset-row-1')).not.toBeInTheDocument();
		expect(screen.getByTestId('asset-row-2')).toBeInTheDocument();
		expect(screen.getByTestId('TableCellCurrentValueSum')).toHaveTextContent(/75,00/);
		await act(async () => {
			fireEvent.click(screen.getByTestId('asset-type-value-Stock'));
		});
		expect(localStorage.getItem(ASSET_TYPE_FILTER_KEY)).toBe('Stock');
		expect(screen.getByTestId('asset-type-value-Crypto')).toHaveAttribute('aria-pressed', 'false');
	});

	it('ignores an invalid saved asset type instead of hiding all assets', async () => {
		localStorage.setItem(ASSET_TYPE_FILTER_KEY, 'InvalidType');
		await act(async () => {
			render(<AssetsRoute />, { preloadedState: {
				assets: [{ ID: 1, type: 'Stock', name: 'Stock Asset', symbol: 'STK', isin: 'STOCK' }] as Asset[],
			} });
		});
		expect(screen.getByTestId('asset-row-1')).toBeInTheDocument();
		expect(localStorage.getItem(ASSET_TYPE_FILTER_KEY)).toBeNull();
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

  it('sums current value from the shares and current price of every asset', async () => {
    const assets = [
      {ID: 1, name: 'Asset 1', symbol: 'A1', isin: 'ISIN1', current_shares: 2, price: 50, current_invest: -80},
      {ID: 2, name: 'Asset 2', symbol: 'A2', isin: 'ISIN2', current_shares: 3, price: 25, current_invest: -60},
    ] as Asset[];

    await act(async () => {
      render(<AssetsRoute />, { preloadedState: { assets } });
    });

    expect(screen.getByTestId('TableCellCurrentValueSum')).toHaveTextContent(/175,00\s*€/);
  });

	 it('sums only realized gain/loss including dividends for every asset', async () => {
		const assets = [
			{ID: 1, name: 'Asset 1', symbol: 'A1', isin: 'ISIN1', current_shares: 2, price: 500, current_sum_in_out: -80, current_invest: -100, dividends_earned: 10},
			{ID: 2, name: 'Asset 2', symbol: 'A2', isin: 'ISIN2', current_shares: 0, price: 25, current_sum_in_out: 25, current_invest: 0, dividends_earned: 5},
		] as Asset[];

		await act(async () => {
			render(<AssetsRoute />, { preloadedState: { assets } });
		});

		expect(screen.getByTestId('TableCellGainLossSum')).toHaveTextContent(/\+60,00\s*€/);
	 });

  it('renders correctly with empty assets', async () => {
    const assets: Asset[] = [];

    const { getAllById } = render(<AssetsRoute />, { preloadedState: { assets: assets } });

    await waitFor(() => {
      expect(getAllById('AssetsRoute').length).toEqual(1);
      expect(screen.queryByText('400.00 €')).toBeNull();
	  expect(screen.getByTestId('TableCellGainLossSum')).toHaveClass('text-slate-500');
	  expect(screen.getByTestId('TableCellGainLossSum').textContent).not.toMatch(/^\+/);
    });
  });

})
