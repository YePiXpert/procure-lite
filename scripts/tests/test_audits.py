import hashlib
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AuditTests(unittest.TestCase):
    def test_precision_uses_decimal_line_rounding_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / 'test.db'
            with sqlite3.connect(db) as conn:
                conn.executescript('CREATE TABLE Item(id INTEGER,quantity REAL,unitPrice REAL); INSERT INTO Item VALUES(1,1,1.005),(2,1,1.005);')
            before = hashlib.sha256(db.read_bytes()).hexdigest()
            report = load('precision-audit').audit(db)
            self.assertEqual(report['lineRoundedTotal'], '2.02')
            self.assertEqual(report['unroundedTotal'], '2.0100')
            self.assertEqual(hashlib.sha256(db.read_bytes()).hexdigest(), before)

    def test_missing_and_unknown_numbers_cannot_pass_effect_gate(self):
        evaluator = load('evaluate-imports')
        samples = []
        for i in range(30):
            samples.append({'documentId': str(i), 'split': 'holdout' if i < 10 else 'development',
                            'gold': [{'sourceRowId': 'row1', 'quantity': None, 'unitPrice': None}],
                            'runs': {v: {'rows': [{'sourceRowId': 'row1', 'quantity': None, 'unitPrice': None}],
                                         'humanEdits': 1 if v == 'new_ocr_gpt' else 2, 'reviewSeconds': None} for v in evaluator.VARIANTS}})
        self.assertTrue(evaluator.evaluate(samples, 'holdout')['effectAccepted'])
        samples[0]['runs']['new_ocr_gpt']['rows'][0]['quantity'] = 1
        self.assertFalse(evaluator.evaluate(samples, 'holdout')['effectAccepted'])
        del samples[0]['runs']['new_ocr_gpt']
        self.assertFalse(evaluator.evaluate(samples, 'holdout')['effectAccepted'])


if __name__ == '__main__': unittest.main()
