import { act, fireEvent, waitFor } from '@testing-library/react'
import { render } from '../../../../../testing/test-utils'
import RefreshButton from './RefreshButton';
import { Provider } from 'react-redux';
import { setupStore } from '../../../../store';

describe('AssetsRoute component', () => {

	it('renders', async() => {
    const {getAllById} = render(<RefreshButton />) 
		await waitFor(() => {
			expect(getAllById('RefreshButton').length).toEqual(1);
		})
	});

  it('dispatches assetsReducer.loadAssets() on button click', async() => {
    
    const store = setupStore();
    const spy = jest.spyOn(store, 'dispatch')

    const {getAllById} = await act(async() => {
      return render(
        <Provider store={store}>
          <RefreshButton />
        </Provider>
      )
    })
    
    fireEvent.click(getAllById('RefreshButton')[0]);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1)
		})
	});

})