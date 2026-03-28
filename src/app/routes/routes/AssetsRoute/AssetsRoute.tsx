import React from 'react';
import { useAppSelector } from './../../../hooks'
import { Card, H3, H5, Icon } from '@blueprintjs/core';

import CreateAndEditAssetOverlay from './components/CreateAndEditAssetOverlay';
import AssetList from './components/AssetList/AssetList';
import * as assetsSelector from './../../../store/assets/assets.selectors';

export default function AnalysisRoute() {
	const assets = useAppSelector(state => state.assets);

	// Portfolio Calculations
	const totalInvested = assets.reduce((acc, asset) => acc + asset.current_invest, 0);
	const currentValue = assets.reduce((acc, asset) => acc + assetsSelector.get_current_value(asset), 0);
	const totalProfitLoss = currentValue - totalInvested;
	const profitLossPercentage = totalInvested !== 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

	return (
		<div id="AssetsRoute" className="w-full p-4 animate-in fade-in duration-500">
			{/* Summary Header */}
			<div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
				<div>
					<H3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
						Portfolio Assets
					</H3>
					<p className="text-gray-400 font-medium">Manage your historical holdings and watchlists.</p>
				</div>
				
				<div className="flex flex-wrap gap-4">
					<Card className="glass-card py-2 px-4 flex items-center gap-3">
						<div className="p-2 bg-blue-500/10 rounded-lg">
							<Icon icon="bank-account" className="text-blue-500" size={16} />
						</div>
						<div>
							<div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Invested</div>
							<div className="text-lg font-bold text-white">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalInvested || 0)}</div>
						</div>
					</Card>
					<Card className="glass-card py-2 px-4 flex items-center gap-3">
						<div className="p-2 bg-indigo-500/10 rounded-lg">
							<Icon icon="selection" className="text-indigo-500" size={16} />
						</div>
						<div>
							<div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Current Value</div>
							<div className="text-lg font-bold text-white">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(currentValue || 0)}</div>
						</div>
					</Card>
					<Card className="glass-card py-2 px-4 flex items-center gap-3">
						<div className="p-2 bg-emerald-500/10 rounded-lg">
							<Icon icon={totalProfitLoss >= 0 ? "trending-up" : "trending-down"} className={totalProfitLoss >= 0 ? "text-emerald-500" : "text-red-500"} size={16} />
						</div>
						<div>
							<div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Gain/Loss</div>
							<div className={`text-lg font-bold ${totalProfitLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
								{totalProfitLoss >= 0 ? "+" : ""}{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalProfitLoss || 0)}
								<span className="text-xs ml-1 font-medium italic">({(profitLossPercentage || 0).toFixed(2)}%)</span>
							</div>
						</div>
					</Card>
				</div>
			</div>

			{/* Asset Management Area */}
			<Card className="glass-card p-0 overflow-hidden min-h-[500px]">
				<div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
					<div className="flex items-center gap-4">
						<H5 className="m-0 text-sm font-bold uppercase tracking-wider text-gray-300">Positions List</H5>
						<span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/20">
							{assets.length} Active
						</span>
					</div>
				</div>
				<div className="overflow-x-auto">
					<AssetList/>
				</div>
			</Card>

			<CreateAndEditAssetOverlay />
		</div>
	);
}