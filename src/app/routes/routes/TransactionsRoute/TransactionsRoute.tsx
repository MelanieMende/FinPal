import { useAppSelector } from './../../../hooks'

import TransactionCreation from './components/TransactionCreation';
import TransactionListItem from './components/TransactionListItem';
import AssetFilter from './../../../components/AssetFilter/AssetFilter'
import Table from '../../../components/Table/Table';
import TableHeaderRow from '../../../components/Table/TableHeaderRow/TableHeaderRow';
import * as appStateReducer from '../../../store/appState/appState.reducer';

export default function TransactionsRoute() {

	const filterForAssets = useAppSelector(state => state.appState.transactions_AssetFilter)
	const transactions = useAppSelector(state => state.transactions)

	const columns = [
		{
			header: {
				content: '#'
			}
		},
    {
			header: {
				content: 'Date'
			}
		},
		{
			header: {
				content: 'Type'
			}
		},
    {
			header: {
				content: <div>{'Asset '}<AssetFilter filter={filterForAssets} onChange={appStateReducer.transactions_AssetFilter_ToggleAsset} /></div>
			}
		},
    {
			header: {
				content: 'Shares'
			}
		},
		{
			header: {
				content: 'Shares (cumulated)'
			}
		},
		{
			header: {
				content: 'Price per share'
			}
		},
		{
			header: {
				content: 'Fee'
			}
		},
		{
			header: {
				content: 'Tax'
			}
		},
		{
			header: {
				content: 'Invest (cumulated)'
			}
		},
		{
			header: {
				content: 'In-/Outcome'
			}
		},
  ]

	return (
		<div
			id="TransactionsRoute"
			data-testid="TransactionsRoute">
			<div id="Main" className="flex p-3 overflow-auto">
				<div className="flex grow justify-center align-center">
					<Table>
						<TableHeaderRow columns={columns}/>
						<tbody>
							<TransactionCreation/>
							{transactions.filter((transaction) => {
								if(filterForAssets && filterForAssets.length > 0) {
									if(filterForAssets.includes(transaction.asset_ID)) {
										return transaction
									}
								}
								else {
									return transaction
								}
							}).map((transaction, i) => {
								return (<TransactionListItem key={"transaction-" + transaction.ID} i={i+1} transaction={transaction}/>)
							})}
						</tbody>
					</Table>
				</div>
			</div>
		</div>
	);
}