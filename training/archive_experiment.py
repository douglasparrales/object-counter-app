"""Create and verify a local recovery archive. Does not upload private media."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def archive(experiment, name):
    media = (ROOT/'media-entrenamiento').resolve()
    experiment = Path(experiment).resolve(strict=True)
    if experiment.parent != media or experiment.name == 'backups':
        raise ValueError('Choose an experiment directly inside media-entrenamiento')
    if Path(name).name != name or not name.endswith('.zip'):
        raise ValueError('Archive name must be a filename ending in .zip')
    directory = media/'backups'; directory.mkdir(exist_ok=True)
    destination = directory/name
    # Exclusive creation makes completed archives immutable.
    files = [p for p in experiment.rglob('*') if p.is_file()]
    annotations = experiment/'annotations.json'
    if annotations.exists():
        for item in json.loads(annotations.read_text(encoding='utf-8')).values():
            if 'source' in item:
                source = (ROOT/item['source']).resolve(strict=True)
                if not source.is_relative_to(media):raise ValueError('Source outside private media')
                files.append(source)
    for snapshot in experiment.glob('*-snapshot.json'):
        for relative in json.loads(snapshot.read_text(encoding='utf-8')).get('protected_weights',{}):
            source=(ROOT/relative).resolve(strict=True)
            if not source.is_relative_to(ROOT):raise ValueError('Weights outside project')
            files.append(source)
    files += [p for parent in ('training','docs','backend/services','backend/routes','backend/tests')
              for p in (ROOT/parent).rglob('*') if p.is_file() and p.suffix in ('.py','.md','.ps1','.json')]
    files += [ROOT/'backend/main.py',ROOT/'object-counter-app/eas.json',ROOT/'.gitignore']
    files += [p for p in (ROOT/'backend/models').glob('*') if p.is_file()]
    files += [ROOT/'backend/requirements.txt',ROOT/'backend/constraints-inference.txt']
    files = sorted(set(files))
    hashes = {p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    with zipfile.ZipFile(destination,'x',zipfile.ZIP_DEFLATED,compresslevel=3) as z:
        for p in files:z.write(p,p.relative_to(ROOT).as_posix())
        z.writestr('RECOVERY-MANIFEST.json',json.dumps(hashes,indent=2))
    with zipfile.ZipFile(destination) as z:
        if z.testzip() is not None:raise ValueError('Archive integrity failure')
        for member,digest in hashes.items():
            if hashlib.sha256(z.read(member)).hexdigest()!=digest:raise ValueError('Archive content mismatch')
    result=dict(archive=destination.name,sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                files=len(hashes),scope='Local same-disk recovery archive; copy off-device for protection against disk loss.')
    destination.with_suffix('.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--experiment',type=Path,required=True);p.add_argument('--name',required=True)
    a=p.parse_args();archive(a.experiment,a.name)
