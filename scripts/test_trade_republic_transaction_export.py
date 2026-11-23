import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


def load_helper():
    event_module = types.ModuleType('pytr.event')
    event_module.Event = type('Event', (), {'from_dict': classmethod(lambda cls, raw: None)})
    event_module.ConditionalEventType = type('ConditionalEventType', (), {'TRADE_INVOICE': object()})
    event_module.tr_event_type_mapping = {}
    for name in ('events_known_ignored', 'events_known_ignored_title', 'events_known_ignored_subtitle'):
        setattr(event_module, name, set())
    transactions = types.ModuleType('pytr.transactions')
    transactions.TransactionExporter = type('TransactionExporter', (), {'from_event': lambda self, event: []})
    main = types.ModuleType('pytr.main')
    main.main = lambda: None
    modules = {'pytr': types.ModuleType('pytr'), 'pytr.event': event_module,
               'pytr.transactions': transactions, 'pytr.main': main}
    source = (Path(__file__).resolve().parents[1] / 'src/app/utils/tradeRepublicTransactionExport.ts').read_text(encoding='utf-8').split('`')[1]
    namespace = {'__name__': 'helper_test'}
    with patch.dict(sys.modules, modules):
        exec(compile(source, 'tradeRepublicTransactionExport', 'exec'), namespace)
    return namespace


class TransactionFieldsTest(unittest.TestCase):
    def test_string_and_other_detail_shapes_do_not_break_export(self):
        helper = load_helper()
        event = types.SimpleNamespace(shares=None, fees=None)
        raw = {'details': {'sections': [{'data': [
            {'title': 'Status', 'detail': 'Ausgeführt'},
            {'title': 'Asset', 'detail': None},
            {'title': 'Other', 'detail': 123},
            {'title': 'Transaktion', 'detail': '1 × 75,659514 €'},
            {'title': 'Entgelt', 'detail': '1,00 €'},
        ]}]}}
        helper['transaction_fields'](raw, event)
        self.assertEqual((event.shares, event.fees, event.finpal_execution_price), (1, 1, 75.659514))

    def test_object_details_and_invalid_sections(self):
        helper = load_helper()
        event = types.SimpleNamespace(shares=None, fees=None)
        helper['transaction_fields']({'details': {'sections': [{'data': [
            {'title': 'Transaction', 'detail': {'text': '2 × 10,50 €'}},
            {'title': 'Fee', 'detail': {'text': '1,00 €'}},
        ]}]}}, event)
        self.assertEqual((event.shares, event.fees, event.finpal_execution_price), (2, 1, 10.5))
        for details in (None, 'unexpected', {'sections': None}):
            helper['transaction_fields']({'details': details}, event)


if __name__ == '__main__':
    unittest.main()
