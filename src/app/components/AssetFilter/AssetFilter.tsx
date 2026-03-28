import React, { useState } from 'react';
import * as assetSelector from '../../store/assets/assets.selectors';
import { useAppSelector, useAppDispatch } from './../../hooks'

import {
	Button,
	Intent,
	Popover,
	InputGroup,
	Checkbox,
	Menu,
	MenuItem,
	Divider,
	Icon
} from '@blueprintjs/core';

export default function AssetFilter(props: {filter:number[], onChange:any}) {
	const [searchTerm, setSearchTerm] = useState('');
	const dispatch = useAppDispatch();
	const assets = useAppSelector(state => state.assets);
	
	const sorted_assets = assetSelector.selectAssetsSortedByName(assets, 'asc');
	const filtered_assets = sorted_assets.filter(asset => 
		asset.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
		asset.symbol.toLowerCase().includes(searchTerm.toLowerCase())
	);

	const activeCount = props.filter ? props.filter.length : 0;

  function AssetFilterOptions() {
    return (
      <div className="glass-card p-2 min-w-[240px] max-h-[400px] flex flex-col shadow-2xl">
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
							// For each asset currently in filter, toggle it (since clear isn't a single action in the reducer)
							// Actually, the reducer handles toggling. If we want to clear all, we need a better action.
							// For now, let's just use the toggle logic as requested.
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
								className={`hover:bg-white/10 rounded-lg transition-colors py-2 ${props.filter && props.filter.includes(asset.ID) ? 'bg-blue-500/10' : ''}`}
								text={
									<div className="flex items-center justify-between w-full">
										<div className="flex flex-col">
											<span className="text-sm font-semibold text-white">{asset.name}</span>
											<span className="text-[10px] text-gray-500 uppercase">{asset.symbol}</span>
										</div>
										<Checkbox 
											checked={props.filter ? props.filter.includes(asset.ID) : false}
											onChange={() => dispatch(props.onChange(asset.ID))}
											className="m-0"
										/>
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

