import { get } from 'node:http';
import transactionsReducer, {
  initialState,
  setTransactionsInternal,
  loadTransactions,
  saveTransaction,
  sortBy,
  calculateInvestCumulated,
} from './transactions.reducer';

describe('Transactions Reducer', () => {

  it('keeps only the proportional cost basis after a partial sell', () => {
    const transactions = [
      { ID: 1, asset_ID: 1, rank: 1, type: 'Buy', shares_cumulated: 1.483, in_out: -101 },
      { ID: 2, asset_ID: 1, rank: 2, type: 'Buy', shares_cumulated: 2.362, in_out: -51 },
      { ID: 3, asset_ID: 1, rank: 3, type: 'Buy', shares_cumulated: 3.181, in_out: -51 },
      { ID: 4, asset_ID: 1, rank: 4, type: 'Buy', shares_cumulated: 3.999, in_out: -50.99 },
      { ID: 5, asset_ID: 1, rank: 5, type: 'Buy', shares_cumulated: 4.780, in_out: -51 },
      { ID: 6, asset_ID: 1, rank: 6, type: 'Buy', shares_cumulated: 5.565, in_out: -51 },
      { ID: 7, asset_ID: 1, rank: 7, type: 'Buy', shares_cumulated: 6.337, in_out: -51 },
      { ID: 8, asset_ID: 1, rank: 8, type: 'Sell', shares_cumulated: 5.632, in_out: 49 },
    ] as Transaction[];

    const result = calculateInvestCumulated(transactions);

    expect(result.find(transaction => transaction.ID === 8)?.invest_cumulated).toBeCloseTo(-361.71, 2);
  });

  it('sets current investment to zero after selling all remaining shares', () => {
    const result = calculateInvestCumulated([
      { ID: 1, asset_ID: 1, rank: 1, type: 'Buy', shares_cumulated: 2, in_out: -101 },
      { ID: 2, asset_ID: 1, rank: 2, type: 'Sell', shares_cumulated: 0, in_out: 99 },
    ] as Transaction[]);

    expect(result[1].invest_cumulated).toBe(0);
  });

	 it('orders transactions on the same date by ID', () => {
		const earlier = { ID: 1, date: '2025-11-03' } as Transaction;
		const later = { ID: 2, date: '2025-11-03' } as Transaction;

		expect(sortBy(earlier, later, 'date', 'asc')).toBeLessThan(0);
		expect(sortBy(earlier, later, 'date', 'desc')).toBeGreaterThan(0);
	 });

  it('should return the initial state', () => {
    const result = transactionsReducer(undefined, { type: '' });
    expect(result).toEqual(initialState);
  });

  it('should handle setTransactionsInternal action', () => {
    const mockTransactions = [
      { id: 1, amount: 100, description: 'Groceries' },
      { id: 2, amount: 200, description: 'Rent' },
    ];
    const result = transactionsReducer(initialState, setTransactionsInternal(mockTransactions));
    expect(result).toEqual(mockTransactions);
  });

  it('should sort transactions by date in descending order', () => {
    const transactionA = { date: '2023-01-01', asset_ID: 1 } as Transaction;
    const transactionB = { date: '2023-02-01', asset_ID: 2 } as Transaction;
    const result = sortBy(transactionA, transactionB, 'date', 'desc');
    expect(result).toBe(1);
  });

  it('should sort transactions by asset in ascending order', () => {
    const transactionA = { date: '2023-01-01', asset_ID: 1 } as Transaction;
    const transactionB = { date: '2023-01-01', asset_ID: 2 } as Transaction;
    const result = sortBy(transactionA, transactionB, 'asset', 'asc');
    expect(result).toBe(-1);
  });

});

describe('Transactions Async Actions', () => {

  it('should dispatch setTransactions when loadTransactions is called', async () => {
    // create dispatch that executes thunks so nested calls run
    const dispatch: any = jest.fn((action: any) => {
      if (typeof action === 'function') {
        return action(dispatch, getState, undefined);
      }
      return action;
    });
    const getState = jest.fn();
    const mockTransactions = [
      { id: 1, amount: 100, description: 'Groceries' },
      { id: 2, amount: 200, description: 'Rent' },
    ];

    window.API = {
      sendToDB: jest.fn() as jest.MockedFunction<(sql: string) => any>,
    };
    (window.API.sendToDB as jest.Mock).mockResolvedValue(mockTransactions);

    await loadTransactions()(dispatch, getState, undefined);
    // ensure something was dispatched (we don’t simulate full reducer execution here)
    expect(dispatch).toHaveBeenCalled();

    // Reset the mock to avoid conflicts in subsequent tests
    (window.API.sendToDB as jest.Mock).mockResolvedValue([]);
  });

  it('should handle saveTransaction with valid inputs', async () => {
    const dispatch = jest.fn();
    const getState = jest.fn();

    window.API = {
      sendToDB: jest.fn().mockResolvedValue([]),
    };

    const props = {
      transaction: { 
        ID: 1, 
        date: '', 
        type: '', 
        asset_ID: 1, 
        rank: 0, 
        amount: 0, 
        price_per_share: 0, 
        fee: 0, 
        solidarity_surcharge: 0,
        shares_cumulated: 0,
        shares_invested: 0,
        invest_cumulated: 0,
        in_out: 0
      },
      dateInput: '2023-01-01',
      typeInput: 'buy',
      assetInput: '1',
      amountInput: '100',
      priceInput: '10.5',
      feeInput: '1.5',
      solidaritySurchargeInput: '0.5',
    };

    await saveTransaction(props)(dispatch, getState, undefined);

    expect(window.API.sendToDB).toHaveBeenCalled();
  });

  it('should not saveTransaction if inputs are missing', async () => {
    const dispatch = jest.fn();
    const getState = jest.fn();

    window.API = {
      sendToDB: jest.fn(),
    };

    const props = {
      transaction: { 
        ID: 1, 
        date: '', 
        type: '', 
        asset_ID: 1, 
        rank: 0, 
        amount: 0, 
        price_per_share: 0, 
        fee: 0, 
        solidarity_surcharge: 0,
        shares_cumulated: 0,
        shares_invested: 0,
        invest_cumulated: 0,
        in_out: 0
      },
      dateInput: '',
      typeInput: '',
      assetInput: '',
      amountInput: '',
      priceInput: '',
      feeInput: '',
      solidaritySurchargeInput: '',
    };

    await saveTransaction(props)(dispatch, getState, undefined);

    expect(window.API.sendToDB).not.toHaveBeenCalled();
  });
});
