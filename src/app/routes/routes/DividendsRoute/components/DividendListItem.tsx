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
    <tr data-testid={"DividendListItem_" + props.i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
			<TableCell className="p-3 text-gray-500 font-mono text-xs">{props.i}</TableCell>
      <TableCell className="p-3">
				<input 
					data-testid={"dateInput_" + props.dividend.ID} 
					type="date" 
					value={dateInput} 
					className="bg-transparent border-0 text-sm text-gray-200 focus:ring-0 w-full"
					onChange={(e) => setDateInput(e.target.value)} 
					onBlur={(e) => dispatch(dividendCreationReducer.validateAndSave())} 
				/>
			</TableCell>
      <TableCell className="p-3">
				<select 
					id={"assetInput_" + props.dividend.ID} 
					name={"assetInput_" +  + props.dividend.ID} 
					value={assetInput} 
					className="bg-transparent border-0 text-sm text-gray-200 focus:ring-0 w-full cursor-pointer"
					onChange={(e) => setAssetInput(Number.parseInt(e.target.value))} 
					onBlur={(e) => dispatch(dividendCreationReducer.validateAndSave())}>
          {assets.map((asset, i) => {
							return (<option key={asset.ID} value={asset.ID}>{asset.name}</option>)
					})}
        </select>
			</TableCell>
      <TableCell className="p-3">
				<div className="flex items-center justify-end font-mono font-bold text-emerald-400">
					<input 
						id={"amountInput" + props.dividend.ID} 
						type="text" 
						value={incomeInput} 
						className="bg-transparent border-0 text-right text-sm focus:ring-0 w-24"
						onChange={(e) => setIncomeInput(e.target.value)} 
						onBlur={(e) => dispatch(dividendCreationReducer.validateAndSave())} 
					/>
					<span className="ml-1">€</span>
				</div>
			</TableCell>
    </tr>
  );
}