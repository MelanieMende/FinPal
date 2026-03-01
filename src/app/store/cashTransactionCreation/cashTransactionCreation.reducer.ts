import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import * as cashReducer from '../cash/cash.reducer'

export const initialState = {
  dateInput: '',
  dateInputGotTouched: false,
  typeInput: 'Deposit',
  typeInputGotTouched: false,
  amountInput: '',
  amountInputGotTouched: false,
  feeInput: '',
  feeInputGotTouched: false,
  commentInput: '',
  commentInputGotTouched: false,
  newID: 0
} as CashTransactionCreation

// touch handlers
export const handleDateInputGotTouched = createAsyncThunk(
  'cashTransactionCreation/handleDateInputGotTouched',
  async (props, thunkAPI) => {
    thunkAPI.dispatch(setDateInputGotTouched(true))
    thunkAPI.dispatch(validateAndSave())
  }
)
export const handleTypeInputGotTouched = createAsyncThunk(
  'cashTransactionCreation/handleTypeInputGotTouched',
  async (props, thunkAPI) => {
    thunkAPI.dispatch(setTypeInputGotTouched(true))
    thunkAPI.dispatch(validateAndSave())
  }
)
export const handleAmountInputGotTouched = createAsyncThunk(
  'cashTransactionCreation/handleAmountInputGotTouched',
  async (props, thunkAPI) => {
    thunkAPI.dispatch(setAmountInputGotTouched(true))
    thunkAPI.dispatch(validateAndSave())
  }
)
export const handleFeeInputGotTouched = createAsyncThunk(
  'cashTransactionCreation/handleFeeInputGotTouched',
  async (props, thunkAPI) => {
    thunkAPI.dispatch(setFeeInputGotTouched(true))
    thunkAPI.dispatch(validateAndSave())
  }
)
export const handleCommentInputGotTouched = createAsyncThunk(
  'cashTransactionCreation/handleCommentInputGotTouched',
  async (props, thunkAPI) => {
    thunkAPI.dispatch(setCommentInputGotTouched(true))
    thunkAPI.dispatch(validateAndSave())
  }
)

function isValid(state: State) {
  const s = state.cashTransactionCreation
  return s.dateInputGotTouched && s.typeInputGotTouched && s.amountInputGotTouched && s.feeInputGotTouched && s.commentInputGotTouched
}

export const validateAndSave = createAsyncThunk(
  'cashTransactionCreation/validateAndSave',
  async (props, thunkAPI) => {
    const state = thunkAPI.getState() as State
    if(isValid(state)) {
      console.log('valid - saving cash transaction')
      let sql = `INSERT OR REPLACE INTO cash (ID, date, type, amount, fee, comment) VALUES ('${state.cashTransactionCreation.newID}','${state.cashTransactionCreation.dateInput}','${state.cashTransactionCreation.typeInput}','${state.cashTransactionCreation.amountInput.replace(',', '.')}','${state.cashTransactionCreation.feeInput.replace(',', '.')}','${state.cashTransactionCreation.commentInput}')`
      console.log(sql)
      window.API.sendToDB(sql).then((result:any) => {
        console.log(result)
        window.API.sendToDB('SELECT MAX(ID) as ID FROM cash').then((res:any) => {
          thunkAPI.dispatch(setNewID(res[0].ID + 1))
          thunkAPI.dispatch(cashReducer.loadCash())
          thunkAPI.dispatch(reset())
        })
      })
    }
    else {
      console.log('invalid - not saving cash transaction')
    }
  }
)

export const reset = createAsyncThunk(
  'cashTransactionCreation/reset',
  async (props, thunkAPI) => {
    thunkAPI.dispatch(setDateInputGotTouched(false))
    thunkAPI.dispatch(setDateInput(''))
    thunkAPI.dispatch(setTypeInputGotTouched(false))
    thunkAPI.dispatch(setTypeInput('Deposit'))
    thunkAPI.dispatch(setAmountInputGotTouched(false))
    thunkAPI.dispatch(setAmountInput(''))
    thunkAPI.dispatch(setFeeInputGotTouched(false))
    thunkAPI.dispatch(setFeeInput(''))
    thunkAPI.dispatch(setCommentInputGotTouched(false))
    thunkAPI.dispatch(setCommentInput(''))
    document.getElementById('dateInput')?.focus()
  }
)

const cashTransactionCreationSlice = createSlice({
  name: 'cashTransactionCreation',
  initialState,
  reducers: {
    setNewID(state, action) { state.newID = action.payload },
    setDateInput(state, action) { state.dateInput = action.payload },
    setDateInputGotTouched(state, action) { state.dateInputGotTouched = action.payload },
    setTypeInput(state, action) { state.typeInput = action.payload },
    setTypeInputGotTouched(state, action) { state.typeInputGotTouched = action.payload },
    setAmountInput(state, action) { state.amountInput = action.payload },
    setAmountInputGotTouched(state, action) { state.amountInputGotTouched = action.payload },
    setFeeInput(state, action) { state.feeInput = action.payload },
    setFeeInputGotTouched(state, action) { state.feeInputGotTouched = action.payload },
    setCommentInput(state, action) { state.commentInput = action.payload },
    setCommentInputGotTouched(state, action) { state.commentInputGotTouched = action.payload }
  }
})

const { actions, reducer } = cashTransactionCreationSlice
export const {
  setNewID,
  setDateInput,
  setDateInputGotTouched,
  setTypeInput,
  setTypeInputGotTouched,
  setAmountInput,
  setAmountInputGotTouched,
  setFeeInput,
  setFeeInputGotTouched,
  setCommentInput,
  setCommentInputGotTouched
} = actions
export default reducer
