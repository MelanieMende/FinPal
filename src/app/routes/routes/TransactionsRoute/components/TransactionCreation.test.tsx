import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import TransactionsRoute from './TransactionCreation';
import * as transactionCreationReducer from './../../../../../../src/app/store/transactionCreation/transactionCreation.reducer';

const mockStore = configureStore([]);

describe('TransactionCreation Component', () => {
  let store: any;

  beforeEach(() => {
    store = mockStore({
      assets: [
        { ID: '1', name: 'Asset 1' },
        { ID: '2', name: 'Asset 2' },
      ],
      transactionCreation: {
        dateInput: '',
        typeInput: 'Buy',
        assetInput: '',
        amountInput: '',
        priceInput: '',
        feeInput: '',
        solidaritySurchargeInput: '',
      },
    });

    store.dispatch = jest.fn();
  });

  it('renders all input fields and dropdowns', () => {
    render(
      <Provider store={store}>
        <table>
          <tbody>
            <TransactionsRoute />
          </tbody>
        </table>
      </Provider>
    );

    expect(screen.getByTestId("dateInput")).toBeInTheDocument();
    expect(screen.getByTestId("typeInput")).toBeInTheDocument();
    expect(screen.getByTestId("assetInput")).toBeInTheDocument();
    expect(screen.getByTestId("amountInput")).toBeInTheDocument();
    expect(screen.getByTestId("priceInput")).toBeInTheDocument();
    expect(screen.getByTestId("feeInput")).toBeInTheDocument();
    expect(screen.getByTestId("solidaritySurchargeInput")).toBeInTheDocument();
  });

  it('dispatches setDateInput action on date input change', () => {
    render(
      <Provider store={store}>
        <table>
          <tbody>
            <TransactionsRoute />
          </tbody>
        </table>
      </Provider>
    );

    const dateInput = screen.getByTestId("dateInput");
    fireEvent.change(dateInput, { target: { value: '2023-01-01' } });

    expect(store.dispatch).toHaveBeenCalledWith(transactionCreationReducer.setDateInput('2023-01-01'));
  });

  it('dispatches setTypeInput action on type dropdown change', () => {
    render(
      <Provider store={store}>
        <table>
          <tbody>
            <TransactionsRoute />
          </tbody>
        </table>
      </Provider>
    );

    const typeInput = screen.getByTestId("typeInput");
    fireEvent.change(typeInput, { target: { value: 'Sell' } });

    expect(store.dispatch).toHaveBeenCalledWith(transactionCreationReducer.setTypeInput('Sell'));
  });

  it('renders sorted assets in the asset dropdown', () => {
    render(
      <Provider store={store}>
        <table>
          <tbody>
            <TransactionsRoute />
          </tbody>
        </table>
      </Provider>
    );

    const assetOptions = screen.getAllByTestId('asset-option');
    expect(assetOptions[0].textContent).toBe('Asset 1');
    expect(assetOptions[1].textContent).toBe('Asset 2');
  });

  it('dispatches setAmountInput action on amount input change', () => {
    render(
      <Provider store={store}>
        <table>
          <tbody>
            <TransactionsRoute />
          </tbody>
        </table>
      </Provider>
    );

    const amountInput = screen.getByTestId("amountInput");
    fireEvent.change(amountInput, { target: { value: '100' } });

    expect(store.dispatch).toHaveBeenCalledWith(transactionCreationReducer.setAmountInput('100'));
  });

  it('dispatches setPriceInput action on price input change', () => {
    render(
      <Provider store={store}>
        <table>
          <tbody>
            <TransactionsRoute />
          </tbody>
        </table>
      </Provider>
    );

    const priceInput = screen.getByTestId("priceInput");
    fireEvent.change(priceInput, { target: { value: '50' } });

    expect(store.dispatch).toHaveBeenCalledWith(transactionCreationReducer.setPriceInput('50'));
  });

  it('dispatches setFeeInput action on fee input change', () => {
    render(
      <Provider store={store}>
        <table>
          <tbody>
            <TransactionsRoute />
          </tbody>
        </table>
      </Provider>
    );

    const feeInput = screen.getByTestId("feeInput");
    fireEvent.change(feeInput, { target: { value: '5' } });

    expect(store.dispatch).toHaveBeenCalledWith(transactionCreationReducer.setFeeInput('5'));
  });

  it('dispatches setSolidaritySurchargeInput action on solidarity surcharge input change', () => {
    render(
      <Provider store={store}>
        <table>
          <tbody>
            <TransactionsRoute />
          </tbody>
        </table>
      </Provider>
    );

    const solidaritySurchargeInput = screen.getByTestId("solidaritySurchargeInput");
    fireEvent.change(solidaritySurchargeInput, { target: { value: '2' } });

    expect(store.dispatch).toHaveBeenCalledWith(transactionCreationReducer.setSolidaritySurchargeInput('2'));
  });
});