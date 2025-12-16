import { act, screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '../../../../../testing/test-utils'
import * as appStateReducer from '../../../../store/appState/appState.reducer';
import Settings from './Settings';
import TopNavBar from '../TopNavBar';

describe('Settings component', () => {

	it('renders', async() => {
    render(<Settings />) 
		await waitFor(() => {
			expect(screen.getAllByTestId('Settings').length).toEqual(1);
		})
	});

  it('opens the menu Settings > Theme & switches the theme', async() => {
    const appState = Object.assign({}, appStateReducer.initialState, { theme: 'bp5-dark' })
    render(<TopNavBar />, { preloadedState: { appState: appState } })
    await waitFor(() => {
      expect(screen.getByTestId('TopNavBar').className.indexOf("bp5-dark") != -1).toBe(true);
		})
    fireEvent.click(screen.getByTestId('TopNavBarSettings'))
    await waitFor(() => {
			expect(screen.getAllByTestId('Settings').length).toEqual(1);
		})
    fireEvent.mouseOver(screen.getByText('Theme'))
    await waitFor(() => {
			expect(screen.getAllByTestId('menuItem-lightMode').length).toEqual(1);
		})
    fireEvent.click(screen.getByTestId('menuItem-lightMode'))
    await waitFor(() => {
      expect(screen.getByTestId('TopNavBar').className.indexOf("bp5-body") != -1).toBe(true);
		})
    fireEvent.click(screen.getByTestId('menuItem-darkMode'))
    await waitFor(() => {
      expect(screen.getByTestId('TopNavBar').className.indexOf("bp5-dark") != -1).toBe(true);
		})
	});
  
})
