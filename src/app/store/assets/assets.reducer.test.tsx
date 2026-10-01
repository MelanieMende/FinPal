import { act, screen, waitFor } from '@testing-library/react'
import reducer, * as assetsReducer from './assets.reducer'
import { setupStore } from '..';
import { MARKET_PRICE_UPDATED_AT_KEY } from '../../utils/syncTimestamps';

jest.mock('easy-currencies', () => ({
	Convert: () => ({ from: () => ({ fetch: async () => ({ rates: { EUR: 1 } }) }) }),
}));

describe('AssetCreation reducer', () => {

	describe('getYahooFinanceSymbol', () => {
		it('uses the EUR pair for a crypto ticker without a currency', () => {
			expect(assetsReducer.getYahooFinanceSymbol({ type: 'Crypto', symbol: 'btc' })).toBe('BTC-EUR');
		});

		it('keeps an explicit crypto currency pair unchanged', () => {
			expect(assetsReducer.getYahooFinanceSymbol({ type: 'Crypto', symbol: 'BTC-USD' })).toBe('BTC-USD');
		});

		it('keeps non-crypto tickers unchanged', () => {
			expect(assetsReducer.getYahooFinanceSymbol({ type: 'Stock', symbol: 'BTC' })).toBe('BTC');
		});
	});

	describe('findTradeRepublicQuote', () => {
		const quotes = [
			{ name: 'Bitcoin', isin: 'BTC', quantity: 0.008129, price: 74650.0185, averageBuyIn: 68482.88, netValue: 606.83 },
			{ name: 'Apple', isin: 'US0378331005', quantity: 2, price: 210.25, averageBuyIn: 150.5, netValue: 420.5 },
		];

		it('matches regular assets by ISIN', () => {
			expect(assetsReducer.findTradeRepublicQuote({ name: 'Apple Inc.', isin: 'us0378331005' }, quotes)?.price).toBe(210.25);
		});

		it('matches crypto assets without an ISIN by name', () => {
      expect(assetsReducer.findTradeRepublicQuote({ name: 'Bitcoin' } as Asset, quotes)?.price).toBe(74650.0185);
		});
	});

  it('should return the initial state', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(assetsReducer.initialState)
  })

  describe('Assets Thunks', () => {

	it('prefers a cached Trade Republic quote and average buy-in over Yahoo', async () => {
		const dispatch = jest.fn();
		const asset = { ID: 31, type: 'Crypto', name: 'Bitcoin', symbol: 'BTC', is_watched: true } as Asset;
		const sendToYahooFinanceAPI = jest.fn();
		window.API = {
			sendToDB: jest.fn(),
			sendToYahooFinanceAPI,
			sendToDivvyDiaryAPI: jest.fn().mockResolvedValue({ dividends: [] }),
			getTradeRepublicQuotes: jest.fn().mockResolvedValue({
				quotes: [{ name: 'Bitcoin', isin: 'BTC', quantity: 0.008129, price: 74650.0185, averageBuyIn: 68482.88, netValue: 606.83 }],
			}),
		};

		await assetsReducer.loadPricesAndDividends(undefined)(dispatch, () => ({ assets: [asset] }), undefined);

		expect(sendToYahooFinanceAPI).not.toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledWith(assetsReducer.setPrice({ asset, price: 74650.0185 }));
		expect(dispatch).toHaveBeenCalledWith(assetsReducer.setAveragePricePaid({ asset, averageBuyIn: 68482.88 }));
	});

	it('refreshes the market price between syncs while preserving the Trade Republic average buy-in', async () => {
		localStorage.removeItem(MARKET_PRICE_UPDATED_AT_KEY);
		const dispatch = jest.fn();
		const asset = { ID: 31, type: 'Crypto', name: 'Bitcoin', symbol: 'BTC', is_watched: true } as Asset;
		window.API = {
			sendToDB: jest.fn(),
			sendToYahooFinanceAPI: jest.fn().mockResolvedValue({
				price: { regularMarketPrice: 75000, currency: 'EUR' },
			}),
			sendToDivvyDiaryAPI: jest.fn(),
			getTradeRepublicQuotes: jest.fn().mockResolvedValue({
				quotes: [{ name: 'Bitcoin', isin: 'BTC', quantity: 0.008129, price: 74000, averageBuyIn: 68482.88, netValue: 601.54 }],
			}),
		};

		await assetsReducer.loadPricesAndDividends({
			preferTradeRepublicPrice: false,
			includeDividends: false,
		})(dispatch, () => ({ assets: [asset] }), undefined);

		expect(window.API.sendToYahooFinanceAPI).toHaveBeenCalledWith({ symbol: 'BTC-EUR', isin: undefined, type: 'Crypto' });
		expect(dispatch).toHaveBeenCalledWith(assetsReducer.setPrice({ asset, price: 75000 }));
		expect(dispatch).toHaveBeenCalledWith(assetsReducer.setAveragePricePaid({ asset, averageBuyIn: 68482.88 }));
		expect(window.API.sendToDivvyDiaryAPI).not.toHaveBeenCalled();
		expect(localStorage.getItem(MARKET_PRICE_UPDATED_AT_KEY)).not.toBeNull();
	});

	it('does not mark an unusable market quote as updated', async () => {
		localStorage.removeItem(MARKET_PRICE_UPDATED_AT_KEY);
		const dispatch = jest.fn();
		const asset = { ID: 32, type: 'Stock', name: 'Unavailable', symbol: 'BAD', is_watched: true } as Asset;
		window.API = {
			sendToDB: jest.fn(),
			sendToYahooFinanceAPI: jest.fn().mockResolvedValue({ price: { regularMarketPrice: 0, currency: 'EUR' } }),
			getTradeRepublicQuotes: jest.fn().mockResolvedValue({ quotes: [] }),
		};

		await assetsReducer.loadPricesAndDividends({ includeDividends: false })(dispatch, () => ({ assets: [asset] }), undefined);

		expect(localStorage.getItem(MARKET_PRICE_UPDATED_AT_KEY)).toBeNull();
		expect(dispatch).not.toHaveBeenCalledWith(assetsReducer.setPrice({ asset, price: 0 }));
	});

    it('should dispatch loadAssets thunk', async () => {
      const dispatch = jest.fn();
      const getState = jest.fn();
      const mockAssets = [
        { ID: 1, name: '3M', symbol: 'MMM' },
        { ID: 2, name: 'Apple', symbol: 'AAPL' },
      ] as Asset[];
      window.API = {
        sendToDB: jest.fn() as jest.MockedFunction<(sql: string) => any>,
      };
      (window.API.sendToDB as jest.Mock).mockResolvedValue(mockAssets);
      
      await assetsReducer.loadAssets()(dispatch, getState, undefined);
      expect(dispatch).toHaveBeenCalledWith(assetsReducer.setAssets(mockAssets));
      
      // Reset the mock to avoid conflicts in subsequent tests
      (window.API.sendToDB as jest.Mock).mockResolvedValue([]);
    });

    it('should dispatch loadAsset thunk', async () => {
      const dispatch = jest.fn();
      const getState = jest.fn();
      const mockAsset = { ID: 1, name: '3M', symbol: 'MMM' } as Asset;
      window.API = {
        sendToDB: jest.fn() as jest.MockedFunction<(sql: string) => any>,
      };
      // return an array to match thunk code
      (window.API.sendToDB as jest.Mock).mockResolvedValue([mockAsset]);
      
      await assetsReducer.loadAsset({assetID: 1})(dispatch, getState, undefined);
      expect(dispatch).toHaveBeenCalledWith(assetsReducer.setAsset(mockAsset));
      
      // Reset the mock to avoid conflicts in subsequent tests
      (window.API.sendToDB as jest.Mock).mockResolvedValue([]);
    });

  });

  describe('Assets Actions', () => {

    it('should handle setAssets action', () => {
      const initialState = assetsReducer.initialState;
      const assets = [{
        ID: 1,
        name: '3M',
        symbol: 'MMM'
      }] as Asset[];
      const newState = reducer(initialState, assetsReducer.setAssets(assets));
      expect(newState).toEqual(assets);
    });

	it('applies the Trade Republic average buy-in to an asset', () => {
		const asset = { ID: 31, name: 'Bitcoin', symbol: 'BTC', avg_price_paid: 67950.77 } as Asset;
		const newState = reducer([asset], assetsReducer.setAveragePricePaid({ asset, averageBuyIn: 68482.88 }));
		expect(newState[0].avg_price_paid).toBe(68482.88);
	});

  });

});
