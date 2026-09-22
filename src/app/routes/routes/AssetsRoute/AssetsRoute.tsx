import React, { useState } from 'react';
import { useAppSelector } from './../../../hooks'
import { Card, H5, Icon } from '@blueprintjs/core';
import type { IconName } from '@blueprintjs/icons';

import CreateAndEditAssetOverlay from './components/CreateAndEditAssetOverlay';
import AssetList from './components/AssetList/AssetList';
import * as assetsSelector from './../../../store/assets/assets.selectors';

const assetTypes: { type: Asset['type']; label: string; icon?: IconName; symbol?: string }[] = [
	{ type: 'Stock', label: 'Stocks', icon: 'chart' },
	{ type: 'ETF', label: 'ETFs', icon: 'pie-chart' },
	{ type: 'Bond', label: 'Bonds', icon: 'bank-account' },
	{ type: 'Crypto', label: 'Crypto', symbol: '₿' },
	{ type: 'Commodity', label: 'Commodities', icon: 'cube' },
	{ type: 'RealEstate', label: 'Real Estate', icon: 'home' },
	{ type: 'CashEquivalent', label: 'Cash Equivalents', icon: 'dollar' },
];
const euroFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export default function AnalysisRoute() {
	const assets = useAppSelector(state => state.assets);
	const [selectedType, setSelectedType] = useState<Asset['type'] | null>(null);
	const filteredAssets = selectedType
		? assets.filter(asset => (asset.type || 'Stock') === selectedType)
		: assets;

	const valuesByType = assetTypes.map(({ type, label, icon, symbol }) => ({
		type,
		label,
		icon,
		symbol,
		value: assets
			.filter(asset => (asset.type || 'Stock') === type)
			.reduce((sum, asset) => sum + (assetsSelector.get_current_value(asset) || 0), 0),
	}));

	return (
		<div id="AssetsRoute" data-testid="AssetsRoute" className="w-full p-4 animate-in fade-in duration-500">
			{/* Summary Header */}
			<div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
				
				<div className="flex flex-wrap gap-4">
					{valuesByType.map(({ type, label, icon, symbol, value }) => (
					<Card
						key={type}
						data-testid={`asset-type-value-${type}`}
						interactive
						role="button"
						tabIndex={0}
						aria-pressed={selectedType === type}
						onClick={() => setSelectedType(current => current === type ? null : type)}
						onKeyDown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								setSelectedType(current => current === type ? null : type);
							}
						}}
						className={`glass-card py-2 px-4 flex items-center gap-3 cursor-pointer transition-all ${selectedType === type ? 'ring-2 ring-indigo-500 bg-indigo-500/10' : ''}`}
					>
						<div className="p-2 bg-indigo-500/10 rounded-lg">
							{icon ? (
								<Icon icon={icon} className="text-indigo-500" size={16} />
							) : (
								<span data-testid={`asset-type-symbol-${type}`} className="text-indigo-500 text-lg font-bold leading-none">{symbol}</span>
							)}
						</div>
						<div>
							<div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">{label}</div>
							<div className={`text-lg font-bold ${value === 0 ? 'text-slate-500' : 'text-white'}`}>{euroFormatter.format(value)}</div>
						</div>
					</Card>
					))}
				</div>
			</div>

			{/* Asset Management Area */}
			<Card className="glass-card p-0 overflow-hidden min-h-[500px]">
				<div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
					<div className="flex items-center gap-4">
						<H5 className="m-0 text-sm font-bold uppercase tracking-wider text-gray-300">Positions List</H5>
						<span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/20">
							{filteredAssets.length} Active
						</span>
					</div>
				</div>
				<div className="overflow-x-auto">
					<AssetList assets={filteredAssets}/>
				</div>
			</Card>

			<CreateAndEditAssetOverlay />
		</div>
	);
}
