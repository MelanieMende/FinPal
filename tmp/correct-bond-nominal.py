import json
import os
import sqlite3
from pathlib import Path

matches = list((Path(os.environ['USERPROFILE']) / 'Dropbox').glob('*/Melle/Development/FinPal/db.sqlite3'))
assert len(matches) == 1, 'Expected one FinPal database'
database = matches[0].resolve(strict=True)
backup = Path(r'C:\Development\FinPal\tmp\db-before-bond-nominal-correction-2026-10-05.sqlite3')
assert not backup.exists(), 'Backup already exists; refusing to overwrite'
with sqlite3.connect(database) as con:
    rows = con.execute('SELECT transaction_ID,asset_ID,isin,nominal,currency,accrued_interest_eur FROM bond_transaction_details WHERE transaction_ID IN (112,113) ORDER BY transaction_ID').fetchall()
    assert rows == [(112, 30, 'US912810SQ22', 0.19, 'USD', 0.0), (113, 30, 'US912810SQ22', 79.81, 'USD', -0.17)], rows
    with sqlite3.connect(backup) as backup_con:
        con.backup(backup_con)
    with con:
        changed = con.execute("UPDATE bond_transaction_details SET nominal=? WHERE transaction_ID=? AND asset_ID=? AND isin=? AND nominal=? AND currency=?", (179.81, 113, 30, 'US912810SQ22', 79.81, 'USD')).rowcount
        assert changed == 1
    updated = con.execute('SELECT transaction_ID,nominal,currency,accrued_interest_eur FROM bond_transaction_details WHERE transaction_ID IN (112,113) ORDER BY transaction_ID').fetchall()
    assert sum(row[1] for row in updated) == 180
    assert con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    print(json.dumps({'updated': updated, 'nominalTotalUSD': 180, 'backup': str(backup)}))
