import { brokerProduct } from './instrumentClassification';

const quote = { name: 'Bitcoin', isin: 'BTC', quantity: 1, price: 100, averageBuyIn: 80, netValue: 100, instrumentType: 'crypto' };
it('uses exact broker identity and type, never names or the local asset category', () => {
  expect(brokerProduct({ isin: 'btc' }, [quote])).toMatchObject({ kind: 'direct-crypto', instrumentId: 'BTC' });
  expect(brokerProduct({ isin: 'BTC' }, [{ ...quote, instrumentType: 'etp' }])).toMatchObject({ kind: 'security' });
  expect(brokerProduct({ isin: '' }, [quote])).toBeUndefined();
  expect(brokerProduct({ isin: 'OTHER' }, [quote])).toBeUndefined();
  expect(brokerProduct({ isin: 'BTC' }, [{ ...quote, instrumentType: undefined }])).toBeUndefined();
  expect(brokerProduct({ isin: 'BTC' }, [quote, quote])).toBeUndefined();
});
