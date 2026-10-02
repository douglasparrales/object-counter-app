"""Exercise real photo and live-frame APIs against an explicitly started backend."""
import json
import requests
from monitor_experiment import WORK, save_json


if __name__ == '__main__':
    base = 'http://127.0.0.1:8001'
    assert requests.get(base+'/health', timeout=10).json()['status'] == 'ok'
    photo = (WORK / 'source/photo_05.jpg').read_bytes()
    files = {'file': ('photo.jpg', photo, 'image/jpeg')}
    response = requests.post(base+'/count-image', files=files, data={'objetivo':'monitores'}, timeout=60)
    response.raise_for_status()
    counted = response.json()
    assert counted['total'] == 6, counted['total']
    assert counted['diagnostico']['ruta'] == 'monitor_experimental'
    params = dict(prompt='monitores', seleccion_x=0.04, seleccion_y=0.345, seleccion_w=0.16, seleccion_h=0.16)
    response = requests.post(base+'/identify', params=params, files=files, timeout=60)
    response.raise_for_status()
    reference = response.json()
    response = requests.post(base+'/detect', params=dict(clase_filtro=reference['clase'],
        referencia_id=reference['referencia_id']), files=files, timeout=60)
    response.raise_for_status()
    detected = response.json()
    assert len(detected['objetos']) == 6, len(detected['objetos'])
    result = dict(health='ok', photo_count=counted['total'], photo_diagnostics=counted['diagnostico'],
                  reference_class=reference['clase'], live_visible_count=len(detected['objetos']),
                  limitation='API smoke test on validation photo; not a physical-phone or unique tracking validation.')
    save_json(WORK / 'api-smoke.json', result)
    print(json.dumps(result, indent=2))
