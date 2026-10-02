"""Replay app photo/reference/scan requests. Not a physical-camera test."""
import io
import base64
import json
import requests
from PIL import Image
from monitor_experiment import ROOT, WORK, save_json


def checked(response):
    response.raise_for_status()
    return response.json()


if __name__ == '__main__':
    base = 'http://127.0.0.1:8001'
    cases = [('photo_05',6,dict(x=.04,y=.345,w=.16,h=.16)),
             ('photo_06',9,dict(x=.16,y=.29,w=.20,h=.15))]
    reports = []
    manifest = {m['id']: m for m in json.loads((WORK / 'manifest.json').read_text(encoding='utf-8'))}
    for name, expected, selection in cases:
        original = ROOT / 'media-entrenamiento/monitor' / manifest[name]['origin']
        image = Image.open(original).convert('RGB')
        # useDetection.ts limits the long edge to 1280 and requests JPEG quality 0.8.
        # Pillow is an approximation of Expo's encoder, not a byte-identical capture.
        image.thumbnail((1280,1280))
        buffer = io.BytesIO()
        image.save(buffer, format='JPEG', quality=80)
        files = {'file': ('barrido.jpg', buffer.getvalue(), 'image/jpeg')}
        original_files = {'file': ('foto.jpg', original.read_bytes(), 'image/jpeg')}
        selected = {f'seleccion_{key}':value for key,value in selection.items()}
        counted = checked(requests.post(base+'/count-image', files=original_files,
            data=dict(objetivo='monitores', **selected), timeout=60))
        (WORK / f'app-flow-{name}.jpg').write_bytes(base64.b64decode(counted['imagen_anotada_base64']))
        reference = checked(requests.post(base+'/identify', files=original_files,
            params=dict(prompt='monitores', **selected), timeout=60))
        scan = checked(requests.post(base+'/scan/sessions',
            params=dict(referencia_id=reference['referencia_id']), timeout=20))['sesion']
        frames = []
        try:
            for sequence in range(5):
                result = checked(requests.post(base+'/detect', files=files, params=dict(
                    modo='barrido', clase_filtro=reference['clase'], referencia_id=reference['referencia_id'],
                    sesion=scan, secuencia=sequence), timeout=60))
                frames.append(dict(sequence=sequence, total=result['total'], state=result['estado'],
                    visible=len(result['objetos']), confirmed=sum(o['confirmado'] for o in result['objetos'])))
        finally:
            checked(requests.delete(base+'/scan/sessions/'+scan, timeout=20))
        reports.append(dict(image=name, expected=expected, photo_count=counted['total'],
            photo_route=counted['diagnostico']['ruta'], scan_frames=frames))
    output = dict(limitation='Original uploaded photo for photo route; JPEG 80 approximation for scan. Same scene repeated, no physical camera/screen or movement.', cases=reports)
    save_json(WORK / 'app-flow-results.json', output)
    print(json.dumps(output, indent=2))
    for case in reports:
        assert case['photo_count'] == case['expected'], case
        assert case['scan_frames'][-1]['total'] == case['expected'], case
