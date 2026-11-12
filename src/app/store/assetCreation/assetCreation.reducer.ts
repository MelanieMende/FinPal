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
  propertyLocationInput: '',
  propertyMarketValueInput: '',
  propertyOwnershipShareInput: '100',
  propertyMortgageBalanceInput: '0',
  propertyPurchaseDateInput: '',
  propertyPurchasePriceInput: '',
  propertyMonthlyRentInput: '0',
  propertyMonthlyCostsInput: '0',
} as AssetCreation

function parseNumberInput(value: string): number | null {
  const compact = value.trim().replace(/\s/g, '')
  if (!compact) return null
  const lastComma = compact.lastIndexOf(',')
  const lastDot = compact.lastIndexOf('.')
  const normalized = lastComma >= 0 && lastDot >= 0
    ? lastComma > lastDot
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.replace(/,/g, '')
    : compact.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function sqlText(value: string): string {
  return `'${value.trim().replace(/'/g, "''")}'`
}

const realEstatePropertyFields = [
  'property_location',
  'property_market_value',
  'property_ownership_share',
  'property_mortgage_balance',
  'property_purchase_date',
  'property_purchase_price',
  'property_monthly_rent',
  'property_monthly_costs',
] as const

function realEstatePropertyValues(assetCreation: AssetCreation): string[] {
  const location = assetCreation.propertyLocationInput.trim()
  const purchaseDate = assetCreation.propertyPurchaseDateInput.trim()
  const purchasePrice = parseNumberInput(assetCreation.propertyPurchasePriceInput)
  const optionalNumberSql = (value: string) => {
    const parsed = parseNumberInput(value)
    return parsed === null ? 'NULL' : String(parsed)
  }
  return [
    location ? sqlText(location) : 'NULL',
    optionalNumberSql(assetCreation.propertyMarketValueInput),
    optionalNumberSql(assetCreation.propertyOwnershipShareInput),
    optionalNumberSql(assetCreation.propertyMortgageBalanceInput),
    purchaseDate ? sqlText(purchaseDate) : 'NULL',
    purchasePrice === null ? 'NULL' : String(purchasePrice),
    optionalNumberSql(assetCreation.propertyMonthlyRentInput),
    optionalNumberSql(assetCreation.propertyMonthlyCostsInput),
  ]
}

export const validateAndSave = createAsyncThunk(
  'assetCreation/validateAndSave',
  async (props, thunkAPI) => {
		const state = thunkAPI.getState() as State
    if(isValid(state.assetCreation)) {
    let sql: string;
    let isinSql = state.assetCreation.isinInput.trim() ? `'${state.assetCreation.isinInput.trim().replace('\'', '\'\'')}'` : 'NULL';
    const kgvSql = state.assetCreation.kgvInput.trim() ? `'${state.assetCreation.kgvInput.trim().replace('\'', '\'\'')}'` : 'NULL';
    const isRealEstate = state.assetCreation.typeInput === 'RealEstate'
    const privateIdentifier = `PRIVATE_PROPERTY_${state.assetCreation.ID}`
    const symbolSql = isRealEstate ? sqlText(privateIdentifier) : sqlText(state.assetCreation.symbolInput)
    if (isRealEstate) isinSql = sqlText(privateIdentifier)
    const realEstateValues = isRealEstate
      ? realEstatePropertyValues(state.assetCreation)
      : ['NULL', 'NULL', '100', '0', 'NULL', 'NULL', '0', '0']
    const realEstateUpdates = realEstatePropertyFields
      .map((column, index) => `${column}=${realEstateValues[index]}`)
      .join(',\n          ')

    if (state.assetCreation.ID && state.assets.some(a => a.ID === state.assetCreation.ID)) {
      sql = `
        UPDATE assets SET 
          name=${sqlText(state.assetCreation.nameInput)},
          symbol=${symbolSql},
          isin=${isinSql},
          kgv=${kgvSql},
          type='${state.assetCreation.typeInput}',
          reserved_amount=${state.assetCreation.typeInput === 'IPO' ? 'reserved_amount' : '0'},
          reserved_since=${state.assetCreation.typeInput === 'IPO' ? 'reserved_since' : 'NULL'},
          ${realEstateUpdates}
        WHERE ID = ${state.assetCreation.ID}
      `;
    } else {
      const propertyColumnList = realEstatePropertyFields.join(', ')
      const propertyValueList = realEstateValues.join(', ')
      sql = `
        INSERT INTO assets (name, symbol, isin, kgv, type, ${propertyColumnList})
        VALUES (
          ${sqlText(state.assetCreation.nameInput)},
          ${symbolSql},
          ${isinSql},
          ${kgvSql},
          '${state.assetCreation.typeInput}',
          ${propertyValueList}
        )
      `;
    }
     
      const result = await window.API.sendToDB(sql)
      if (typeof result === 'string' && result.includes('SQLITE_ERROR')) {
        console.error('Failed to save asset:', result)
        return false
      }
      await thunkAPI.dispatch(assetsReducer.loadAssets(undefined))
      thunkAPI.dispatch(appStateReducer.setShowAssetOverlay(false))
      await thunkAPI.dispatch(reset())
      return true
    }
    return false
  }
)

export function isValid(assetCreation:AssetCreation) {
  if (assetCreation.typeInput === 'RealEstate') {
    const marketValue = parseNumberInput(assetCreation.propertyMarketValueInput)
    const ownershipShare = parseNumberInput(assetCreation.propertyOwnershipShareInput)
    const mortgageBalance = parseNumberInput(assetCreation.propertyMortgageBalanceInput)
    const purchasePrice = parseNumberInput(assetCreation.propertyPurchasePriceInput)
    const monthlyRent = parseNumberInput(assetCreation.propertyMonthlyRentInput)
    const monthlyCosts = parseNumberInput(assetCreation.propertyMonthlyCostsInput)
    const optionalAmountInputs: [string, number | null][] = [
      [assetCreation.propertyMortgageBalanceInput, mortgageBalance],
      [assetCreation.propertyPurchasePriceInput, purchasePrice],
      [assetCreation.propertyMonthlyRentInput, monthlyRent],
      [assetCreation.propertyMonthlyCostsInput, monthlyCosts],
    ]
    const validOptionalAmounts = optionalAmountInputs
      .every(([input, value]) => input.trim() === '' || value !== null && value >= 0)
    return assetCreation.nameInput.trim().length > 0
      && marketValue !== null && marketValue >= 0
      && ownershipShare !== null && ownershipShare > 0 && ownershipShare <= 100
      && validOptionalAmounts
  }
  return assetCreation.nameInput.length > 0 && assetCreation.symbolInput.length > 0 && (assetCreation.isinInput.length === 12 || assetCreation.isinInput.trim() === '')
}

export const prefillFromISIN = createAsyncThunk(
  'assetCreation/prefillFromISIN',
  async (props: { isin: string, fallbackName: string, type?: Asset['type'] }, thunkAPI) => {
    // Reset form first
    thunkAPI.dispatch(setISINInput(props.isin))
    thunkAPI.dispatch(setNameInput(props.fallbackName))
    thunkAPI.dispatch(setSymbolInput(''))
    thunkAPI.dispatch(setKGVInput(''))
    thunkAPI.dispatch(resetPropertyInputs())
    thunkAPI.dispatch(setTypeInput(props.type ?? 'Stock'))

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
    thunkAPI.dispatch(resetPropertyInputs())
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
    setPropertyLocationInput(state, action) { state.propertyLocationInput = action.payload },
    setPropertyMarketValueInput(state, action) { state.propertyMarketValueInput = action.payload },
    setPropertyOwnershipShareInput(state, action) { state.propertyOwnershipShareInput = action.payload },
    setPropertyMortgageBalanceInput(state, action) { state.propertyMortgageBalanceInput = action.payload },
    setPropertyPurchaseDateInput(state, action) { state.propertyPurchaseDateInput = action.payload },
    setPropertyPurchasePriceInput(state, action) { state.propertyPurchasePriceInput = action.payload },
    setPropertyMonthlyRentInput(state, action) { state.propertyMonthlyRentInput = action.payload },
    setPropertyMonthlyCostsInput(state, action) { state.propertyMonthlyCostsInput = action.payload },
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
  setPropertyLocationInput,
  setPropertyMarketValueInput,
  setPropertyOwnershipShareInput,
  setPropertyMortgageBalanceInput,
  setPropertyPurchaseDateInput,
  setPropertyPurchasePriceInput,
  setPropertyMonthlyRentInput,
  setPropertyMonthlyCostsInput,
  setTypeInput,
} = actions

export const resetPropertyInputs = () => (dispatch: (action: { type: string; payload: string }) => void) => {
  dispatch(setPropertyLocationInput(''))
  dispatch(setPropertyMarketValueInput(''))
  dispatch(setPropertyOwnershipShareInput('100'))
  dispatch(setPropertyMortgageBalanceInput('0'))
  dispatch(setPropertyPurchaseDateInput(''))
  dispatch(setPropertyPurchasePriceInput(''))
  dispatch(setPropertyMonthlyRentInput('0'))
  dispatch(setPropertyMonthlyCostsInput('0'))
}

export default reducer
