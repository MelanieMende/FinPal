import { Icon, type IconName } from '@blueprintjs/core';
import { useAppSelector } from '../../../../../../hooks';
import type { AssetRecommendation } from '../../../../../../utils/portfolioAnalysis';
import { formatSyncTime } from '../../../../../../utils/syncTimestamps';

const indicators: Record<AssetRecommendation['action'], { icon: IconName; color: string }> = {
  Kaufen: { icon: 'arrow-up', color: 'text-emerald-400 bg-emerald-500/15' },
  Halten: { icon: 'pause', color: 'text-indigo-300 bg-indigo-500/15' },
  Verkaufen: { icon: 'arrow-down', color: 'text-red-400 bg-red-500/15' },
  Prüfen: { icon: 'help', color: 'text-amber-300 bg-amber-500/15' },
};

export default function AssetAnalysisIndicator({ assetId }: { assetId: number }) {
  const report = useAppSelector(state => state.portfolioAnalysis.lastResult ?? state.portfolioAnalysis.result);
  const recommendation = report?.recommendations.find(rec => rec.assetId === assetId);
  if (!recommendation) return <span className="text-slate-500" title="Keine KI-Empfehlung vorhanden" aria-label="Keine KI-Empfehlung vorhanden">—</span>;
  const { icon, color } = indicators[recommendation.action];
  return <span role="img" aria-label={'KI-Empfehlung: ' + recommendation.action}
    title={recommendation.action + ' · KI-Analyse vom ' + (formatSyncTime(report.generatedAt) ?? report.generatedAt) + '\n' + recommendation.rationale}
    className={'inline-flex h-8 w-8 items-center justify-center rounded-full ' + color}>
    <Icon icon={icon} size={16} aria-hidden="true" />
  </span>;
}
