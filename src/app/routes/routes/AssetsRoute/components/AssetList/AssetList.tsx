import { useAppSelector } from './../../../../../hooks'

import AssetListItem from './components/AssetListItem';
import Table from '../../../../../components/Table/Table';
import TableCell from '../../../../../components/Table/TableCell/TableCell';
import * as assetsSelector from '../../../../../store/assets/assets.selectors';
import RefreshButton from './../../components/RefreshButton';
import NewAssetButton from './components/NewAssetButton';

export default function AnalysisRoute() {

	const assets = useAppSelector(state => state.assets)

	var sum_profit_lost = 0
	var sum_dividends = 0
	var sum_in_out = 0

	assets.forEach(asset => {
		const current_price = asset.price || 0
		const current_shares = asset.current_shares || 0
		const current_invest = asset.current_invest || 0
		const dividends_earned = asset.dividends_earned || 0
		const current_sum_in_out = asset.current_sum_in_out || 0

		const current_profit_loss = (current_shares * current_price) + current_invest
		sum_profit_lost += current_profit_loss
		sum_dividends += dividends_earned
		sum_in_out += current_sum_in_out + dividends_earned + (current_shares * current_price)
	});
	
	var sum_profit_loss_formatted = (Math.round(sum_profit_lost * 100) / 100).toFixed(2) + " €"
	var sum_dividends_formatted = (Math.round(sum_dividends * 100) / 100).toFixed(2) + " €"
	var sum_in_out_formatted = (Math.round(sum_in_out  * 100) / 100).toFixed(2) + " €"

	const sorted_Assets = assetsSelector.selectAssetsSortedByProfitLoss(assets, 'desc')

	const euroFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

	return (
    <Table className="w-full">
      <thead>
				<tr className="bg-white/5">
					<th className="p-3 text-left w-12"><RefreshButton /></th>
					<th className="p-3 text-left w-12">#</th>
					<th className="p-3 text-left min-w-[150px] text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-white/10">Name</th>
					<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-white/10">Shares</th>
					<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-white/10 text-nowrap">Price / Avg</th>
					<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-white/10">Value</th>
					<th className="p-3 text-center text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-white/10 min-w-[200px]">Profit / Loss</th>
					<th className="p-3 text-center text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-white/10">Yield / Div</th>
					<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-white/10 text-nowrap">Ex / Pay Date</th>
					<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-white/10 text-nowrap">Total Earned</th>
				</tr>
			</thead>
      <tbody>
				{/* Totals Row */}
				<tr className="bg-white/10 font-bold border-t-2 border-white/10">
					<TableCell className="p-3 text-center">*</TableCell><TableCell className="p-3">Σ</TableCell><TableCell className="p-3"><NewAssetButton /></TableCell><TableCell className="p-3 text-right">—</TableCell><TableCell className="p-3 text-right">—</TableCell><TableCell className="p-3 text-right">{euroFormatter.format(sum_in_out - sum_dividends - sum_profit_lost)}</TableCell><TableCell className="p-3 text-center"><div className={`px-3 py-1 rounded-full text-xs font-bold inline-block ${sum_profit_lost >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{euroFormatter.format(sum_profit_lost)}</div></TableCell><TableCell className="p-3 text-center">—</TableCell><TableCell className="p-3 text-right">—</TableCell><TableCell className="p-3 text-right text-emerald-400">{euroFormatter.format(sum_dividends)}</TableCell>
				</tr>
        <AssetListRows assets={sorted_Assets}/>
      </tbody>
    </Table>
	);

	function AssetListRows(props:{assets:Asset[]}):JSX.Element {
		return <>{
			props.assets.map((asset, i) => (<AssetListItem key={"asset-" + asset.ID} i={i+1} asset={asset} />))
		}</>
	}
}

