import { useEffect, useRef, useState } from 'react';
import { Button } from '@blueprintjs/core';
import { useAppDispatch, useAppSelector } from '../../../../hooks';
import { isDividendForecastAsset, needsDividendForecast } from '../../../../utils/dividendForecasts';
import { loadDividendForecasts } from '../../../../store/assets/assets.reducer';

export default function DividendForecastStatus() {
  const dispatch = useAppDispatch();
  const assets = useAppSelector(state => state.assets);
  const relevantAssets = assets.filter(isDividendForecastAsset);
  const ids = relevantAssets.map(asset => asset.ID).join(',');
  const failedAssets = relevantAssets.filter(asset => asset.dividendForecastError);
  const [loadingDividends, setLoadingDividends] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{hasApiKey: boolean; secureStorageAvailable: boolean} | null>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  async function perform(action: () => Promise<unknown>, loadsDividends = false) {
    if (running.current) return;
    running.current = true; setBusy(true); setLoadingDividends(loadsDividends); setError(null);
    try { await action(); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Die DivvyDiary-Anfrage ist fehlgeschlagen.'); }
    finally { running.current = false; if (mounted.current) { setBusy(false); setLoadingDividends(false); } }
  }
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const next = window.API.getDivvyDiaryStatus ? await window.API.getDivvyDiaryStatus() : null;
        if (!mounted.current) return;
        setStatus(next);
        if ((next?.hasApiKey || !next) && window.API.sendToDivvyDiaryAPI && relevantAssets.some(needsDividendForecast)) {
          await perform(() => dispatch(loadDividendForecasts({ onlyMissing: true })).unwrap(), true);
        }
      } catch (e) {
        if (mounted.current) setError(e instanceof Error ? e.message : 'Die DivvyDiary-Anfrage ist fehlgeschlagen.');
      }
    })();
    return () => { mounted.current = false; };
  }, [ids]);
  return <div className="mb-3 space-y-3 text-xs">
    <details className="rounded border border-white/10 p-3" open={status?.hasApiKey === false}>
      <summary className="cursor-pointer font-bold text-gray-300">DivvyDiary-Zugang</summary>
      <p className="text-gray-400">DivvyDiary verlangt für automatische Abrufe einen API-Schlüssel. Er wird lokal verschlüsselt gespeichert und nur an DivvyDiary übermittelt.</p>
      <Button small disabled={busy || !window.API.openDivvyDiarySettings} onClick={() => void perform(() => window.API.openDivvyDiarySettings())}>DivvyDiary-Einstellungen öffnen</Button>
      {!window.API.getDivvyDiaryStatus && <p className="text-amber-200">Bitte FinPal vollständig neu starten, um die Schlüsselverwaltung zu laden.</p>}
      {status?.hasApiKey && <p className="text-sky-200">API-Schlüssel gespeichert.</p>}
      {status && !status.secureStorageAvailable && <p className="text-amber-200">Sichere Schlüsselspeicherung ist nicht verfügbar.</p>}
      <label className="mt-3 block text-gray-300">DivvyDiary-API-Schlüssel
        <input type="password" autoComplete="off" className="mt-1 w-full rounded border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white" value={key} disabled={busy || !status?.secureStorageAvailable} onChange={event => setKey(event.target.value)} />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button small disabled={busy || !status?.secureStorageAvailable || !key.trim()} onClick={() => void perform(async () => {
          await window.API.saveDivvyDiaryKey(key);
          if (mounted.current) setKey('');
          const next = await window.API.getDivvyDiaryStatus();
          if (mounted.current) setStatus(next);
          if (ids) {
            if (mounted.current) setLoadingDividends(true);
            await dispatch(loadDividendForecasts()).unwrap();
          }
        })}>Schlüssel speichern und laden</Button>
        {status?.hasApiKey && <Button small disabled={busy} onClick={() => void perform(async () => {
          await window.API.forgetDivvyDiaryKey();
          const next = await window.API.getDivvyDiaryStatus();
          if (mounted.current) { setStatus(next); setKey(''); }
        })}>Schlüssel entfernen</Button>}
      </div>
    </details>
    <Button small loading={loadingDividends} disabled={busy || !ids || status?.hasApiKey === false} onClick={() => void perform(() => dispatch(loadDividendForecasts()).unwrap(), true)}>Dividenden aktualisieren</Button>
    {loadingDividends && <p role="status" className="text-sky-200">DivvyDiary-Anfrage wird verarbeitet.</p>}
    {error && <p role="alert" className="text-amber-200">{error}</p>}
    {failedAssets.length > 0 && <div role="alert" className="rounded border border-amber-400/30 bg-amber-500/10 p-3 text-amber-200">
      <p className="m-0 font-bold">{failedAssets.length === relevantAssets.length ? 'Dividendendaten konnten nicht aktualisiert werden.' : 'Dividendendaten konnten teilweise nicht aktualisiert werden.'}</p>
      {failedAssets.map(asset => <p key={asset.ID} className="mb-0">{asset.name || asset.isin || ('Asset ' + asset.ID)}: {asset.dividendForecastError}</p>)}
      <p className="mb-0">Bereits geladene Zahlungen bleiben sichtbar. Eine leere Liste bestätigt nicht, dass keine Dividenden anstehen.</p>
    </div>}
    <p className="m-0 text-gray-400">Voraussichtliche Bruttozahlungen anhand der bekannten Termine und Bestände.</p>
  </div>;
}
