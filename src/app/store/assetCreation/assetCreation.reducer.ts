import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import * as assetsReducer from '../assets/assets.reducer';
import * as appStateReducer from '../appState/appState.reducer';

export const initialState = {
  ID: null,
  typeInput: 'Stock',
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
    let sql;
    let isinSql = state.assetCreation.isinInput.trim() ? `'${state.assetCreation.isinInput.trim().replace('\'', '\'\'')}'` : 'NULL';
    let kgvSql = state.assetCreation.kgvInput.trim() ? `'${state.assetCreation.kgvInput.trim().replace('\'', '\'\'')}'` : 'NULL';

    if (state.assetCreation.ID && state.assets.some(a => a.ID === state.assetCreation.ID)) {
      sql = `
        UPDATE assets SET 
          name='${state.assetCreation.nameInput.replace('\'', '\'\'')}',
          symbol='${state.assetCreation.symbolInput.replace('\'', '\'\'')}',
          isin=${isinSql},
          kgv=${kgvSql},
          type='${state.assetCreation.typeInput}'
        WHERE ID = ${state.assetCreation.ID}
      `;
    } else {
      sql = `
        INSERT INTO assets (name, symbol, isin, kgv, type) 
        VALUES (
          '${state.assetCreation.nameInput.replace('\'', '\'\'')}',
          '${state.assetCreation.symbolInput.replace('\'', '\'\'')}',
          ${isinSql},
          ${kgvSql},
          '${state.assetCreation.typeInput}'
        )
      `;
    }
     
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
                thunkAPI.dispatch(assetsReducer.loadAssets(undefined))
                thunkAPI.dispatch(appStateReducer.setShowAssetOverlay(false))
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
  return assetCreation.nameInput.length > 0 && assetCreation.symbolInput.length > 0 && (assetCreation.isinInput.length === 12 || assetCreation.isinInput.trim() === '')
}

export const prefillFromISIN = createAsyncThunk(
  'assetCreation/prefillFromISIN',
  async (props: { isin: string, fallbackName: string }, thunkAPI) => {
    // Reset form first
    thunkAPI.dispatch(setISINInput(props.isin))
    thunkAPI.dispatch(setNameInput(props.fallbackName))
    thunkAPI.dispatch(setSymbolInput(''))
    thunkAPI.dispatch(setKGVInput(''))
    thunkAPI.dispatch(setTypeInput('Stock'))

    // Prepare ID
    let sql  = 'SELECT MAX(ID) as ID FROM assets'
    let result = await window.API.sendToDB(sql)
    thunkAPI.dispatch(setID(result[0].ID + 1))

    // Fetch from DivvyDiary
    try {
      const json = await window.API.sendToDivvyDiaryAPI({ isin: props.isin })
      if (json) {
        if (json.name) thunkAPI.dispatch(setNameInput(json.name))
        if (json.symbol) thunkAPI.dispatch(setSymbolInput(json.symbol))
      }
    } catch (e) {
      console.error('Failed to prefill from DivvyDiary:', e)
    }
  }
)

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
    thunkAPI.dispatch(setTypeInput('Stock'))
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
    setTypeInput(state, action) {
			state.typeInput = action.payload
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
  setTypeInput,
} = actions

export default reducer