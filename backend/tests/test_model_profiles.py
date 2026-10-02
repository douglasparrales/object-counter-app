"""Profiles must be portable and cannot silently select mismatched weights."""
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'training'))
import serve_backend


class ModelProfileTests(unittest.TestCase):
    def test_original_clears_custom_model_environment(self):
        with patch.dict(os.environ,MONITOR_MODEL_PATH='old',CLASSROOM_MODEL_PATH='other'):
            env=serve_backend.profile_environment('original',{'profiles':{'original':{'kind':'original'}}})
        self.assertNotIn('MONITOR_MODEL_PATH',env)
        self.assertNotIn('CLASSROOM_MODEL_PATH',env)

    def test_checksum_and_exclusive_selection(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(serve_backend,'MODELS',Path(tmp)):
            p=Path(tmp)/'model.pt';p.write_bytes(b'checkpoint-fixture')
            profile=dict(kind='classroom',file=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),thresholds={'0':.7,'1':.35})
            manifest={'profiles':{'aula':profile}}
            with patch.dict(os.environ,MONITOR_MODEL_PATH='old'):
                env=serve_backend.profile_environment('aula',manifest)
            self.assertNotIn('MONITOR_MODEL_PATH',env)
            self.assertEqual(env['CLASSROOM_MODEL_PATH'],str(p.resolve()))
            p.write_bytes(b'changed')
            with self.assertRaises(ValueError):serve_backend.profile_environment('aula',manifest)
