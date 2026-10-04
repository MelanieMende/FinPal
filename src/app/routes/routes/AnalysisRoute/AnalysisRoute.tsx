import PortfolioAnalysis from './components/PortfolioAnalysis';
import RefreshButton from '../AssetsRoute/components/RefreshButton';
import { useMarketPriceUpdatedAt } from '../../../utils/useMarketPriceUpdatedAt';
import { formatSyncTime } from '../../../utils/syncTimestamps';

export default function AnalysisRoute() {
  const priceUpdatedAt = useMarketPriceUpdatedAt();
  return (
    <div id="AnalysisRoute" data-testid="AnalysisRoute" className="w-full p-4 animate-in fade-in duration-500">
      <div className="mb-4 flex items-center gap-3">
        <RefreshButton />
        <span className="text-xs text-gray-400">Marktpreise zuletzt aktualisiert: {formatSyncTime(priceUpdatedAt) ?? 'noch nicht'}</span>
      </div>
      <PortfolioAnalysis priceUpdatedAt={priceUpdatedAt} standalone />
    </div>
  );
}
