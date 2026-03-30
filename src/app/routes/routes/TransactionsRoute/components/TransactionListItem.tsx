import React, { useState } from 'react';
import { useAppSelector, useAppDispatch } from '../../../../hooks'
import * as transactionsReducer from '../../../../store/transactions/transactions.reducer';
import TableCell from '../../../../components/Table/TableCell/TableCell';
import * as assetsSelector from './../../../../store/assets/assets.selectors';
import { Button, Icon, Intent, Alignment } from '@blueprintjs/core';

export default function TransactionListItem(props: {i: number, transaction:Transaction}) {
	const dispatch = useAppDispatch();
	const assets = useAppSelector(state => state.assets);
	const transaction_asset = assets.find(asset => asset.ID === props.transaction.asset_ID);

  const [dateInput, setDateInput] = useState(props.transaction.date || '');
	const [typeInput, setTypeInput] = useState(props.transaction.type || '');
	const [assetInput, setAssetInput] = useState(transaction_asset ? transaction_asset.ID.toString() : '');
	const [amountInput, setAmountInput] = useState(props.transaction.amount || '');
	const [priceInput, setPriceInput] = useState((props.transaction.price_per_share || 0).toString());
	const [feeInput, setFeeInput] = useState((props.transaction.fee || 0).toString());
	const [solidaritySurchargeInput, setSolidaritySurchargeInput] = useState((props.transaction.solidarity_surcharge || 0).toString());

  const euroFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
	const shareFormatter = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  function validateAndSave() {
		dispatch(transactionsReducer.saveTransaction({
			transaction: props.transaction, 
			dateInput, 
			typeInput, 
			assetInput, 
			amountInput, 
			priceInput, 
			feeInput, 
			solidaritySurchargeInput}
		))
	}

	function deleteTransaction(ID:number) {
		if (window.confirm("Are you sure you want to delete this transaction?")) {
			window.API.sendToDB('DELETE FROM transactions WHERE ID = ' + ID).then(() => {
				window.API.sendToDB('SELECT * FROM transactions_v').then((result:Transaction[]) => {
					dispatch(transactionsReducer.setTransactions(result))
				});
			});
		}
	}

	const sorted_Assets = assetsSelector.selectAssetsSortedByName(assets, 'asc');
	const isBuy = typeInput === "Buy";

  return (
    <tr id={"TransactionListItem_" + props.transaction.ID} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group">
			<TableCell className="p-3 text-gray-500 font-mono text-xs">{props.i}</TableCell><TableCell className="p-3"><input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} onBlur={() => validateAndSave()} className="glass-input-minimal text-xs bg-transparent border-0 focus:ring-1 focus:ring-blue-500/50 rounded px-1 transition-all"/></TableCell><TableCell className="p-3"><div className="relative"><select value={typeInput} onChange={(e) => setTypeInput(e.target.value)} onBlur={() => validateAndSave()} className={`text-[10px] font-bold uppercase rounded-full px-3 py-1 border-0 cursor-pointer appearance-none transition-all ${isBuy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}><option value="Buy">Buy</option><option value="Sell">Sell</option></select></div></TableCell><TableCell className="p-3"><select value={assetInput} onChange={(e) => setAssetInput(e.target.value)} onBlur={() => validateAndSave()} className="glass-input-minimal text-sm font-semibold bg-transparent border-0 text-white w-full truncate focus:ring-1 focus:ring-blue-500/50 rounded px-1">{sorted_Assets.map((asset) => (<option key={asset.ID} value={asset.ID}>{asset.name}</option>))}</select></TableCell><TableCell className="p-3 text-right"><input type="text" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} onBlur={() => validateAndSave()} className="text-right glass-input-minimal text-sm font-bold bg-transparent border-0 text-white w-20 focus:ring-1 focus:ring-blue-500/50 rounded px-1"/></TableCell><TableCell className="p-3 text-right text-gray-500 font-medium text-xs">{shareFormatter.format(props.transaction.shares_cumulated || 0)}</TableCell><TableCell className="p-3 text-right"><div className="flex items-center justify-end"><input type="text" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} onBlur={() => validateAndSave()} className="text-right glass-input-minimal text-sm font-bold bg-transparent border-0 text-white w-20 focus:ring-1 focus:ring-blue-500/50 rounded px-1"/><span className="text-[10px] text-gray-500 ml-1">EUR</span></div></TableCell><TableCell className="p-3 text-right"><div className="text-xs group-hover:text-gray-300 transition-colors text-white font-mono">{euroFormatter.format(props.transaction.fee || 0)}</div></TableCell><TableCell className="p-3 text-right"><div className="text-xs group-hover:text-gray-300 transition-colors text-red-400 font-mono">{euroFormatter.format(props.transaction.solidarity_surcharge || 0)}</div></TableCell><TableCell className="p-3 text-right text-gray-500 text-xs italic">{euroFormatter.format(props.transaction.invest_cumulated || 0)}</TableCell><TableCell className="p-3 text-right"><div className={`text-sm font-bold ${props.transaction.in_out > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{props.transaction.in_out > 0 ? "+" : ""}{euroFormatter.format(props.transaction.in_out || 0)}</div></TableCell><TableCell className="p-3 text-center"><Button intent={Intent.DANGER} minimal small icon="trash" onClick={() => deleteTransaction(props.transaction.ID)} className="opacity-0 group-hover:opacity-100 transition-opacity"/></TableCell>
    </tr>
  );
}