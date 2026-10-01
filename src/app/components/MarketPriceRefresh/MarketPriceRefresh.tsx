import { useCallback, useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import * as assetsReducer from '../../store/assets/assets.reducer';

export const MARKET_PRICE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export function isMarketPriceRefreshDue(lastStartedAt: number, now = Date.now()): boolean {
	return now - lastStartedAt >= MARKET_PRICE_REFRESH_INTERVAL_MS;
}

export default function MarketPriceRefresh(): null {
	const dispatch = useAppDispatch();
	const hasWatchedAssets = useAppSelector(state => state.assets.some(asset => asset.is_watched));
	const lastStartedAt = useRef(Date.now());
	const isRefreshing = useRef(false);

	const refreshIfDue = useCallback(() => {
		const now = Date.now();
		if (!hasWatchedAssets || isRefreshing.current || !isMarketPriceRefreshDue(lastStartedAt.current, now)) return;

		lastStartedAt.current = now;
		isRefreshing.current = true;
		void dispatch(assetsReducer.loadPricesAndDividends({
			preferTradeRepublicPrice: false,
			includeDividends: false,
		})).finally(() => {
			isRefreshing.current = false;
		});
	}, [dispatch, hasWatchedAssets]);

	useEffect(() => {
		const interval = window.setInterval(refreshIfDue, MARKET_PRICE_REFRESH_INTERVAL_MS);
		const handleFocus = () => refreshIfDue();
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') refreshIfDue();
		};

		window.addEventListener('focus', handleFocus);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			window.clearInterval(interval);
			window.removeEventListener('focus', handleFocus);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, [refreshIfDue]);

	return null;
}
