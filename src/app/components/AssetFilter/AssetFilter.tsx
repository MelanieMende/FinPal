import * as assetSelector from '../../store/assets/assets.selectors';
import { useAppSelector, useAppDispatch } from './../../hooks'

import {
	Button,
	Intent,
	Popover
} from '@blueprintjs/core';

export default function AssetFilter(props: {filter:number[], onChange:any}) {

  function AssetFilterOptions() {

    const dispatch = useAppDispatch();
    const assets = useAppSelector(state => state.assets)
    const sorted_assets = assetSelector.selectAssetsSortedByName(assets, 'asc')

    return (
      <div id="AssetFilterPopupContent" data-testid="asset-filter-popup-content">
        {sorted_assets.map((asset, i) => {
          return (
            <div key={"assetsFilter_" + asset.ID} data-testid={`asset-filter-item-${asset.ID}`}>
              <input 
                data-testid={`asset-filter-checkbox-${asset.ID}`} 
                type="checkbox" 
                checked={props.filter.includes(asset.ID)} 
                onChange={(e) => dispatch(props.onChange(asset.ID))} />
              <label 
                htmlFor={`assetsFilter_${asset.ID}`} 
                data-testid={`asset-filter-label-${asset.ID}`}>
                {asset.name}
              </label>
            </div>
          )
        })}
      </div>
    )
  }

  return(
    <Popover content={AssetFilterOptions()}>
      <Button 
        id="AssetFilterButton" 
        data-testid="asset-filter-button" 
        intent={Intent.PRIMARY} 
        icon="filter" 
        tabIndex={0} />
    </Popover>
  )
}

