import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { render } from '../../../../testing/test-utils'
import TopNavBar from './TopNavBar';
import RootRoute from '../../RootRoute';
import { setupStore } from './../../../store';
import { Provider } from 'react-redux';
import { prepareAutoBatched } from '@reduxjs/toolkit';

describe('TopNavBar component', () => {

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

  it('quits on button click', async() => {
    render(<TopNavBar />)
    const spy = jest.spyOn(window.API, 'quit')
    fireEvent.click(screen.getByTestId('quit-button'));
		expect(spy).toHaveBeenCalled();
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
      const logSpy = jest.spyOn(console, 'log');

      act(() => {
        const tab = screen.getByTestId('assetsTab');
        user.click(tab);
        user.click(tab);
      });

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledTimes(0);
        expect(logSpy).toHaveBeenCalledWith("Current route is already \\assetsTab");
      });
    });

  });

})
