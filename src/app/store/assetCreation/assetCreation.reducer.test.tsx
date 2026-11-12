import { act, screen, waitFor } from '@testing-library/react'
import reducer, * as assetCreationReducer from './assetCreation.reducer'
import { setupStore } from './../../store';

describe('AssetCreation reducer', () => {

	it('should return the initial state', () => {
		expect(reducer(undefined, { type: 'unknown' })).toEqual(assetCreationReducer.initialState)
	})

	it('validates property equity inputs and rejects malformed optional amounts', () => {
		const property = {
			...assetCreationReducer.initialState,
			typeInput: 'RealEstate' as const,
			nameInput: 'Family home',
			propertyMarketValueInput: '450.000,00',
			propertyOwnershipShareInput: '50,5',
			propertyMortgageBalanceInput: '100.000,00',
		}

		expect(assetCreationReducer.isValid(property)).toBe(true)
		expect(assetCreationReducer.isValid({
			...property,
			propertyOwnershipShareInput: '101',
		})).toBe(false)
		expect(assetCreationReducer.isValid({
			...property,
			propertyMonthlyRentInput: 'unknown',
		})).toBe(false)
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

		it('persists real estate fields with a private identifier', async () => {
			const originalAPI = window.API
			const sendToDB = jest.fn((query: string) => Promise.resolve(
				query === 'SELECT * FROM assets_v' ? [] : query.startsWith('SELECT MAX') ? [{ ID: 2 }] : []
			))
			window.API = { ...window.API, sendToDB }
			const store = setupStore()
			store.dispatch(assetCreationReducer.setID(2))
			store.dispatch(assetCreationReducer.setTypeInput('RealEstate'))
			store.dispatch(assetCreationReducer.setNameInput("Family's home"))
			store.dispatch(assetCreationReducer.setPropertyMarketValueInput('450.000,00'))
			store.dispatch(assetCreationReducer.setPropertyOwnershipShareInput('50'))
			store.dispatch(assetCreationReducer.setPropertyMortgageBalanceInput('100.000,00'))

			await expect(store.dispatch(assetCreationReducer.validateAndSave()).unwrap()).resolves.toBe(true)

			const insert = sendToDB.mock.calls.find(([query]) => query.includes('INSERT INTO assets'))?.[0]
			expect(insert).toContain("'Family''s home'")
			expect(insert).toContain("'PRIVATE_PROPERTY_2'")
			expect(insert).toContain("'RealEstate'")
			expect(insert).toContain('450000, 50, 100000')
			expect(insert).toContain('property_monthly_rent, property_monthly_costs')
			window.API = originalAPI
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
