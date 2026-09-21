import { Fragment, useState } from 'react';
import { useAppSelector, useAppDispatch } from '../../../../../../hooks'
import * as selectors from '../../../../../../selectors';
import TableCell from '../../../../../../components/Table/TableCell/TableCell'
import { Alignment, Button, Colors, Icon } from '@blueprintjs/core';
import * as assetsSelector from '../../../../../../store/assets/assets.selectors';
import * as appStateReducer from '../../../../../../store/appState/appState.reducer';
import * as assetCreationReducer from '../../../../../../store/assetCreation/assetCreation.reducer';
import * as assetReducer from '../../../../../../store/assets/assets.reducer';

export default function AssetListItem(props: {i: number, asset:Asset}) {

  const dispatch = useAppDispatch();
	const transactions = useAppSelector(state => state.transactions);
	const [showTransactions, setShowTransactions] = useState(false);
	const assetTransactions = transactions
		.filter(transaction => transaction.asset_ID === props.asset.ID)
		.slice()
		.sort((a, b) => b.date.localeCompare(a.date));

	const shares_formatted = (Math.round(props.asset.current_shares * 1000) / 1000).toFixed(3)
	const current_price = (Math.round((props.asset.price || 0) * 100) / 100).toFixed(2)
	const avg_price_paid_formatted = (Math.round(props.asset.avg_price_paid * 100) / 100).toFixed(2)
	const price_comparison = props.asset.price < props.asset.avg_price_paid ? "<" : props.asset.price > props.asset.avg_price_paid ? ">" : "="
	const current_invest = Math.round((props.asset.current_invest || 0) * 100) / 100
	const current_value_formatted = (Math.round(assetsSelector.get_current_value(props.asset) * 100) / 100).toFixed(2)
	const current_profit_loss = assetsSelector.get_current_profit_loss(props.asset)
	const current_profit_loss_formatted = (Math.round(current_profit_loss * 100) / 100).toFixed(2)
	const current_profit_loss_percentage = assetsSelector.get_current_profit_loss_percentage(props.asset)
	const current_profit_loss_percentage_formatted = (current_profit_loss_percentage).toFixed(2)
	const upcoming_dividends = (Math.round(assetsSelector.get_upcoming_dividends(props.asset).value * 1000) / 1000).toFixed(3)
	const dividends_formatted = (Math.round((props.asset.dividends_earned || 0) * 100) / 100).toFixed(2)
	const current_sum_in_out = (props.asset.current_sum_in_out || 0) + assetsSelector.get_current_value(props.asset) + (props.asset.dividends_earned || 0)
	const current_sum_in_out_formatted = (Math.round(current_sum_in_out * 100) / 100).toFixed(2)
	const currentPriceColor = price_comparison === '>' ? 'text-red-500' : 'text-emerald-500'

	const options = { day: '2-digit', month: '2-digit', year: 'numeric' } as Intl.DateTimeFormatOptions;

	const exDividendDate = new Date(props.asset.exDividendDate != null ? props.asset.exDividendDate : '')
	const exDividendDateFormatted = isNaN(exDividendDate.getTime()) ? '' : exDividendDate.toLocaleDateString("de-DE", options)

	const payDividendDate = new Date(props.asset.payDividendDate ?? '')
	const payDividendDateFormatted = isNaN(payDividendDate.getTime()) ? '' : payDividendDate.toLocaleDateString("de-DE", options)

	const dividendYieldFormatted = assetsSelector.get_dividend_yield_formatted(props.asset)

	const bgColor_PriceComparison = price_comparison == "<" ? "bg-teal-600" : (price_comparison == "=" ? "bg-slate-500" : "bg-custom-red")
	const bgColor_ProfitLoss = assetsSelector.get_current_profit_loss_bgColor(props.asset)
	const bgColor_InOut = assetsSelector.get_current_sum_in_out_bgColor(current_sum_in_out)
	
	const theme = useAppSelector(state => state.appState.theme)
	const button_text_color = selectors.get_button_text_color(theme ?? '')

  const euroFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const shareFormatter = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  return (
		<Fragment>
    <tr
			id={"AssetListItem_" + props.i}
			data-testid={"asset-row-" + props.asset.ID}
			aria-expanded={showTransactions}
			tabIndex={0}
			onClick={() => setShowTransactions(current => !current)}
			onKeyDown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					setShowTransactions(current => !current);
				}
			}}
			className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group cursor-pointer focus:outline-none focus:bg-white/5"
		>
			{/* Watch Icon */}
			<TableCell className="p-3 text-center">
				<Button 
					data-testid={"toggleIsWatched_" + props.asset.ID} 
					minimal 
					small
					onClick={(event) => {
						event.stopPropagation();
						toggleIsWatched(props.asset);
					}}>
						<Icon icon={props.asset.is_watched ? "eye-open" : "eye-off"} className={props.asset.is_watched ? "text-blue-400" : "text-gray-600"} />
				</Button>
			</TableCell>

			{/* Index */}
			<TableCell className="p-3 text-gray-500 font-mono text-xs text-left">
				<div className="flex items-center gap-2">
					<Icon icon={showTransactions ? 'chevron-down' : 'chevron-right'} size={12} />
					{props.i}
				</div>
			</TableCell>

			{/* Name */}
      <TableCell className="p-3">
				<Button 
					data-testid={"openOverlayButton_" + props.asset.ID} 
					text={<span className="font-bold text-white group-hover:text-blue-400 transition-colors">{props.asset.name || 'Unnamed Asset'}</span>} 
					minimal 
					fill 
					alignText={Alignment.LEFT} 
					onClick={(event) => {
						event.stopPropagation();
					openAssetOverlay();
				}} />
			</TableCell>

			{/* Shares */}
			<TableCell className="p-3 text-right">
				<div data-testid={"current-shares-" + props.asset.ID} className={`font-semibold ${assetsSelector.get_current_shares_textColor(props.asset) === 'inherit' ? 'text-white' : assetsSelector.get_current_shares_textColor(props.asset)}`}>{shareFormatter.format(props.asset.current_shares || 0)}</div>
			</TableCell>

			{/* Avg Price Paid */}
			<TableCell className="p-3 text-right">
				<div className="text-sm font-medium text-white">
					{euroFormatter.format(props.asset.avg_price_paid || 0)}
				</div>
			</TableCell>

			{/* Current Price */}
			<TableCell className="p-3 text-right">
				<div data-testid={"current-price-" + props.asset.ID} className={`text-sm font-medium uppercase ${currentPriceColor}`}>
					{euroFormatter.format(props.asset.price || 0)}
				</div>
			</TableCell>

			{/* Current Invest */}
			<TableCell className="p-3 text-right">
				<div data-testid={"current-invest-" + props.asset.ID} className={`font-semibold ${assetsSelector.get_current_invest_textColor(props.asset) === 'inherit' ? 'text-blue-300' : assetsSelector.get_current_invest_textColor(props.asset)}`}>{euroFormatter.format(current_invest)}</div>
			</TableCell>

			{/* Value */}
			<TableCell className="p-3 text-right">
				<div data-testid={"current-value-" + props.asset.ID} className={`font-bold ${assetsSelector.get_current_value_textColor(props.asset) === 'inherit' ? 'text-white' : assetsSelector.get_current_value_textColor(props.asset)}`}>{euroFormatter.format(assetsSelector.get_current_value(props.asset) || 0)}</div>
				<div data-testid={"profit-loss-" + props.asset.ID} className={`mt-1 inline-flex rounded border px-2 py-0.5 text-s font-bold ${current_profit_loss >= 0 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'}`}>
					{current_profit_loss >= 0 ? '+' : ''}{euroFormatter.format(current_profit_loss || 0)} / {current_profit_loss_percentage >= 0 ? '+' : ''}{(current_profit_loss_percentage || 0).toFixed(2)}%
				</div>
			</TableCell>

			{/* Yield / Div */}
			<TableCell className="p-3 text-center">
				<div className="text-xs font-bold text-indigo-400">{dividendYieldFormatted}</div>
				<div className="text-[10px] text-indigo-300/50 uppercase">Ext. Yield</div>
			</TableCell>

			{/* Dates */}
			<TableCell className="p-3 text-right">
				<div id={`AssetListItem_${props.i}_exDividendDate`} className="text-xs font-medium text-white">{exDividendDateFormatted}</div>
				<div className="text-[10px] text-gray-500 uppercase">Ex Date</div>
				<div id={`AssetListItem_${props.i}_payDividendDate`} className="text-xs font-medium text-white">{payDividendDateFormatted}</div>
				<div className="text-[10px] text-gray-500 uppercase">Pay Date</div>
			</TableCell>

			{/* Total Earned */}
			<TableCell className="p-3 text-right">
				<div className="font-bold text-emerald-400">{euroFormatter.format(props.asset.dividends_earned)}</div>
				<div className="text-[10px] text-emerald-400/50 uppercase">Total Divs</div>
			</TableCell>
    </tr>
		{showTransactions && (
			<tr data-testid={"asset-transactions-" + props.asset.ID} className="bg-slate-950/50 border-b border-blue-500/20">
				<td colSpan={11} className="px-10 py-4">
					{assetTransactions.length === 0 ? (
						<div className="text-sm text-gray-500 italic">No transactions for this asset.</div>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="text-[10px] uppercase tracking-wider text-gray-500">
									<th className="pb-2 text-left">Date</th>
									<th className="pb-2 text-left">Type</th>
									<th className="pb-2 text-right">Shares</th>
									<th className="pb-2 text-right">Cumulated Shares</th>
									<th className="pb-2 text-right">Price</th>
									<th className="pb-2 text-right">Fee</th>
									<th className="pb-2 text-right">Tax</th>
									<th className="pb-2 text-right">Outcome</th>
								</tr>
							</thead>
							<tbody>
								{assetTransactions.map(transaction => (
									<tr key={transaction.ID} className="border-t border-white/5 text-gray-300">
										<td className="py-2 text-left font-mono">{formatDate(transaction.date)}</td>
										<td className={transaction.type === 'Buy' ? 'py-2 text-left text-emerald-400' : 'py-2 text-left text-red-400'}>{transaction.type}</td>
										<td className="py-2 text-right font-mono">{shareFormatter.format(transaction.amount || 0)}</td>
										<td className="py-2 text-right font-mono text-blue-300">{shareFormatter.format(transaction.shares_cumulated || 0)}</td>
										<td className="py-2 text-right font-mono">{euroFormatter.format(transaction.price_per_share || 0)}</td>
										<td className="py-2 text-right font-mono">{euroFormatter.format(transaction.fee || 0)}</td>
										<td className="py-2 text-right font-mono">{euroFormatter.format(transaction.solidarity_surcharge || 0)}</td>
										<td className={`py-2 text-right font-mono font-bold ${(transaction.in_out || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{euroFormatter.format(transaction.in_out || 0)}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</td>
			</tr>
		)}
		</Fragment>
  );

	function formatDate(date: string) {
		const parsedDate = new Date(`${date}T00:00:00`);
		return isNaN(parsedDate.getTime()) ? date : parsedDate.toLocaleDateString('de-DE');
	}

	function openAssetOverlay() {
		dispatch(appStateReducer.setAssetOverlayType(appStateReducer.AssetOverlayType.EDIT))
		dispatch(assetCreationReducer.setID(props.asset.ID))
		dispatch(assetCreationReducer.setNameInput(props.asset.name))
		dispatch(assetCreationReducer.setSymbolInput(props.asset.symbol))
		dispatch(assetCreationReducer.setISINInput(props.asset.isin))
		dispatch(assetCreationReducer.setKGVInput(props.asset.kgv))
		dispatch(assetCreationReducer.setTypeInput(props.asset.type || 'Stock'))
		dispatch(appStateReducer.setShowAssetOverlay(true))
	}

	function toggleIsWatched(asset: Asset) {
		dispatch(assetReducer.setIsWatched({asset, is_watched: !asset.is_watched}))
	}
}
