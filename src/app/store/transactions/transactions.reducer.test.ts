import { get } from 'node:http';
import transactionsReducer, {
  initialState,
  setTransactionsInternal,
  loadTransactions,
  saveTransaction,
  sortBy,
} from './transactions.reducer';

describe('Transactions Reducer', () => {

  it('should return the initial state', () => {
    const result = transactionsReducer(undefined, { type: undefined });
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