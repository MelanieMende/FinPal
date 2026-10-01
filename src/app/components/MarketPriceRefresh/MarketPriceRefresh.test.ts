import React from 'react';
import { act, render } from '../../../testing/test-utils';
import MarketPriceRefresh, { isMarketPriceRefreshDue, MARKET_PRICE_REFRESH_INTERVAL_MS } from './MarketPriceRefresh';
import * as assetsReducer from '../../store/assets/assets.reducer';

describe('MarketPriceRefresh', () => {
	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it('becomes due after fifteen minutes', () => {
		const startedAt = 1_000;
		expect(isMarketPriceRefreshDue(startedAt, startedAt + MARKET_PRICE_REFRESH_INTERVAL_MS - 1)).toBe(false);
		expect(isMarketPriceRefreshDue(startedAt, startedAt + MARKET_PRICE_REFRESH_INTERVAL_MS)).toBe(true);
	});

	it('refreshes watched market prices every fifteen minutes without dividends', () => {
		jest.useFakeTimers();
		const refresh = jest.spyOn(assetsReducer, 'loadPricesAndDividends')
			.mockReturnValue((() => Promise.resolve()) as any);

		render(React.createElement(MarketPriceRefresh), {
			preloadedState: {
				assets: [{ ID: 1, name: 'Apple', symbol: 'AAPL', is_watched: true } as Asset],
			},
		});

		act(() => jest.advanceTimersByTime(MARKET_PRICE_REFRESH_INTERVAL_MS));

		expect(refresh).toHaveBeenCalledWith({
			preferTradeRepublicPrice: false,
			includeDividends: false,
		});
	});
});
