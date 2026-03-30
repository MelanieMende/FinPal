import React from 'react';
import { useAppSelector } from '../../../hooks';
import AssetAllocationChart from '../../../components/Charts/AssetAllocationChart';
import { Card, H3, H5, Icon } from '@blueprintjs/core';
import './DashboardRoute.css';

export default function DashboardRoute() {
	const assets = useAppSelector(state => state.assets);
	const transactions = useAppSelector(state => state.transactions) || [];
	const dividends = useAppSelector(state => state.dividends) || [];
	const cash = useAppSelector(state => state.cash) || [];

	// Asset Valuation Helper: Fallback to invested capital if no live price exists
	const getAssetValue = (asset: any) => {
		const shares = asset.current_shares || 0;
		if (shares <= 0) return 0;
		return asset.price && asset.price > 0 ? shares * asset.price : Math.abs(asset.current_invest || 0);
	};

	// Basic calculations
	const totalAssetsValue = assets.reduce((acc: number, asset) => acc + getAssetValue(asset), 0);
	
	const manualCash = cash.reduce((acc: number, c) => {
		const amount = c.amount || 0;
		const fee = c.fee || 0;
		return acc + (c.type === 'Deposit' ? amount : -amount) - fee;
	}, 0);

	const totalTransactionFlow = transactions.reduce((acc, t) => acc + (t.in_out || 0), 0);
	const totalDividends = dividends.reduce((acc, d) => acc + (d.income || 0), 0);
	const totalCash = manualCash + totalTransactionFlow + totalDividends;

	const netWorth = totalAssetsValue + totalCash;

	// Chart Data: Allocation by Asset
	const allocationData = [
		...assets
			.filter(a => (a.current_shares || 0) > 0)
			.map(a => ({
				name: a.name || 'Unknown',
				value: getAssetValue(a)
			})),
		{ name: 'Cash', value: totalCash }
	].sort((a, b) => b.value - a.value);

	// Chart Data: Allocation by Type
	const typeLabels: { [key: string]: string } = {
		'Stock': 'Einzelaktien',
		'ETF': 'ETFs',
		'Bond': 'Anleihen',
		'Crypto': 'Kryptowährungen',
		'Commodity': 'Rohstoffe',
		'RealEstate': 'Immobilien',
		'CashEquivalent': 'Geldmarkt/Cash'
	};

	const allocationByTypeData = Object.keys(typeLabels).map(type => {
		const totalValue = assets
			.filter(a => (a.type === type || (!a.type && type === 'Stock')) && (a.current_shares || 0) > 0)
			.reduce((acc, a) => acc + getAssetValue(a), 0);
		
		return {
			name: typeLabels[type],
			value: totalValue
		};
	}).filter(item => item.value > 0);

	if (totalCash > 0) {
		allocationByTypeData.push({ name: 'Cash (Liquid)', value: totalCash });
	}

	allocationByTypeData.sort((a, b) => b.value - a.value);

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

			{/* Charts Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
				<Card className="glass-card h-[400px] flex flex-col">
					<div className="flex items-center gap-2 mb-4">
						<div className="p-1.5 bg-blue-500/10 rounded-md">
							<Icon icon="pie-chart" className="text-blue-500" size={14} />
						</div>
						<H5 className="m-0 text-gray-400 uppercase text-xs font-bold tracking-widest">Allocation by Asset</H5>
					</div>
					<div className="flex-grow">
						<AssetAllocationChart data={allocationData} />
					</div>
				</Card>

				<Card className="glass-card h-[400px] flex flex-col">
					<div className="flex items-center gap-2 mb-4">
						<div className="p-1.5 bg-indigo-500/10 rounded-md">
							<Icon icon="layers" className="text-indigo-500" size={14} />
						</div>
						<H5 className="m-0 text-gray-400 uppercase text-xs font-bold tracking-widest">Allocation by Class</H5>
					</div>
					<div className="flex-grow">
						<AssetAllocationChart data={allocationByTypeData} />
					</div>
				</Card>
			</div>

			<div className="grid grid-cols-1 gap-8">
				<Card className="glass-card flex flex-col">
					<div className="flex items-center gap-2 mb-4">
						<div className="p-1.5 bg-purple-500/10 rounded-md">
							<Icon icon="list-columns" className="text-purple-500" size={14} />
						</div>
						<H5 className="m-0 text-gray-400 uppercase text-xs font-bold tracking-widest">Top Positions</H5>
					</div>
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
