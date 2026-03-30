import React from 'react';
import { useAppSelector, useAppDispatch } from './../../../../hooks'
import * as transactionCreationReducer from './../../../../../../src/app/store/transactionCreation/transactionCreation.reducer';
import TableCell from '../../../../components/Table/TableCell/TableCell';
import * as assetsSelector from './../../../../store/assets/assets.selectors';
import { Icon } from '@blueprintjs/core';

export default function TransactionCreation() {
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
  const isBuy = typeInput === "Buy";

	return (
    <tr className="bg-blue-500/5 border-b border-blue-500/10">
      <TableCell className="p-3 text-center">
				<Icon icon="plus" className="text-blue-400 animate-pulse" size={14} />
			</TableCell>
      
			<TableCell className="p-3">
				<input 
					data-testid="dateInput" 
					type="date" 
					value={dateInput} 
					onChange={(e) => dispatch(transactionCreationReducer.setDateInput(e.target.value))} 
					onBlur={() => dispatch(transactionCreationReducer.handleDateInputGotTouched())} 
					className="glass-input-minimal text-xs bg-white/5 border border-white/10 rounded px-1 text-white focus:border-blue-500/50 outline-none"
				/>
			</TableCell>

      <TableCell className="p-3">
				<div className="relative">
					<select 
						data-testid="typeInput" 
						name="typeInput" 
						value={typeInput} 
						onChange={(e) => dispatch(transactionCreationReducer.setTypeInput(e.target.value))} 
						onBlur={() => dispatch(transactionCreationReducer.handleTypeInputGotTouched())}
						className={`text-[10px] font-bold uppercase rounded-full px-3 py-1 border cursor-pointer appearance-none outline-none transition-all ${isBuy ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}
					>
						<option value="Buy">Buy</option>
						<option value="Sell">Sell</option>
					</select>
				</div>
      </TableCell>

      <TableCell className="p-3">
        <select 
					data-testid="assetInput" 
					name="assetInput" 
					value={assetInput} 
					onChange={(e) => dispatch(transactionCreationReducer.setAssetInput(e.target.value))} 
					onBlur={() => dispatch(transactionCreationReducer.handleAssetInputGotTouched())}
					className="glass-input-minimal text-sm font-semibold bg-white/5 border border-white/10 rounded px-1 text-white w-full outline-none focus:border-blue-500/50"
				>
          {sorted_Assets.map((asset) => (
						<option data-testid="asset-option" key={'asset_' + asset.ID} value={asset.ID}>{asset.name}</option>
					))}
        </select>
      </TableCell>

      <TableCell className="p-3 text-right">
				<input 
					data-testid="amountInput" 
					type="text" 
					placeholder="Shares"
					value={amountInput} 
					onChange={(e) => dispatch(transactionCreationReducer.setAmountInput(e.target.value))} 
					onBlur={() => dispatch(transactionCreationReducer.handleAmountInputGotTouched())} 
					className="text-right glass-input-minimal text-sm font-bold bg-white/5 border border-white/10 rounded px-1 text-white w-20 outline-none focus:border-blue-500/50"
				/>
			</TableCell>

      <TableCell className="p-3 text-right text-gray-500 font-medium text-xs">
				—
			</TableCell>

      <TableCell className="p-3 text-right">
				<div className="flex items-center justify-end">
					<input 
						data-testid="priceInput" 
						type="text" 
						placeholder="Price"
						value={priceInput} 
						onChange={(e) => dispatch(transactionCreationReducer.setPriceInput(e.target.value))} 
						onBlur={() => dispatch(transactionCreationReducer.handlePriceInputGotTouched())} 
						className="text-right glass-input-minimal text-sm font-bold bg-white/5 border border-white/10 rounded px-1 text-white w-20 outline-none focus:border-blue-500/50"
					/>
					<span className="text-[10px] text-gray-500 ml-1">EUR</span>
				</div>
			</TableCell>

      <TableCell className="p-3 text-right group">
				<div className="flex flex-col gap-1">
					<input 
						data-testid="feeInput" 
						type="text" 
						placeholder="Fee"
						value={feeInput} 
						onChange={(e) => dispatch(transactionCreationReducer.setFeeInput(e.target.value))} 
						onBlur={() => dispatch(transactionCreationReducer.handleFeeInputGotTouched())} 
						className="text-right glass-input-minimal text-[10px] bg-white/5 border border-white/10 rounded px-1 text-gray-300 w-16 ml-auto outline-none focus:border-blue-500/50"
					/>
					<input 
						data-testid="solidaritySurchargeInput" 
						type="text" 
						placeholder="Tax"
						value={solidaritySurchargeInput} 
						onChange={(e) => dispatch(transactionCreationReducer.setSolidaritySurchargeInput(e.target.value))} 
						onBlur={() => dispatch(transactionCreationReducer.handleSolidaritySurchargeInputGotTouched())} 
						className="text-right glass-input-minimal text-[10px] bg-white/5 border border-white/10 rounded px-1 text-gray-500 w-16 ml-auto outline-none focus:border-blue-500/50"
					/>
				</div>
			</TableCell>

			<TableCell className="p-3 text-right text-gray-500 text-xs italic">
				—
			</TableCell>

			<TableCell className="p-3 text-right text-gray-500 text-xs italic">
				—
			</TableCell>

			<TableCell className="p-3 text-center">
				<div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-500/10">
					<Icon icon="add" size={14} />
				</div>
			</TableCell>
    </tr>
	);
}