import { Button, Intent } from '@blueprintjs/core';
import * as assetsReducer from '../../../../store/assets/assets.reducer';
import { useAppDispatch } from '../../../../hooks';

export default function AnalysisRoute() {

	const dispatch = useAppDispatch();

	return (
		<Button id="RefreshButton" intent={Intent.PRIMARY} icon="refresh" onClick={(e) => dispatch(assetsReducer.loadAssets())} />
	);
}