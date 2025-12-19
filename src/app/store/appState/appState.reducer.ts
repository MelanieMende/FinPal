import { TabId } from '@blueprintjs/core';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import AppState from './appState';

export enum AssetOverlayType {
  NEW = 'NEW',
  EDIT = 'EDIT'
}

export const initialState = {
	selectedTab: "transactionsTab",
	theme: "bp5-dark",
	database: "",
	assetOverlayType: AssetOverlayType.NEW,
	showAssetOverlay: false,
	transactions_AssetFilter: [],
	dividends_AssetFilter: []
} as AppState

export const changeSelectedTab = createAsyncThunk(
  'appState/changeSelectedTab',
  async (navbarTabId:TabId, thunkAPI) => {
		console.log("Changing the selected tab to '" + navbarTabId + "' ...")
		let state:any = thunkAPI.getState()
		thunkAPI.dispatch(setSelectedTab(navbarTabId))
		state = thunkAPI.getState()
		window.API.saveSelectedTab(state.appState.selectedTab).then(() => {
			console.log("Selected tab '" + state.appState.selectedTab + "' saved to config file.")
			return state.appState
		})
  }
)

export const transactions_AssetFilter_ToggleAsset = createAsyncThunk(
	'appState/transactions_AssetFilter_ToggleAsset',
	async (assetID:number, thunkAPI) => {
		console.log("Toggling asset with ID: " + assetID)
		thunkAPI.dispatch(toggleTransactionsAssetFilter(assetID))
		let state:any = thunkAPI.getState()
		window.API.saveTransactionsAssetFilter(state.appState.transactions_AssetFilter)
	}
)

const appStateSlice = createSlice({
	name: 'appState',
	initialState,
	reducers: {
		setSelectedTab(state, action) {
			state.selectedTab = action.payload
		},
		setTheme(state, action) {
			state.theme = action.payload
		},
		setDatabase(state, action) {
			state.database = action.payload
		},
		setAssetOverlayType(state, action) {
			state.assetOverlayType = action.payload
		},
		setShowAssetOverlay(state, action) {
			state.showAssetOverlay = action.payload
		},
		setTransactionsAssetFilter(state, action) {
			state.transactions_AssetFilter = action.payload
		},
		toggleTransactionsAssetFilter(state, action: { payload: number }) {
			console.log("Toggling asset with ID: " + action.payload)
			if(!state.transactions_AssetFilter.includes(action.payload)) {
				console.log("Adding asset to filter")
				state.transactions_AssetFilter.push(action.payload)
			}
      else {
				console.log("Removing asset from filter")
				state.transactions_AssetFilter.splice(state.transactions_AssetFilter.indexOf(action.payload), 1)
			}
		},
		dividends_AssetFilter_ToggleAsset(state, action: { payload: number }) {
			console.log("Toggling asset with ID: " + action.payload)
			if(!state.dividends_AssetFilter.includes(action.payload)) {
				console.log("Adding asset to filter")
				state.dividends_AssetFilter.push(action.payload)
			}
      else {
				console.log("Removing asset from filter")
				state.dividends_AssetFilter.splice(state.dividends_AssetFilter.indexOf(action.payload), 1)
			}
		},
	}
})

// Extract the action creators object and the reducer
const { actions, reducer } = appStateSlice
// Extract and export each action creator by name
export const {
	setSelectedTab, 
	setTheme,
	setDatabase,
	setAssetOverlayType,
	setShowAssetOverlay,
	setTransactionsAssetFilter,
	toggleTransactionsAssetFilter,
	dividends_AssetFilter_ToggleAsset
} = actions

export default reducer
