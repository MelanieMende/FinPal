import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from './../../../hooks'
import { Card, H5, Icon } from '@blueprintjs/core';
import type { IconName } from '@blueprintjs/icons';

import CreateAndEditAssetOverlay from './components/CreateAndEditAssetOverlay';
import TradeRepublicTradeDialog from './components/TradeRepublicTradeDialog';
import RefreshButton from './components/RefreshButton';
import AssetList from './components/AssetList/AssetList';
import * as assetsSelector from './../../../store/assets/assets.selectors';
import { selectTotalLiquidity } from '../../../store/cash/cash.selectors';
import { changeSelectedTab } from '../../../store/appState/appState.reducer';
import { formatSyncTime } from '../../../utils/syncTimestamps';
import { useMarketPriceUpdatedAt } from '../../../utils/useMarketPriceUpdatedAt';
import type { TradeRepublicQuoteCache } from '../../../utils/tradeRepublicSync';

const assetTypes: { type: Asset['type']; label: string; icon?: IconName; symbol?: string }[] = [
	{ type: 'Stock', label: 'Aktie', icon: 'chart' },
	{ type: 'ETF', label: 'ETF', icon: 'pie-chart' },
	{ type: 'Fund', label: 'Fonds', icon: 'briefcase' },
	{ type: 'Bond', label: 'Anleihe', icon: 'bank-account' },
	{ type: 'Crypto', label: 'Krypto', symbol: '₿' },
	{ type: 'Commodity', label: 'Rohstoff', icon: 'cube' },
	{ type: 'RealEstate', label: 'Immobilien', icon: 'home' },
	{ type: 'CashEquivalent', label: 'Geldmarkt', icon: 'dollar' },
	{ type: 'IPO', label: 'IPO', icon: 'time' },
];
const filterableAssetTypes = assetTypes.filter(({ type }) => type !== 'RealEstate');
const euroFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const ASSET_TYPE_FILTER_KEY = 'finpal.assets.selectedType.v1';

export default function AnalysisRoute() {
	const dispatch = useAppDispatch();
	const assets = useAppSelector(state => state.assets);
	const selectedTab = useAppSelector(state => state.appState.selectedTab);
	const totalLiquidity = useAppSelector(selectTotalLiquidity);
	const [brokerCache, setBrokerCache] = useState<TradeRepublicQuoteCache | null>(null);
	useEffect(() => {
		let active = true;
		window.API.getTradeRepublicQuotes?.().then(cache => { if (active) setBrokerCache(cache); }).catch(() => {});
		return () => { active = false; };
	}, []);
	const totalWealth = assets.reduce((sum, asset) => sum + (assetsSelector.get_current_value(asset) || 0), 0) + totalLiquidity;
	const [selectedType, setSelectedType] = useState<Asset['type'] | null>(() => {
		const savedType = localStorage.getItem(ASSET_TYPE_FILTER_KEY);
		return filterableAssetTypes.find(({ type }) => type === savedType)?.type ?? null;
	});
	useEffect(() => {
		if (selectedType) {
			localStorage.setItem(ASSET_TYPE_FILTER_KEY, selectedType);
		} else {
			localStorage.removeItem(ASSET_TYPE_FILTER_KEY);
		}
	}, [selectedType]);
	const marketPriceUpdatedAt = useMarketPriceUpdatedAt();
	const filteredAssets = assets
		.filter(asset => asset.type !== 'RealEstate')
		.filter(asset => !selectedType || (asset.type || 'Stock') === selectedType);

	const valuesByType = assetTypes.map(({ type, label, icon, symbol }) => ({
		type,
		label,
		icon,
		symbol,
		value: assets
			.filter(asset => (asset.type || 'Stock') === type)
			.reduce((sum, asset) => sum + (assetsSelector.get_current_value(asset) || 0), 0),
	}));

	const renderAssetTypeCard = ({ type, label, icon, symbol, value }: typeof valuesByType[number]) => {
					const isRealEstate = type === 'RealEstate';
						const isSelected = isRealEstate ? selectedTab === 'realEstateTab' : selectedType === type;

						return (
						<Card
						key={type}
						data-testid={`asset-type-value-${type}`}
						interactive={!isRealEstate}
						role={isRealEstate ? 'link' : 'button'}
						tabIndex={0}
						aria-pressed={isRealEstate ? undefined : isSelected}
						aria-current={isRealEstate && isSelected ? 'page' : undefined}
						title={isRealEstate ? 'Immobilien öffnen' : undefined}
						onClick={() => isRealEstate
							? dispatch(changeSelectedTab('realEstateTab'))
							: setSelectedType(current => current === type ? null : type)}
						onKeyDown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								if (isRealEstate) dispatch(changeSelectedTab('realEstateTab'));
								else setSelectedType(current => current === type ? null : type);
							}
						}}
						className={`glass-card py-2 px-4 flex items-center gap-3 cursor-pointer transition-colors duration-200 ${
							isSelected
								? '!border-indigo-400/70 !bg-indigo-500/30'
								: 'border-transparent hover:border-indigo-500/30'
						}`}
					>
						<div className={`p-2 rounded-lg transition-colors ${isSelected ? 'bg-indigo-500 text-white' : 'bg-indigo-500/10'}`}>
							{icon ? (
								<Icon icon={icon} className={isSelected ? 'text-white' : 'text-indigo-500'} size={16} />
							) : (
								<span data-testid={`asset-type-symbol-${type}`} className={`${isSelected ? 'text-white' : 'text-indigo-500'} text-lg font-bold leading-none`}>{symbol}</span>
							)}
						</div>
						<div>
							<div className={`text-[10px] uppercase font-bold tracking-wider ${isSelected ? 'text-indigo-200' : 'text-gray-400'}`}>{label}</div>
							<div className={`text-lg font-bold ${value === 0 ? 'text-slate-500' : 'text-white'}`}>{euroFormatter.format(value)}</div>
						</div>
						</Card>
						);
	};

	return (
		<div id="AssetsRoute" data-testid="AssetsRoute" className="w-full p-4 animate-in fade-in duration-500">
			{/* Summary Header */}
			<div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">

				<div className="flex flex-wrap gap-4">
					<Card
						data-testid="asset-total-wealth"
						title="Aktuelle Positionswerte inklusive Cash Equivalents plus Total Liquidity aus Cash Management"
						className="glass-card py-2 px-4 flex items-center gap-3 !border-emerald-400/30 !bg-emerald-500/10"
					>
						<div className="p-2 rounded-lg bg-emerald-500/10">
							<Icon icon="bank-account" className="text-emerald-400" size={16} />
						</div>
						<div>
							<div className="text-[10px] uppercase font-bold tracking-wider text-emerald-300">Gesamtvermögen</div>
							<div className={`text-lg font-bold ${totalWealth === 0 ? 'text-slate-500' : 'text-white'}`}>{euroFormatter.format(totalWealth)}</div>
						</div>
					</Card>
                    <Card
                        data-testid="asset-trade-republic-value"
                        title={brokerCache?.fetchedAt ? `Depotpositionen laut Trade Republic, Stand: ${formatSyncTime(brokerCache.fetchedAt)}. Cash ist separat ausgewiesen.` : 'Depotpositionen aus dem letzten Trade-Republic-Sync; Cash ist separat ausgewiesen.'}
                        className="glass-card py-2 px-4 flex items-center gap-3"
                    >
                        <div className="p-2 rounded-lg bg-indigo-500/10"><Icon icon="briefcase" className="text-indigo-500" size={16} /></div>
                        <div>
                            <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Trade Republic</div>
                            <div className={`text-lg font-bold ${brokerCache?.fetchedAt ? 'text-white' : 'text-slate-500'}`}>
                                {brokerCache?.fetchedAt ? euroFormatter.format(brokerCache.quotes.reduce((sum, quote) => sum + (Number.isFinite(quote.netValue) ? quote.netValue : 0), 0)) : 'Nicht verfügbar'}
                            </div>
                            {brokerCache?.fetchedAt && <div className="text-[10px] text-gray-400">Stand: {formatSyncTime(brokerCache.fetchedAt)}</div>}
                        </div>
                    </Card>
                    {valuesByType.filter(item => item.type === 'RealEstate').map(renderAssetTypeCard)}
					<Card
						data-testid="asset-cash-value"
						interactive
						role="link"
						tabIndex={0}
						title="Cash Management öffnen"
						onClick={() => dispatch(changeSelectedTab('cashTab'))}
						onKeyDown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								dispatch(changeSelectedTab('cashTab'));
							}
						}}
						className="glass-card py-2 px-4 flex items-center gap-3 cursor-pointer transition-colors duration-200 border-transparent hover:border-indigo-500/30"
					>
						<div className="p-2 rounded-lg bg-indigo-500/10">
							<Icon icon="bank-account" className="text-indigo-500" size={16} />
						</div>
						<div>
						<div className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Verfügbares Cash</div>
							<div className={`text-lg font-bold ${totalLiquidity === 0 ? 'text-slate-500' : 'text-white'}`}>{euroFormatter.format(totalLiquidity)}</div>
						</div>
					</Card>
				</div>
			</div>
            <div data-testid="asset-type-row" className="mb-8 flex flex-wrap gap-4">
                {valuesByType.filter(item => item.type !== 'RealEstate').map(renderAssetTypeCard)}
            </div>

			{/* Asset Management Area */}
			{assets.some(asset => asset.current_shares > 0 && asset.quote?.valuationCurrency === 'unknown') &&
				<p role="status" className="text-sm text-amber-300">Die EUR-Summen sind unvollständig: Positionen ohne gültige Währungsumrechnung sind nicht enthalten.</p>}
			<Card className="glass-card p-0 overflow-hidden min-h-[500px]">
				<div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-start gap-3">
					<div className="flex items-center gap-4">
						<H5 className="!m-0 text-sm font-bold uppercase tracking-wider text-gray-300 leading-none">Positions List</H5>
						<RefreshButton />
						<span className="text-xs text-gray-400 leading-none" data-testid="market-price-updated-at">Marktpreise zuletzt aktualisiert: {formatSyncTime(marketPriceUpdatedAt) ?? 'noch nicht'}</span>
						<span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/20 leading-none">
							{filteredAssets.length} Active
						</span>
					</div>
				</div>
				<div className="px-4 py-3 border-b border-white/5"><TradeRepublicTradeDialog assets={assets}/></div>
				<div className="overflow-x-auto">
					<AssetList assets={filteredAssets}/>
				</div>
			</Card>

			<CreateAndEditAssetOverlay />
		</div>
	);
}
