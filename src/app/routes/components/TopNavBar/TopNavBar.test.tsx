import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { render } from '../../../../testing/test-utils'
import TopNavBar from './TopNavBar';
import RootRoute, { Content } from '../../RootRoute';
import { setupStore } from './../../../store';
import { Provider } from 'react-redux';
import { prepareAutoBatched } from '@reduxjs/toolkit';
import { IMPORT_ACTIVITY_KEY, recordImportActivity } from '../../../utils/importActivity';

describe('TopNavBar component', () => {
  beforeEach(() => { window.innerWidth = 1280; });

  it('shows the daily reminder until an import completes and restores it the next day', async () => {
    localStorage.removeItem(IMPORT_ACTIVITY_KEY);
    window.API.getTradeRepublicStatus = jest.fn().mockResolvedValue({ runnerAvailable: true, hasSavedCredentials: true });
    await act(async () => { render(<TopNavBar />); });
    expect(screen.getByTestId('import-todo-bubble')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByTestId('importTab')); });
    expect(screen.getByTestId('import-todo-bubble')).toBeInTheDocument();
    act(() => { recordImportActivity(); });
    expect(screen.queryByTestId('import-todo-bubble')).not.toBeInTheDocument();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    localStorage.setItem(IMPORT_ACTIVITY_KEY, yesterday.toISOString());
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(screen.getByTestId('import-todo-bubble')).toBeInTheDocument();
    localStorage.removeItem(IMPORT_ACTIVITY_KEY);
  });

  it('recognizes a successful sync today after restarting the renderer', async () => {
    window.API.getTradeRepublicStatus = jest.fn().mockResolvedValue({ runnerAvailable: true, hasSavedCredentials: true, lastSyncAt: new Date().toISOString() });
    await act(async () => { render(<TopNavBar />); });
    expect(screen.queryByTestId('import-todo-bubble')).not.toBeInTheDocument();
  });

  it('places Analyse between Dashboard and Assets and opens its dedicated route', async () => {
    window.API.saveSelectedTab = jest.fn().mockResolvedValue(undefined);
    window.API.getPortfolioAIStatus = jest.fn().mockResolvedValue({ hasApiKey: false, secureStorageAvailable: true, chatGpt: { connected: false, accounts: [] } });
    const store = setupStore({ appState: { selectedTab: 'dashboardTab' } });
    await act(async () => { render(<><TopNavBar /><Content /></>, { store }); });
    expect(screen.getAllByRole('tab').slice(0, 3).map(tab => tab.getAttribute('data-testid')))
      .toEqual(['dashboardTab', 'analysisTab', 'assetsTab']);
    await act(async () => { fireEvent.click(screen.getByTestId('analysisTab')); });
    expect(store.getState().appState.selectedTab).toBe('analysisTab');
    expect(window.API.saveSelectedTab).toHaveBeenCalledWith('analysisTab');
    expect(screen.getByTestId('AnalysisRoute')).toBeInTheDocument();
    expect(screen.getByLabelText('Anlageziel')).toBeInTheDocument();
    expect(screen.queryByTestId('AssetsRoute')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByTestId('assetsTab')); });
    expect(screen.getByTestId('AssetsRoute')).toBeInTheDocument();
    expect(screen.queryByTestId('portfolio-analysis')).not.toBeInTheDocument();
  });

	it('renders', async() => {
    const {getAllById} = render(<TopNavBar />) 
		await waitFor(() => {
			expect(getAllById('TopNavBar').length).toEqual(1);
		})
	});

  it('renders all tabs correctly', async () => {
    render(<TopNavBar />);
    await waitFor(() => {
      expect(screen.getByTestId('assetsTab')).toBeDefined();
      expect(screen.getByTestId('transactionsTab')).toBeDefined();
      expect(screen.getByTestId('dividendsTab')).toBeDefined();
    });
  });

  it('applies the correct theme class to the navbar', async () => {
    const store = setupStore();
    store.dispatch({ type: 'appState/changeTheme', payload: 'bp5-dark' });

    render(
      <Provider store={store}>
        <TopNavBar />
      </Provider>
    );

    await waitFor(() => {
      const navbar = screen.getByTestId('TopNavBar');
      expect(navbar).toHaveClass('bp5-dark');
    });
  });

  it('opens Import as a separate action and keeps Dashboard named Dashboard', async() => {
    const store = setupStore({ appState: { selectedTab: 'dashboardTab' } });
    await act(async () => { render(<TopNavBar />, { store }); });
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Bestand' })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Import' })); });
    expect(store.getState().appState.selectedTab).toBe('importTab');
    expect(screen.getByRole('button', { name: 'Import' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByTestId('quit-button')).not.toBeInTheDocument();
  });

  it('keeps the active overflow section visible and navigable after resizing', async () => {
    const store = setupStore({ appState: { selectedTab: 'transactionsTab' } });
    await act(async () => { render(<TopNavBar />, { store }); });
    await act(async () => { window.innerWidth = 900; window.dispatchEvent(new Event('resize')); });
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mehr: Transaktionen' })); });
    await act(async () => { fireEvent.click(await screen.findByText('Cash')); });
    expect(store.getState().appState.selectedTab).toBe('cashTab');
    await act(async () => { window.innerWidth = 320; window.dispatchEvent(new Event('resize')); });
    expect(screen.getByRole('button', { name: 'Bereich wählen: Cash' })).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
	});

  describe('handleTabChange', () => {

    const user = userEvent.setup();

    it('changes the current root route to "transactionsTab" if the tab got clicked and if appState.route != "transactionsTab" ', async() => {

      const store = setupStore({
        appState: {
          selectedTab: "assetsTab",
        }
      });

      render(
        <Provider store={store}>
          <RootRoute />
        </Provider>
      )

      expect(store.getState().appState.selectedTab).toEqual("assetsTab");
      expect(screen.getByTestId('AssetsRoute')).toBeDefined();

      act(() => {
        const tab = screen.getByTestId('transactionsTab')
        user.click(tab)
      });

      await waitFor(() => {
        expect(store.getState().appState.selectedTab).toEqual('transactionsTab')
      })
    })   

    it('changes the current root route to "dividendsTab" if the tab got clicked and if appState.route != "dividendsTab"', async () => {
      
      const store = setupStore({
        appState: {
          selectedTab: "assetsTab",
        }
      });

      render(
        <Provider store={store}>
          <RootRoute />
        </Provider>
      );

      expect(store.getState().appState.selectedTab).toEqual("assetsTab");
      expect(screen.getByTestId('AssetsRoute')).toBeDefined();

      act(() => {
        const tab = screen.getByTestId('dividendsTab');
        user.click(tab);
      });

      await waitFor(() => {
        expect(store.getState().appState.selectedTab).toEqual('dividendsTab');
        expect(screen.getByTestId('DividendsRoute')).toBeDefined();
      });
    });

    it('does not dispatch any action if the same tab is clicked multiple times', async () => {

      const store = setupStore({
        appState: {
          selectedTab: "assetsTab",
        }
      });

      render(
        <Provider store={store}>
          <RootRoute />
        </Provider>
      );

      expect(store.getState().appState.selectedTab).toEqual("assetsTab");

      const dispatchSpy = jest.spyOn(store, 'dispatch');

      act(() => {
        const tab = screen.getByTestId('assetsTab');
        user.click(tab);
        user.click(tab);
      });

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledTimes(0);
      });
    });

  });

})
