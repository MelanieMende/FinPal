import { useAppDispatch } from './../../../../../../hooks'

import { Button, Intent } from '@blueprintjs/core';
import * as assetCreationReducer from '../../../../../../store/assetCreation/assetCreation.reducer';
import * as appStateReducer from '../../../../../../store/appState/appState.reducer';

export default function AnalysisRoute(props: { type?: Asset['type']; text?: string }) {

	const dispatch = useAppDispatch();

	return (
    <Button id="newAssetButton" intent={Intent.PRIMARY} icon="plus" text={props.text ?? 'New Asset'} fill onClick={() => openAssetOverlay()} />
	);

	async function openAssetOverlay() {
		await dispatch(assetCreationReducer.reset())
		if (props.type) dispatch(assetCreationReducer.setTypeInput(props.type))
		dispatch(appStateReducer.setAssetOverlayType(appStateReducer.AssetOverlayType.NEW))
		dispatch(appStateReducer.setShowAssetOverlay(true))
	}
}

