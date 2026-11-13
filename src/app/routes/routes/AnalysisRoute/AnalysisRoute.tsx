import PortfolioAnalysis from './components/PortfolioAnalysis';
import { useMarketPriceUpdatedAt } from '../../../utils/useMarketPriceUpdatedAt';

export default function AnalysisRoute() {
  const priceUpdatedAt = useMarketPriceUpdatedAt();
  return (
    <div id="AnalysisRoute" data-testid="AnalysisRoute" className="w-full p-4 animate-in fade-in duration-500">
      <PortfolioAnalysis priceUpdatedAt={priceUpdatedAt} standalone />
    </div>
  );
}
