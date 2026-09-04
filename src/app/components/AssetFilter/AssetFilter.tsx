import React, { useState } from 'react';
import * as assetSelector from '../../store/assets/assets.selectors';
import { useAppSelector, useAppDispatch } from './../../hooks'

import {
	Button,
	Intent,
	Popover,
	InputGroup,
	Icon,
	Menu,
	MenuItem,
	Divider
} from '@blueprintjs/core';

export default function AssetFilter(props: {filter:number[], onChange:any}) {
	const [searchTerm, setSearchTerm] = useState('');
	const dispatch = useAppDispatch();
	const assets = useAppSelector(state => state.assets);
	
	const sorted_assets = assetSelector.selectAssetsSortedByName(assets, 'asc');
	const filtered_assets = sorted_assets.filter(asset => 
		(asset.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
		(asset.symbol || '').toLowerCase().includes(searchTerm.toLowerCase())
	);

	const activeCount = props.filter ? props.filter.length : 0;

  function AssetFilterOptions() {
    return (
      <div data-testid="asset-filter-popup-content" className="glass-card p-2 min-w-[240px] max-h-[400px] flex flex-col shadow-2xl">
				<div className="p-2 mb-2">
					<InputGroup
						placeholder="Search assets..."
						leftIcon="search"
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="glass-input-group"
						small
					/>
				</div>
				
				<div className="flex justify-between px-2 mb-2">
					<Button 
						minimal 
						small 
						text="Clear All" 
						onClick={() => {
							props.filter.forEach(assetID => dispatch(props.onChange(assetID)));
						}} 
						className="text-[10px] uppercase font-bold text-gray-400 hover:text-white"
					/>
				</div>

				<Divider className="my-1 opacity-10" />

				<div className="flex-grow overflow-y-auto scrollbar-hide">
					<Menu className="bg-transparent">
						{filtered_assets.map((asset) => (
							<MenuItem
								key={asset.ID}
								data-testid={`asset-filter-item-${asset.ID}`}
								className={`hover:bg-white/10 rounded-lg transition-colors py-2 ${props.filter && props.filter.includes(asset.ID) ? 'bg-blue-500/10' : ''}`}
								text={
									<div className="flex items-center justify-between w-full">
										<div className="flex flex-col">
											<span className="text-sm font-semibold text-white">{asset.name}</span>
											<span className="text-[10px] text-gray-500 uppercase">{asset.symbol}</span>
										</div>
									<span
										data-testid={`asset-filter-checkbox-${asset.ID}`}
										aria-label={asset.name}
										aria-checked={props.filter ? props.filter.includes(asset.ID) : false}
										role="checkbox"
										className={`w-4 h-4 shrink-0 rounded-sm border flex items-center justify-center ${
											props.filter && props.filter.includes(asset.ID)
												? 'bg-blue-500 border-blue-400 text-white'
												: 'border-gray-500 bg-transparent'
										}`}
									>
										{props.filter && props.filter.includes(asset.ID) && <Icon icon="tick" size={11} />}
									</span>
									</div>
								}
								onClick={() => dispatch(props.onChange(asset.ID))}
								shouldDismissPopover={false}
							/>
						))}
						{filtered_assets.length === 0 && (
							<div className="p-4 text-center text-gray-500 text-xs italic">No assets found</div>
						)}
					</Menu>
				</div>
      </div>
    )
  }

  return(
    <Popover 
			content={AssetFilterOptions()} 
			position="bottom-left"
			modifiers={{ arrow: { enabled: false }, offset: { options: { offset: [0, 8] } } }}
			popoverClassName="glass-popover"
		>
      <div className="relative inline-block group">
				<Button 
					id="AssetFilterButton" 
					data-testid="asset-filter-button" 
					intent={activeCount > 0 ? Intent.PRIMARY : Intent.NONE} 
					icon="filter" 
					tabIndex={0}
					className={`rounded-full shadow-lg transition-all transform group-hover:scale-105 ${activeCount > 0 ? 'bg-blue-600' : 'bg-gray-700/50 backdrop-blur-md border border-white/10'}`}
				/>
				{activeCount > 0 && (
					<span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border-2 border-[#121418] shadow-lg animate-in zoom-in grow-0">
						{activeCount}
					</span>
				)}
			</div>
    </Popover>
  )
}

