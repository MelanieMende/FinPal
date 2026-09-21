import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { loadAsset, setCurrentInvest } from './../assets/assets.reducer'

export const initialState = [] as Transaction[]

export function calculateInvestCumulated(transactions: Transaction[]) {
	const calculated = transactions.map(transaction => ({ ...transaction }));
	const ordered = calculated.slice().sort((a, b) =>
		a.asset_ID - b.asset_ID || a.rank - b.rank || a.ID - b.ID
	);
	const previousByAsset = new Map<number, Transaction>();

	ordered.forEach(transaction => {
		const previous = previousByAsset.get(transaction.asset_ID);

		if (!previous) {
			transaction.invest_cumulated = transaction.in_out;
		} else if (transaction.type === 'Buy') {
			transaction.invest_cumulated = previous.invest_cumulated + transaction.in_out;
		} else {
			const previousShares = previous.shares_cumulated || 0;
			const remainingShareRatio = previousShares === 0
				? 0
				: Math.max(0, transaction.shares_cumulated / previousShares);
			transaction.invest_cumulated = remainingShareRatio === 0
				? 0
				: previous.invest_cumulated * remainingShareRatio;
		}

		previousByAsset.set(transaction.asset_ID, transaction);
	});

	return calculated;
}

export const loadTransactions = createAsyncThunk<void, { assetIDs?: number[] } | void>(
  'transactions/loadTransactions',
  async (props, thunkAPI) => {
		const sql = 'SELECT * FROM transactions_v'
		console.log(sql)
		const dbResult = await window.API.sendToDB(sql)
		const result = calculateInvestCumulated(dbResult)

		console.log('result - load transactions: ', result)

		thunkAPI.dispatch(setTransactions(result))
		thunkAPI.dispatch(updateCurrentInvest({ assetIDs: props ? props.assetIDs : undefined }))
  }
)

export const updateCurrentInvest = createAsyncThunk(
  'assets/updateCurrentInvest',
  async (props: { assetIDs?: number[] } | undefined, thunkAPI) => {
		const state = thunkAPI.getState() as State
		let assets = state.assets
		
		if (props?.assetIDs && props.assetIDs.length > 0) {
			assets = assets.filter(a => props.assetIDs.includes(a.ID))
		}

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
			const sql  = `
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
