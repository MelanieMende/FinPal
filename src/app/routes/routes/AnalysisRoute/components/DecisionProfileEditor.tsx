import React from 'react';
import { decisionMoneyFields, type DecisionForm } from '../../../../utils/decisionProfile';

const fieldClass = 'w-full min-w-0 rounded border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400';

export default function DecisionProfileEditor({ value = {}, onChange, busy }: { value?: DecisionForm; onChange: (value?: DecisionForm) => void; busy: boolean }) {
  const lossUnit = value.lossCapacityUnit ?? (value.lossCapacityPercent !== undefined ? 'percent' : 'EUR');
  const lossKey = lossUnit === 'percent' ? 'lossCapacityPercent' : 'lossCapacityEUR';
  const update = (key: keyof DecisionForm, text: string) => {
    const next = { ...value, [key]: text, confirmedAt: new Date().toISOString() };
    onChange(Object.entries(next).some(([name, entry]) => name !== 'confirmedAt' && entry?.trim()) ? next : undefined);
  };
  return <details className="min-w-0 rounded border border-white/15 p-3 text-xs text-gray-300" data-testid="decision-profile-fields">
    <summary className="cursor-pointer font-bold">Persönliche Entscheidungsgrundlage ergänzen</summary>
    <p>Optional und dauerhaft gespeichert. Leer bedeutet unbekannt; trage 0 ein, wenn ausdrücklich kein Betrag vorliegt. Änderungen machen eine vorhandene Analyse veraltet.</p>
    <div className="analysis-fields decision-fields">
      {Object.entries(decisionMoneyFields).filter(([key]) => key !== 'lossCapacityPercent').map(([key, label]) => key === 'lossCapacityEUR' ? <React.Fragment key={key}>
        <label className="flex min-w-0 flex-col justify-end">Einheit für finanziell tragbaren Verlust
          <select className={`${fieldClass} mt-1`} value={lossUnit} disabled={busy} onChange={event => {
            const next = { ...value, lossCapacityUnit: event.target.value, confirmedAt: new Date().toISOString() };
            delete next.lossCapacityEUR;
            delete next.lossCapacityPercent;
            onChange(next);
          }}>
            <option value="EUR">EUR</option><option value="percent">Prozent des erfassten Portfolios</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col justify-end">{decisionMoneyFields[lossKey]}
          <input className={`${fieldClass} mt-1`} type="number" step="any" min={0} max={lossUnit === 'percent' ? 100 : 1e9}
            value={value[lossKey] ?? ''} disabled={busy} onChange={event => update(lossKey, event.target.value)} />
        </label>
      </React.Fragment> : <label key={key} className="flex min-w-0 flex-col justify-end">{label}
        <input className={`${fieldClass} mt-1`} type="number" step="any" min={key === 'monthlySurplusEUR' ? undefined : 0} max={key === 'tolerableDrawdownPercent' ? 100 : 1e9}
          value={value[key as keyof DecisionForm] ?? ''} disabled={busy} onChange={event => update(key as keyof DecisionForm, event.target.value)} />
      </label>)}
      <label className="flex min-w-0 flex-col justify-end">Anlageerfahrung
        <select className={`${fieldClass} mt-1`} value={value.experience ?? ''} disabled={busy} onChange={event => update('experience', event.target.value)}>
          <option value="">Unbekannt</option><option value="none">Keine</option><option value="basic">Grundkenntnisse</option><option value="experienced">Erfahren</option>
        </select>
      </label>
    </div>
    <p>Die finanzielle Verlusttragfähigkeit kann in EUR oder von 0 bis einschließlich 100 % angegeben werden. Prozent beziehen sich auf das in FinPal erfasste Portfolio einschließlich Cash, ohne externes Vermögen. Beim Wechsel der Einheit wird der bisherige Verlustwert geleert; es erfolgt keine automatische Umrechnung.</p>
    <p>Reserve und zusätzliche Entnahmen werden addiert und für Käufe sowie Gebühren geschützt. Entnahmen nicht nochmals in der Reserve erfassen. Beide Beträge beziehen sich auf die erfasste Liquidität. Externes Vermögen wird weder als Kaufbudget noch als pauschaler Risikoausgleich angerechnet.</p>
    <label className="block min-w-0">Weitere Angaben zu Entnahmen, Verpflichtungen, Erfahrung und Steuerbesonderheiten
      <textarea className={`${fieldClass} mt-1`} rows={3} maxLength={3000} value={value.notes ?? ''} disabled={busy} onChange={event => update('notes', event.target.value)} />
    </label>
    <p>Finanzielle Verlusttragfähigkeit und persönliche Verlusttoleranz sind getrennte Angaben. Sie garantieren keine Verlustbegrenzung. Die lokale Berechnung setzt den Cashschutz um; Verlustangaben und Erfahrung werden für eine spätere qualitative Prüfung gespeichert. Bei einer KI-Analyse werden die Angaben an den gewählten Anbieter zur Beurteilung übertragen; eine lokale Analyse überträgt sie nicht an eine KI.</p>
    {value.confirmedAt && <p>Zuletzt angegeben: {new Date(value.confirmedAt).toLocaleString('de-DE')}</p>}
    <button type="button" className="max-w-full whitespace-normal rounded border border-white/20 px-3 py-2" disabled={busy || !value.confirmedAt} onClick={() => onChange(undefined)}>Ergänzende Angaben löschen</button>
  </details>;
}
