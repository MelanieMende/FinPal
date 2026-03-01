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

  return (
    <tr id={"AssetListItem_" + props.i}>
			<TableCell additionalClassNames="text-right">{props.i}</TableCell>
			<TableCell additionalClassNames="text-center">
				<Button 
					data-testid={"toggleIsWatched_" + props.asset.ID} 
					minimal fill
					onClick={(e) => toggleIsWatched(props.asset)}>
						<Icon icon={props.asset.is_watched ? "eye-open" : "eye-off"} style={{ color: props.asset.is_watched ? button_text_color : Colors.GRAY1 }} />
				</Button>
			</TableCell>
      <TableCell>
				<Button 
					data-testid={"openOverlayButton_" + props.asset.ID} 
					text={props.asset.name} 
					minimal 
					style={{ color: button_text_color }} 
					fill 
					alignText={Alignment.LEFT} 
					onClick={(e) => openAssetOverlay()} />
			</TableCell>
			<TableCell additionalClassNames={"text-right " + assetsSelector.get_current_shares_textColor(props.asset)}>
				{shares_formatted}
			</TableCell>
			<TableCell additionalClassNames={"text-right w-24 " + (props.asset.is_watched ? "inherit" : "text-slate-500")}>
				{current_price} {props.asset.currencySymbol}
			</TableCell>
			<TableCell additionalClassNames="text-right" bgColor={bgColor_PriceComparison}>{price_comparison}</TableCell>
			<TableCell additionalClassNames="text-right">{avg_price_paid_formatted} {props.asset.currencySymbol}</TableCell>
			<TableCell additionalClassNames={"text-right " + assetsSelector.get_current_invest_textColor(props.asset)}>{current_invest} {props.asset.currencySymbol}</TableCell>
			<TableCell additionalClassNames={"text-right " + assetsSelector.get_current_value_textColor(props.asset)}>{current_value_formatted} {props.asset.currencySymbol}</TableCell>
			<TableCell additionalClassNames={"text-center " + assetsSelector.get_current_profit_loss_textColor(props.asset)} bgColor={bgColor_ProfitLoss}>{current_profit_loss_formatted} {props.asset.currencySymbol} / {current_profit_loss_percentage_formatted} %</TableCell>
			<TableCell id={"AssetListItem_" + props.i + "_exDividendDate"} additionalClassNames={"text-right " + assetsSelector.get_ex_dividend_date_textColor(props.asset)}>{exDividendDateFormatted}</TableCell>
			<TableCell id={"AssetListItem_" + props.i + "_payDividendDate"} additionalClassNames={"text-right " + assetsSelector.get_pay_dividend_date_textColor(props.asset)}>{payDividendDateFormatted}</TableCell>
			<TableCell additionalClassNames="text-center">{props.asset.dividendFrequency}</TableCell>
			<TableCell additionalClassNames="text-center">{dividendYieldFormatted}</TableCell>
			<TableCell 
				additionalClassNames={"text-right " + assetsSelector.get_upcoming_dividends_textColor(props.asset)}
				tooltip={props.asset.next_estimated_dividend_per_share + ' * ' + props.asset.current_shares_before_ex_date}>{upcoming_dividends} {props.asset.currencySymbol}</TableCell>
			<TableCell additionalClassNames={"text-right " + assetsSelector.get_dividends_earned_textColor(props.asset)}>{dividends_formatted} {props.asset.currencySymbol}</TableCell>
			<TableCell additionalClassNames="text-right" bgColor={bgColor_InOut}>{current_sum_in_out_formatted} €</TableCell>
    </tr>
  );

	function openAssetOverlay() {
		dispatch(appStateReducer.setAssetOverlayType(appStateReducer.AssetOverlayType.EDIT))
		dispatch(assetCreationReducer.setID(props.asset.ID))
		dispatch(assetCreationReducer.setNameInput(props.asset.name))
		dispatch(assetCreationReducer.setSymbolInput(props.asset.symbol))
		dispatch(assetCreationReducer.setISINInput(props.asset.isin))
		dispatch(assetCreationReducer.setKGVInput(props.asset.kgv))
		dispatch(appStateReducer.setShowAssetOverlay(true))
	}

	function toggleIsWatched(asset: Asset) {
		dispatch(assetReducer.setIsWatched({asset, is_watched: !asset.is_watched}))
	}
}