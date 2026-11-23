// Preserve monetary timeline events that pytr cannot classify so FinPal can
// show them in its existing review list instead of silently dropping them.
export const tradeRepublicTransactionExport = String.raw`
import re
from pytr.event import Event, ConditionalEventType, tr_event_type_mapping, events_known_ignored, events_known_ignored_title, events_known_ignored_subtitle
from pytr.transactions import TransactionExporter
from pytr.main import main

original_parse = Event.from_dict.__func__
original_export = TransactionExporter.from_event
tr_event_type_mapping['IPO_SUBSCRIPTION_ALLOCATION'] = ConditionalEventType.TRADE_INVOICE

def number(text):
    text = str(text).strip().replace(' ', '').replace('\u00a0', '')
    if not re.fullmatch(r'[0-9][0-9.,]*', text):
        return None
    if ',' in text:
        text = text.replace('.', '').replace(',', '.')
    try:
        return float(text)
    except ValueError:
        return None

def transaction_fields(raw, event):
    # Broker overview rows can carry the quantity and unit price together.
    details = raw.get('details')
    sections = details.get('sections', []) if isinstance(details, dict) else []
    if not isinstance(sections, list):
        return
    for section in sections:
        if not isinstance(section, dict) or not isinstance(section.get('data'), list):
            continue
        for item in section['data']:
            if not isinstance(item, dict):
                continue
            title = item.get('title')
            title = title.lower() if isinstance(title, str) else ''
            detail = item.get('detail')
            display = detail.get('displayValue') if isinstance(detail, dict) else None
            text = detail.get('text') if isinstance(detail, dict) else detail
            text = text if isinstance(text, str) else ''
            if title in ('transaktion', 'transaction'):
                combined = text if isinstance(text, str) else ''
                if isinstance(display, dict):
                    combined += ' ' + str(display.get('prefix') or '') + ' ' + str(display.get('value') or '')
                elif isinstance(display, str):
                    combined += ' ' + display
                match = re.search(r'([0-9][0-9.,]*)\s*[×x]\s*([0-9][0-9.,]*)', combined)
                if match:
                    quantity, price = number(match.group(1)), number(match.group(2))
                    if quantity and price:
                        if event.shares is None:
                            event.shares = quantity
                        if abs(event.shares - quantity) < 1e-8:
                            event.finpal_execution_price = price
            if title in ('entgelt', 'gebühr', 'fee') and event.fees is None:
                match = re.search(r'[0-9][0-9.,]*', str(text))
                if match:
                    event.fees = number(match.group())

def parse(cls, raw):
    event = original_parse(cls, raw)
    kind = (raw.get('eventType') or '').upper()
    if event.event_type == ConditionalEventType.TRADE_INVOICE:
        transaction_fields(raw, event)
    details = raw.get('details')
    sections = details.get('sections', []) if isinstance(details, dict) else []
    sections = sections if isinstance(sections, list) else []
    canceled = (raw.get('status') or '').lower() == 'canceled' or any(
        section.get('type') == 'header' and isinstance(section.get('data'), dict)
        and str(section['data'].get('status') or '').lower() == 'canceled'
        for section in sections if isinstance(section, dict)
    )
    if ((event.event_type is None or (kind == 'IPO_SUBSCRIPTION_ALLOCATION' and (not event.shares or event.fees is None or not event.value))) and not canceled and kind not in events_known_ignored
        and raw.get('title') not in events_known_ignored_title
        and raw.get('subtitle') not in events_known_ignored_subtitle
        and (event.isin or event.value)):
        event.finpal_unclassified_type = kind or 'Unbekanntes Ereignis'
        if kind == 'IPO_SUBSCRIPTION_ALLOCATION':
            event.finpal_missing_details = True
    return event

def export(self, event):
    kind = getattr(event, 'finpal_unclassified_type', None)
    if kind:
        yield {'Unclassified': True, 'MissingTradeDetails': getattr(event, 'finpal_missing_details', False), 'Date': event.date.date().isoformat(), 'Type': kind, 'Value': event.value,
               'Note': event.title, 'ISIN': event.isin}
    else:
        for row in original_export(self, event):
            if getattr(event, 'finpal_execution_price', None):
                row['ExecutionPrice'] = event.finpal_execution_price
            yield row

Event.from_dict = classmethod(parse)
TransactionExporter.from_event = export
if __name__ == '__main__':
    main()
`;
