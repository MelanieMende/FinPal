import { useState } from 'react';
import { Button } from '@blueprintjs/core';
import { resolveAcquisitionHistory, depotHistoryKey, hasAssetHistoryOverride, validAssetInvestorFacts, validCustody, validFactDate,
  type AssetInvestorFacts, type CustodyFact, type InvestorFacts, type DepotHistoryConfirmation, type HistoryCoverage } from '../../../../utils/investorFacts';

const input = 'mt-1 w-full rounded border border-white/15 bg-slate-900 px-2 py-1 text-sm text-white';
const numberValue = (v: string) => v.trim() ? Number(v.replace(',', '.')) : null;

function CustodyFields({ value, onChange }: { value: CustodyFact; onChange: (v: CustodyFact) => void }) {
  const [fee, setFee] = useState(value.orderFeeEUR === null ? '' : String(value.orderFeeEUR));
  return <div className="analysis-fields">
    <label>Verwahrungsart<select className={input} value={value.kind} onChange={e => { setFee(''); onChange({ ...value, kind: e.target.value as CustodyFact['kind'], orderFeeEUR: null }); }}>
      <option value="broker">Broker / Anbieter</option><option value="self-custody">Eigene Wallet</option>
      <option value="mixed">Mehrere Verwahrorte</option><option value="unknown">Unbekannt</option>
    </select></label>
    <label>Verwahranbieter / Wallet<input className={input} maxLength={200} value={value.provider}
      onChange={e => { setFee(''); onChange({ ...value, provider: e.target.value, orderFeeEUR: null }); }} /></label>
    <label>Gebühr je regulärer Order (EUR)<input className={input} inputMode="decimal" value={fee} placeholder="Unbekannt"
      onChange={e => { setFee(e.target.value); onChange({ ...value, orderFeeEUR: numberValue(e.target.value) }); }} /></label>
  </div>;
}

function AssetFactsEditor({ asset, facts, transactions, depotHistories, onSave }: {
  asset: Asset; facts: AssetInvestorFacts; transactions: Transaction[]; depotHistories: InvestorFacts['depotHistories']; onSave: (v: AssetInvestorFacts) => void;
}) {
  const [draft, setDraft] = useState(facts);
  const [target, setTarget] = useState(facts.targetWeight ? String(facts.targetWeight.percent) : '');
  const [minimum, setMinimum] = useState(facts.targetWeight ? String(facts.targetWeight.minPercent) : '');
  const [maximum, setMaximum] = useState(facts.targetWeight ? String(facts.targetWeight.maxPercent) : '');
  const [error, setError] = useState('');
  const history = resolveAcquisitionHistory(asset, transactions, draft, depotHistories);
  function save() {
    const timestamp = new Date().toISOString();
    const targetWeight = [target, minimum, maximum].some(v => v.trim())
      ? { percent: numberValue(target)!, minPercent: numberValue(minimum)!, maxPercent: numberValue(maximum)! } : null;
    const historyCoverageDepots = hasAssetHistoryOverride(draft) ? [...new Set([depotHistoryKey(draft.custody.provider),
      ...transactions.filter(t => t.asset_ID === asset.ID).map(t => depotHistoryKey(t.depot ?? ''))].filter(Boolean))] : undefined;
    const next = { ...draft, targetWeight, confirmedAt: timestamp, historyCoverageDepots,
      custody: { ...draft.custody, source: 'user-confirmed' as const, confirmedAt: timestamp } };
    if (!validAssetInvestorFacts(next)) { setError('Bitte Verwahranbieter und Gebühren prüfen. Für ein Zielgewicht sind Ziel, Unter- und Obergrenze zwischen 0 und 100 erforderlich: Untergrenze ≤ Ziel ≤ Obergrenze.'); return; }
    setError(''); onSave(next);
  }
  return <details className="rounded border border-white/10 p-3" data-testid={`investor-facts-${asset.ID}`}>
    <summary className="cursor-pointer font-bold text-white">{asset.name || `Asset ${asset.ID}`} · {facts.custody.provider || 'Verwahrung unbekannt'}</summary>
    <div className="mt-3 space-y-3">
      <CustodyFields value={draft.custody} onChange={custody => setDraft({ ...draft, custody })} />
      <div className="analysis-fields">
        <label>Transaktionshistorie<select className={input} value={hasAssetHistoryOverride(draft) ? draft.historyCoverage : 'inherit'} onChange={e => setDraft({ ...draft,
          historyCoverageOverride: e.target.value !== 'inherit', historyCoverage: e.target.value === 'inherit' ? 'unknown' : e.target.value as HistoryCoverage })}>
          <option value="inherit">Depotbestätigung übernehmen</option>
          <option value="unknown">Ausnahme: Vollständigkeit unbestätigt</option><option value="complete">Ausnahme: vollständig, einschließlich anderer Anbieter / Überträge</option>
          <option value="incomplete">Unvollständig / Überträge fehlen</option>
        </select></label>
        <label>Sonderaktivitäten<select className={input} value={draft.specialActivities} onChange={e => setDraft({ ...draft, specialActivities: e.target.value as AssetInvestorFacts['specialActivities'] })}>
          <option value="unknown">Unbekannt</option><option value="none">Keine</option><option value="staking">Staking</option><option value="lending">Lending</option><option value="mixed">Mehrere / sonstige</option>
        </select></label>
        <label>Steuerlicher Kontext (eigene Angabe)<select className={input} value={draft.taxContext} onChange={e => setDraft({ ...draft, taxContext: e.target.value as AssetInvestorFacts['taxContext'] })}>
          <option value="unknown">Ungeklärt</option><option value="private-direct-crypto">Direkt gehaltene Kryptowerte im Privatvermögen</option>
          <option value="security">Wertpapier im Privatvermögen</option><option value="business">Betrieblicher Kontext</option>
        </select></label>
      </div>
      <p className="text-gray-400">Vollständigkeit: {history.coverage === 'complete' ? 'Vollständig' : history.coverage === 'incomplete' ? 'Unvollständig' : 'Unbestätigt'}
        {history.coverageSource === 'depot' ? ' · Depotbestätigung' : history.coverageSource === 'asset' ? ' · Eigene Angabe für dieses Asset' : ''}.</p>
      {!!history.coverageIssues?.length && <p className="text-amber-200">{history.coverageIssues.join(' ')}</p>}
      <p className="m-0 text-gray-400">Erfasst: {history.transactionCount} Transaktionen · Erster Kauf: {history.firstPurchaseDate?.slice(0, 10) ?? 'nicht erfasst'} · Letzter Kauf: {history.lastPurchaseDate?.slice(0, 10) ?? 'nicht erfasst'}.</p>
      <p className={history.reconcilesWithHolding ? 'text-sky-200' : 'text-amber-200'}>{history.reconcilesWithHolding
        ? 'Die erfassten Mengen stimmen mit dem aktuellen Bestand überein. Das bestätigt nicht automatisch die Vollständigkeit.'
        : 'Die erfasste Historie erklärt den aktuellen Bestand nicht vollständig. Fehlende oder ungültige Buchungen / Überträge prüfen.'}</p>
      <p className="text-gray-400">Verbleibende Anschaffungsposten: {history.remainingLots.length} · Zuordnung nach FIFO als Rechenhilfe, keine bestätigte steuerliche Kostenbasis.</p>
      {!!history.remainingLots.length && <details><summary className="cursor-pointer text-indigo-200">Verbleibende Anschaffungsposten anzeigen</summary>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Kaufdatum</th><th>Verbleibende Menge</th><th>Kaufpreis je Einheit</th></tr></thead>
          <tbody>{history.remainingLots.map(lot => <tr key={lot.transactionId}><td>{lot.purchaseDate.slice(0, 10)}</td>
            <td>{lot.quantity.toLocaleString('de-DE', { maximumFractionDigits: 10 })}</td><td>{lot.unitPrice.toLocaleString('de-DE', { maximumFractionDigits: 6 })}</td></tr>)}</tbody>
        </table></div>
      </details>}
      <div className="analysis-fields">
        <label>Zielgewicht (%)<input className={input} inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="Nicht festgelegt" /></label>
        <label>Untergrenze (%)<input className={input} inputMode="decimal" value={minimum} onChange={e => setMinimum(e.target.value)} /></label>
        <label>Obergrenze (%)<input className={input} inputMode="decimal" value={maximum} onChange={e => setMaximum(e.target.value)} /></label>
      </div>
      <p className="text-gray-400">Zielgewichte beziehen sich auf das in FinPal erfasste Gesamtvermögen einschließlich Cash.</p>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <Button small onClick={save}>Angaben für {asset.name || `Asset ${asset.ID}`} speichern</Button>
      {facts.confirmedAt && <p className="text-gray-400">Bestätigt am {new Date(facts.confirmedAt).toLocaleString('de-DE')}</p>}
      {!facts.confirmedAt && facts.custody.source === 'user-confirmed' && <p className="text-gray-400">Verwahranbieter gemäß deiner Angabe vorbelegt; weitere Angaben sind noch unbestätigt.</p>}
    </div>
  </details>;
}

function DepotHistoryEditor({ provider, confirmation, onSave }: {
  provider: string; confirmation?: DepotHistoryConfirmation; onSave: (v: DepotHistoryConfirmation) => void;
}) {
  const [coverage, setCoverage] = useState<HistoryCoverage>(confirmation?.coverage ?? 'unknown');
  return <div className="rounded border border-white/10 p-3 space-y-2" data-testid={`depot-history-${depotHistoryKey(provider)}`}>
    <label className="block">Transaktionshistorie für {provider}<select className={input} value={coverage} onChange={e => setCoverage(e.target.value as HistoryCoverage)}>
      <option value="unknown">Vollständigkeit unbestätigt</option>
      <option value="complete">Vollständige Historie für dieses Depot erfasst</option>
      <option value="incomplete">Historie dieses Depots unvollständig</option>
    </select></label>
    <Button small onClick={() => onSave({ provider, coverage, confirmedAt: new Date().toISOString() })}>Historie für {provider} speichern</Button>
    {confirmation && <p className="text-gray-400">Bestätigt am {new Date(confirmation.confirmedAt).toLocaleString('de-DE')}</p>}
  </div>;
}

export default function InvestorFactsEditor({ facts, assets, transactions, onSave, busy, storageError }: {
  facts: InvestorFacts; assets: Asset[]; transactions: Transaction[]; onSave: (v: InvestorFacts) => boolean; busy: boolean; storageError: string | null;
}) {
  const [country, setCountry] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [defaultCustody, setDefaultCustody] = useState(facts.defaultCustody);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const providers = new Map<string, string>();
  for (const name of [...assets.map(asset => facts.assets[asset.ID]?.custody.provider ?? ''),
    ...transactions.map(transaction => transaction.depot ?? ''), ...Object.values(facts.depotHistories ?? {}).map(v => v.provider)]) {
    if (name.trim()) providers.set(depotHistoryKey(name), name.trim());
  }
  const historyReviews = assets.flatMap(asset => {
    const assetFacts = facts.assets[asset.ID];
    if (!assetFacts) return [];
    const history = resolveAcquisitionHistory(asset, transactions, assetFacts, facts.depotHistories);
    const confirmedComplete = hasAssetHistoryOverride(assetFacts) ? assetFacts.historyCoverage === 'complete'
      : facts.depotHistories?.[depotHistoryKey(assetFacts.custody.provider)]?.coverage === 'complete';
    return confirmedComplete && history.coverage !== 'complete' ? [{ asset, history }] : [];
  });
  function save(next: InvestorFacts) {
    if (onSave(next)) { setError(''); setNotice('Angaben dauerhaft gespeichert. Sie werden bei der nächsten Analyse berücksichtigt.'); }
  }
  function saveResidence() {
    const normalized = country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized) || !validFactDate(validFrom)) { setError('Bitte Steuerland als zweistelligen Ländercode und ein gültiges Gültigkeitsdatum angeben.'); return; }
    const entry = { country: normalized, validFrom, confirmedAt: new Date().toISOString() };
    const taxResidencies = [...facts.taxResidencies.filter(v => v.validFrom !== validFrom), entry].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    if (taxResidencies.length > 50) { setError('Es können höchstens 50 Steuerwohnsitz-Zeiträume gespeichert werden.'); return; }
    save({ ...facts, taxResidencies });
  }
  return <details className="rounded-lg border border-white/10 p-4 text-xs text-gray-300" data-testid="durable-analysis-facts">
    <summary className="cursor-pointer font-bold text-indigo-200">Dauerhafte Angaben für die Analyse</summary>
    <fieldset disabled={busy} className="mt-3 space-y-4 border-0 p-0">
      <p>Die Angaben werden für diese FinPal-Datenbank gespeichert. Bekannte Fakten fließen automatisch in Gesamt- und Einzelanalysen ein.</p>
      <section aria-label="Steuerwohnsitz" className="space-y-2">
        <h6 className="m-0 font-bold text-white">Steuerwohnsitz mit Gültigkeitsbeginn</h6>
        {!facts.taxResidencies.length && <p>Steuerwohnsitz noch nicht bestätigt.</p>}
        {facts.taxResidencies.map(v => <div key={v.validFrom} className="flex flex-wrap items-center gap-3">
          <span>{v.country} · gültig ab {v.validFrom} · bestätigt am {new Date(v.confirmedAt).toLocaleDateString('de-DE')}</span>
          <Button small minimal onClick={() => save({ ...facts, taxResidencies: facts.taxResidencies.filter(entry => entry !== v) })} aria-label={`Steuerwohnsitz ab ${v.validFrom} entfernen`}>Entfernen</Button>
        </div>)}
        <div className="analysis-fields">
          <label>Steuerland (Ländercode)<input className={input} maxLength={2} value={country} placeholder="z. B. DE" onChange={e => setCountry(e.target.value)} /></label>
          <label>Gültig ab<input type="date" className={input} value={validFrom} onChange={e => setValidFrom(e.target.value)} /></label>
        </div>
        <Button small onClick={saveResidence}>Steuerwohnsitz speichern</Button>
        <p className="text-gray-400">Ein neuer Eintrag ergänzt einen Zeitraum. Ein Eintrag mit demselben Beginn ersetzt die frühere Angabe. Bei mehreren gleichzeitigen Steuerwohnsitzen bleibt die Einordnung gesondert zu klären.</p>
      </section>
      <section aria-label="Standardverwahrung" className="space-y-2">
        <h6 className="m-0 font-bold text-white">Standard für neu hinzukommende Assets</h6>
        <CustodyFields value={defaultCustody} onChange={setDefaultCustody} />
        <Button small onClick={() => {
          if (!validCustody(defaultCustody)) { setError('Bitte Standard-Verwahranbieter und Ordergebühr prüfen.'); return; }
          save({ ...facts, defaultCustody: { ...defaultCustody, source: 'default', confirmedAt: new Date().toISOString() } });
        }}>Standard speichern</Button>
        <p className="text-gray-400">Bestehende Asset-Angaben bleiben erhalten. Neue Assets erhalten eine unbestätigte Voreinstellung, die du unten bestätigen oder ändern kannst.</p>
      </section>
      <section aria-label="Vollständigkeit je Depot" className="space-y-2">
        <h6 className="m-0 font-bold text-white">Transaktionshistorie einmal je Depot bestätigen</h6>
        <p>Die Depotbestätigung gilt gemeinsam für die zugehörigen Assets. Einzelne Ausnahmen kannst du unten festlegen. Berücksichtige auch frühere Käufe und Verkäufe sowie Anschaffungsdaten übertragener Bestände.</p>
        {[...providers].map(([key, provider]) => <DepotHistoryEditor key={`${key}-${JSON.stringify(facts.depotHistories?.[key])}`}
          provider={provider} confirmation={facts.depotHistories?.[key]} onSave={confirmation => save({ ...facts,
            depotHistories: { ...facts.depotHistories, [key]: confirmation } })} />)}
        {!!historyReviews.length && <div className="text-amber-200" aria-label="Historienprüfung">
          <p>Für diese Assets ist trotz gespeicherter Bestätigung eine erneute Prüfung nötig:</p>
          <ul className="list-disc pl-4">{historyReviews.map(({ asset, history }) => <li key={asset.ID}>{asset.name || `Asset ${asset.ID}`}: {history.coverageIssues?.join(' ')}</li>)}</ul>
        </div>}
        <p className="text-gray-400">Optional für normale Portfolioanalysen; wichtig für verlässliche steuerliche Aussagen. Neue Depots, unklare Depotzuordnungen, erkennbare Depotwechsel oder Mengenlücken werden gezielt zur Prüfung angezeigt.</p>
      </section>
      <section aria-label="Angaben je Asset" className="space-y-2">
        <h6 className="m-0 font-bold text-white">Angaben je Asset</h6>
        {assets.map(asset => facts.assets[asset.ID] && <AssetFactsEditor key={`${asset.ID}-${JSON.stringify(facts.assets[asset.ID])}`} asset={asset}
          facts={facts.assets[asset.ID]} transactions={transactions} depotHistories={facts.depotHistories} onSave={value => save({ ...facts, assets: { ...facts.assets, [asset.ID]: value } })} />)}
      </section>
      <p className="text-gray-400">Der Spread wird nicht als dauerhafte Tatsache gespeichert. Vor einer Order muss ein aktuelles handelbares Geld-/Brief-Angebot geprüft werden.</p>
      {(error || storageError) && <p role="alert" className="text-red-300">{error || storageError}</p>}
      {notice && <p role="status" className="text-emerald-300">{notice}</p>}
    </fieldset>
  </details>;
}
