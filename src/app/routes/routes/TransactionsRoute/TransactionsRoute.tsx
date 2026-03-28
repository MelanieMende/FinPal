import React from 'react';
import { useAppSelector } from './../../../hooks'
import { Card, H3 } from '@blueprintjs/core';

import TransactionCreation from './components/TransactionCreation';
import TransactionListItem from './components/TransactionListItem';
import AssetFilter from './../../../components/AssetFilter/AssetFilter'
import Table from '../../../components/Table/Table';
import * as appStateReducer from '../../../store/appState/appState.reducer';

export default function TransactionsRoute() {
	const filterForAssets = useAppSelector(state => state.appState.transactions_AssetFilter);
	const transactions = useAppSelector(state => state.transactions);

	const filteredTransactions = transactions.filter((transaction) => {
		if (filterForAssets && filterForAssets.length > 0) {
			return filterForAssets.includes(transaction.asset_ID);
		}
		return true;
	});

	return (
		<div id="TransactionsRoute" className="w-full p-4 animate-in fade-in duration-500">
			{/* Page Header */}
			<div className="mb-8">
				<H3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
					Transaction History
				</H3>
				<p className="text-gray-400 font-medium">Detailed log of all buy and sell activities.</p>
			</div>

			{/* Ledger Card */}
			<Card className="glass-card p-0 overflow-hidden">
				<div className="overflow-x-auto">
					<Table className="w-full">
						<thead>
							<tr className="bg-white/5 border-b border-white/10">
								<th className="p-3 text-left w-12 text-[10px] uppercase font-bold text-gray-500">#</th>
								<th className="p-3 text-left text-[10px] uppercase font-bold text-gray-400 tracking-wider">Date</th>
								<th className="p-3 text-left text-[10px] uppercase font-bold text-gray-400 tracking-wider">Type</th>
								<th className="p-3 text-left text-[10px] uppercase font-bold text-gray-400 tracking-wider min-w-[150px]">
									<div className="flex items-center gap-2 underline decoration-blue-500/50 underline-offset-4 decoration-2">
										Asset
										<AssetFilter filter={filterForAssets} onChange={appStateReducer.transactions_AssetFilter_ToggleAsset} />
									</div>
								</th>
								<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider">Shares</th>
								<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Shares</th>
								<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider">Price / Share</th>
								<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider">Fees / Tax</th>
								<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Invest</th>
								<th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider">In-/Outcome</th>
								<th className="p-3 text-center text-[10px] uppercase font-bold text-gray-400 tracking-wider w-12 italic">Actions</th>
							</tr>
						</thead>
						<tbody>
							<TransactionCreation />
							{filteredTransactions.map((transaction, i) => (
								<TransactionListItem key={"transaction-" + transaction.ID} i={i + 1} transaction={transaction} />
							))}
							{filteredTransactions.length === 0 && (
								<tr>
									<td colSpan={11} className="p-12 text-center text-gray-500 italic">No transactions found matching the filter.</td>
								</tr>
							)}
						</tbody>
					</Table>
				</div>
			</Card>
		</div>
	);
}