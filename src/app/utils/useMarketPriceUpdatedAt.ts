import { useEffect, useState } from 'react';
import { MARKET_PRICE_UPDATED_AT_KEY, MARKET_PRICE_UPDATED_EVENT } from './syncTimestamps';

export function useMarketPriceUpdatedAt(): string | null {
  const [updatedAt, setUpdatedAt] = useState<string | null>(() => localStorage.getItem(MARKET_PRICE_UPDATED_AT_KEY));
  useEffect(() => {
    const update = (event: Event) => setUpdatedAt((event as CustomEvent<string>).detail);
    window.addEventListener(MARKET_PRICE_UPDATED_EVENT, update);
    return () => window.removeEventListener(MARKET_PRICE_UPDATED_EVENT, update);
  }, []);
  return updatedAt;
}
