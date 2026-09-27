#!/usr/bin/env python3
"""Read-only Float migration impact report; never rounds or writes the database."""
import argparse
import json
import sqlite3
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


def audit(database):
    connection = sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True)
    connection.execute('PRAGMA query_only=ON')
    changes, old_total, rounded_total, target_total = [], Decimal(0), Decimal(0), Decimal(0)
    for ident, quantity, price in connection.execute('SELECT id,quantity,unitPrice FROM Item ORDER BY id'):
        q = Decimal(str(quantity))
        p = None if price is None else Decimal(str(price))
        rq = q.quantize(Decimal('.000001'), rounding=ROUND_HALF_UP)
        rp = None if p is None else p.quantize(Decimal('.0001'), rounding=ROUND_HALF_UP)
        old = q * p if p is not None else Decimal(0)
        line = old.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        target = (rq * rp).quantize(Decimal('.01'), rounding=ROUND_HALF_UP) if rp is not None else Decimal(0)
        old_total += old; rounded_total += line; target_total += target
        if q != rq or p != rp or old != line or line != target:
            changes.append({'itemId': ident, 'quantity': str(q), 'quantity6': str(rq),
                            'price': None if p is None else str(p), 'price4': None if rp is None else str(rp),
                            'unroundedAmount': str(old), 'lineAmount2': str(line), 'targetAmount2': str(target)})
    connection.close()
    return {'readOnly': True, 'rounding': 'ROUND_HALF_UP, line then sum',
            'unroundedTotal': str(old_total), 'lineRoundedTotal': str(rounded_total),
            'targetPrecisionTotal': str(target_total), 'difference': str(target_total-old_total),
            'affectedRows': len(changes), 'rows': changes}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database')
    args = parser.parse_args()
    print(json.dumps(audit(args.database), ensure_ascii=False, indent=2))
