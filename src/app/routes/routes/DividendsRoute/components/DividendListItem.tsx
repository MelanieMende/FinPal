import { useAppSelector, useAppDispatch } from '../../../../hooks'
import { useState } from 'react';
import * as dividendCreationReducer from '../../../../store/dividendCreation/dividendCreation.reducer';
import TableCell from '../../../../components/Table/TableCell/TableCell';

export default function DividendListItem(props: {i: number, dividend:Dividend}) {

	const assets = useAppSelector(state => state.assets)

  const dispatch = useAppDispatch();
  const [dateInput, setDateInput] = useState(props.dividend.date || '');
	const [assetInput, setAssetInput] = useState(props.dividend.asset_ID);
	const [incomeInput, setIncomeInput] = useState(props.dividend.income || '');

  return (
    <tr data-testid={"DividendListItem_" + props.i}>
			<TableCell>{props.i}</TableCell>
      <TableCell><input data-testid={"dateInput_" + props.dividend.ID} type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} onBlur={(e) => dispatch(dividendCreationReducer.validateAndSave())} /></TableCell>
      <TableCell>
				<select 
					id={"assetInput_" + props.dividend.ID} 
					name={"assetInput_" +  + props.dividend.ID} 
					value={assetInput} 
					onChange={(e) => setAssetInput(Number.parseInt(e.target.value))} 
					onBlur={(e) => dispatch(dividendCreationReducer.validateAndSave())}>
          {assets.map((asset, i) => {
							return (<option key={asset.ID} value={asset.ID}>{asset.name}</option>)
					})}
        </select>
			</TableCell>
      <TableCell><input id={"amountInput" + props.dividend.ID} type="text" value={incomeInput} onChange={(e) => setIncomeInput(e.target.value)} onBlur={(e) => dispatch(dividendCreationReducer.validateAndSave())} /></TableCell>
    </tr>
  );
}