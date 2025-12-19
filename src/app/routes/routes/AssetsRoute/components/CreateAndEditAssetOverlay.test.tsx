import { act, screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '../../../../../testing/test-utils'
import CreateAndEditAssetOverlay from './CreateAndEditAssetOverlay';
import { Provider } from 'react-redux';
import { setupStore } from '../../../../store';
import AppState from '../../../../store/appState/appState';

describe('CreateAndEditAssetOverlay component', () => {

  const preloadedState = { 
    appState: { 
      showAssetOverlay: true 
    } as AppState
  }

	it('renders', async() => {
    const {getAllById} = render(<CreateAndEditAssetOverlay />, { preloadedState: preloadedState }) 
		await waitFor(() => {
			expect(getAllById('AssetOverlay').length).toEqual(1);
		})
	});

  it('handles onCLose event', async() => {
    
    const store = setupStore(preloadedState);

    const {getAllById} = await act(async() => {
      return render(
        <Provider store={store}>
          <CreateAndEditAssetOverlay />
        </Provider>
      )
    })

    await waitFor(() => {
      expect(store.getState().appState.showAssetOverlay).toEqual(true)
		})
    
    fireEvent.click(screen.getByLabelText('Close'));

    await waitFor(() => {
      expect(store.getState().appState.showAssetOverlay).toEqual(false)
		})
	});

  it('dispatches assetCreationReducer.setNameInput(e.target.value) on nameInput change', async() => {
    
    const store = setupStore(preloadedState);

    const {getAllById} = await act(async() => {
      return render(
        <Provider store={store}>
          <CreateAndEditAssetOverlay />
        </Provider>
      )
    })

    await waitFor(() => {
      expect(store.getState().appState.showAssetOverlay).toEqual(true)
		})
    
    fireEvent.change(getAllById('nameInput')[0], { target: { value: 'nameInput' } })

    await waitFor(() => {
      expect(store.getState().assetCreation.nameInput).toEqual('nameInput')
		})
	});

  it('dispatches assetCreationReducer.setSymbolInput(e.target.value) on symbolInput change', async() => {
    
    const store = setupStore(preloadedState);

    const {getAllById} = await act(async() => {
      return render(
        <Provider store={store}>
          <CreateAndEditAssetOverlay />
        </Provider>
      )
    })

    await waitFor(() => {
      expect(store.getState().appState.showAssetOverlay).toEqual(true)
		})
    
    fireEvent.change(getAllById('symbolInput')[0], { target: { value: 'symbolInput' } })

    await waitFor(() => {
      expect(store.getState().assetCreation.symbolInput).toEqual('symbolInput')
		})
	});

  it('dispatches assetCreationReducer.setISINInput(e.target.value) on isinInput change', async() => {
    
    const store = setupStore(preloadedState);

    const {getAllById} = await act(async() => {
      return render(
        <Provider store={store}>
          <CreateAndEditAssetOverlay />
        </Provider>
      )
    })

    await waitFor(() => {
      expect(store.getState().appState.showAssetOverlay).toEqual(true)
		})
    
    fireEvent.change(getAllById('isinInput')[0], { target: { value: 'isinInput' } })

    await waitFor(() => {
      expect(store.getState().assetCreation.isinInput).toEqual('isinInput')
		})
	});

  it('dispatches assetCreationReducer.setKGVInput(e.target.value) on kgvInput change', async() => {
    
    const store = setupStore(preloadedState);

    const {getAllById} = await act(async() => {
      return render(
        <Provider store={store}>
          <CreateAndEditAssetOverlay />
        </Provider>
      )
    })

    await waitFor(() => {
      expect(store.getState().appState.showAssetOverlay).toEqual(true)
		})
    
    fireEvent.change(getAllById('kgvInput')[0], { target: { value: 'kgvInput' } })

    await waitFor(() => {
      expect(store.getState().assetCreation.kgvInput).toEqual('kgvInput')
		})
	});

  it('dispatches assetCreationReducer.validateAndSave() on SaveButton click', async() => {
    
    const store = setupStore(preloadedState);
    const spy = jest.spyOn(store, 'dispatch')

    const {getAllById} = await act(async() => {
      return render(
        <Provider store={store}>
          <CreateAndEditAssetOverlay />
        </Provider>
      )
    })

    await waitFor(() => {
      expect(store.getState().appState.showAssetOverlay).toEqual(true)
		})
    
    fireEvent.click(getAllById('SaveButton')[0]);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1)
		})
	});

  it('dispatches appStateReducer.setShowAssetOverlay(false) on CloseButton click', async() => {
    
    const store = setupStore(preloadedState);

    const {getAllById} = await act(async() => {
      return render(
        <Provider store={store}>
          <CreateAndEditAssetOverlay />
        </Provider>
      )
    })

    await waitFor(() => {
      expect(store.getState().appState.showAssetOverlay).toEqual(true)
		})
    
    fireEvent.click(getAllById('CloseButton')[0]);

    await waitFor(() => {
      expect(store.getState().appState.showAssetOverlay).toEqual(false)
		})
	});
})