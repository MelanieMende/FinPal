import { act, screen, waitFor } from '@testing-library/react'
import reducer, * as transactionCreationReducer from './transactionCreation.reducer'
import { setupStore } from '..';

describe('AssetCreation reducer', () => {

  it('should return the initial state', () => {
		expect(reducer(undefined, { type: 'unknown' })).toEqual(transactionCreationReducer.initialState)
	})

  describe('Assets Thunks', () => {

    it('should handleDateInputGotTouched()', () => {
      const store = setupStore();
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { dateInputGotTouched: false })
			)
      store.dispatch(transactionCreationReducer.handleDateInputGotTouched())
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { dateInputGotTouched: true })
			)
    })

    it('should handleTypeInputGotTouched()', () => {
      const store = setupStore();
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { typeInputGotTouched: false })
			)
      store.dispatch(transactionCreationReducer.handleTypeInputGotTouched())
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { typeInputGotTouched: true })
			)
    })

    it('should handleAssetInputGotTouched()', () => {
      const store = setupStore();
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { assetInputGotTouched: false })
			)
      store.dispatch(transactionCreationReducer.handleAssetInputGotTouched())
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { assetInputGotTouched: true })
			)
    })

    it('should handleAmountInputGotTouched()', () => {
      const store = setupStore();
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { amountInputGotTouched: false })
			)
      store.dispatch(transactionCreationReducer.handleAmountInputGotTouched())
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { amountInputGotTouched: true })
			)
    })

    it('should handlePriceInputGotTouched()', () => {
      const store = setupStore();
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { priceInputGotTouched: false })
			)
      store.dispatch(transactionCreationReducer.handlePriceInputGotTouched())
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { priceInputGotTouched: true })
			)
    })

    it('should handleFeeInputGotTouched()', () => {
      const store = setupStore();
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { feeInputGotTouched: false })
			)
      store.dispatch(transactionCreationReducer.handleFeeInputGotTouched())
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { feeInputGotTouched: true })
			)
    })

    it('should handleSolidaritySurchargeInputGotTouched()', () => {
      const store = setupStore();
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { solidaritySurchargeInputGotTouched: false })
			)
      store.dispatch(transactionCreationReducer.handleSolidaritySurchargeInputGotTouched())
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, { solidaritySurchargeInputGotTouched: true })
			)
    })

    it('should reset()', () => {
      const preloadedState = Object.assign({}, { transactionCreation: transactionCreationReducer.initialState }, {
        transactionCreation: {
          dateInput: '2024-11-09',
          dateInputGotTouched: true,
          typeInput: 'Sell',
          typeInputGotTouched: true,
          assetInput: 'Test',
          assetInputGotTouched: true,
          amountInput: 'Test',
          amountInputGotTouched: true,
          priceInput: 'Test',
          priceInputGotTouched: true,
          feeInput: 'Test',
          feeInputGotTouched: true,
          solidaritySurchargeInput: 'Test',
          solidaritySurchargeInputGotTouched: true
        }
      })
      const store = setupStore(preloadedState);
      store.dispatch(transactionCreationReducer.reset())
      expect(store.getState().transactionCreation).toEqual(
				Object.assign({}, transactionCreationReducer.initialState, {
          dateInput: '',
          dateInputGotTouched: false,
          typeInput: 'Buy',
          typeInputGotTouched: false,
          assetInput: '',
          assetInputGotTouched: false,
          amountInput: '',
          amountInputGotTouched: false,
          priceInput: '',
          priceInputGotTouched: false,
          feeInput: '',
          feeInputGotTouched: false,
          solidaritySurchargeInput: '',
          solidaritySurchargeInputGotTouched: false 
        })
			)
    })
  })
/*
    it('should handle validateAndSave()', () => {
      const path_to_test_configs = process.cwd() + '\\src\\testing\\test_configs\\'
      const filePath = path_to_test_configs + 'config.json'

      window.API = {
        appState:{
          dataPath: path_to_test_configs,
          filePath: filePath,
          load: () => appStateAPI.load(filePath),
          saveTheme: jest.fn(),
          saveSelectedTab: jest.fn()
        },
        sendToDB: sendToDB(sql:string),
        sendToFinanceAPI: jest.fn(),
        quit: jest.fn()
      }
      const preloadedState = Object.assign({}, { transactionCreation: transactionCreationReducer.initialState }, {
        transactionCreation: {
          dateInput: '2024-11-09',
          dateInputGotTouched: true,
          typeInput: 'Sell',
          typeInputGotTouched: true,
          assetInput: 'Test',
          assetInputGotTouched: true,
          amountInput: 'Test',
          amountInputGotTouched: true,
          priceInput: 'Test',
          priceInputGotTouched: true,
          feeInput: 'Test',
          feeInputGotTouched: true,
          solidaritySurchargeInput: 'Test',
          solidaritySurchargeInputGotTouched: true
        }
      })
      const store = setupStore(preloadedState);
      store.dispatch(transactionCreationReducer.validateAndSave())
    })

  })
*/
  describe('isValid(state:State)', () => {
  
    it('should return true if every mandatory field got touched', () => {
      const testState = Object.assign({}, { transactionCreation: transactionCreationReducer.initialState }, {
        transactionCreation: {
          dateInputGotTouched: true,
          typeInputGotTouched: true,
          assetInputGotTouched: true,
          amountInputGotTouched: true,
          priceInputGotTouched: true,
          feeInputGotTouched: true,
          solidaritySurchargeInputGotTouched: true
        }
      })
      expect(transactionCreationReducer.isValid(testState)).toBeTruthy()
    })

    it('should return false if any mandatory field got not touched', () => {
      const testState = Object.assign({}, { transactionCreation: transactionCreationReducer.initialState }, {
        transactionCreation: {
          dateInputGotTouched: false,
          typeInputGotTouched: true,
          assetInputGotTouched: true,
          amountInputGotTouched: true,
          priceInputGotTouched: true,
          feeInputGotTouched: true,
          solidaritySurchargeInputGotTouched: true
        }
      })
      expect(transactionCreationReducer.isValid(testState)).toBeFalsy()
    })
  
  })

})