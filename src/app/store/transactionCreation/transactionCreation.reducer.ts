import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import * as transactionsReducer from '../transactions/transactions.reducer';
import * as assetsReducer from '../assets/assets.reducer';

export const initialState = {
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
} as TransactionCreation

export const handleDateInputGotTouched = createAsyncThunk(
  'transactionCreation/handleDateInputGotTouched',
  async (props, thunkAPI) => {
		thunkAPI.dispatch(setDateInputGotTouched(true))
		thunkAPI.dispatch(validateAndSave())
  }
)

export const handleTypeInputGotTouched = createAsyncThunk(
  'transactionCreation/handleTypeInputGotTouched',
  async (props, thunkAPI) => {
		thunkAPI.dispatch(setTypeInputGotTouched(true))
		thunkAPI.dispatch(validateAndSave())
  }
)

export const handleAssetInputGotTouched = createAsyncThunk(
  'transactionCreation/handleAssetInputGotTouched',
  async (props, thunkAPI) => {
		thunkAPI.dispatch(setAssetInputGotTouched(true))
		thunkAPI.dispatch(validateAndSave())
  }
)

export const handleAmountInputGotTouched = createAsyncThunk(
  'transactionCreation/handleAmountInputGotTouched',
  async (props, thunkAPI) => {
		thunkAPI.dispatch(setAmountInputGotTouched(true))
		thunkAPI.dispatch(validateAndSave())
  }
)

export const handlePriceInputGotTouched = createAsyncThunk(
  'transactionCreation/handlePriceInputGotTouched',
  async (props, thunkAPI) => {
		thunkAPI.dispatch(setPriceInputGotTouched(true))
		thunkAPI.dispatch(validateAndSave())
  }
)

export const handleFeeInputGotTouched = createAsyncThunk(
  'transactionCreation/handleFeeInputGotTouched',
  async (props, thunkAPI) => {
		thunkAPI.dispatch(setFeeInputGotTouched(true))
		thunkAPI.dispatch(validateAndSave())
  }
)

export const handleSolidaritySurchargeInputGotTouched = createAsyncThunk(
  'transactionCreation/handleSolidaritySurchargeInputGotTouched',
  async (props, thunkAPI) => {
		thunkAPI.dispatch(setSolidaritySurchargeInputGotTouched(true))
		thunkAPI.dispatch(validateAndSave())
  }
)

export function isValid(state:State) {
  if(state.transactionCreation.dateInputGotTouched && 
    state.transactionCreation.assetInputGotTouched && 
    state.transactionCreation.amountInputGotTouched && 
    state.transactionCreation.priceInputGotTouched && 
    state.transactionCreation.feeInputGotTouched && 
    state.transactionCreation.solidaritySurchargeInputGotTouched
  ) {
    return true
  }
  else {
    return false
  }
}

export const validateAndSave = createAsyncThunk(
  'transactionCreation/validate',
  async (props, thunkAPI) => {
		let state = thunkAPI.getState() as State
    if(isValid(state)) {
      let sql  = 'INSERT OR REPLACE INTO transactions (ID, date, type, asset_ID, amount, price_per_share, fee, solidarity_surcharge) '
          sql += 'VALUES (\'' + state.transactionCreation.newID
          sql += '\',\'' + state.transactionCreation.dateInput
          sql += '\',\'' + state.transactionCreation.typeInput.replace('\'', '\'\'')
          sql += '\',\'' + state.transactionCreation.assetInput
          sql += '\',\'' + state.transactionCreation.amountInput.replace(',', '.') 
          sql += '\',\'' + state.transactionCreation.priceInput.replace(',', '.') 
          sql += '\',\'' + state.transactionCreation.feeInput.replace(',', '.')
          sql += '\',\'' + state.transactionCreation.solidaritySurchargeInput.replace(',', '.') + '\')'
    
      console.log(sql)
     
      window.API.sendToDB(sql).then((result:any) => {
        console.log(result)
        let sql  = 'SELECT MAX(ID) as ID FROM transactions'
        console.log(sql)
        window.API.sendToDB(sql).then((result:any) => {
          thunkAPI.dispatch(setNewID(result[0].ID + 1))
          thunkAPI.dispatch(transactionsReducer.loadTransactions())
          thunkAPI.dispatch(assetsReducer.loadAsset({ assetID: parseInt(state.transactionCreation.assetInput) }))
          thunkAPI.dispatch(reset())
        });
      });
    }
  }
)

export const reset = createAsyncThunk(
  'transactionCreation/reset',
  async (props, thunkAPI) => {
    console.log("reseting transactionCreation")

		thunkAPI.dispatch(setDateInputGotTouched(false))
		thunkAPI.dispatch(setDateInput(''))
    thunkAPI.dispatch(setTypeInputGotTouched(false))
		thunkAPI.dispatch(setTypeInput('Buy'))
    thunkAPI.dispatch(setAssetInputGotTouched(false))
		thunkAPI.dispatch(setAssetInput(''))
    thunkAPI.dispatch(setAmountInputGotTouched(false))
		thunkAPI.dispatch(setAmountInput(''))
    thunkAPI.dispatch(setPriceInputGotTouched(false))
		thunkAPI.dispatch(setPriceInput(''))
    thunkAPI.dispatch(setFeeInputGotTouched(false))
		thunkAPI.dispatch(setFeeInput(''))
    thunkAPI.dispatch(setSolidaritySurchargeInputGotTouched(false))
		thunkAPI.dispatch(setSolidaritySurchargeInput(''))

    document.getElementById("dateInput").focus();
  }
)

const transactionCreationSlice = createSlice({
	name: 'transactionCreation',
	initialState,
	reducers: {
    setNewID(state, action) {
			state.newID = action.payload
		},
    setDateInput(state, action) {
			state.dateInput = action.payload
		},
		setDateInputGotTouched(state, action) {
			state.dateInputGotTouched = action.payload
		},
    setTypeInput(state, action) {
			state.typeInput = action.payload
		},
    setTypeInputGotTouched(state, action) {
			state.typeInputGotTouched = action.payload
		},
    setAssetInput(state, action) {
			state.assetInput = action.payload
		},
    setAssetInputGotTouched(state, action) {
			state.assetInputGotTouched = action.payload
		},
    setAmountInput(state, action) {
			state.amountInput = action.payload
		},
    setAmountInputGotTouched(state, action) {
			state.amountInputGotTouched = action.payload
		},
    setPriceInput(state, action) {
			state.priceInput = action.payload
		},
    setPriceInputGotTouched(state, action) {
			state.priceInputGotTouched = action.payload
		},
    setFeeInput(state, action) {
			state.feeInput = action.payload
		},
    setFeeInputGotTouched(state, action) {
			state.feeInputGotTouched = action.payload
		},
    setSolidaritySurchargeInput(state, action) {
			state.solidaritySurchargeInput = action.payload
		},
    setSolidaritySurchargeInputGotTouched(state, action) {
			state.solidaritySurchargeInputGotTouched = action.payload
		},
	}
})

// Extract the action creators object and the reducer
const { actions, reducer } = transactionCreationSlice
// Extract and export each action creator by name
export const {
  setNewID,
  setDateInput,
	setDateInputGotTouched,
  setTypeInput,
  setTypeInputGotTouched,
  setAssetInput,
  setAssetInputGotTouched,
  setAmountInput,
  setAmountInputGotTouched,
  setPriceInput,
  setPriceInputGotTouched,
  setFeeInput,
  setFeeInputGotTouched,
  setSolidaritySurchargeInput,
  setSolidaritySurchargeInputGotTouched
} = actions

export default reducer