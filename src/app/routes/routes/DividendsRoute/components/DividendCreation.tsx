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
    <tr id="DividendCreation" className="bg-emerald-500/5 transition-colors group">
      <TableCell className="p-3 text-emerald-500 font-bold text-center group-hover:bg-emerald-500/10">*</TableCell>
      <TableCell className="p-3 group-hover:bg-emerald-500/10">
        <input 
          id="dateInput" 
          data-testid="dateInput" 
          type="date" 
          value={dateInput} 
          className="bg-transparent border-0 text-sm text-gray-200 focus:ring-0 w-full"
          onChange={(e) => dispatch(dividendCreationReducer.setDateInput(e.target.value))} 
          onBlur={() => { dispatch(dividendCreationReducer.handleDateInputGotTouched()) }} 
        />
      </TableCell>
      <TableCell className="p-3 group-hover:bg-emerald-500/10">
        <select 
          data-testid="assetInput" 
          name="assetInput" 
          value={assetInput} 
          className="bg-transparent border-0 text-sm text-gray-200 focus:ring-0 w-full cursor-pointer"
          onChange={(e) => dispatch(dividendCreationReducer.setAssetInput(e.target.value))} 
          onBlur={() => { dispatch(dividendCreationReducer.handleAssetInputGotTouched()) }}>
          {assets.map((asset, i) => {
							return (<option key={asset.ID} value={asset.ID}>{asset.name}</option>)
					})}
        </select>
      </TableCell>
      <TableCell className="p-3 group-hover:bg-emerald-500/10">
				<div className="flex items-center justify-end font-mono font-bold text-emerald-400">
					<input 
						data-testid="incomeInput" 
						type="text" 
						value={incomeInput} 
						className="bg-transparent border-0 text-right text-sm focus:ring-0 w-24"
						onChange={(e) => dispatch(dividendCreationReducer.setIncomeInput(e.target.value))} 
						onBlur={() => { dispatch(dividendCreationReducer.handleIncomeInputGotTouched()) }} 
					/>
					<span className="ml-1">€</span>
				</div>
			</TableCell>
    </tr>
	);
}