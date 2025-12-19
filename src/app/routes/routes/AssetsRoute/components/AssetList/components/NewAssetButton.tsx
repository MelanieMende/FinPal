import { useAppDispatch, useAppSelector } from './../../../../../../hooks'

import { Button, Intent } from '@blueprintjs/core';
import * as assetCreationReducer from '../../../../../../store/assetCreation/assetCreation.reducer';
import * as appStateReducer from '../../../../../../store/appState/appState.reducer';

export default function AnalysisRoute() {

	const dispatch = useAppDispatch();

	return (
    <Button id="newAssetButton" intent={Intent.PRIMARY} icon="plus" text="New Asset" fill onClick={(e) => openAssetOverlay()} />
	);

	function openAssetOverlay() {
		dispatch(assetCreationReducer.reset())
		dispatch(appStateReducer.setAssetOverlayType(appStateReducer.AssetOverlayType.NEW))
		dispatch(appStateReducer.setShowAssetOverlay(true))
	}
}

