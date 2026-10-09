import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, DialogBody, DialogFooter, OverlaysProvider } from '@blueprintjs/core';
import { validateTradeDraft, type TradeDraft, type TradePreview, type TradeReceipt, type TradingStatus } from '../../../../utils/tradeRepublicTrading';
const eur = (value: number | null) => value === null ? 'Nicht bestätigt' : new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'}).format(value);
const number = (value: string) => Number(value.trim().replace(',', '.'));
export default function TradeRepublicTradeDialog({assets}: {assets: Asset[]}) {
  const eligible = assets.filter(asset => ['Stock', 'ETF'].includes(asset.type) && /^[A-Z]{2}[A-Z0-9]{10}$/.test(asset.isin || ''));
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<TradingStatus>({state: 'disconnected', requiresCode: false, accounts: []});
  const [assetId, setAssetId] = useState('');
  const asset = eligible.find(item => String(item.ID) === assetId) ?? eligible[0];
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [method, setMethod] = useState<'amount' | 'shares'>('amount');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [limit, setLimit] = useState('');
  const [execution, setExecution] = useState<'best-price' | 'direct'>('best-price');
  const [exchange, setExchange] = useState('LSX');
  const [accountNumber, setAccountNumber] = useState('');
  const account = status.accounts.find(a => a.securitiesAccountNumber === accountNumber) ?? status.accounts[0];
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<TradePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<TradeReceipt | null>(null);
  const [orders, setOrders] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!open) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [open]);
  async function perform(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null);
    try { await action(); } catch (e) { if (mounted.current) { setError(e instanceof Error ? e.message : 'Trade-Republic-Anfrage fehlgeschlagen.'); try { const next = await window.API.getTradeRepublicTradingStatus?.(); if (next && mounted.current) setStatus(next); } catch { /* Keep the actionable original error. */ } } }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  function invalidate() { setPreview(null); setConfirmed(false); }
  const expiresAt = preview ? Date.parse(preview.expiresAt) : NaN;
  const expired = !!preview && (!Number.isFinite(expiresAt) || now >= expiresAt);
  const remainingSeconds = preview && !expired ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const confirmationBlockedReason = busy ? 'Bitte warten, die Broker-Anfrage läuft noch.' : expired ? 'Bestätigung gesperrt: Die Vorschau ist abgelaufen. Bitte die Vorschau erneuern.' : preview?.blockers.length ? 'Bestätigung gesperrt: Zuerst die oben angezeigten Brokerhinweise beheben und die Vorschau erneuern.' : null;
  async function loadPreview() {
    if (!asset || !account || receipt) return;
    const draft = validateTradeDraft({isin: asset.isin, assetType: asset.type as TradeDraft['assetType'], side, ...(method === 'amount' ? {method: 'amount' as const, amountEUR: number(amount)} : {quantity: number(quantity), limit: number(limit)}), exchange: execution === 'best-price' ? 'TIB' : exchange, accountNumber: account.securitiesAccountNumber});
    invalidate(); const next = await window.API.previewTradeRepublicOrder(draft); if (mounted.current) { setPreview(next); setNow(Date.now()); }
  }
  return <>
    <Button icon="exchange" onClick={() => { setOpen(true); void perform(async () => {
      if (!window.API.getTradeRepublicTradingStatus) throw new Error('Bitte FinPal vollständig neu starten, um den Handel zu laden.');
      const next = await window.API.getTradeRepublicTradingStatus(); if (mounted.current) setStatus(next);
    }); }}>Trade Republic handeln</Button>
    <OverlaysProvider><Dialog isOpen={open} onClose={() => { if (!busy) setOpen(false); }} canEscapeKeyClose={!busy} canOutsideClickClose={false} title="Trade Republic · Kaufen / Verkaufen" className="bp5-dark" style={{width: 620}}>
      <DialogBody className="space-y-4">
        <p className="text-sky-200">Experimenteller direkter Handel. Aktien und ETFs: Euro-Beträge als Market-Orders oder ganze Anteile mit tagesgültigem Limit. Anmeldung kann eine Bestätigung in der Trade-Republic-App erfordern.</p>
        {status.state === 'disconnected' && <Button disabled={busy} loading={busy} onClick={() => void perform(async () => { const next = await window.API.connectTradeRepublicTrading(); if (mounted.current) setStatus(next); })}>Mit Trade Republic verbinden</Button>}
        {status.state === 'confirmation-required' && <div>
          <p>Bitte die Anmeldung in der Trade-Republic-App bestätigen.</p>
          {status.requiresCode && <label>Authenticator-Code<input aria-label="Authenticator-Code" type="password" autoComplete="off" value={code} disabled={busy} onChange={e => setCode(e.target.value)} /></label>}
          <Button disabled={busy} loading={busy} onClick={() => void perform(async () => { try { const next = await window.API.connectTradeRepublicTrading(code); if (mounted.current) setStatus(next); } finally { if (mounted.current) setCode(''); } })}>Anmeldung bestätigt</Button>
        </div>}
        {status.state === 'connected' && <>
          <p className="text-sky-200">Mit Trade Republic verbunden.</p>
          <fieldset disabled={busy || !!receipt} className="grid grid-cols-2 gap-3 border-0 p-0">
            <label className="col-span-2">Wertpapier<select aria-label="Wertpapier" className="block w-full bg-slate-800 p-2" value={asset ? String(asset.ID) : ''} onChange={e => { setAssetId(e.target.value); invalidate(); }}>{eligible.map(a => <option key={a.ID} value={a.ID}>{a.name} ({a.isin})</option>)}</select></label>
            <label>Aktion<select aria-label="Aktion" className="block w-full bg-slate-800 p-2" value={side} onChange={e => { setSide(e.target.value as 'buy' | 'sell'); invalidate(); }}><option value="buy">Kaufen</option><option value="sell">Verkaufen</option></select></label>
            <label>Wertpapierkonto<select aria-label="Wertpapierkonto" className="block w-full bg-slate-800 p-2" value={account?.securitiesAccountNumber || ''} onChange={e => { setAccountNumber(e.target.value); invalidate(); }}>{status.accounts.map(a => <option key={a.securitiesAccountNumber} value={a.securitiesAccountNumber}>Konto …{a.securitiesAccountNumber.slice(-4)} (EUR)</option>)}</select></label>
            <label className="col-span-2">Eingabe<select aria-label="Eingabe" className="block w-full bg-slate-800 p-2" value={method} onChange={e => { setMethod(e.target.value as 'amount' | 'shares'); invalidate(); }}><option value="amount">Betrag (EUR)</option><option value="shares">Ganze Anteile mit Limit</option></select></label>
            {method === 'amount' ? <label className="col-span-2">Betrag (EUR)<input aria-label="Betrag (EUR)" inputMode="decimal" className="block w-full bg-slate-800 p-2" value={amount} onChange={e => { setAmount(e.target.value); invalidate(); }} /><span className="text-sky-200">Ab 1 EUR, ohne Gebühren und Steuern. Bruchstücke möglich. Ausführung zum Marktpreis; Kurs und tatsächliche Anteile können abweichen.</span></label> : <>
            <label>Ganze Anteile<input aria-label="Ganze Anteile" inputMode="numeric" className="block w-full bg-slate-800 p-2" value={quantity} onChange={e => { setQuantity(e.target.value); invalidate(); }} /></label>
            <label>Limit je Anteil (EUR)<input aria-label="Limit je Anteil (EUR)" inputMode="decimal" className="block w-full bg-slate-800 p-2" value={limit} onChange={e => { setLimit(e.target.value); invalidate(); }} /></label></>}
            <label>Ausführung<select aria-label="Ausführung" className="block w-full bg-slate-800 p-2" value={execution} onChange={e => { setExecution(e.target.value as 'best-price' | 'direct'); invalidate(); }}><option value="best-price">Bestpreis (automatisch)</option><option value="direct">Direktpreis (Handelsplatz wählen)</option></select></label>
            {execution === 'direct' && <label>Handelsplatz<select aria-label="Handelsplatz" className="block w-full bg-slate-800 p-2" value={exchange} onChange={e => { setExchange(e.target.value); invalidate(); }}>{['LSX', 'TDG', 'TIB', 'XETR', 'XMIL', 'XPAR', 'XWBO'].map(value => <option key={value}>{value}</option>)}</select></label>}
            <p>{method === 'amount' ? 'Market-Order' : 'Limit-Order'} · Gültigkeit: heute</p>
          </fieldset>
          <Button disabled={busy || !asset || !account || !!receipt} loading={busy} onClick={() => void perform(loadPreview)}>Ordervorschau laden</Button>
          {preview && <div className="space-y-2 rounded border border-white/15 p-3">
            <p className="font-bold">{preview.draft.side === 'buy' ? 'Kaufen' : 'Verkaufen'}: {preview.draft.method === 'amount' ? eur(preview.draft.amountEUR) : preview.draft.quantity + ' Anteile'} · {preview.draft.isin} · {preview.draft.exchange === 'TIB' ? 'Bestpreis (automatisch)' : 'Direktpreis: ' + preview.draft.exchange}</p>
            {preview.draft.method === 'amount' ? <p>Market-Order · Geschätzte Anteile: {preview.estimatedShares ?? 'Nicht bestätigt'}<br/>Ausführung zum Marktpreis, ohne Preislimit.</p> : <p>Limit: {eur(preview.draft.limit)} je Anteil · tagesgültig</p>}
            <p>Aktueller {preview.draft.side === 'buy' ? 'Kaufkurs' : 'Verkaufskurs'}: {eur(preview.price)}<br/>Kurszeitpunkt: {preview.quoteAsOf ? new Date(preview.quoteAsOf).toLocaleString('de-DE') : 'Nicht bestätigt'}</p>
            <p>{preview.draft.method === 'amount' ? 'Orderbetrag' : 'Orderwert am Limit'}: {eur(preview.limitValueEUR)}<br/>Brokergebühren: {eur(preview.feesEUR)}<br/>{preview.draft.side === 'buy' ? (preview.draft.method === 'amount' ? 'Betrag inklusive Gebühren' : 'Maximaler Betrag') : (preview.draft.method === 'amount' ? 'Erwarteter Erlös vor Steuern' : 'Erlös am Limit vor Steuern')}: {eur(preview.feesEUR === null ? null : preview.limitValueEUR + (preview.draft.side === 'buy' ? preview.feesEUR : -preview.feesEUR))}</p>
            <p>{preview.draft.side === 'buy' ? ('Verfügbares Broker-Guthaben: ' + eur(preview.cashEUR)) : ('Frei verkaufbare Broker-Anteile: ' + (preview.availableShares ?? 'Nicht bestätigt'))}</p>
            {preview.blockers.map(message => <p role="alert" className="text-amber-200" key={message}>{message}</p>)}
            {!receipt && !expired && <p className="text-sky-200">Vorschau noch {remainingSeconds} Sekunden gültig. Vor dem Absenden werden die Brokerdaten erneut geprüft.</p>}
            {!receipt && confirmationBlockedReason && <p id="trade-confirmation-reason" role="alert" className="text-amber-200">{confirmationBlockedReason}</p>}
            {!receipt && expired && <Button disabled={busy} onClick={() => void perform(loadPreview)}>Vorschau erneuern</Button>}
            {!receipt && <Checkbox checked={confirmed && !expired} disabled={!!confirmationBlockedReason} aria-describedby={confirmationBlockedReason ? 'trade-confirmation-reason' : undefined} onChange={e => {
              if (busy || preview.blockers.length || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) { setConfirmed(false); setNow(Date.now()); return; }
              setConfirmed(e.currentTarget.checked);
            }}>Ich bestätige diese kostenpflichtige {preview.draft.method === 'amount' ? 'Market-Order' : 'Limit-Order'} mit den angezeigten Angaben.</Checkbox>}
            {!receipt && <Button intent={preview.draft.side === 'buy' ? 'success' : 'danger'} disabled={busy || !confirmed || expired || !!preview.blockers.length} loading={busy} onClick={() => void perform(async () => {
              setConfirmed(false); try { const result = await window.API.submitTradeRepublicOrder(preview.id, true); if (mounted.current) setReceipt(result); } finally { if (mounted.current) invalidate(); }
            })}>{preview.draft.side === 'buy' ? 'Kostenpflichtig kaufen' : 'Kostenpflichtig verkaufen'}</Button>}
            {preview.blockers.length > 0 && <details><summary>Broker-Antworten zur Prüfung</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{preview.diagnostics}</pre></details>}
          </div>}
          {receipt && <div role="status" className={receipt.status === 'submitted' ? 'text-sky-200' : 'text-amber-200'}>{receipt.status === 'submitted' ? 'Order übermittelt. Die Ausführung ist noch nicht bestätigt.' : receipt.status === 'rejected' ? (receipt.message || 'Der Broker hat die Order abgelehnt.') : 'Orderstatus unklar. Nicht erneut absenden; zuerst bei Trade Republic prüfen.'}{receipt.orderId && <p>Order-ID: {receipt.orderId}</p>}<p>FinPal bucht erst die später synchronisierte Brokerabrechnung. Lokale Bestände wurden nicht verändert.</p></div>}
          <Button disabled={busy || !account} onClick={() => void perform(async () => { const result = await window.API.getTradeRepublicOrders(account.securitiesAccountNumber); if (mounted.current) { setOrders(JSON.stringify(result, null, 2)); if (receipt) setReceipt(result.receipts.find(item => item.clientProcessId === receipt.clientProcessId) ?? receipt); } })}>Orderstatus prüfen</Button>
          {orders && <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{orders}</pre>}
          {receipt && receipt.status !== 'unknown' && <Button disabled={busy} onClick={() => { setReceipt(null); setOrders(null); invalidate(); }}>Neue Order vorbereiten</Button>}
          <Button minimal disabled={busy} onClick={() => void perform(async () => { await window.API.disconnectTradeRepublicTrading(); if (mounted.current) { setStatus({state: 'disconnected', requiresCode: false, accounts: []}); invalidate(); } })}>Verbindung trennen</Button>
        </>}
          <Button minimal disabled={busy} onClick={() => void perform(async () => { await window.API.disconnectTradeRepublicTrading(true); if (mounted.current) { setStatus({state: 'disconnected', requiresCode: false, accounts: []}); invalidate(); } })}>Sitzung löschen</Button>
        {busy && <p role="status">Trade-Republic-Anfrage läuft.</p>}
        {error && <p role="alert" className="text-amber-200">{error}</p>}
        {!eligible.length && <p>Keine Aktie oder kein ETF mit gültiger ISIN vorhanden.</p>}
      </DialogBody>
      <DialogFooter actions={<Button disabled={busy} onClick={() => setOpen(false)}>Schließen</Button>}/>
    </Dialog></OverlaysProvider>
  </>;
}
