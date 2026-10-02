"""Portable launcher for the models shipped with the repository."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT/'backend/models'


def profile_environment(profile, manifest=None):
    manifest = manifest or json.loads((MODELS/'profiles.json').read_text(encoding='utf-8'))
    selected = manifest['profiles'][profile]
    env = os.environ.copy()
    # Profiles are mutually exclusive, independent of leftover terminal settings.
    for name in ('MONITOR_MODEL_PATH','CLASSROOM_MODEL_PATH','MONITOR_CONFIDENCE',
                 'MONITOR_IMGSZ','CLASSROOM_MONITOR_CONFIDENCE','CLASSROOM_MOUSE_CONFIDENCE','CLASSROOM_KEYBOARD_CONFIDENCE','CLASSROOM_KEYBOARD_SOFT_NMS_SIGMA','CLASSROOM_MOUSE_PREVIOUS_PATH','CLASSROOM_MOUSE_PREVIOUS_CONFIDENCE','CLASSROOM_PRESERVE_PREVIOUS_MONITOR'):
        env.pop(name,None)
    env.update(OMP_NUM_THREADS='2',MKL_NUM_THREADS='2')
    if selected['kind'] == 'original':
        return env
    path = (MODELS/selected['file']).resolve(strict=True)
    if not path.is_relative_to(MODELS.resolve()):raise ValueError('Model path outside model directory')
    if hashlib.sha256(path.read_bytes()).hexdigest()!=selected['sha256']:
        raise ValueError('Model checksum mismatch; restore the version shipped with this profile')
    if selected['kind']=='monitor':
        env.update(MONITOR_MODEL_PATH=str(path),MONITOR_CONFIDENCE=str(selected['confidence']),MONITOR_IMGSZ='640')
    elif selected['kind']=='classroom':
        env.update(CLASSROOM_MODEL_PATH=str(path),CLASSROOM_MONITOR_CONFIDENCE=str(selected['thresholds']['0']),
                   CLASSROOM_MOUSE_CONFIDENCE=str(selected['thresholds']['1']),
                   CLASSROOM_KEYBOARD_CONFIDENCE=str(selected['thresholds'].get('2',0.5)))
        if selected.get('mouse_previous'):
            previous=selected['mouse_previous']
            old_path=(MODELS/previous['file']).resolve(strict=True)
            if not old_path.is_relative_to(MODELS.resolve()) or hashlib.sha256(old_path.read_bytes()).hexdigest()!=previous['sha256']:
                raise ValueError('Previous mouse checkpoint path or checksum mismatch')
            env.update(CLASSROOM_MOUSE_PREVIOUS_PATH=str(old_path),CLASSROOM_MOUSE_PREVIOUS_CONFIDENCE=str(previous['confidence']))
        if selected.get('preserve_previous_monitor'):
            env['CLASSROOM_PRESERVE_PREVIOUS_MONITOR']='1'
        if selected.get('keyboard_soft_nms_sigma') is not None:
            env['CLASSROOM_KEYBOARD_SOFT_NMS_SIGMA']=str(selected['keyboard_soft_nms_sigma'])
    else:raise ValueError('Unknown model profile')
    return env


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--profile',choices=['original','monitores','aula','aula-anterior'],default='aula')
    parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=8000)
    parser.add_argument('--check',action='store_true',help='Verify bundled weights without starting the server')
    args=parser.parse_args()
    env=profile_environment(args.profile)
    if args.check:
        print('Profile verified:',args.profile)
    else:
        raise SystemExit(subprocess.call([sys.executable,'-m','uvicorn','main:app','--host',args.host,'--port',str(args.port)],
                                         cwd=ROOT/'backend',env=env))
