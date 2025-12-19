import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import * as assetsReducer from '../assets/assets.reducer';
import { AssetOverlayType } from '../appState/appState.reducer';

export const initialState = {
  ID: null,
  nameInput: '',
  symbolInput: '',
  isinInput: '',
  kgvInput: '',
} as AssetCreation

export const validateAndSave = createAsyncThunk(
  'assetCreation/validateAndSave',
  async (props, thunkAPI) => {
		let state = thunkAPI.getState() as State
    if(isValid(state.assetCreation)) {
    let sql  = `
      INSERT OR REPLACE INTO assets (ID, name, symbol, isin, kgv) 
        VALUES (
           ${state.assetCreation.ID},
          '${state.assetCreation.nameInput.replace('\'', '\'\'')}',
          '${state.assetCreation.symbolInput.replace('\'', '\'\'')}',
          '${state.assetCreation.isinInput.replace('\'', '\'\'')}',
          '${state.assetCreation.kgvInput.replace('\'', '\'\'')}'
        )`
     
    window.API.sendToDB(sql)
      .then((result:any) => {
        console.log(result)
        let sql  = 'SELECT MAX(ID) as ID FROM assets'
        window.API.sendToDB(sql)
          .then((result:any) => {
            thunkAPI.dispatch(setID(result[0].ID + 1))
            window.API.sendToDB(sql)
              .then((result:Asset[]) => {
                console.log('result: ', result)
                thunkAPI.dispatch(assetsReducer.loadAssets())
                thunkAPI.dispatch(reset())
                return true;
              });
          });
      });
   }
   else {
    return false;
   }
  }
)

export function isValid(assetCreation:AssetCreation) {
  return assetCreation.nameInput.length > 0 && assetCreation.symbolInput.length > 0 && assetCreation.isinInput.length == 12
}

export const reset = createAsyncThunk(
  'assetCreation/reset',
  async (props, thunkAPI) => {

    let sql  = 'SELECT MAX(ID) as ID FROM assets'

    console.log(sql)

    let result = await window.API.sendToDB(sql)
    
    console.log('Max. ID: ', result[0].ID)

    thunkAPI.dispatch(setID(result[0].ID + 1))
    thunkAPI.dispatch(setNameInput(''))
    thunkAPI.dispatch(setSymbolInput(''))
    thunkAPI.dispatch(setISINInput(''))
    thunkAPI.dispatch(setKGVInput(''))
    let state = thunkAPI.getState() as State
    console.log(state.assetCreation)
  }
)

const assetCreationSlice = createSlice({
	name: 'assetCreation',
	initialState,
	reducers: {
    setID(state, action) {
			state.ID = action.payload
		},
    setNameInput(state, action) {
			state.nameInput = action.payload
		},
    setSymbolInput(state, action) {
			state.symbolInput = action.payload
		},
    setISINInput(state, action) {
			state.isinInput = action.payload
		},
    setKGVInput(state, action) {
			state.kgvInput = action.payload
		},
	}
})

// Extract the action creators object and the reducer
const { actions, reducer } = assetCreationSlice
// Extract and export each action creator by name
export const {
  setID,
  setNameInput,
  setSymbolInput,
  setISINInput,
  setKGVInput,
} = actions

export default reducer