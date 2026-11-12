import { Button, Intent } from '@blueprintjs/core';
import * as assetsReducer from '../../../../store/assets/assets.reducer';
import { useAppDispatch } from '../../../../hooks';

export default function AnalysisRoute() {
	const dispatch = useAppDispatch();

	return (
		<Button
			id="RefreshButton"
			small
			intent={Intent.PRIMARY}
			icon="refresh"
			aria-label="Aktualisieren"
			className="flex items-center justify-center !h-8 !w-8 !min-w-0"
			onClick={() => dispatch(assetsReducer.loadAssets())}
		/>
	);
}