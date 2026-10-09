import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, H5, Icon, Intent, Spinner } from '@blueprintjs/core';
import { useAppSelector, useAppDispatch } from '../../../../hooks';
import { ANALYSIS_TIMEOUT_MS, buildAnalysisPositions, validateAnalysisRequest, type InvestmentProfile, type PortfolioAnalysisProgress } from '../../../../utils/portfolioAnalysis';
import type { ChatGptModel, ChatGptStatus } from '../../../../utils/chatGptAuth';
import { analyzePortfolio, setAnalysisOpen, clearAnalysisResult } from '../../../../store/portfolioAnalysis/portfolioAnalysis.reducer';
import { formatSyncTime } from '../../../../utils/syncTimestamps';
import { assessQuoteFreshness } from '../../../../utils/quoteFreshness';
import { isEltif, assessNavFreshness, type NavEvidence } from '../../../../utils/eltifValuation';
import type { AnalysisPosition } from '../../../../utils/portfolioAnalysis';
import { selectTotalLiquidity } from '../../../../store/cash/cash.selectors';
import { selectRecommendationExecutions } from '../../../../utils/recommendationExecution';
import { checkPortfolioFunding } from '../../../../utils/portfolioFunding';
import TradeDecisionReview from './TradeDecisionReview';
import InvestorFactsEditor from './InvestorFactsEditor';
import { useInvestorFacts } from '../../../../utils/useInvestorFacts';
import { buildInvestorContext } from '../../../../utils/investorFacts';

export const ANALYSIS_PROFILE_KEY = 'finpal.portfolioAnalysis.profile.v1';
export const ANALYSIS_MODEL_KEY = 'finpal.portfolioAnalysis.model.v1';
type ProfileForm = { goal: string; risk: string; horizonYears: string; buyBudget: string };
const emptyProfile: ProfileForm = { goal: '', risk: '', horizonYears: '', buyBudget: '0' };
const inputClass = 'w-full rounded border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400';
const stageLabels: Record<PortfolioAnalysisProgress['stage'], string> = {
  prices: 'Kurse werden aktualisiert',
  preparing: 'KI-Verbindung wird vorbereitet',
  research: 'Aktuelle Quellen werden recherchiert',
  analysis: 'Portfolio und Empfehlungen werden analysiert',
  retrying: 'Unterbrochene KI-Anfrage wird einmal erneut versucht',
  correcting: 'Empfehlungen werden korrigiert und erneut geprüft',
  validating: 'Antwort und Quellen werden geprüft',
};
function duration(seconds: number) { return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }
const euros = (amount: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
const fundingLabels = { 'no-trades': 'Keine Käufe oder Verkäufe vorgeschlagen', unknown: 'Finanzierung ungeklärt', insufficient: 'Budget reicht nicht aus', conditional: 'Im Gebührenszenario gedeckt; Steuern und Spreads noch offen' };
const emptyChatGpt: ChatGptStatus = { connected: false, accounts: [] };

// Reclassify this known neutral message in older saved analyses; keep other warnings intact.
const legacyQuoteInfo = 'Die Kurse aller Positionen besitzen einen quoteAsOf-Zeitpunkt; ein fehlender Kurszeitpunkt liegt nicht vor. Die US-Schlusskurse mit Status market-closed werden nicht allein wegen Börsenschluss oder Vorbörse beanstandet.';
function AnalysisMessages({ infos = [], warnings = [] }: { infos?: string[]; warnings?: string[] }) {
  const information = [...new Set([...infos, ...warnings.filter(message => message.trim() === legacyQuoteInfo)])];
  const alerts = warnings.filter(message => message.trim() !== legacyQuoteInfo);
  return <div className="space-y-2">
    {!!information.length && <section aria-label="Infos" className="rounded-lg border border-sky-400/30 bg-sky-500/10 p-3 text-xs text-sky-200">
      <h6 className="m-0 mb-2 flex items-center gap-2 font-bold"><Icon icon="info-sign" aria-hidden="true" size={14} />Infos</h6>
      <ul className="m-0 list-disc pl-5 space-y-1">{information.map((message, i) => <li key={i}>{message}</li>)}</ul>
    </section>}
    {!!alerts.length && <section aria-label="Warnungen" className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
      <h6 className="m-0 mb-2 flex items-center gap-2 font-bold"><Icon icon="warning-sign" aria-hidden="true" size={14} />Warnungen</h6>
      <ul className="m-0 list-disc pl-5 space-y-1">{alerts.map((message, i) => <li key={i}>{message}</li>)}</ul>
    </section>}
  </div>;
}

function EltifValuation({ position, evidence }: { position?: AnalysisPosition; evidence?: NavEvidence | null }) {
  if (!position || !isEltif(position)) return null;
  const status = assessNavFreshness(evidence);
  const broker = assessQuoteFreshness(position);
  const statusText = { current: 'Innerhalb des belegten Bewertungszyklus', stale: 'Veröffentlichung überfällig', unknown: 'Ungeklärt' };
  return <section aria-label="Brokerpreis und NAV" className="mt-3 space-y-2 text-xs">
    <div className="rounded border border-sky-400/30 bg-sky-500/10 p-3 text-sky-200">
      <p className="m-0 font-bold">Brokerpreis im Portfolio</p>
      <p className="m-0">{position.price === null ? 'Unbekannt' : position.price + ' ' + position.currency} je Anteil</p>
      <p className="m-0">Letzter Tick: {formatSyncTime(position.quote?.quoteAsOf) ?? 'unbekannt'}</p>
      <p className="m-0">Brokerkursalter: {broker.brokerTickAgeHours !== undefined ? broker.brokerTickAgeHours + ' Stunden' : 'unbekannt'}. Kein Nachweis eines veralteten NAV.</p>
      <p className="m-0">Quelle: {position.quote?.source ?? 'unbekannt'}. Kein offizieller NAV-Stichtag.</p>
    </div>
    <div className={status === 'current' ? 'rounded border border-sky-400/30 bg-sky-500/10 p-3 text-sky-200' : 'rounded border border-amber-400/30 bg-amber-500/10 p-3 text-amber-200'}>
      <p className="m-0 font-bold">NAV-Aktualität: {statusText[status]}</p>
      <p className="m-0">Offizieller NAV: {evidence?.value != null ? evidence.value + ' ' + (evidence.currency ?? '(Währung unbekannt)') : 'nicht belegt'}</p>
      <p className="m-0">Bewertungsstichtag: {evidence?.valuationDate ?? 'nicht belegt'}</p>
      <p className="m-0">Veröffentlichungszyklus: {evidence?.publicationCycle ?? 'nicht belegt'}</p>
      <p className="m-0">Nächste Veröffentlichung fällig: {evidence?.nextPublicationDue ?? 'nicht belegt'}</p>
    </div>
  </section>;
}

function readModel(): string {
  try { return localStorage.getItem(ANALYSIS_MODEL_KEY) || ''; }
  catch { return ''; }
}

function readProfile(): ProfileForm {
  try {
    const saved = JSON.parse(localStorage.getItem(ANALYSIS_PROFILE_KEY) || 'null');
    return saved && Object.keys(emptyProfile).every(key => typeof saved[key] === 'string') ? saved : emptyProfile;
  } catch { return emptyProfile; }
}

export default function PortfolioAnalysis({ priceUpdatedAt, standalone = false }: { priceUpdatedAt: string | null; standalone?: boolean }) {
  const assets = useAppSelector(state => state.assets);
  const transactions = useAppSelector(state => state.transactions);
  const database = useAppSelector(state => state.appState.database || '');
  const { facts: investorFacts, save: saveInvestorFacts, error: investorFactsError } = useInvestorFacts(database, assets);
  const investorContext = buildInvestorContext(investorFacts, assets, transactions);
  const positions = buildAnalysisPositions(assets);
  const dispatch = useAppDispatch();
  const analysisState = useAppSelector(state => state.portfolioAnalysis);
  const { progress, startedAt, result, resultSnapshot } = analysisState;
  const executions = useAppSelector(selectRecommendationExecutions);
  const open = standalone || analysisState.open;
  const setOpen = (value: boolean) => dispatch(setAnalysisOpen(value));
  const [savedProfile, setProfile] = useState<ProfileForm>(readProfile);
  const totalLiquidity = useAppSelector(selectTotalLiquidity);
  const profile = { ...savedProfile, buyBudget: String(totalLiquidity) };
  const [provider, setProvider] = useState<'chatgpt' | 'api'>(analysisState.provider);
  const [chatGpt, setChatGpt] = useState(emptyChatGpt);
  const [models, setModels] = useState<ChatGptModel[]>([]);
  const [model, setModel] = useState(() => readModel() || analysisState.model);
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [secureStorage, setSecureStorage] = useState(false);
  const [actionBusy, setBusy] = useState(false);
  const busy = actionBusy || progress !== null;
  const [now, setNow] = useState(Date.now);
  const analyzing = progress !== null;
  useEffect(() => {
    if (!analyzing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [analyzing]);
  const [signingIn, setSigningIn] = useState(false);
  const [localError, setError] = useState<string | null>(null);
  const error = localError || analysisState.error;
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const snapshot = JSON.stringify({ positions, profile, priceUpdatedAt, investorContext });
  let comparableSnapshot = resultSnapshot;
  try {
    const { transactionIds: _transactionIds, ...saved } = JSON.parse(resultSnapshot);
    comparableSnapshot = JSON.stringify(saved);
  } catch { /* Legacy snapshots may not be JSON. */ }
  const stale = !!result && comparableSnapshot !== snapshot;
  const hasExecution = result?.recommendations.some(rec => executions[rec.assetId]?.status !== 'open' && executions[rec.assetId]);
  const fundingCheck = result && hasExecution ? checkPortfolioFunding({
    investorContext,
    provider, positions, profile: { ...profile, horizonYears: Number(profile.horizonYears), buyBudget: totalLiquidity } as InvestmentProfile,
    priceUpdatedAt,
  }, {
    ...result,
    recommendations: result.recommendations.filter(rec => executions[rec.assetId]?.status !== 'done').map(rec => ({
      ...rec, plannedAmountEUR: executions[rec.assetId]?.remainingEUR ?? rec.plannedAmountEUR,
    })),
  }) : result?.fundingCheck;

  async function refreshStatus() {
    if (!window.API.getPortfolioAIStatus) throw new Error('Bitte FinPal vollständig neu starten, um die KI-Anbindung zu laden.');
    const status = await window.API.getPortfolioAIStatus();
    if (!alive.current) return;
    setHasKey(status.hasApiKey); setSecureStorage(status.secureStorageAvailable); setChatGpt(status.chatGpt);
    if (status.chatGpt.connected) {
      const available = await window.API.getPortfolioChatGptModels();
      if (!alive.current) return;
      const preferred = readModel() || analysisState.model;
      setModels(available);
      setModel(current => available.some(m => m.slug === preferred) ? preferred
        : available.some(m => m.slug === current) ? current : available[0]?.slug || '');
    } else { setModels([]); setModel(''); }
  }

  useEffect(() => {
    if (open) void refreshStatus().catch(e => {
      if (alive.current) setError(e instanceof Error ? e.message : 'Die KI-Verbindung konnte nicht geladen werden.');
    });
  }, [open]);

  useEffect(() => { setProvider(analysisState.provider); }, [analysisState.provider]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try { await action(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Die KI-Anfrage ist fehlgeschlagen.'); }
    finally { if (alive.current) { setBusy(false); setSigningIn(false); } }
  }

  function toggleOpen() {
    setOpen(!open);

  }
  function signIn(clientId?: string) {
    void run(async () => {
      setSigningIn(true);
      await window.API.signInPortfolioChatGpt(clientId);
      await refreshStatus();
    });
  }
  function selectModel(value: string) {
    setModel(value);
    try { localStorage.setItem(ANALYSIS_MODEL_KEY, value); }
    catch { setError('Die Modellauswahl konnte nicht dauerhaft gespeichert werden.'); }
  }
  function updateProfile(key: keyof ProfileForm, value: string) {
    const next = { ...profile, [key]: value };
    setProfile(next);
    try { localStorage.setItem(ANALYSIS_PROFILE_KEY, JSON.stringify(next)); }
    catch { setError('Die Analyse-Einstellungen konnten nicht dauerhaft gespeichert werden.'); }
  }
  function openSource(event: React.MouseEvent<HTMLAnchorElement>, url: string) {
    event.preventDefault();
    if (window.API.openPortfolioAnalysisSource) {
      void window.API.openPortfolioAnalysisSource(url).catch(() => setError('Der Quellenlink konnte nicht geöffnet werden.'));
    } else { setError('Bitte FinPal neu starten, um Quellen im Browser zu öffnen.'); }
  }

  function analyze(targetAssetId?: number) {
    void run(async () => {
      if (investorFactsError) throw new Error(investorFactsError);
      if (!profile.horizonYears.trim() || !profile.buyBudget.trim()) throw new Error('Bitte Anlagedauer und Kaufbudget angeben.');
      const request = {
        provider, model, positions, priceUpdatedAt, ...(targetAssetId === undefined ? {} : { targetAssetId }),
        investorContext,
        profile: { goal: profile.goal, risk: profile.risk, horizonYears: Number(profile.horizonYears), buyBudget: Number(profile.buyBudget.replace(',', '.')) } as InvestmentProfile,
      };
      validateAnalysisRequest(request);
      if (provider === 'chatgpt' && (!chatGpt.connected || !model)) throw new Error('Bitte zuerst mit ChatGPT anmelden und ein Modell auswählen.');
      if (provider === 'api' && !hasKey) throw new Error('Bitte zuerst einen API-Schlüssel speichern.');
      localStorage.setItem(ANALYSIS_PROFILE_KEY, JSON.stringify(profile));
      // The store continues receiving progress and the result after a route change.
      await dispatch(analyzePortfolio({ request, snapshot }));
    });
  }

  return (
    <Card className="glass-card analysis-form mb-6" data-testid="portfolio-analysis">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <H5 className="m-0 text-sm font-bold text-indigo-300">KI-Portfolio-Analyse</H5>
          <p className="mt-1 mb-0 text-xs text-gray-400">Kauf-, Halte- und Verkaufsvorschläge für dein Portfolio sowie neue Kaufideen mit aktuellen Quellen.</p>
        </div>
        {!standalone && <Button icon="search" intent={Intent.PRIMARY} onClick={toggleOpen} aria-expanded={open} aria-controls="portfolio-analysis-content">
          {open ? 'Analyse schließen' : 'Portfolio analysieren'}
        </Button>}
      </div>
      {progress && <div className="mt-4 flex items-center gap-3 rounded-lg border border-indigo-400/20 bg-indigo-500/10 p-3" aria-label="Laufende Analyse">
        <Spinner size={20} />
        <div>
          {analysisState.targetAssetId != null && <p className="mt-0 mb-1 text-sm font-bold text-indigo-200">Einzelanalyse: {assets.find(asset => asset.ID === analysisState.targetAssetId)?.name || `Asset ${analysisState.targetAssetId}`}</p>}
          {analysisState.targetAssetId != null && <p className="mt-0 mb-1 text-xs text-gray-400">Eine vorhandene Einzelrecherche wird bis zu 30 Minuten wiederverwendet. Bestände, Kurse und Anlageprofil werden bei jeder Empfehlung neu ausgewertet.</p>}
          <p role="status" className="m-0 text-sm text-indigo-200">{stageLabels[progress.stage]}{progress.stage === 'research' && progress.researchTotal && ` · ${progress.researchCompleted ?? 0}/${progress.researchTotal} Gruppen abgeschlossen`}</p>
          <p className="mt-1 mb-0 text-xs text-gray-300">Laufzeit: {duration(Math.max(0, Math.floor((now - startedAt) / 1000)))} · Letzte Rückmeldung vor {Math.max(0, Math.floor((now - progress.lastActivityAt) / 1000))} s</p>
          <p className="mt-1 mb-0 text-xs text-gray-400">Webrecherche und Analyse können mehrere Minuten dauern. Zeitlimit: {ANALYSIS_TIMEOUT_MS / 60000} Minuten. Abgeschlossene Recherchegruppen werden für erneute Versuche bis zu 30 Minuten wiederverwendet.</p>
        </div>
      </div>}
      {open && <div id="portfolio-analysis-content" className="mt-5 space-y-4">
        <p className="text-xs text-gray-400">Analysiert werden alle {positions.length} gehaltenen Positionen, unabhängig vom aktiven Asset-Type-Filter. Zusätzlich werden passende Assets außerhalb deines Portfolios recherchiert. Empfehlungen sind eine Entscheidungshilfe und führen keine Trades aus.</p>
        <label className="block text-xs text-gray-300">KI-Zugang
          <select className={`${inputClass} mt-1`} style={{ colorScheme: 'dark' }} value={provider} disabled={busy} onChange={e => setProvider(e.target.value as 'chatgpt' | 'api')}>
            <option value="chatgpt">ChatGPT Plus / Pro</option><option value="api">OpenAI API (separat kostenpflichtig)</option>
          </select>
        </label>
        {provider === 'chatgpt' ? <div className="rounded-lg border border-white/10 p-3 space-y-3">
          <p className="text-xs text-gray-400 m-0">Die Analyse nutzt dein bestehendes ChatGPT-Kontingent. Anmeldung und Freigabe erfolgen im Browser. Webrecherche hängt von Modell und Kontofreigabe ab.</p>
          <p className="text-xs text-gray-400 m-0">Für FinPal kann ein eigenes Nutzungslimit gelten. <a href="https://chatgpt.com/settings/usage" onClick={e => openSource(e, 'https://chatgpt.com/settings/usage')} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">ChatGPT-Nutzung verwalten</a></p>
          {chatGpt.connected && <p className="text-sm text-emerald-300">Verbunden: {chatGpt.accounts.find(a => a.clientId === chatGpt.activeClientId)?.label}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !secureStorage} onClick={() => signIn()}>{chatGpt.connected ? 'Anderes ChatGPT-Konto hinzufügen' : 'Continue with ChatGPT'}</Button>
            {chatGpt.accounts.map(account => <Button key={account.clientId} disabled={busy || !secureStorage} onClick={() => signIn(account.clientId)}>Anmelden: {account.label}</Button>)}
            {chatGpt.connected && <Button disabled={busy} onClick={() => void run(async () => {
              const logout = await window.API.signOutPortfolioChatGpt(); await refreshStatus();
              await window.API.forgetLastPortfolioAnalysis?.();
              dispatch(clearAnalysisResult());
              if (!logout.revoked) setNotice('Lokal abgemeldet. Der Widerruf bei OpenAI konnte nicht bestätigt werden; du kannst FinPal in den ChatGPT-Einstellungen trennen.');
            })}>ChatGPT abmelden</Button>}
            {signingIn && <Button onClick={() => { void window.API.cancelPortfolioChatGptSignIn(); }}>Anmeldung abbrechen</Button>}
          </div>
          {chatGpt.connected && <label className="block text-xs text-gray-300">ChatGPT-Modell
            <select className={`${inputClass} mt-1`} style={{ colorScheme: 'dark' }} value={model} disabled={busy} onChange={e => selectModel(e.target.value)}>
              {!models.length && <option value="">Keine Modelle verfügbar</option>}
              {models.map(m => <option key={m.slug} value={m.slug}>{m.displayName}</option>)}
            </select>
          </label>}
        </div> : <div className="rounded-lg border border-white/10 p-3 space-y-3">
          <p className="text-xs text-gray-400 m-0">API-Nutzung und Webrecherche werden separat bei OpenAI abgerechnet. Der Schlüssel wird lokal verschlüsselt gespeichert.</p>
          {hasKey && <p className="text-xs text-emerald-300">API-Schlüssel gespeichert.</p>}
          <label className="block text-xs text-gray-300">OpenAI-API-Schlüssel
            <input type="password" autoComplete="off" className={`${inputClass} mt-1`} value={apiKey} disabled={busy} onChange={e => setApiKey(e.target.value)} placeholder="sk-…" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !secureStorage || !apiKey.trim()} onClick={() => void run(async () => {
              await window.API.savePortfolioAIKey(apiKey); setApiKey(''); await refreshStatus();
            })}>Schlüssel speichern</Button>
            {hasKey && <Button disabled={busy} onClick={() => void run(async () => { await window.API.forgetPortfolioAIKey(); setApiKey(''); await refreshStatus(); })}>Schlüssel entfernen</Button>}
          </div>
        </div>}
        <div className="analysis-fields">
          <label className="text-xs text-gray-300">Anlageziel
            <select className={`${inputClass} mt-1`} style={{ colorScheme: 'dark' }} value={profile.goal} disabled={busy} onChange={e => updateProfile('goal', e.target.value)}>
              <option value="">Bitte auswählen</option><option value="growth">Vermögensaufbau</option><option value="income">Laufende Erträge</option><option value="preservation">Kapitalerhalt</option>
            </select>
          </label>
          <label className="text-xs text-gray-300">Risikobereitschaft
            <select className={`${inputClass} mt-1`} style={{ colorScheme: 'dark' }} value={profile.risk} disabled={busy} onChange={e => updateProfile('risk', e.target.value)}>
              <option value="">Bitte auswählen</option><option value="low">Niedrig</option><option value="medium">Mittel</option><option value="high">Hoch</option>
            </select>
          </label>
          <label className="text-xs text-gray-300">Anlagedauer (Jahre)<input type="number" min="0.1" max="100" step="0.1" className={`${inputClass} mt-1`} value={profile.horizonYears} disabled={busy} onChange={e => updateProfile('horizonYears', e.target.value)} /></label>
          <div className="text-xs text-gray-300">
            <label>Zusätzliches Kaufbudget (EUR)<input type="text" inputMode="decimal" className={`${inputClass} mt-1`} value={totalLiquidity.toFixed(2).replace('.', ',')} readOnly aria-describedby="buy-budget-source" /></label>
            <p id="buy-budget-source" className="mt-1 mb-0 text-gray-400">Entspricht automatisch deiner Total Liquidity.</p>
          </div>
        </div>
        <InvestorFactsEditor key={database} facts={investorFacts} assets={assets} transactions={transactions} onSave={saveInvestorFacts} busy={busy} storageError={investorFactsError} />
        <p className="text-xs text-gray-400">Beim Start werden Namen, ISINs, Bestände, Kurse, Einstandswerte, Gewinne und Dividenden sowie dein Anlageprofil, gespeicherte Verwahr- und Steuerangaben, Zielgewichte und abgeleitete Anschaffungsdaten an OpenAI übertragen. Kommentare und Zugangsdaten werden nicht übertragen. Kurse zuletzt aktualisiert: {formatSyncTime(priceUpdatedAt) ?? 'unbekannt'}.</p>
        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer">Kurswährungen und EUR-Umrechnung</summary>
          <p>Kurswährungen zeigen keine vollständige Währungsrisiko-Allokation. Für Fonds und ETFs fehlen Angaben zu den enthaltenen Anlagen und Absicherungen.</p>
          <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Position</th><th>Originalkurs</th><th>EUR je Währungseinheit</th><th>Quelle / Kurszeit</th><th>FX-Stand / Umrechnung</th></tr></thead>
            <tbody>{positions.map(position => <tr key={position.id} className="border-t border-white/10">
              <td className="py-2 pr-3">{position.name}</td>
              <td className="pr-3">{position.quote ? `${position.quote.originalPrice} ${position.quote.originalCurrency}` : 'Unbekannt'}{position.quote?.unitFactor !== undefined && position.quote.unitFactor !== 1 && <><br />Faktor je erfasster Einheit: {position.quote.unitFactor}</>}</td>
              <td className="pr-3">{position.quote?.fxRateToEUR ?? 'Unbekannt'}</td>
              <td className="pr-3">{position.quote?.source ?? 'Unbekannt'} · {formatSyncTime(position.quote?.quoteAsOf) ?? 'Kurszeit unbekannt'}<br />Abruf: {formatSyncTime(position.quote?.fetchedAt) ?? 'unbekannt'}
                {position.quote?.exchange && <><br />Kurs-Handelsplatz: {position.quote.exchange}</>}
                {position.quote?.tradedInPercent && <><br />Prozentnotierung</>}
                {position.quote?.bondUnits && <><br />Broker-Menge: {position.quote.bondUnits.brokerQuantity} · Erfasst: {position.quote.bondUnits.recordedQuantity}<br />Mengenquelle: Trade Republic · {formatSyncTime(position.quote.bondUnits.fetchedAt)}</>}
                {position.bondHolding && <><br />Bestätigter Nominalbestand: {position.bondHolding.nominal.toFixed(2)} {position.bondHolding.currency}<br />Stückzinsen beim Kauf: {position.bondHolding.purchaseAccruedInterestEUR.toFixed(2)} EUR
                  {position.bondHolding.quantityConflict && <span className="block text-amber-300">Abweichende Broker-Menge: {position.bondHolding.brokerQuantity}. Bewertung verwendet den bestätigten Nominalbestand.</span>}
                </>}
              </td>
              <td>{position.quote?.fxSource ?? (position.quote?.originalCurrency === 'EUR' ? 'Direkter EUR-Kurs' : 'Unbekannt')}<br />{formatSyncTime(position.quote?.fxAsOf) ?? 'Kein FX-Zeitpunkt'} · {formatSyncTime(position.quote?.convertedAt) ?? 'Keine Umrechnung'}<br />FX-Abruf: {formatSyncTime(position.quote?.fxFetchedAt) ?? 'Nicht erforderlich / unbekannt'}</td>
            </tr>)}</tbody></table></div>
          <a href="https://www.exchangerate-api.com" onClick={e => openSource(e, 'https://www.exchangerate-api.com')} target="_blank" rel="noopener noreferrer" className="underline">Wechselkurse von ExchangeRate-API</a>
        </details>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {notice && <p role="status" className="text-sm text-amber-300">{notice}</p>}
        <Button intent={Intent.PRIMARY} loading={analyzing} disabled={busy || !positions.length} onClick={() => analyze()}>Analyse starten</Button>
        {!positions.length && <p className="text-xs text-gray-400">Es sind keine gehaltenen Assets vorhanden.</p>}
        {result && <section aria-label="Analyseergebnis" className="space-y-3 border-t border-white/10 pt-4">
          <p className="text-xs text-gray-400">Analyse vom {formatSyncTime(result.generatedAt)} · {result.model} · Kursstand: {formatSyncTime(result.priceUpdatedAt) ?? 'unbekannt'}</p>
          {stale && <p role="status" className="text-amber-300 text-sm">Portfolio, Kurse oder Anlageprofil haben sich seit dieser Analyse geändert. Bitte neu analysieren.</p>}
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{result.summary}</p>
          <AnalysisMessages infos={result.infos} warnings={result.warnings} />
          {fundingCheck && <section aria-label="Finanzierungsprüfung" className="rounded-lg border border-indigo-400/20 p-4 text-sm text-gray-300">
            <H5 className="text-sm text-indigo-300">Finanzierungsprüfung</H5>
            {hasExecution && <p className="text-xs text-emerald-300">Aktuelle Barmittel und offene Restbeträge: Erfasste Trades werden nicht erneut eingeplant.</p>}
            <p className="font-bold text-amber-200">{fundingLabels[fundingCheck.status]}</p>
            <dl className="grid grid-cols-2 gap-2">
              <dt>Vorhandene Barmittel</dt><dd>{euros(fundingCheck.cashEUR)}</dd>
              <dt>Geplante Brutto-Verkaufserlöse</dt><dd>{euros(fundingCheck.saleProceedsEUR)}</dd>
              <dt>Alle geplanten Käufe</dt><dd>{euros(fundingCheck.buyAmountEUR)}</dd>
              <dt>Gebührenszenario für Käufe und Verkäufe</dt><dd>{euros(fundingCheck.feeScenarioEUR)}</dd>
              <dt>Restbetrag vor Spread und Steuern</dt><dd>{euros(fundingCheck.balanceBeforeSpreadAndTaxEUR)}</dd>
            </dl>
            {fundingCheck.shortfallEUR > 0 && <p>Mindestens fehlender Betrag im erfassten Szenario: {euros(fundingCheck.shortfallEUR)}</p>}
            <AnalysisMessages warnings={fundingCheck.warnings} />
          </section>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {result.recommendations.map(rec => <article key={rec.assetId} className="rounded-lg border border-white/10 p-4">
              <div className="flex justify-between items-start gap-3"><span className="font-bold text-sm text-white">{assets.find(a => a.ID === rec.assetId)?.name || `Asset ${rec.assetId}`}</span>
                <span className={`text-xs font-bold ${rec.action === 'Kaufen' ? 'text-emerald-400' : rec.action === 'Verkaufen' ? 'text-red-400' : rec.action === 'Prüfen' ? 'text-amber-300' : 'text-indigo-300'}`}>{rec.action}</span>
              </div>
              {executions[rec.assetId]?.status !== 'open' && executions[rec.assetId] && <p
                className="text-xs font-bold text-emerald-400" data-testid={`recommendation-execution-${rec.assetId}`}>
                {executions[rec.assetId].status === 'done' ? 'Done' : 'Teilweise umgesetzt'} · {euros(executions[rec.assetId].amountEUR)} erfasst
                {executions[rec.assetId].remainingEUR !== null && executions[rec.assetId].status !== 'done' && ` · ${euros(executions[rec.assetId].remainingEUR!)} offen`}
              </p>}
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{rec.rationale}</p>
              {rec.tradeDecision ? <TradeDecisionReview decision={rec.tradeDecision} />
                : rec.action === 'Verkaufen' && <p className="text-xs text-sky-200">Diese gespeicherte Empfehlung enthält noch keine Abwägung von Halten und Reduzieren mit Kursszenarien. Über „Neu analysieren“ ergänzen.</p>}
              {typeof rec.plannedAmountEUR === 'number' && <p className="text-xs text-gray-400">Geplanter {rec.action === 'Verkaufen' ? 'Brutto-Verkaufsbetrag' : 'Kaufbetrag'} im Szenario: {euros(rec.plannedAmountEUR)}</p>}
              <Button small disabled={busy || !positions.some(position => position.id === rec.assetId)} onClick={() => analyze(rec.assetId)} aria-label={`Asset ${rec.assetId} neu analysieren`}>Neu analysieren</Button>
              {rec.updatedAt && <p className="text-xs text-gray-400">Einzelanalyse vom {formatSyncTime(rec.updatedAt)} · {rec.model}. Portfolio-Zusammenfassung und übrige Empfehlungen stammen aus der Gesamtanalyse.</p>}
              <EltifValuation position={positions.find(position => position.id === rec.assetId)} evidence={rec.navEvidence} />
              <AnalysisMessages infos={rec.infos} warnings={rec.warnings} />
              <p className="text-xs text-amber-200 whitespace-pre-wrap">Risiken: {rec.risk}</p>
              {rec.tradeCheck && <div className="rounded border border-white/10 bg-slate-950/30 p-3 text-xs text-gray-300 space-y-2" aria-label="Kosten- und Steuerprüfung">
                <p className="m-0"><span className="font-bold text-white">Kosten:</span> {rec.tradeCheck.costs}</p>
                <p className="m-0"><span className="font-bold text-white">Steuern:</span> {rec.tradeCheck.taxes}</p>
                <p className="m-0"><span className="font-bold text-white">Ergebnis:</span> {rec.tradeCheck.conclusion}</p>
              </div>}
              <div className="flex flex-wrap gap-2 mt-2">{[...new Set([...rec.sourceIndexes, ...('navEvidence' in rec ? rec.navEvidence?.sourceIndexes ?? [] : []), ...(rec.tradeDecision?.scenarios.flatMap(s => s.sourceIndexes) ?? [])])].map(index => <a key={index} href={result.sources[index].url} onClick={e => openSource(e, result.sources[index].url)} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 underline">[{index}] {result.sources[index].title}</a>)}</div>
            </article>)}
          </div>
          {result.newAssetRecommendations && <section aria-label="Neue Kaufideen" className="space-y-3">
            <H5 className="text-sm text-indigo-300">Neue Kaufideen</H5>
            <p className="text-xs text-gray-400">Mögliche Ergänzungen zu deinem Portfolio, passend zu Anlageprofil und Kaufbudget.</p>
            {!result.newAssetRecommendations.length && <p className="text-sm text-gray-400">Keine passenden neuen Assets mit ausreichenden Belegen gefunden.</p>}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {result.newAssetRecommendations.map((rec, i) => <article key={i} className="rounded-lg border border-white/10 p-4">
                <div className="flex justify-between items-start gap-3">
                  <span className="font-bold text-sm text-white">{rec.name}</span>
                  <span className={`text-xs font-bold ${rec.action === 'Kaufen' ? 'text-emerald-400' : 'text-amber-300'}`}>{rec.action}</span>
                </div>
                <p className="text-xs text-gray-400">{rec.type}{rec.isin && ` · ISIN: ${rec.isin}`}{rec.symbol && ` · Ticker: ${rec.symbol}`}</p>
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{rec.rationale}</p>
                {typeof rec.plannedAmountEUR === 'number' && <p className="text-xs text-gray-400">Geplanter Kaufbetrag im Szenario: {euros(rec.plannedAmountEUR)}</p>}
                <p className="text-xs text-amber-200 whitespace-pre-wrap">Risiken: {rec.risk}</p>
                <div className="flex flex-wrap gap-2 mt-2">{[...new Set(rec.sourceIndexes)].map(index => <a key={index} href={result.sources[index].url} onClick={e => openSource(e, result.sources[index].url)} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 underline">[{index}] {result.sources[index].title}</a>)}</div>
              </article>)}
            </div>
          </section>}
          <details className="text-xs text-gray-400"><summary className="cursor-pointer">Recherchequellen</summary><ul className="mt-2 space-y-1">{result.sources.map((source, index) => <li key={source.url}><a href={source.url} onClick={e => openSource(e, source.url)} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">[{index}] {source.title}</a></li>)}</ul></details>
        </section>}
      </div>}
    </Card>
  );
}
