import { Card, H3 } from '@blueprintjs/core';
import { useAppSelector } from '../../../hooks';
import AssetList from '../AssetsRoute/components/AssetList/AssetList';
import CreateAndEditAssetOverlay from '../AssetsRoute/components/CreateAndEditAssetOverlay';

export default function RealEstateRoute() {
	const assets = useAppSelector(state => state.assets);
	const properties = assets.filter(asset => asset.type === 'RealEstate');

	return (
		<div id="RealEstateRoute" data-testid="RealEstateRoute" className="w-full p-4 animate-in fade-in duration-500">
			<div className="mb-6">
				<H3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
					Immobilien
				</H3>
				<p className="text-gray-400 font-medium">Übersicht deiner Immobilien und Eigentumsanteile.</p>
			</div>
			<Card className="glass-card p-0 overflow-hidden min-h-[500px]">
				<div className="overflow-x-auto">
					<AssetList assets={properties} newAssetType="RealEstate" newAssetLabel="Immobilie hinzufügen" />
				</div>
			</Card>
			<CreateAndEditAssetOverlay />
		</div>
	);
}
