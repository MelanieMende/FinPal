import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { loadAsset } from './../assets/assets.reducer'

export const initialState = [] as Dividend[]

export const loadDividends = createAsyncThunk(
  'dividends/loadDividends',
  async (props, thunkAPI) => {
		var sql = 'SELECT * FROM dividends_v'
		console.log(sql)
		var result = await window.API.sendToDB(sql)
		console.log('result - load dividends: ', result)

		// Complete the state update before callers continue. The import list derives
		// its "Bereits importiert" status from this dividends state.
		await thunkAPI.dispatch(setDividends(result))
  }
)

export const setDividends = createAsyncThunk(
  'dividends/sortDividends',
  async (dividends:Dividend[], thunkAPI) => {
		const sorted = dividends.slice().sort((a:Dividend, b:Dividend) => sortBy(a, b, 'date', 'desc'))
		thunkAPI.dispatch(setDividendsInternal(sorted))
  }
)

export const saveDividend = createAsyncThunk(
	'dividends/saveDividend',
	async (props: { dividend: Dividend, dateInput: string, assetInput: number, incomeInput: string }, thunkAPI) => {
		if (!props.dateInput || !props.assetInput || !props.incomeInput) return

		const income = props.incomeInput.replace(',', '.')
		const sql = `
			INSERT OR REPLACE INTO dividends (ID, date, asset_ID, income)
			VALUES (
				'${props.dividend.ID}',
				'${props.dateInput}',
				'${props.assetInput}',
				'${income}'
			)`

		await window.API.sendToDB(sql)
		await thunkAPI.dispatch(loadDividends())
		await thunkAPI.dispatch(loadAsset({ assetID: props.assetInput }))
	}
)

export function sortBy(a:Dividend, b:Dividend, property:string, direction:'asc'|'desc') {
	if(property == 'date') {
		if(direction == 'asc')
			return a.date.localeCompare(b.date)
		else
			return b.date.localeCompare(a.date)
	}
	else if(property == 'asset') {
		if(direction == 'asc')
			return a.asset_ID.toString().localeCompare(b.asset_ID.toString())
		else
			return b.asset_ID.toString().localeCompare(a.asset_ID.toString())
	}
}

const dividendsSlice = createSlice({
	name: 'dividends',
	initialState,
	reducers: {
		setDividendsInternal(state, action) {
			return action.payload
		},
	}
})

// Extract the action creators object and the reducer
const { actions, reducer } = dividendsSlice
// Extract and export each action creator by name
export const {
	setDividendsInternal
} = actions

export default reducer
