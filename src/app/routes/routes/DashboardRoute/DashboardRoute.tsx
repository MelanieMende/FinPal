import React from 'react';
import { useAppSelector } from '../../../hooks';
import AssetAllocationChart from '../../../components/Charts/AssetAllocationChart';
import { Card, H3, H5, Icon } from '@blueprintjs/core';
import './DashboardRoute.css';

export default function DashboardRoute() {
	const assets = useAppSelector(state => state.assets);
	const cash = useAppSelector(state => state.cash);

	// Basic calculations
	const totalAssetsValue = assets.reduce((acc: number, asset) => acc + ((asset.current_shares || 0) * (asset.price || 0)), 0);
	
	const totalCash = cash.reduce((acc: number, c) => {
		const amount = c.amount || 0;
		const fee = c.fee || 0;
		return acc + (c.type === 'Deposit' ? amount : -amount) - fee;
	}, 0);

	const netWorth = totalAssetsValue + totalCash;

	// Chart Data: Allocation
	const allocationData = [
		...assets
			.filter(a => (a.current_shares || 0) > 0)
			.map(a => ({
				name: a.name || 'Unknown',
				value: (a.current_shares || 0) * (a.price || 0)
			})),
		{ name: 'Cash', value: totalCash }
	].sort((a, b) => b.value - a.value);

	return (
		<div id="DashboardRoute" className="w-full p-4">
			<div className="mb-8">
				<H3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500">
					Portfolio Overview
				</H3>
				<p className="text-gray-400 font-medium">Welcome back, Melanie. Here is your financial snapshot.</p>
			</div>

			{/* KPI Grid */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
				<Card className="glass-card flex flex-col justify-between">
					<div className="flex justify-between items-start mb-4">
						<H5 className="text-gray-400 uppercase text-xs font-bold tracking-widest">Total Net Worth</H5>
						<div className="p-2 bg-blue-500/10 rounded-lg">
							<Icon icon="bank-account" className="text-blue-500" />
						</div>
					</div>
					<div className="text-3xl font-bold text-white tracking-tight">
						{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(netWorth || 0)}
					</div>
					<div className="mt-4 text-sm text-green-400 flex items-center bg-green-400/10 w-fit px-2 py-1 rounded-full">
						<Icon icon="trending-up" className="mr-1" size={12} />
						<span className="font-semibold">+2.4%</span>
					</div>
				</Card>

				<Card className="glass-card flex flex-col justify-between">
					<div className="flex justify-between items-start mb-4">
						<H5 className="text-gray-400 uppercase text-xs font-bold tracking-widest">Total Assets</H5>
						<div className="p-2 bg-indigo-500/10 rounded-lg">
							<Icon icon="timeline-line-chart" className="text-indigo-500" />
						</div>
					</div>
					<div className="text-3xl font-bold text-white tracking-tight">
						{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalAssetsValue || 0)}
					</div>
					<div className="mt-4 text-sm text-indigo-300 font-medium">
						{assets.filter(a => (a.current_shares || 0) > 0).length} active positions
					</div>
				</Card>

				<Card className="glass-card flex flex-col justify-between">
					<div className="flex justify-between items-start mb-4">
						<H5 className="text-gray-400 uppercase text-xs font-bold tracking-widest">Cash Balance</H5>
						<div className="p-2 bg-emerald-500/10 rounded-lg">
							<Icon icon="dollar" className="text-emerald-500" />
						</div>
					</div>
					<div className="text-3xl font-bold text-white tracking-tight">
						{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalCash || 0)}
					</div>
					<div className="mt-4 text-sm text-emerald-300 font-medium">
						{(netWorth !== 0 ? (totalCash / netWorth) * 100 : 0).toFixed(1)}% of total portfolio
					</div>
				</Card>
			</div>

			{/* Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<Card className="glass-card h-[400px] flex flex-col">
					<H5 className="mb-4 text-gray-400 uppercase text-xs font-bold tracking-widest">Asset Allocation</H5>
					<div className="flex-grow">
						<AssetAllocationChart data={allocationData} />
					</div>
				</Card>
				
				<Card className="glass-card h-[400px] flex flex-col">
					<H5 className="mb-4 text-gray-400 uppercase text-xs font-bold tracking-widest">Top Positions</H5>
					<div className="overflow-auto scrollbar-hide">
						{assets
							.filter(a => (a.current_shares || 0) > 0)
							.sort((a, b) => ((b.current_shares || 0) * (b.price || 0)) - ((a.current_shares || 0) * (a.price || 0)))
							.slice(0, 5)
							.map((asset, index) => (
								<div key={asset.ID} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 grow">
									<div className="flex items-center">
										<div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold mr-3">
											{(asset.symbol || '??').substring(0, 2)}
										</div>
										<div>
											<div className="font-semibold text-sm">{asset.name || 'Unknown'}</div>
											<div className="text-xs text-gray-500 uppercase">{asset.symbol}</div>
										</div>
									</div>
									<div className="text-right">
										<div className="font-bold text-sm">
											{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(((asset.current_shares || 0) * (asset.price || 0)) || 0)}
										</div>
										<div className="text-xs text-green-400">
											{(netWorth !== 0 ? (((asset.current_shares || 0) * (asset.price || 0)) / netWorth) * 100 : 0).toFixed(1)}%
										</div>
									</div>
								</div>
							))}
					</div>
				</Card>
			</div>
		</div>
	);
}
