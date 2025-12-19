import { useAppSelector } from './../../../../../hooks'

import AssetListSumRow from './components/AssetListSumRow';
import AssetListItem from './components/AssetListItem';
import Table from '../../../../../components/Table/Table';
import * as assetsSelector from '../../../../../store/assets/assets.selectors';
import RefreshButton from './../../components/RefreshButton';
import NewAssetButton from './components/NewAssetButton';
import TableHeaderRow from '../../../../../components/Table/TableHeaderRow/TableHeaderRow';

export default function AnalysisRoute() {

	const assets = useAppSelector(state => state.assets)

	var sum_profit_lost = 0
	var sum_dividends = 0
	var sum_in_out = 0

	assets.forEach(asset => {
		const current_profit_loss = (asset.current_shares * asset.price) + asset.current_invest
		sum_profit_lost += current_profit_loss
		sum_dividends += asset.dividends_earned
		sum_in_out += asset.current_sum_in_out + asset.dividends_earned + (asset.current_shares * asset.price)
	});
	
	var sum_profit_loss_formatted = (Math.round(sum_profit_lost * 100) / 100).toFixed(2) + " €"
	var sum_dividends_formatted = (Math.round(sum_dividends * 100) / 100).toFixed(2) + " €"
	var sum_in_out_formatted = (Math.round(sum_in_out  * 100) / 100).toFixed(2) + " €"

	const sorted_Assets = assetsSelector.selectAssetsSortedByProfitLoss(assets, 'desc')

	const columns = [
		{
			header: {
				content: <RefreshButton />
			},
			sum_row: {
				content: '*',
				additionalClassNames: "text-right"
			}
		},
		{
			header: {
				content: 'Name'
			},
			sum_row: {
				ID: 'TableCellSumNewAssetButton',
				content: <NewAssetButton />,
				additionalClassNames: "text-center"
			}
		},
		{
			header: {
				content: 'Shares'
			}
		},
		{
			header: {
				content: 'Current Price per Share'
			}
		},
		{
			header: {
				content: ''
			}
		},
		{
			header: {
				content: 'Avg Price Paid'
			}
		},
		{
			header: {
				content: 'Current Invest'
			}
		},
		{
			header: {
				content: 'Current Value'
			}
		},
		{
			header: {
				content: 'Current Profit/Loss',
				additionalClassNames: "min-w-[180px]"
			},
			sum_row: {
				ID: 'TableCellSumProfitLoss',
				content: sum_profit_loss_formatted,
				additionalClassNames: "text-center"
			}
		},
		{
			header: {
				content: 'Ex Date'
			}
		},
		{
			header: {
				content: 'Pay Date'
			}
		},
		{
			header: {
				content: 'Frequency'
			}
		},
		{
			header: {
				content: 'Dividend Yield'
			}
		},
		{
			header: {
				content: 'Upcoming Dividends'
			}
		},
		{
			header: {
				content: 'Dividends Earned'
			},
			sum_row: {
				content: sum_dividends_formatted,
				additionalClassNames: "text-right"
			}
		},
		{
			header: {
				content: 'In-/Outcome'
			},
			sum_row: {
				content: sum_in_out_formatted,
				additionalClassNames: "text-right"
			}
		}
	]

	return (
    <Table>
      <TableHeaderRow columns={columns}/>
      <tbody>
        <AssetListSumRow columns={columns} />
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

