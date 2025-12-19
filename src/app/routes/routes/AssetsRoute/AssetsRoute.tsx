import { useAppSelector } from './../../../hooks'

import CreateAndEditAssetOverlay from './components/CreateAndEditAssetOverlay';
import AssetList from './components/AssetList/AssetList';

export default function AnalysisRoute() {

	return (
		<div
			id="AssetsRoute"
			data-testid="AssetsRoute">
			<AssetList/>
			<CreateAndEditAssetOverlay />
		</div>
	);
}