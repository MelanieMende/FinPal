import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, H5, Intent, Spinner } from '@blueprintjs/core';
import { useAppSelector, useAppDispatch } from '../../../../hooks';
import { buildAnalysisPositions, validateAnalysisRequest, type InvestmentProfile, type PortfolioAnalysisProgress } from '../../../../utils/portfolioAnalysis';
import type { ChatGptModel, ChatGptStatus } from '../../../../utils/chatGptAuth';
import { analyzePortfolio, setAnalysisOpen, clearAnalysisResult } from '../../../../store/portfolioAnalysis/portfolioAnalysis.reducer';
import { formatSyncTime } from '../../../../utils/syncTimestamps';

export const ANALYSIS_PROFILE_KEY = 'finpal.portfolioAnalysis.profile.v1';
export const ANALYSIS_MODEL_KEY = 'finpal.portfolioAnalysis.model.v1';
type ProfileForm = { goal: string; risk: string; horizonYears: string; buyBudget: string };
const emptyProfile: ProfileForm = { goal: '', risk: '', horizonYears: '', buyBudget: '0' };
const inputClass = 'w-full rounded border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400';
const stageLabels: Record<PortfolioAnalysisProgress['stage'], string> = {
  preparing: 'KI-Verbindung wird vorbereitet',
  research: 'Aktuelle Quellen werden recherchiert',
  analysis: 'Portfolio und Empfehlungen werden analysiert',
  retrying: 'Unterbrochene KI-Anfrage wird einmal erneut versucht',
  correcting: 'Empfehlungen werden korrigiert und erneut geprüft',
  validating: 'Antwort und Quellen werden geprüft',
};
function duration(seconds: number) { return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }
const emptyChatGpt: ChatGptStatus = { connected: false, accounts: [] };

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
  const positions = buildAnalysisPositions(assets);
  const dispatch = useAppDispatch();
  const analysisState = useAppSelector(state => state.portfolioAnalysis);
  const { progress, startedAt, result, resultSnapshot } = analysisState;
  const open = standalone || analysisState.open;
  const setOpen = (value: boolean) => dispatch(setAnalysisOpen(value));
  const [profile, setProfile] = useState<ProfileForm>(readProfile);
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
  const snapshot = JSON.stringify({ positions, profile, priceUpdatedAt });
  const stale = !!result && resultSnapshot !== snapshot;

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

  function analyze() {
    void run(async () => {
      if (!profile.horizonYears.trim() || !profile.buyBudget.trim()) throw new Error('Bitte Anlagedauer und Kaufbudget angeben.');
      const request = {
        provider, model, positions, priceUpdatedAt,
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
    <Card className="glass-card mb-6" data-testid="portfolio-analysis">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <H5 className="m-0 text-sm font-bold text-indigo-300">KI-Portfolio-Analyse</H5>
          <p className="mt-1 mb-0 text-xs text-gray-400">Kauf-, Halte- und Verkaufsvorschläge für dein gesamtes Portfolio mit aktuellen Quellen.</p>
        </div>
        {!standalone && <Button icon="search" intent={Intent.PRIMARY} onClick={toggleOpen} aria-expanded={open} aria-controls="portfolio-analysis-content">
          {open ? 'Analyse schließen' : 'Portfolio analysieren'}
        </Button>}
      </div>
      {progress && <div className="mt-4 flex items-center gap-3 rounded-lg border border-indigo-400/20 bg-indigo-500/10 p-3" aria-label="Laufende Analyse">
        <Spinner size={20} />
        <div>
          <p role="status" className="m-0 text-sm text-indigo-200">{stageLabels[progress.stage]}</p>
          <p className="mt-1 mb-0 text-xs text-gray-300">Laufzeit: {duration(Math.max(0, Math.floor((now - startedAt) / 1000)))} · Letzte Rückmeldung vor {Math.max(0, Math.floor((now - progress.lastActivityAt) / 1000))} s</p>
          <p className="mt-1 mb-0 text-xs text-gray-400">Webrecherche und Analyse können mehrere Minuten dauern. Zeitlimit: 4 Minuten.</p>
        </div>
      </div>}
      {open && <div id="portfolio-analysis-content" className="mt-5 space-y-4">
        <p className="text-xs text-gray-400">Analysiert werden alle {positions.length} gehaltenen Positionen, unabhängig vom aktiven Asset-Type-Filter. Empfehlungen sind eine Entscheidungshilfe und führen keine Trades aus.</p>
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
          <div className="flex gap-2">
            <Button disabled={busy || !secureStorage || !apiKey.trim()} onClick={() => void run(async () => {
              await window.API.savePortfolioAIKey(apiKey); setApiKey(''); await refreshStatus();
            })}>Schlüssel speichern</Button>
            {hasKey && <Button disabled={busy} onClick={() => void run(async () => { await window.API.forgetPortfolioAIKey(); setApiKey(''); await refreshStatus(); })}>Schlüssel entfernen</Button>}
          </div>
        </div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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
          <label className="text-xs text-gray-300">Zusätzliches Kaufbudget (EUR)<input type="text" inputMode="decimal" className={`${inputClass} mt-1`} value={profile.buyBudget} disabled={busy} onChange={e => updateProfile('buyBudget', e.target.value)} /></label>
        </div>
        <p className="text-xs text-gray-400">Beim Start werden Namen, ISINs, Bestände, Kurse, Einstandswerte, Gewinne und Dividenden sowie dein Anlageprofil an OpenAI übertragen. Kurse zuletzt aktualisiert: {formatSyncTime(priceUpdatedAt) ?? 'unbekannt'}.</p>
        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer">Kurswährungen und EUR-Umrechnung</summary>
          <p>Kurswährungen zeigen keine vollständige Währungsrisiko-Allokation. Für Fonds und ETFs fehlen Angaben zu den enthaltenen Anlagen und Absicherungen.</p>
          <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Position</th><th>Originalkurs</th><th>EUR je Währungseinheit</th><th>Quelle / Kurszeit</th><th>FX-Stand / Umrechnung</th></tr></thead>
            <tbody>{positions.map(position => <tr key={position.id} className="border-t border-white/10">
              <td className="py-2 pr-3">{position.name}</td>
              <td className="pr-3">{position.quote ? `${position.quote.originalPrice} ${position.quote.originalCurrency}` : 'Unbekannt'}{position.quote?.unitFactor !== undefined && position.quote.unitFactor !== 1 && <><br />Faktor je erfasster Einheit: {position.quote.unitFactor}</>}</td>
              <td className="pr-3">{position.quote?.fxRateToEUR ?? 'Unbekannt'}</td>
              <td className="pr-3">{position.quote?.source ?? 'Unbekannt'} · {formatSyncTime(position.quote?.quoteAsOf) ?? 'Kurszeit unbekannt'}<br />Abruf: {formatSyncTime(position.quote?.fetchedAt) ?? 'unbekannt'}</td>
              <td>{position.quote?.fxSource ?? (position.quote?.originalCurrency === 'EUR' ? 'Direkter EUR-Kurs' : 'Unbekannt')}<br />{formatSyncTime(position.quote?.fxAsOf) ?? 'Kein FX-Zeitpunkt'} · {formatSyncTime(position.quote?.convertedAt) ?? 'Keine Umrechnung'}<br />FX-Abruf: {formatSyncTime(position.quote?.fxFetchedAt) ?? 'Nicht erforderlich / unbekannt'}</td>
            </tr>)}</tbody></table></div>
          <a href="https://www.exchangerate-api.com" onClick={e => openSource(e, 'https://www.exchangerate-api.com')} target="_blank" rel="noopener noreferrer" className="underline">Wechselkurse von ExchangeRate-API</a>
        </details>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {notice && <p role="status" className="text-sm text-amber-300">{notice}</p>}
        <Button intent={Intent.PRIMARY} loading={analyzing} disabled={busy || !positions.length} onClick={analyze}>Analyse starten</Button>
        {!positions.length && <p className="text-xs text-gray-400">Es sind keine gehaltenen Assets vorhanden.</p>}
        {result && <section aria-label="Analyseergebnis" className="space-y-3 border-t border-white/10 pt-4">
          <p className="text-xs text-gray-400">Analyse vom {formatSyncTime(result.generatedAt)} · {result.model} · Kursstand: {formatSyncTime(result.priceUpdatedAt) ?? 'unbekannt'}</p>
          {stale && <p role="status" className="text-amber-300 text-sm">Portfolio, Kurse oder Anlageprofil haben sich seit dieser Analyse geändert. Bitte neu analysieren.</p>}
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{result.summary}</p>
          {!!result.warnings.length && <ul className="list-disc pl-5 text-xs text-amber-300">{result.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {result.recommendations.map(rec => <article key={rec.assetId} className="rounded-lg border border-white/10 p-4">
              <div className="flex justify-between items-start gap-3"><span className="font-bold text-sm text-white">{assets.find(a => a.ID === rec.assetId)?.name || `Asset ${rec.assetId}`}</span>
                <span className={`text-xs font-bold ${rec.action === 'Kaufen' ? 'text-emerald-400' : rec.action === 'Verkaufen' ? 'text-red-400' : rec.action === 'Prüfen' ? 'text-amber-300' : 'text-indigo-300'}`}>{rec.action}</span>
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{rec.rationale}</p>
              <p className="text-xs text-amber-200 whitespace-pre-wrap">Risiken: {rec.risk}</p>
              <div className="flex flex-wrap gap-2 mt-2">{[...new Set(rec.sourceIndexes)].map(index => <a key={index} href={result.sources[index].url} onClick={e => openSource(e, result.sources[index].url)} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 underline">[{index}] {result.sources[index].title}</a>)}</div>
            </article>)}
          </div>
          <details className="text-xs text-gray-400"><summary className="cursor-pointer">Recherchequellen</summary><ul className="mt-2 space-y-1">{result.sources.map((source, index) => <li key={source.url}><a href={source.url} onClick={e => openSource(e, source.url)} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">[{index}] {source.title}</a></li>)}</ul></details>
        </section>}
      </div>}
    </Card>
  );
}
