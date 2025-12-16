import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { loadAsset, setCurrentInvest } from './../assets/assets.reducer'

export const initialState = [] as Transaction[]

export const loadTransactions = createAsyncThunk(
  'transactions/loadTransactions',
  async (props, thunkAPI) => {
		var sql = 'SELECT * FROM transactions_v'
		console.log(sql)
		var result = await window.API.sendToDB(sql)
		result.forEach((transaction:Transaction) => {
			if(transaction.rank == 1)
				transaction.invest_cumulated = transaction.in_out
			else
				transaction.invest_cumulated = 0
		});
		result.forEach((transaction:Transaction) => {
			var prev_trans = result.find((other_trans:Transaction) => other_trans.asset_ID == transaction.asset_ID && other_trans.rank == transaction.rank-1)
			if(transaction.rank > 1) {
				if(transaction.type == 'Buy')
					transaction.invest_cumulated = transaction.in_out + prev_trans.invest_cumulated
				else
					transaction.invest_cumulated = transaction.shares_cumulated * prev_trans.invest_cumulated
			} 
		});

		console.log('result - load transactions: ', result)

		thunkAPI.dispatch(setTransactions(result))
		thunkAPI.dispatch(updateCurrentInvest())
  }
)

export const updateCurrentInvest = createAsyncThunk(
  'assets/updateCurrentInvest',
  async (props, thunkAPI) => {
		let state = thunkAPI.getState() as State
		const assets = state.assets

		assets.forEach((asset:Asset) => {
			const filtered = state.transactions.filter((trans:Transaction) => trans.asset_ID == asset.ID)
			const sorted = filtered.slice().sort((a:Transaction, b:Transaction) => sortBy(a, b, 'date', 'desc'))

			let current_invest = 0
			
			if(sorted[0])
				current_invest = sorted[0].invest_cumulated
				
			thunkAPI.dispatch(setCurrentInvest({asset, current_invest}))
		})
  }
)

export const setTransactions = createAsyncThunk(
  'transactions/sortTransactions',
  async (transactions:Transaction[], thunkAPI) => {
		const sorted = transactions.slice().sort((a:Transaction, b:Transaction) => sortBy(a, b, 'date', 'desc'))
		thunkAPI.dispatch(setTransactionsInternal(sorted))
  }
)

export const saveTransaction = createAsyncThunk(
  'transactions/saveTransaction',
	async (props:{transaction:Transaction, dateInput:string, typeInput:string, assetInput:string, amountInput:string, priceInput:string, feeInput:string, solidaritySurchargeInput:string}, thunkAPI) => {
		if(props.dateInput && props.typeInput && props.assetInput && props.amountInput && props.priceInput) {
			let sql  = `
				INSERT OR REPLACE INTO transactions (ID, date, type, asset_ID, amount, price_per_share, fee, solidarity_surcharge)
				VALUES (
					'${props.transaction.ID}',
					'${props.dateInput}',
					'${props.typeInput}',
					'${props.assetInput}',
					'${props.amountInput}',
					'${props.priceInput.replace(',', '.')}',
					'${props.feeInput.replace(',', '.')}',
					'${props.solidaritySurchargeInput.replace(',', '.')}'
				)`
			console.log(sql)
			window.API.sendToDB(sql).then((result:any) => {
				console.log(result)
				window.API.sendToDB('SELECT * FROM transactions_v').then(async (result:Transaction[]) => {
					console.log(result)
					await thunkAPI.dispatch(setTransactions(result))
					await thunkAPI.dispatch(loadAsset({ assetID: parseInt(props.assetInput) }))
				});
			});
		}
		else {
			console.log('Error: Missing input values')
		}
	}
)

export function sortBy(a:Transaction, b:Transaction, property:string, direction:'asc'|'desc') {
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

const transactionsSlice = createSlice({
	name: 'transactions',
	initialState,
	reducers: {
		setTransactionsInternal(state, action) {
			return action.payload
		},
	}
})

// Extract the action creators object and the reducer
const { actions, reducer } = transactionsSlice
// Extract and export each action creator by name
export const {
	setTransactionsInternal
} = actions

export default reducer