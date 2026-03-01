import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

export const initialState = [] as CashTransaction[]

export const loadCash = createAsyncThunk(
  'cash/loadCash',
  async (props, thunkAPI) => {
    let sql = 'SELECT * FROM cash'
    let result = await window.API.sendToDB(sql)
    console.log('result - load cash: ', result)
    thunkAPI.dispatch(setCash(result))
  }
)

export const setCash = createAsyncThunk(
  'cash/setCash',
  async (cash:CashTransaction[], thunkAPI) => {
    const sorted = cash.slice().sort((a, b) => b.date.localeCompare(a.date))
    thunkAPI.dispatch(setCashInternal(sorted))
  }
)

const cashSlice = createSlice({
  name: 'cash',
  initialState,
  reducers: {
    setCashInternal(state, action) {
      return action.payload
    }
  }
})

// Extract the action creators object and the reducer
const { actions, reducer } = cashSlice
// Extract and export each action creator by name
export const { setCashInternal } = actions

export default reducer
