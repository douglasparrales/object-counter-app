"""Measure actual API photo and scan routes; report errors, never fix totals."""
import argparse
import base64
import io
import json
from pathlib import Path
import requests
from PIL import Image, ImageOps
from classroom_experiment import ROOT, WORK, save, iou


def checked(response):
    response.raise_for_status()
    return response.json()


def run(base, name, only=None):
    destination=WORK/name
    destination.mkdir(exist_ok=False)
    records=[]
    annotations=json.loads((WORK/'annotations.json').read_text(encoding='utf-8'))
    cases=[(f'mouse_{i:02d}','mouse') for i in range(5)]
    cases += [(key,'mouse') for key in ('mouse_05','mouse_06') if key in annotations]
    cases += [('photo_00','mouse'),('photo_05','monitor'),('photo_06','monitor')]
    cases += [(key,'keyboard') for key in annotations if key.startswith('keyboard_')]
    if only is not None:cases=[case for case in cases if case[0] in only]
    for key,target in cases:
        item=annotations[key];original=ROOT/item['source']
        cls={'monitor':0,'mouse':1,'keyboard':2}[target]
        boxes=[b[1:] for b in item['boxes'] if b[0]==cls]
        expected=len(boxes)
        image=ImageOps.exif_transpose(Image.open(original)).convert('RGB')
        x1,y1,x2,y2=max(boxes,key=lambda b:(b[2]-b[0])*(b[3]-b[1]))
        # For the monitor scan choose a complete reference, not the border box.
        if key=='photo_06':x1,y1,x2,y2=206,271,462,425
        selection=dict(seleccion_x=x1/image.width,seleccion_y=y1/image.height,
                       seleccion_w=(x2-x1)/image.width,seleccion_h=(y2-y1)/image.height)
        requested='teclado' if target=='keyboard' else target
        files={'file':('original.jpg',original.read_bytes(),'image/jpeg')}
        photo=checked(requests.post(base+'/count-image',files=files,
            data=dict(objetivo=requested,**selection),timeout=90))
        assert photo['diagnostico']['ruta']=='aula_experimental'
        assert all(o['clase']==target for o in photo['objetos'])
        (destination/(key+'-'+target+'.jpg')).write_bytes(base64.b64decode(photo['imagen_anotada_base64']))
        unmatched=set(range(len(boxes))); matched=0
        for obj in sorted(photo['objetos'],key=lambda o:-o['confianza']):
            detected=[(obj['cx']-obj['w']/2)*image.width,(obj['cy']-obj['h']/2)*image.height,
                      (obj['cx']+obj['w']/2)*image.width,(obj['cy']+obj['h']/2)*image.height]
            score,index=max(((iou(detected,boxes[j]),j) for j in unmatched),default=(0,-1))
            if score>=0.5:matched+=1;unmatched.remove(index)
        record=dict(id=key,target=target,expected=expected,photo_count=photo['total'],
                    photo_correct=photo['total']==expected,route=photo['diagnostico']['ruta'],model_version=photo['diagnostico'].get('modelo_version'),
                    localization=dict(tp=matched,fp=photo['total']-matched,fn=len(unmatched),iou_threshold=0.5))
        if key.startswith('keyboard_') or key in ('mouse_00','mouse_02','mouse_05','mouse_06','photo_05','photo_06'):
            reference=checked(requests.post(base+'/identify',files=files,
                params=dict(prompt=requested,**selection),timeout=90))
            session=checked(requests.post(base+'/scan/sessions',
                params=dict(referencia_id=reference['referencia_id']),timeout=20))['sesion']
            image.thumbnail((1280,1280));encoded=io.BytesIO();image.save(encoded,format='JPEG',quality=80)
            frames=[]
            try:
                for sequence in range(4):
                    frame=checked(requests.post(base+'/detect',files={'file':('frame.jpg',encoded.getvalue(),'image/jpeg')},
                        params=dict(modo='barrido',clase_filtro=reference['clase'],referencia_id=reference['referencia_id'],
                                    sesion=session,secuencia=sequence),timeout=90))
                    assert all(o['clase']==target for o in frame['objetos'])
                    frames.append(dict(total=frame['total'],visible=len(frame['objetos']),state=frame['estado']))
            finally:checked(requests.delete(base+'/scan/sessions/'+session,timeout=20))
            record['scan_frames']=frames;record['scan_correct']=frames[-1]['total']==expected
        records.append(record)
        save(destination/'results.json',dict(cases=records,limitation='HTTP replay, original photos and JPEG80 repeated frames; no physical camera or moving-scene validation.'))
        print(json.dumps(record),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--base',default='http://127.0.0.1:8001');p.add_argument('--name',required=True)
    p.add_argument('--only',nargs='+')
    p.add_argument('--work',type=Path,default=WORK)
    args=p.parse_args();WORK=args.work.resolve();run(args.base,args.name,args.only)
