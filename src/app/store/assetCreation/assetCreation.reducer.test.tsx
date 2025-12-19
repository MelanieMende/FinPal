import { act, screen, waitFor } from '@testing-library/react'
import reducer, * as assetCreationReducer from './assetCreation.reducer'
import { setupStore } from './../../store';

describe('AssetCreation reducer', () => {

	it('should return the initial state', () => {
		expect(reducer(undefined, { type: 'unknown' })).toEqual(assetCreationReducer.initialState)
	})

	it('should handle setID', () => {
		expect(reducer(assetCreationReducer.initialState, assetCreationReducer.setID('test_value'))).toEqual(
			Object.assign({}, assetCreationReducer.initialState, {
				ID: "test_value"
			})
		)
	})

	it('should handle setNameInput', () => {
		expect(reducer(assetCreationReducer.initialState, assetCreationReducer.setNameInput('test_value'))).toEqual(
			Object.assign({}, assetCreationReducer.initialState, {
				nameInput: "test_value"
			})
		)
	})

  it('should handle setSymbolInput', () => {
		expect(reducer(assetCreationReducer.initialState, assetCreationReducer.setSymbolInput('test_value'))).toEqual(
			Object.assign({}, assetCreationReducer.initialState, {
				symbolInput: "test_value"
			})
		)
	})

  it('should handle setISINInput', () => {
		expect(reducer(assetCreationReducer.initialState, assetCreationReducer.setISINInput('test_value'))).toEqual(
			Object.assign({}, assetCreationReducer.initialState, {
				isinInput: "test_value"
			})
		)
	})

  it('should handle setKGVInput', () => {
		expect(reducer(assetCreationReducer.initialState, assetCreationReducer.setKGVInput('test_value'))).toEqual(
			Object.assign({}, assetCreationReducer.initialState, {
				kgvInput: "test_value"
			})
		)
	})

	describe('AppState Thunks', () => {

    it('should handle validateAndSave', async() => {
			const store = setupStore();
      store.dispatch(assetCreationReducer.setNameInput('testName'))
			store.dispatch(assetCreationReducer.setSymbolInput('testSymbol'))
			store.dispatch(assetCreationReducer.setISINInput('0123456789012'))
      let result1 = await store.dispatch(assetCreationReducer.validateAndSave())
      expect(result1.payload).toEqual(false)
      expect(store.getState().assetCreation).toEqual(
				Object.assign({}, assetCreationReducer.initialState, {
          nameInput: 'testName',
					symbolInput: 'testSymbol',
					isinInput: '0123456789012'
        })
			)
    })

		it('should handle reset', async() => {
			const store = setupStore();
      store.dispatch(assetCreationReducer.setNameInput('test'))
      store.dispatch(assetCreationReducer.setSymbolInput('test'))
      store.dispatch(assetCreationReducer.setISINInput('test'))
      store.dispatch(assetCreationReducer.setKGVInput('test'))
      expect(store.getState().assetCreation).toEqual(
				Object.assign({}, assetCreationReducer.initialState, {
          nameInput: 'test',
          symbolInput: 'test',
		      isinInput: 'test',
		      kgvInput: 'test'
        })
			)
      await store.dispatch(assetCreationReducer.reset())
			expect(store.getState().assetCreation).toEqual(
				Object.assign({}, assetCreationReducer.initialState, {
					ID: 2,
          nameInput: '',
          symbolInput: '',
		      isinInput: '',
		      kgvInput: ''
        })
			)
		})

	})

})
