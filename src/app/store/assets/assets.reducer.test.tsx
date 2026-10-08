import { act, screen, waitFor } from '@testing-library/react'
import reducer, * as assetsReducer from './assets.reducer'
import { setupStore } from '..';
import { MARKET_PRICE_UPDATED_AT_KEY } from '../../utils/syncTimestamps';
import { restoreQuote } from '../../utils/quoteMetadata';
import { buildAnalysisPositions } from '../../utils/portfolioAnalysis';

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

	describe('getBondPricePerRecordedShare', () => {
		const quote = { name: 'Aug. 2040', isin: 'US912810SQ22', quantity: 180, price: 0.5785, averageBuyIn: 0.5595, netValue: 104.13 };

		it('uses the TR position value rather than multiplying its nominal-unit price by recorded purchases', () => {
			expect(assetsReducer.getBondPricePerRecordedShare({ current_shares: 2 }, quote)).toBe(52.065);
		});

		it('uses a compatible current market quote and rejects prices in a different unit', () => {
			expect(assetsReducer.getBondPricePerRecordedShare({ current_shares: 2 }, quote, 0.587)).toBeCloseTo(52.83);
			expect(assetsReducer.getBondPricePerRecordedShare({ current_shares: 2 }, quote, 58.7)).toBe(52.065);
		});

		it('does not invent a per-purchase price without a recorded holding', () => {
			expect(assetsReducer.getBondPricePerRecordedShare({ current_shares: 0 }, quote)).toBeUndefined();
		});
	});

  it('should return the initial state', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(assetsReducer.initialState)
  })

  describe('Assets Thunks', () => {

  it.each(['USD', 'DKK', 'CHF', 'GBP'])('converts %s and retains its FX provenance across reloads', async currency => {
    const asset = { ID: 901, name: currency, symbol: currency, is_watched: true, current_shares: 2 } as Asset;
    const asOf = '2026-10-03T00:00:00.000Z';
    window.API = {
      sendToDB: jest.fn(),
      sendToYahooFinanceAPI: jest.fn().mockResolvedValue({ price: { regularMarketPrice: 100, currency, regularMarketTime: 1791000000 } }),
      getEuroExchangeRates: jest.fn().mockResolvedValue({ rates: { [currency]: 0.8 }, source: 'ExchangeRate-API', asOf, fetchedAt: asOf }),
    };
    const store = setupStore({ assets: [asset] });
    await store.dispatch(assetsReducer.loadPricesAndDividends({ includeDividends: false }));
    expect(store.getState().assets[0]).toMatchObject({ price: 80, quote: {
      originalPrice: 100, originalCurrency: currency, valuationCurrency: 'EUR', fxRateToEUR: 0.8,
      fxAsOf: asOf, fxSource: 'ExchangeRate-API', quoteAsOf: new Date(1791000000 * 1000).toISOString(),
    } });
    const reloaded = { ...asset };
    restoreQuote(reloaded);
    expect(reloaded.price).toBe(80);
    expect(reloaded.quote).toEqual(store.getState().assets[0].quote);
    expect(buildAnalysisPositions(store.getState().assets)[0]).toMatchObject({ price: 80, currency: 'EUR', quote: { fxRateToEUR: 0.8 } });
  });

  it.each(['unknown', 'ZZZ'])('clears an unconvertible %s quote instead of presenting it as EUR', async currency => {
    const asset = { ID: 902, name: currency, symbol: currency, is_watched: true, current_shares: 2, price: 50 } as Asset;
    window.API = {
      sendToDB: jest.fn(),
      sendToYahooFinanceAPI: jest.fn().mockResolvedValue({ price: { regularMarketPrice: 100, currency } }),
      getEuroExchangeRates: jest.fn().mockResolvedValue({ rates: { USD: 0.8 }, source: 'ExchangeRate-API', asOf: new Date().toISOString() }),
    };
    const store = setupStore({ assets: [asset] });
    await store.dispatch(assetsReducer.loadPricesAndDividends({ includeDividends: false }));
    expect(store.getState().assets[0].price).toBeUndefined();
    expect(buildAnalysisPositions(store.getState().assets)[0]).toMatchObject({ price: null, currency: 'unknown' });
  });

  it('does not need a working FX service for a direct EUR quote', async () => {
    const asset = { ID: 903, name: 'EUR', symbol: 'EUR', is_watched: true } as Asset;
    window.API = {
      sendToDB: jest.fn(),
      sendToYahooFinanceAPI: jest.fn().mockResolvedValue({ price: { regularMarketPrice: 100, currency: 'EUR' } }),
      getEuroExchangeRates: jest.fn().mockRejectedValue(new Error('Offline')),
    };
    const store = setupStore({ assets: [asset] });
    await store.dispatch(assetsReducer.loadPricesAndDividends({ includeDividends: false }));
    expect(store.getState().assets[0].price).toBe(100);
    expect(window.API.getEuroExchangeRates).not.toHaveBeenCalled();
  });

  it('shares one FX snapshot, handles minor units and continues EUR updates after FX failure', async () => {
    const assets = ['GBp', 'CHF', 'EUR'].map((currency, i) => ({ ID: 910 + i, name: currency, symbol: currency, is_watched: true, current_shares: 1 } as Asset));
    window.API = {
      sendToDB: jest.fn(),
      sendToYahooFinanceAPI: jest.fn().mockImplementation(({ symbol }) => Promise.resolve({ price: { regularMarketPrice: 100, currency: symbol } })),
      getEuroExchangeRates: jest.fn().mockResolvedValue({ rates: { GBP: 1.2, CHF: 1.1 }, source: 'ExchangeRate-API', asOf: new Date().toISOString(), fetchedAt: new Date().toISOString() }),
    };
    const store = setupStore({ assets });
    await store.dispatch(assetsReducer.loadPricesAndDividends({ includeDividends: false }));
    expect(store.getState().assets[0].price).toBeCloseTo(1.2);
    expect(window.API.getEuroExchangeRates).toHaveBeenCalledTimes(1);
    (window.API.getEuroExchangeRates as jest.Mock).mockRejectedValue(new Error('Offline'));
    await store.dispatch(assetsReducer.loadPricesAndDividends({ includeDividends: false }));
    expect(store.getState().assets[0].price).toBeUndefined();
    expect(store.getState().assets[1].price).toBeUndefined();
    expect(store.getState().assets[2].price).toBe(100);
    expect(window.API.getEuroExchangeRates).toHaveBeenCalledTimes(2);
  });

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

	it.each([null, { price: { regularMarketPrice: 0, currency: 'EUR' } }, { price: {} }, new Error('Market unavailable')])('falls back to the matching cached EUR quote when the market quote is unavailable (%p)', async reply => {
		localStorage.removeItem(MARKET_PRICE_UPDATED_AT_KEY);
		const asset = { ID: 32, type: 'Stock', name: 'Apollo Private Markets-Aligned Alternatives A2 EUR Acc', symbol: 'A41HPL', isin: 'LU3170240538', current_shares: 0.099818, is_watched: true } as Asset;
		const fetchedAt = '2026-10-02T11:08:06.098Z';
		window.API = {
			sendToDB: jest.fn(),
			sendToYahooFinanceAPI: reply instanceof Error ? jest.fn().mockRejectedValue(reply) : jest.fn().mockResolvedValue(reply),
			getTradeRepublicQuotes: jest.fn().mockResolvedValue({ fetchedAt, quotes: [
				{ name: 'Private Equity', isin: asset.isin, price: 109.395, quantity: 0.099818, netValue: 10.92, averageBuyIn: 110.2007 },
			] }),
		};
		const store = setupStore({ assets: [asset] });
		const error = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await store.dispatch(assetsReducer.loadPricesAndDividends({ preferTradeRepublicPrice: false, includeDividends: false }));
			expect(buildAnalysisPositions(store.getState().assets)[0]).toMatchObject({
				price: 109.395, currency: 'EUR', quote: { source: 'trade-republic', fetchedAt, quoteAsOf: null },
			});
			expect(localStorage.getItem(MARKET_PRICE_UPDATED_AT_KEY)).toBeNull();
			const restored = { ...asset };
			restoreQuote(restored);
			expect(restored.price).toBe(109.395);
		} finally { error.mockRestore(); }
	});

	it('keeps a fresh matching Trade Republic quote when a market reply is implausibly high', async () => {
		const dispatch = jest.fn();
		const asset = { ID: 34, type: 'Stock', name: 'SpaceX', symbol: 'SPCX', isin: 'US84615Q1031', is_watched: true } as Asset;
		window.API = {
			sendToDB: jest.fn(),
			sendToYahooFinanceAPI: jest.fn().mockResolvedValue({ price: { regularMarketPrice: 276.8, currency: 'EUR' } }),
			sendToDivvyDiaryAPI: jest.fn(),
			getTradeRepublicQuotes: jest.fn().mockResolvedValue({
				fetchedAt: new Date().toISOString(),
				quotes: [{ name: 'SpaceX', isin: 'US84615Q1031', quantity: 0.537301, price: 134.12, averageBuyIn: 130.08, netValue: 72.06 }],
			}),
		};
		const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await assetsReducer.loadPricesAndDividends({ preferTradeRepublicPrice: false, includeDividends: false })(
				dispatch, () => ({ assets: [asset] }), undefined,
			);
			expect(dispatch).toHaveBeenCalledWith(assetsReducer.setPrice({ asset, price: 134.12 }));
			expect(warning).toHaveBeenCalled();
		} finally {
			warning.mockRestore();
		}
	});

	it('normalizes a Trade Republic bond position to the recorded purchase count', async () => {
		const dispatch = jest.fn();
		const asset = { ID: 30, type: 'Bond', name: 'US-Staatsanleihen', symbol: 'A281P1', isin: 'US912810SQ22', current_shares: 2, avg_price_paid: 50.055, is_watched: true } as Asset;
		window.API = {
			sendToDB: jest.fn(),
			sendToYahooFinanceAPI: jest.fn(),
			sendToDivvyDiaryAPI: jest.fn(),
			getTradeRepublicQuotes: jest.fn().mockResolvedValue({
				quotes: [{ name: 'Aug. 2040', isin: 'US912810SQ22', quantity: 180, price: 0.5785, averageBuyIn: 0.5595, netValue: 104.13 }],
			}),
		};

		await assetsReducer.loadPricesAndDividends({ includeDividends: false })(dispatch, () => ({ assets: [asset] }), undefined);

		expect(dispatch).toHaveBeenCalledWith(assetsReducer.setPrice({ asset, price: 52.065 }));
		expect(dispatch).not.toHaveBeenCalledWith(assetsReducer.setAveragePricePaid({ asset, averageBuyIn: 0.5595 }));
		expect(window.API.sendToYahooFinanceAPI).not.toHaveBeenCalled();
	});

	it('updates a bond from a compatible percentage quote between TR syncs', async () => {
		const fetchedAt = '2026-10-02T11:08:06.098Z';
		const quoteAsOf = '2026-10-02T17:00:11+02:00';
		const asset = { ID: 30, type: 'Bond', name: 'US-Staatsanleihen', symbol: 'A281P1', isin: 'US912810SQ22', current_shares: 2, is_watched: true } as Asset;
		window.API = {
			sendToDB: jest.fn(),
			sendToYahooFinanceAPI: jest.fn().mockResolvedValue({
				price: { regularMarketPrice: 58.7, currency: 'EUR', regularMarketTime: quoteAsOf }, source: 'boerse-frankfurt', tradedInPercent: true, exchange: 'XFRA',
			}),
			sendToDivvyDiaryAPI: jest.fn(),
			getTradeRepublicQuotes: jest.fn().mockResolvedValue({
				fetchedAt,
				quotes: [{ name: 'Aug. 2040', isin: 'US912810SQ22', quantity: 180, price: 0.5785, averageBuyIn: 0.5595, netValue: 104.13 }],
			}),
		};

		const store = setupStore({ assets: [asset] });
		await store.dispatch(assetsReducer.loadPricesAndDividends({ preferTradeRepublicPrice: false, includeDividends: false }));
		const position = buildAnalysisPositions(store.getState().assets)[0];
		expect(position.price).toBeCloseTo(52.83);
		expect(position.quote).toMatchObject({ exchange: 'XFRA', tradedInPercent: true,
			quoteAsOf: '2026-10-02T15:00:11.000Z',
			bondUnits: { brokerQuantity: 180, recordedQuantity: 2, source: 'trade-republic', fetchedAt },
		});
		const restored = { ...asset };
		restoreQuote(restored);
		expect(restored.quote).toEqual(position.quote);
		expect(window.API.sendToYahooFinanceAPI).toHaveBeenCalledWith({ symbol: 'A281P1', isin: 'US912810SQ22', type: 'Bond' });
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

	it.each([true, false])('prefers a newer percentage quote for confirmed holdings and falls back when unavailable (market available: %s)', async available => {
		const asset = { ID: 30, type: 'Bond', name: 'US Treasury', symbol: 'A281P1', isin: 'US912810SQ22', current_shares: 2, is_watched: true } as Asset;
		const asOf = '2026-10-04T09:56:20.406Z';
		window.API = {
			sendToDB: jest.fn().mockResolvedValue([
				{ ID: 112, date: '2025-11-03', type: 'Buy', isin: asset.isin, nominal: 0.19, currency: 'USD', accrued_interest_eur: 0, source: 'user-confirmed' },
				{ ID: 113, date: '2025-11-03', type: 'Buy', isin: asset.isin, nominal: 179.81, currency: 'USD', accrued_interest_eur: -0.17, source: 'user-confirmed' },
			]),
			sendToYahooFinanceAPI: jest.fn().mockResolvedValue(available ? {
				price: { regularMarketPrice: 57.96, currency: 'USD', regularMarketTime: asOf }, source: 'boerse-frankfurt', tradedInPercent: true,
			} : null),
			getEuroExchangeRates: jest.fn().mockResolvedValue({ rates: { USD: 0.8887838148912174 }, source: 'ExchangeRate-API', asOf, fetchedAt: asOf }),
			getTradeRepublicQuotes: jest.fn().mockResolvedValue({ fetchedAt: asOf, quotes: [
				{ name: 'Aug. 2040', isin: asset.isin, quantity: 180, price: 0.5784, averageBuyIn: 0.5595, netValue: 104.11, quoteAsOf: '2026-10-02T15:00:11Z', exchange: 'LSX' },
			] }),
		};
		const store = setupStore({ assets: [asset] });
		await store.dispatch(assetsReducer.loadPricesAndDividends({ preferTradeRepublicPrice: false, includeDividends: false }));
		let position = buildAnalysisPositions(store.getState().assets)[0];
		expect(position.bondHolding).toMatchObject({ nominal: 180, brokerQuantity: 180, quantityConflict: false });
		expect(position.price! * position.shares).toBeCloseTo(available ? 180 * 57.96 / 100 * 0.8887838148912174 : 104.11);
        expect(position.quote).toMatchObject(available
            ? { source: 'boerse-frankfurt', originalPrice: 57.96, originalCurrency: 'USD', quoteAsOf: asOf, unitFactor: 0.9 }
            : { source: 'trade-republic', originalCurrency: 'EUR', fetchedAt: asOf, quoteAsOf: '2026-10-02T15:00:11.000Z', exchange: 'LSX' });
		await store.dispatch(assetsReducer.loadPricesAndDividends({ includeDividends: false }));
		position = buildAnalysisPositions(store.getState().assets)[0];
		expect(position.price! * position.shares).toBeCloseTo(104.11);
	});

	it.each([true, false])('values the confirmed USD nominal instead of the conflicting broker quantity (market available: %s)', async available => {
		const asset = { ID: 30, type: 'Bond', name: 'US Treasury', symbol: 'A281P1', isin: 'US912810SQ22', current_shares: 2, is_watched: true, price: 52 } as Asset;
		const details = [
			{ ID: 112, date: '2025-11-03', type: 'Buy', isin: asset.isin, nominal: 0.19, currency: 'USD', accrued_interest_eur: 0, source: 'user-confirmed' },
			{ ID: 113, date: '2025-11-03', type: 'Buy', isin: asset.isin, nominal: 79.81, currency: 'USD', accrued_interest_eur: -0.17, source: 'user-confirmed' },
		];
		const asOf = '2026-10-02T15:00:11.000Z';
		window.API = {
			sendToDB: jest.fn().mockResolvedValue(details),
			sendToYahooFinanceAPI: jest.fn().mockResolvedValue(available ? {
				price: { regularMarketPrice: 60, currency: 'USD', regularMarketTime: asOf },
				source: 'boerse-frankfurt', exchange: 'XFRA', tradedInPercent: true,
			} : null),
			getEuroExchangeRates: jest.fn().mockResolvedValue({ rates: { USD: 0.9 }, source: 'ExchangeRate-API', asOf, fetchedAt: asOf }),
			getTradeRepublicQuotes: jest.fn().mockResolvedValue({ fetchedAt: asOf, quotes: [
				{ name: 'Aug. 2040', isin: asset.isin, quantity: 180, price: 0.58, netValue: 104.4 },
			] }),
		};
		const store = setupStore({ assets: [asset] });
		await store.dispatch(assetsReducer.loadPricesAndDividends({ includeDividends: false }));
		const position = buildAnalysisPositions(store.getState().assets)[0];
		expect(position.bondHolding).toMatchObject({ nominal: 80, currency: 'USD', purchaseAccruedInterestEUR: -0.17, brokerQuantity: 180, quantityConflict: true });
		if (available) {
			expect(position.price! * position.shares).toBeCloseTo(43.2);
			expect(position.quote).toMatchObject({ originalPrice: 60, originalCurrency: 'USD', fxRateToEUR: 0.9, unitFactor: 0.4, quoteAsOf: asOf, exchange: 'XFRA' });
		} else expect(position.price).toBeNull();
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


it.each(['current', 'older', 'missing time', 'wrong currency', 'wrong notation', 'unavailable'] as const)('checks confirmed bond identity and quote time: %s', mode => {
  // The current quote is more than 10% away from the stale broker snapshot.
  const asset = { ID: 30, type: 'Bond', name: 'US Treasury', symbol: 'A281P1', isin: 'US912810SQ22', current_shares: 2, is_watched: false } as Asset;
  const brokerTime = '2026-10-05T10:22:14.210Z';
  const marketTime = mode === 'older' ? '2026-10-04T08:05:52Z' : mode === 'missing time' ? undefined : '2026-10-08T08:05:52Z';
  window.API = {
    sendToDB: jest.fn().mockResolvedValue([{ ID: 112, date: '2025-11-03', type: 'Buy', isin: asset.isin, nominal: 180, currency: 'USD', accrued_interest_eur: -0.17, source: 'user-confirmed' }]),
    getTradeRepublicQuotes: jest.fn().mockResolvedValue({ fetchedAt: brokerTime, quotes: [{ name: 'Aug. 2040', isin: asset.isin, quantity: 180, price: 0.5775, netValue: 103.95, quoteAsOf: brokerTime, exchange: 'WLD' }] }),
    sendToYahooFinanceAPI: jest.fn().mockResolvedValue(mode === 'unavailable' ? null : { source: 'boerse-frankfurt', exchange: 'XFRA', tradedInPercent: mode !== 'wrong notation', price: { regularMarketPrice: 57.31, currency: mode === 'wrong currency' ? 'EUR' : 'USD', regularMarketTime: marketTime } }),
    getEuroExchangeRates: jest.fn().mockResolvedValue({ rates: { USD: 0.892946437500893 }, source: 'ExchangeRate-API', asOf: '2026-10-08T00:02:31Z', fetchedAt: '2026-10-08T08:06:00Z' }),
  };
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-08T08:13:06Z'));
  const store = setupStore({ assets: [asset] });
  return store.dispatch(assetsReducer.loadPricesAndDividends({ assetIDs: [30], preferTradeRepublicPrice: false, includeDividends: false })).unwrap().then(() => {
    const position = buildAnalysisPositions(store.getState().assets)[0];
    if (mode === 'current') {
      expect(position.price! * position.shares).toBeCloseTo(180 * 57.31 / 100 * 0.892946437500893);
      expect(position.quote).toMatchObject({ source: 'boerse-frankfurt', exchange: 'XFRA', quoteAsOf: new Date(marketTime!).toISOString(), originalPrice: 57.31, originalCurrency: 'USD', tradedInPercent: true, unitFactor: 0.9 });
      const restored = { ...asset };
      restoreQuote(restored);
      expect(restored.price).toBe(position.price);
      expect(restored.quote).toEqual(position.quote);
    } else if (mode === 'wrong currency' || mode === 'wrong notation') {
      expect(position.price).toBeNull();
    } else {
      expect(position.price! * position.shares).toBeCloseTo(103.95);
      expect(position.quote).toMatchObject({ source: 'trade-republic', quoteAsOf: brokerTime });
    }
    expect(position.bondHolding?.nominal).toBe(180);
    expect(position.bondHolding?.purchaseAccruedInterestEUR).toBe(-0.17);
  }).finally(() => clock.mockRestore());
});
