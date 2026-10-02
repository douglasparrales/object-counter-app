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
        with patch.dict(os.environ,MONITOR_MODEL_PATH='old',CLASSROOM_MODEL_PATH='other',CLASSROOM_KEYBOARD_SOFT_NMS_SIGMA='.5',CLASSROOM_MOUSE_PREVIOUS_PATH='previous',CLASSROOM_PRESERVE_PREVIOUS_MONITOR='1'):
            env=serve_backend.profile_environment('original',{'profiles':{'original':{'kind':'original'}}})
        self.assertNotIn('MONITOR_MODEL_PATH',env)
        self.assertNotIn('CLASSROOM_MODEL_PATH',env)
        self.assertNotIn('CLASSROOM_KEYBOARD_SOFT_NMS_SIGMA',env)
        self.assertNotIn('CLASSROOM_MOUSE_PREVIOUS_PATH',env)
        self.assertNotIn('CLASSROOM_PRESERVE_PREVIOUS_MONITOR',env)

    def test_checksum_and_exclusive_selection(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(serve_backend,'MODELS',Path(tmp)):
            p=Path(tmp)/'model.pt';p.write_bytes(b'checkpoint-fixture')
            profile=dict(kind='classroom',file=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),thresholds={'0':.7,'1':.35,'2':.99},keyboard_soft_nms_sigma=.5)
            manifest={'profiles':{'aula':profile}}
            with patch.dict(os.environ,MONITOR_MODEL_PATH='old'):
                env=serve_backend.profile_environment('aula',manifest)
            self.assertNotIn('MONITOR_MODEL_PATH',env)
            self.assertEqual(env['CLASSROOM_MODEL_PATH'],str(p.resolve()))
            self.assertEqual(env['CLASSROOM_KEYBOARD_CONFIDENCE'],'0.99')
            self.assertEqual(env['CLASSROOM_KEYBOARD_SOFT_NMS_SIGMA'],'0.5')
            p.write_bytes(b'changed')
            with self.assertRaises(ValueError):serve_backend.profile_environment('aula',manifest)

    def test_auxiliary_mouse_checkpoint_is_verified(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(serve_backend,'MODELS',Path(tmp)):
            current=Path(tmp)/'current.pt';current.write_bytes(b'current')
            previous=Path(tmp)/'previous.pt';previous.write_bytes(b'previous')
            profile=dict(kind='classroom',file=current.name,sha256=hashlib.sha256(current.read_bytes()).hexdigest(),
                thresholds={'0':.7,'1':.55,'2':.75},preserve_previous_monitor=True,mouse_previous=dict(file=previous.name,
                    sha256=hashlib.sha256(previous.read_bytes()).hexdigest(),confidence=.85))
            manifest={'profiles':{'aula':profile}}
            env=serve_backend.profile_environment('aula',manifest)
            self.assertEqual(env['CLASSROOM_MOUSE_PREVIOUS_PATH'],str(previous.resolve()))
            self.assertEqual(env['CLASSROOM_MOUSE_PREVIOUS_CONFIDENCE'],'0.85')
            self.assertEqual(env['CLASSROOM_PRESERVE_PREVIOUS_MONITOR'],'1')
            previous.write_bytes(b'wrong version')
            with self.assertRaises(ValueError):serve_backend.profile_environment('aula',manifest)
