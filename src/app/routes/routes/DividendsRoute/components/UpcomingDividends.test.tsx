import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import UpcomingDividends from './UpcomingDividends';

const mockStore = configureStore([]);

describe('UpcomingDividends Component', () => {
  let store: any;

  beforeEach(() => {
    var today = new Date();
    var payDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    store = mockStore({
      appState: {
        theme: 'bp5-dark',
      },
      assets: [
        {
          current_shares_before_ex_date: 10,
          next_estimated_dividend_per_share: 1.5,
          payDividendDate: payDate.toISOString(),
          dividends: [
            { payDate: payDate.toISOString(), exDate: new Date().toISOString() },
          ],
          name: 'Asset 1',
        },
        {
          current_shares_before_ex_date: 0,
          next_estimated_dividend_per_share: 0,
          payDividendDate: payDate.toISOString(),
          dividends: [],
          name: 'Asset 2',
        },
      ],
    });
  });

  it('renders without crashing', () => {
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });

  it('renders the correct number of rows for upcoming dividends', () => {
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(2); // 1 header row + 1 data row
  });

  it('renders no rows when there are no upcoming dividends', () => {
    store = mockStore({
      appState: {
        theme: 'bp5-dark',
      },
      assets: [],
    });
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    const rows = screen.queryAllByRole('row');
    expect(rows.length).toBe(1); // Only the header row
  });

  it('displays the correct data for an upcoming dividend', () => {
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    expect(screen.getByText('Asset 1')).toBeInTheDocument();
    expect(screen.getByText('15.000 €')).toBeInTheDocument();
  });

  it('does not render rows for assets without upcoming dividends', () => {
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    expect(screen.queryByText('Asset 2')).not.toBeInTheDocument();
  });

  it('renders the correct header columns', () => {
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    expect(screen.getByText('#')).toBeInTheDocument();
    expect(screen.getByText('Pay Date')).toBeInTheDocument();
    expect(screen.getByText('Ex Date')).toBeInTheDocument();
    expect(screen.getByText('Asset')).toBeInTheDocument();
    expect(screen.getByText('Dividend')).toBeInTheDocument();
  });
  
  it('renders the correct number of columns in the table', () => {
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    const headerCells = screen.getAllByRole('columnheader');
    expect(headerCells.length).toBe(5); // 5 columns: #, Pay Date, Ex Date, Asset, Dividend
  });

  it('formats payDate and exDate correctly', () => {
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    const today = new Date();
    const payDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const formattedPayDate = payDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedExDate = today.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    expect(screen.getByText(formattedPayDate)).toBeInTheDocument();
    expect(screen.getByText(formattedExDate)).toBeInTheDocument();
  });

  it('renders no rows when all dividends are in the past', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    store = mockStore({
      appState: {
        theme: 'bp5-dark',
      },
      assets: [
        {
          current_shares_before_ex_date: 10,
          next_estimated_dividend_per_share: 1.5,
          payDividendDate: pastDate.toISOString(),
          dividends: [
            { payDate: pastDate.toISOString(), exDate: pastDate.toISOString() },
          ],
          name: 'Asset 1',
        },
      ],
    });
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    const rows = screen.queryAllByRole('row');
    expect(rows.length).toBe(1); // Only the header row
  });

  it('renders multiple rows for multiple upcoming dividends', () => {
    const today = new Date();
    const payDate1 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const payDate2 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
    store = mockStore({
      appState: {
        theme: 'bp5-dark',
      },
      assets: [
        {
          current_shares_before_ex_date: 10,
          next_estimated_dividend_per_share: 1.5,
          payDividendDate: payDate1.toISOString(),
          dividends: [
            { payDate: payDate1.toISOString(), exDate: today.toISOString() },
          ],
          name: 'Asset 1',
        },
        {
          current_shares_before_ex_date: 5,
          next_estimated_dividend_per_share: 2.0,
          payDividendDate: payDate2.toISOString(),
          dividends: [
            { payDate: payDate2.toISOString(), exDate: today.toISOString() },
          ],
          name: 'Asset 2',
        },
      ],
    });
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(3); // 1 header row + 2 data rows
  });

  it('renders the correct dividend value for each asset', () => {
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    expect(screen.getByText('15.000 €')).toBeInTheDocument(); // Asset 1 dividend
  });

  it('handles assets with no dividends gracefully', () => {
    store = mockStore({
      appState: {
        theme: 'bp5-dark',
      },
      assets: [
        {
          current_shares_before_ex_date: 10,
          next_estimated_dividend_per_share: 0,
          payDividendDate: new Date().toISOString(),
          dividends: [],
          name: 'Asset 3',
        },
      ],
    });
    render(
      <Provider store={store}>
        <UpcomingDividends />
      </Provider>
    );
    expect(screen.queryByText('Asset 3')).not.toBeInTheDocument();
  });
});