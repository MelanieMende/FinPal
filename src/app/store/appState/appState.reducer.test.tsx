import { act, screen, waitFor } from '@testing-library/react'
import reducer, * as appStateReducer from './appState.reducer'
import { setupStore } from './../../store';

describe('AppState reducer', () => {

	it('should return the initial state', () => {
		expect(reducer(undefined, { type: 'unknown' })).toEqual(appStateReducer.initialState)
	})

	it('should handle setSelectedTab', () => {
		expect(reducer(appStateReducer.initialState, appStateReducer.setSelectedTab('test_tab'))).toEqual(
			Object.assign({}, appStateReducer.initialState, {
				selectedTab: "test_tab"
			})
		)
	})

	it('should handle setTheme', () => {
		expect(reducer(appStateReducer.initialState, appStateReducer.setTheme('test_theme'))).toEqual(
			Object.assign({}, appStateReducer.initialState, {
				theme: "test_theme"
			})
		)
	})

	it('should handle setDatabase', () => {
		expect(reducer(appStateReducer.initialState, appStateReducer.setDatabase('test_db'))).toEqual(
			Object.assign({}, appStateReducer.initialState, {
				database: "test_db"
			})
		)
	})

	describe('toggleTransactionsAssetFilter', () => {
		it('should add AssetID if not yet in array', () => {
			expect(reducer(appStateReducer.initialState, appStateReducer.toggleTransactionsAssetFilter(1))).toEqual(
				Object.assign({}, appStateReducer.initialState, {
					transactions_AssetFilter: [1]
				})
			)
		})
		it('should remove AssetID if already in array', () => {
			expect(reducer(Object.assign({}, appStateReducer.initialState, { transactions_AssetFilter: [1,2,3] }), appStateReducer.toggleTransactionsAssetFilter(2))).toEqual(
				Object.assign({}, appStateReducer.initialState, {
					transactions_AssetFilter: [1,3]
				})
			)
		})
	})
/*
	describe('AppState Thunks', () => {

		it('should handle changeSelectedTab', async() => {
			const store = setupStore({
				appState: {
					selectedTab: "assetsTab",
				}
			});
			let result = null
			result = await store.dispatch(appStateReducer.changeSelectedTab('databaseTab'))
			expect(result.payload).toEqual(
				Object.assign({}, appStateReducer.initialState, {selectedTab: "databaseTab"})
			)
			result = await store.dispatch(appStateReducer.changeSelectedTab('dividendsTab'))
			expect(result.payload).toEqual(
				Object.assign({}, appStateReducer.initialState, {selectedTab: "dividendsTab"})
			)
		})

	})
*/
})
