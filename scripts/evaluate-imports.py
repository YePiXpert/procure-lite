#!/usr/bin/env python3
"""Compare independently annotated source-row IDs, never match by item name."""
import argparse
import json
from decimal import Decimal

VARIANTS = ('old', 'fixed_old', 'new_ocr', 'new_ocr_gpt')


def number(value):
    return None if value is None else Decimal(str(value))


def evaluate(samples, split):
    selected = [s for s in samples if s['split'] == split]
    reports = {}
    for variant in VARIANTS:
        total = missing = numeric = errors = extra = 0
        edits, seconds = [], []
        complete = True
        for sample in selected:
            if variant not in sample['runs']:
                complete = False; continue
            run = sample['runs'][variant]
            actual = {r['sourceRowId']: r for r in run['rows']}
            if len(actual) != len(run['rows']):
                raise ValueError('Duplicate sourceRowId; annotate physical rows independently')
            gold = {r['sourceRowId']: r for r in sample['gold']}
            if len(gold) != len(sample['gold']): raise ValueError('Duplicate gold sourceRowId')
            total += len(gold); extra += len(set(actual)-set(gold))
            for key, row in gold.items():
                if key not in actual: missing += 1
                for field in ('quantity', 'unitPrice'):
                    numeric += 1
                    if key not in actual or number(row.get(field)) != number(actual[key].get(field)): errors += 1
            if run.get('humanEdits') is not None: edits.append(run['humanEdits'])
            if run.get('reviewSeconds') is not None: seconds.append(run['reviewSeconds'])
        reports[variant] = {'complete': complete and bool(selected), 'documents': len(selected),
                            'goldRows': total, 'missingRows': missing, 'extraRows': extra,
                            'missingRate': missing / total if total else None,
                            'numericErrorRate': errors / numeric if numeric else None,
                            'humanEdits': sum(edits) if len(edits) == len(selected) and edits else None,
                            'reviewSeconds': sum(seconds) if len(seconds) == len(selected) and seconds else None}
    baseline, new, gpt = (reports[k] for k in ('fixed_old', 'new_ocr', 'new_ocr_gpt'))
    ready = all(r['complete'] for r in reports.values())
    accuracy = ready and baseline['missingRate'] is not None and all(r['missingRate'] is not None and r['missingRate'] <= baseline['missingRate'] and r['numericErrorRate'] <= baseline['numericErrorRate'] for r in (new, gpt))
    improved = any(baseline[k] is not None and gpt[k] is not None and gpt[k] < baseline[k] for k in ('humanEdits', 'reviewSeconds'))
    holdout = sum(s['split'] == 'holdout' for s in samples)
    sample_gate = 30 <= len(samples) <= 50 and holdout * 3 >= len(samples)
    return {'split': split, 'variants': reports, 'sampleGate': sample_gate,
            'accuracyGate': accuracy, 'humanBenefitGate': improved,
            'effectAccepted': split == 'holdout' and sample_gate and accuracy and improved,
            'note': 'Does not replace interface, resource, backup or deployment acceptance.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest'); parser.add_argument('--split', choices=['development', 'holdout'], default='holdout')
    args = parser.parse_args()
    with open(args.manifest) as file: samples = json.load(file)
    print(json.dumps(evaluate(samples, args.split), ensure_ascii=False, indent=2))
