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

	const shares_formatted = (Math.round(props.asset.current_shares * 1000) / 1000).toFixed(3)
	const current_price = (Math.round((props.asset.price || 0) * 100) / 100).toFixed(2)
	const avg_price_paid_formatted = (Math.round(props.asset.avg_price_paid * 100) / 100).toFixed(2)
	const price_comparison = props.asset.price < props.asset.avg_price_paid ? "<" : props.asset.price > props.asset.avg_price_paid ? ">" : "="
	const current_invest = (Math.round(props.asset.current_invest * 100) / 100).toFixed(2)
	const current_value_formatted = (Math.round(assetsSelector.get_current_value(props.asset) * 100) / 100).toFixed(2)
	const current_profit_loss = assetsSelector.get_current_profit_loss(props.asset)
	const current_profit_loss_formatted = (Math.round(current_profit_loss * 100) / 100).toFixed(2)
	const current_profit_loss_percentage = assetsSelector.get_current_profit_loss_percentage(props.asset)
	const current_profit_loss_percentage_formatted = (current_profit_loss_percentage).toFixed(2)
	const upcoming_dividends = (Math.round(assetsSelector.get_upcoming_dividends(props.asset).value * 1000) / 1000).toFixed(3)
	const dividends_formatted = (Math.round(props.asset.dividends_earned * 100) / 100).toFixed(2)
	const current_sum_in_out = props.asset.current_sum_in_out + assetsSelector.get_current_value(props.asset) + props.asset.dividends_earned
	const current_sum_in_out_formatted = (Math.round((current_sum_in_out) * 100) / 100).toFixed(2)

	const options = { day: '2-digit', month: '2-digit', year: 'numeric' } as Intl.DateTimeFormatOptions;

	const exDividendDate = new Date(props.asset.exDividendDate != null ? props.asset.exDividendDate : '')
	const exDividendDateFormatted = isNaN(exDividendDate.getTime()) ? '' : exDividendDate.toLocaleDateString("de-DE", options)

	const payDividendDate = new Date(props.asset.payDividendDate)
	const payDividendDateFormatted = isNaN(payDividendDate.getTime()) ? '' : payDividendDate.toLocaleDateString("de-DE", options)

	const dividendYieldFormatted = assetsSelector.get_dividend_yield_formatted(props.asset)

	const bgColor_PriceComparison = price_comparison == "<" ? "bg-teal-600" : (price_comparison == "=" ? "bg-slate-500" : "bg-custom-red")
	const bgColor_ProfitLoss = assetsSelector.get_current_profit_loss_bgColor(props.asset)
	const bgColor_InOut = assetsSelector.get_current_sum_in_out_bgColor(current_sum_in_out)
	
	const theme = useAppSelector(state => state.appState.theme)
	const button_text_color = selectors.get_button_text_color(theme)

  const euroFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const shareFormatter = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  return (
    <tr id={"AssetListItem_" + props.i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group">
			{/* Watch Icon */}
			<TableCell className="p-3 text-center">
				<Button 
					data-testid={"toggleIsWatched_" + props.asset.ID} 
					minimal 
					small
					onClick={(e) => toggleIsWatched(props.asset)}>
						<Icon icon={props.asset.is_watched ? "eye-open" : "eye-off"} className={props.asset.is_watched ? "text-blue-400" : "text-gray-600"} />
				</Button>
			</TableCell>

			{/* Index */}
			<TableCell className="p-3 text-gray-500 font-mono text-xs text-left">{props.i}</TableCell>

			{/* Name */}
      <TableCell className="p-3">
				<Button 
					data-testid={"openOverlayButton_" + props.asset.ID} 
					text={<span className="font-bold text-white group-hover:text-blue-400 transition-colors">{props.asset.name}</span>} 
					minimal 
					fill 
					alignText={Alignment.LEFT} 
					onClick={(e) => openAssetOverlay()} />
			</TableCell>

			{/* Shares */}
			<TableCell className="p-3 text-right">
				<div className="font-semibold text-white">{shareFormatter.format(props.asset.current_shares || 0)}</div>
				<div className="text-[10px] text-gray-500 uppercase">{props.asset.symbol}</div>
			</TableCell>

			{/* Price / Avg */}
			<TableCell className="p-3 text-right">
				<div className="text-sm font-medium text-white">{euroFormatter.format(props.asset.price || 0)}</div>
				<div className={`text-[10px] uppercase ${price_comparison === '>' ? 'text-emerald-500' : 'text-red-500'}`}>
					Avg: {euroFormatter.format(props.asset.avg_price_paid || 0)}
				</div>
			</TableCell>

			{/* Value */}
			<TableCell className="p-3 text-right">
				<div className="font-bold text-white">{euroFormatter.format(assetsSelector.get_current_value(props.asset) || 0)}</div>
				<div className="text-[10px] text-gray-500 uppercase">Current Value</div>
			</TableCell>

			{/* Profit / Loss */}
			<TableCell className="p-3">
				<div className="flex flex-col items-center">
					<div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${current_profit_loss >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
						<Icon icon={current_profit_loss >= 0 ? "arrow-up" : "arrow-down"} size={10} />
						{euroFormatter.format(current_profit_loss || 0)}
					</div>
					<div className={`text-[10px] mt-1 font-semibold ${current_profit_loss >= 0 ? 'text-emerald-500/60' : 'text-red-500/60'}`}>
						{current_profit_loss_percentage >= 0 ? "+" : ""}{(current_profit_loss_percentage || 0).toFixed(2)}%
					</div>
				</div>
			</TableCell>

			{/* Yield / Div */}
			<TableCell className="p-3 text-center">
				<div className="text-xs font-bold text-indigo-400">{dividendYieldFormatted}</div>
				<div className="text-[10px] text-indigo-300/50 uppercase">Ext. Yield</div>
			</TableCell>

			{/* Dates */}
			<TableCell className="p-3 text-right">
				<div className="text-xs font-medium text-white">{payDividendDateFormatted || '—'}</div>
				<div className="text-[10px] text-gray-500 uppercase">Pay Date</div>
			</TableCell>

			{/* Total Earned */}
			<TableCell className="p-3 text-right">
				<div className="font-bold text-emerald-400">{euroFormatter.format(props.asset.dividends_earned)}</div>
				<div className="text-[10px] text-emerald-400/50 uppercase">Total Divs</div>
			</TableCell>
    </tr>
  );

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