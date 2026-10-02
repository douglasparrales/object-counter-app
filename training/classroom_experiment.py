"""Versioned monitor and mouse experiments; private data remains outside Git."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time

os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')
os.environ.setdefault('YOLO_AUTOINSTALL', 'false')
ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'media-entrenamiento/experimento-aula-v1'
MONITOR = ROOT / 'media-entrenamiento/experimento-monitor'
NAMES = {0: 'monitor', 1: 'mouse'}


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare():
    from PIL import Image, ImageOps, ImageDraw
    dataset = WORK / 'dataset'
    if dataset.exists():
        raise ValueError('Dataset already exists; use a new version instead of overwriting')
    annotations = json.loads((WORK / 'annotations.json').read_text(encoding='utf-8'))
    manifest = []
    for name, item in annotations.items():
        source = ROOT / item['source']
        image = ImageOps.exif_transpose(Image.open(source)).convert('RGB')
        width, height = image.size
        split = item['split']
        assert split in ('train', 'val', 'test')
        target = dataset / 'images' / split / (name + '.jpg')
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, quality=95)
        label = dataset / 'labels' / split / (name + '.txt')
        label.parent.mkdir(parents=True, exist_ok=True)
        rows = []
        draw = ImageDraw.Draw(image)
        for cls, x1,y1,x2,y2 in item['boxes']:
            assert cls in NAMES and 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height, (name, cls,x1,y1,x2,y2)
            rows.append(f'{cls} {(x1+x2)/2/width:.6f} {(y1+y2)/2/height:.6f} {(x2-x1)/width:.6f} {(y2-y1)/height:.6f}')
            color = 'lime' if cls == 0 else 'cyan'
            draw.rectangle((x1,y1,x2,y2),outline=color,width=3)
            draw.text((x1,y1),NAMES[cls],fill=color,stroke_width=1,stroke_fill='black')
        label.write_text('\n'.join(rows),encoding='utf-8')
        (WORK/'review').mkdir(exist_ok=True)
        image.thumbnail((1280,1280)); image.save(WORK/'review'/target.name)
        manifest.append(dict(id=name,source=item['source'],source_sha256=sha(source),split=split,
                             width=width,height=height,image_sha256=sha(target),label_sha256=sha(label)))
    save(WORK/'manifest.json',manifest)
    (WORK/'dataset.yaml').write_text(f'path: {dataset.as_posix()}\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n  0: monitor\n  1: mouse\n',encoding='utf-8')
    print('Prepared',len(manifest),'images')


def train(name, epochs, parent=None, patience=25, learning_rate=0.001):
    import torch
    from ultralytics import YOLO
    torch.set_num_threads(2); torch.set_num_interop_threads(1)
    if not 1 <= epochs <= 100 or (WORK/'runs'/name).exists():
        raise ValueError('Use 1..100 epochs and a new run name')
    monitor_parent = MONITOR/'runs/monitor-cpu-v3/weights/best.pt'
    parent = Path(parent).resolve() if parent else monitor_parent
    original = ROOT/'backend/yolov8n.pt'
    hashes = {str(p.relative_to(ROOT)):sha(p) for p in (parent,original,monitor_parent)}
    snapshot = dict(parent_weights=str(parent.relative_to(ROOT)),protected_weights=hashes,
        names=NAMES,annotations=json.loads((WORK/'annotations.json').read_text(encoding='utf-8')),
        files={str(p.relative_to(WORK)):sha(p) for p in (WORK/'dataset').rglob('*') if p.is_file() and p.suffix in ('.jpg','.txt')},
        limitation='Related scenes/objects; validation is calibration, not independent generalization evidence.')
    save(WORK/(name+'-snapshot.json'),snapshot)
    model=YOLO(str(parent))
    model.add_callback('on_train_start',lambda trainer:torch.set_num_threads(2))
    started=time.monotonic()
    model.train(data=str(WORK/'dataset.yaml'),device='cpu',epochs=epochs,batch=1,imgsz=640,
        workers=0,cache=False,freeze=10,optimizer='AdamW',lr0=learning_rate,nbs=8,patience=patience,
        seed=42,deterministic=True,amp=False,plots=False,mosaic=0,mixup=0,
        degrees=5,translate=0.08,scale=0.3,fliplr=0.5,
        project=str(WORK/'runs'),name=name,exist_ok=False,save=True)
    for p,digest in hashes.items():assert sha(ROOT/p)==digest,'Protected weights changed'
    save(WORK/(name+'-completed.json'),dict(seconds=time.monotonic()-started,
        weights_sha256=sha(WORK/'runs'/name/'weights/best.pt'),protected_weights_unchanged=True))


def iou(a,b):
    inter=max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))
    return inter/max(1,(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-inter)


def evaluate(weights,name,imgsz=640):
    import torch
    from ultralytics import YOLO
    from PIL import Image,ImageDraw
    torch.set_num_threads(2)
    output=WORK/name
    if output.exists():raise ValueError('Evaluation exists; choose a new name')
    output.mkdir()
    model=YOLO(str(weights))
    mapping={62:0,64:1} if len(model.names)==80 else {0:0,1:1}
    assert len(model.names)==80 or model.names==NAMES
    labels=json.loads((WORK/'annotations.json').read_text(encoding='utf-8'))
    records=[]
    for key,item in labels.items():
        image=Image.open(WORK/'dataset/images'/item['split']/(key+'.jpg')).convert('RGB')
        r=model.predict(image,device='cpu',imgsz=imgsz,conf=0.05,iou=0.45,classes=list(mapping),verbose=False)[0]
        boxes=[dict(cls=mapping[int(b.cls[0])],xyxy=[float(v) for v in b.xyxy[0]],confidence=float(b.conf[0])) for b in r.boxes]
        records.append(dict(id=key,split=item['split'],boxes=boxes))
    # Threshold selection uses validation only. Test frames never choose it.
    def metrics(rows,cls,threshold):
        tp=fp=fn=error=exact=0
        for row in rows:
            gt=[b[1:] for b in labels[row['id']]['boxes'] if b[0]==cls]
            unmatched=set(range(len(gt)))
            predictions=[b for b in row['boxes'] if b['cls']==cls and b['confidence']>=threshold]
            for p in sorted(predictions,key=lambda p:-p['confidence']):
                matches=[(iou(p['xyxy'],gt[j]),j) for j in unmatched]
                score,j=max(matches,default=(0,-1))
                if score>=0.5:tp+=1;unmatched.remove(j)
                else:fp+=1
            fn+=len(unmatched); error+=abs(len(predictions)-len(gt));exact+=len(predictions)==len(gt)
        return dict(tp=tp,fp=fp,fn=fn,precision=tp/max(1,tp+fp),recall=tp/max(1,tp+fn),
                    f1=2*tp/max(1,2*tp+fp+fn),count_mae=error/max(1,len(rows)),exact_count=exact,images=len(rows))
    thresholds={};calibration={}
    for cls in NAMES:
        candidates=[(t,metrics([r for r in records if r['split']=='val'],cls,t)) for t in [.15,.25,.35,.45,.55,.65,.7,.75,.85]]
        thresholds[cls]=max(candidates,key=lambda x:(x[1]['f1'],-x[1]['count_mae'],x[0]))[0]
        calibration[NAMES[cls]]=candidates
    summary={split:{NAMES[c]:metrics([r for r in records if r['split']==split],c,thresholds[c]) for c in NAMES} for split in ['train','val','test']}
    for row in records:
        image=Image.open(WORK/'dataset/images'/row['split']/(row['id']+'.jpg')).convert('RGB');draw=ImageDraw.Draw(image)
        row['counts']={NAMES[c]:sum(p['cls']==c and p['confidence']>=thresholds[c] for p in row['boxes']) for c in NAMES}
        for p in row['boxes']:
            if p['confidence']<thresholds[p['cls']]:continue
            color='lime' if p['cls']==0 else 'cyan';draw.rectangle(p['xyxy'],outline=color,width=3)
            draw.text(tuple(p['xyxy'][:2]),f"{NAMES[p['cls']]} {p['confidence']:.2f}",fill=color,stroke_width=1,stroke_fill='black')
        image.thumbnail((1280,1280));image.save(output/(row['id']+'.jpg'))
    save(output/'predictions.json',records)
    save(output/'evaluation.json',dict(weights=str(weights),weights_sha256=sha(Path(weights)),thresholds=thresholds,
        imgsz=imgsz,nms_iou=.45,calibration=calibration,summary=summary,
        limitation='Related scenes and same mouse specimens; not an independent benchmark. Video mouse labels are provisional. No Soft-NMS in this evaluation.'))
    print(json.dumps(dict(thresholds=thresholds,summary=summary),indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','train','evaluate'])
    parser.add_argument('--name');parser.add_argument('--epochs',type=int,default=60);parser.add_argument('--weights',type=Path)
    parser.add_argument('--parent',type=Path);parser.add_argument('--patience',type=int,default=25)
    parser.add_argument('--work',type=Path,default=WORK);parser.add_argument('--learning-rate',type=float,default=0.001)
    parser.add_argument('--imgsz',type=int,default=640)
    args=parser.parse_args()
    WORK=args.work.resolve()
    if WORK.parent != (ROOT/'media-entrenamiento').resolve():parser.error('--work must be inside media-entrenamiento')
    if args.action=='prepare':prepare()
    elif args.action=='train':
        if not args.name:parser.error('--name required')
        train(args.name,args.epochs,args.parent,args.patience,args.learning_rate)
    else:
        if not args.name or not args.weights:parser.error('--name and --weights required')
        evaluate(args.weights,args.name,args.imgsz)
