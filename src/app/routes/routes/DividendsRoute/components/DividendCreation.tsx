import { useAppSelector, useAppDispatch } from './../../../../hooks'

import * as dividendCreationReducer from './../../../../../../src/app/store/dividendCreation/dividendCreation.reducer';
import TableCell from '../../../../components/Table/TableCell/TableCell';

export default function DividendCreation() {

	const dispatch = useAppDispatch();
  const assets = useAppSelector(state => state.assets)
	const dateInput = useAppSelector(state => state.dividendCreation.dateInput)
	const assetInput = useAppSelector(state => state.dividendCreation.assetInput)
	const incomeInput = useAppSelector(state => state.dividendCreation.incomeInput)

	return (
    <tr id="DividendCreation">
      <TableCell>*</TableCell>
      <TableCell>
        <input 
          id="dateInput" /* id is needed by the reset function, to focus this element */ 
          data-testid="dateInput" 
          type="date" 
          value={dateInput} 
          onChange={(e) => dispatch(dividendCreationReducer.setDateInput(e.target.value))} 
          onBlur={() => { dispatch(dividendCreationReducer.handleDateInputGotTouched()) }} />
      </TableCell>
      <TableCell>
      <select data-testid="assetInput" name="assetInput" value={assetInput} onChange={(e) => dispatch(dividendCreationReducer.setAssetInput(e.target.value))} onBlur={() => { dispatch(dividendCreationReducer.handleAssetInputGotTouched()) }}>
          {assets.map((asset, i) => {
							return (<option key={asset.ID} value={asset.ID}>{asset.name}</option>)
					})}
        </select>
      </TableCell>
      <TableCell><input data-testid="incomeInput" type="text" value={incomeInput} onChange={(e) => dispatch(dividendCreationReducer.setIncomeInput(e.target.value))} onBlur={() => { dispatch(dividendCreationReducer.handleIncomeInputGotTouched()) }} /></TableCell>
    </tr>
	);
}