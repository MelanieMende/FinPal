import { useAppSelector, useAppDispatch } from './../../../../hooks'

import * as transactionCreationReducer from './../../../../../../src/app/store/transactionCreation/transactionCreation.reducer';
import TableCell from '../../../../components/Table/TableCell/TableCell';
import * as assetsSelector from './../../../../store/assets/assets.selectors';

export default function TransactionsRoute() {

	const dispatch = useAppDispatch();
  const assets = useAppSelector(state => state.assets)
	const dateInput = useAppSelector(state => state.transactionCreation.dateInput)
	const typeInput = useAppSelector(state => state.transactionCreation.typeInput)
	const assetInput = useAppSelector(state => state.transactionCreation.assetInput)
	const amountInput = useAppSelector(state => state.transactionCreation.amountInput)
	const priceInput = useAppSelector(state => state.transactionCreation.priceInput)
	const feeInput = useAppSelector(state => state.transactionCreation.feeInput)
	const solidaritySurchargeInput = useAppSelector(state => state.transactionCreation.solidaritySurchargeInput)

  const sorted_Assets = assetsSelector.selectAssetsSortedByName(assets, 'asc')

  const bgColorType = typeInput == "Buy" ? "bg-emerald-600" : "bg-pink-700"

	return (
    <tr>
      <TableCell>*</TableCell>
      <TableCell><input data-testid="dateInput" type="date" value={dateInput} onChange={(e) => dispatch(transactionCreationReducer.setDateInput(e.target.value))} onBlur={() => { dispatch(transactionCreationReducer.handleDateInputGotTouched()) }} /></TableCell>
      <TableCell>
        <select className={bgColorType} data-testid="typeInput" name="typeInput" defaultValue={typeInput} onChange={(e) => dispatch(transactionCreationReducer.setTypeInput(e.target.value))} onBlur={() => { dispatch(transactionCreationReducer.handleTypeInputGotTouched()) }}>
          <option value="Buy">Buy</option>
          <option value="Sell">Sell</option>
        </select>
      </TableCell>
      <TableCell>
        <select data-testid="assetInput" name="assetInput" value={assetInput} onChange={(e) => dispatch(transactionCreationReducer.setAssetInput(e.target.value))} onBlur={() => { dispatch(transactionCreationReducer.handleAssetInputGotTouched()) }}>
          {sorted_Assets.map((asset, i) => {
							return (<option data-testid="asset-option" key={'asset_' + asset.ID} value={asset.ID}>{asset.name}</option>)
					})}
        </select>
      </TableCell>
      <TableCell><input data-testid="amountInput" type="text" value={amountInput} onChange={(e) => dispatch(transactionCreationReducer.setAmountInput(e.target.value))} onBlur={() => { dispatch(transactionCreationReducer.handleAmountInputGotTouched()) }} /></TableCell>
      <TableCell></TableCell>
      <TableCell><input data-testid="priceInput" type="text" value={priceInput} onChange={(e) => dispatch(transactionCreationReducer.setPriceInput(e.target.value))} onBlur={() => { dispatch(transactionCreationReducer.handlePriceInputGotTouched()) }} /></TableCell>
      <TableCell><input data-testid="feeInput" type="text" value={feeInput} onChange={(e) => dispatch(transactionCreationReducer.setFeeInput(e.target.value))} onBlur={() => { dispatch(transactionCreationReducer.handleFeeInputGotTouched()) }} /></TableCell>
      <TableCell><input data-testid="solidaritySurchargeInput" type="text" value={solidaritySurchargeInput} onChange={(e) => dispatch(transactionCreationReducer.setSolidaritySurchargeInput(e.target.value))} onBlur={() => { dispatch(transactionCreationReducer.handleSolidaritySurchargeInputGotTouched()) }} /></TableCell>
    </tr>
	);
}