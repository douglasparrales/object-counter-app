"""Local, opt-in monitor experiment. Never overwrites production weights.

Run with the project's yolovenv Python. All private outputs stay under the
gitignored media-entrenamiento/experimento-monitor directory.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import time

os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')
os.environ.setdefault('YOLO_AUTOINSTALL', 'false')
ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'media-entrenamiento' / 'experimento-monitor'


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')


def prepare():
    import cv2
    from PIL import Image, ImageOps
    WORK.mkdir(parents=True, exist_ok=True)
    if (WORK / 'manifest.json').exists():
        raise ValueError('Experiment already prepared; preserve its manifest and annotations')
    images = WORK / 'source'
    images.mkdir(exist_ok=True)
    manifest = []
    for i, path in enumerate(sorted((ROOT / 'media-entrenamiento/monitor').glob('*.jpeg'))):
        name = f'photo_{i:02d}'
        im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
        im.save(images / f'{name}.jpg', quality=95)
        manifest.append(dict(id=name, origin=path.name, width=im.width, height=im.height, kind='photo'))
    for i, path in enumerate(sorted((ROOT / 'media-entrenamiento/monitor').glob('*.mp4'))):
        cap = cv2.VideoCapture(str(path))
        frames, fps = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), cap.get(cv2.CAP_PROP_FPS)
        for j, fraction in enumerate([0.1, 0.35, 0.6, 0.85]):
            frame = int((frames - 1) * fraction)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame)
            ok, bgr = cap.read()
            if not ok:
                raise RuntimeError(f'Cannot read {path.name} frame {frame}')
            name = f'video_{i:02d}_{j:02d}'
            cv2.imwrite(str(images / f'{name}.jpg'), bgr)
            manifest.append(dict(id=name, origin=path.name, frame=frame, seconds=frame/fps,
                                 duration=frames/fps, width=bgr.shape[1], height=bgr.shape[0], kind='video'))
        cap.release()
    save_json(WORK / 'manifest.json', manifest)
    original = ROOT / 'backend/yolov8n.pt'
    copied = WORK / 'baseline-yolov8n.pt'
    if not copied.exists():
        shutil.copy2(original, copied)
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    assert digest(original) == digest(copied), 'Baseline copy differs'
    save_json(WORK / 'baseline-provenance.json', dict(source=str(original), sha256=digest(original)))
    print(json.dumps(manifest, indent=2))


def predict(weights, name, threshold=0.25, imgsz=640, split=None, nms_iou=0.7):
    import torch
    from ultralytics import YOLO
    from PIL import Image, ImageDraw
    torch.set_num_threads(2)
    model = YOLO(str(weights))
    out = WORK / name
    out.mkdir(exist_ok=True)
    records = []
    annotations = json.loads((WORK / 'annotations.json').read_text(encoding='utf-8')) if split else {}
    for path in sorted((WORK / 'source').glob('*.jpg')):
        if split and annotations.get(path.stem, {}).get('split') != split:
            continue
        start = time.monotonic()
        result = model.predict(str(path), imgsz=imgsz, conf=threshold, iou=nms_iou, classes=[62] if len(model.names) == 80 else [0],
                               device='cpu', verbose=False)[0]
        boxes = [dict(xyxy=[round(float(v), 1) for v in b.xyxy[0]], confidence=round(float(b.conf[0]), 4)) for b in result.boxes]
        record = dict(id=path.stem, count=len(boxes), seconds=round(time.monotonic()-start, 3), boxes=boxes)
        records.append(record)
        im = Image.open(path).convert('RGB')
        draw = ImageDraw.Draw(im)
        for j, box in enumerate(boxes):
            coords = box['xyxy']
            draw.rectangle(coords, outline='lime', width=3)
            draw.text((coords[0], coords[1]), f"{j}: {box['confidence']:.2f}", fill='red', stroke_width=1)
        im.thumbnail((960, 720))
        im.save(out / path.name)
        print(path.stem, len(boxes), record['seconds'], flush=True)
    save_json(out / 'predictions.json', records)
    save_json(out / 'settings.json', dict(weights=str(weights), confidence=threshold, imgsz=imgsz, nms_iou=nms_iou, split=split))


def dataset():
    from PIL import Image, ImageDraw
    labels = json.loads((WORK / 'annotations.json').read_text(encoding='utf-8'))
    manifest = {v['id']: v for v in json.loads((WORK / 'manifest.json').read_text(encoding='utf-8'))}
    review = WORK / 'review'
    review.mkdir(exist_ok=True)
    folder = WORK / 'dataset'
    expected = {folder / 'images' / value['split'] / f'{name}.jpg' for name, value in labels.items()}
    stale = set((folder / 'images').rglob('*.jpg')) - expected
    if stale:
        raise ValueError(f'Stale exported images; use a fresh dataset directory after review: {stale}')
    for name, annotation in labels.items():
        meta = manifest[name]
        width, height = meta['width'], meta['height']
        split = annotation['split']
        assert split in ('train', 'val', 'test')
        folder = WORK / 'dataset'
        (folder / 'images' / split).mkdir(parents=True, exist_ok=True)
        (folder / 'labels' / split).mkdir(parents=True, exist_ok=True)
        source = WORK / 'source' / f'{name}.jpg'
        shutil.copy2(source, folder / 'images' / split / source.name)
        rows = []
        im = Image.open(source).convert('RGB')
        draw = ImageDraw.Draw(im)
        for index, (x1, y1, x2, y2) in enumerate(annotation['boxes']):
            assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height, (name, index)
            rows.append(f'0 {(x1+x2)/2/width:.6f} {(y1+y2)/2/height:.6f} {(x2-x1)/width:.6f} {(y2-y1)/height:.6f}')
            draw.rectangle((x1,y1,x2,y2), outline='lime', width=3)
            draw.text((x1,y1), str(index+1), fill='red', stroke_width=1)
        (folder / 'labels' / split / f'{name}.txt').write_text('\n'.join(rows), encoding='utf-8')
        im.thumbnail((960,720))
        im.save(review / f'{name}.jpg')
    (WORK / 'dataset.yaml').write_text(f'path: {folder.as_posix()}\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n  0: monitor\n', encoding='utf-8')
    print('Dataset exported:', len(labels), 'images')


def train(epochs, name, imgsz=416):
    import torch
    from ultralytics import YOLO
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    if epochs < 1 or epochs > 100:
        raise ValueError('Local experiment supports 1..100 epochs per run')
    run = WORK / 'runs' / name
    if run.exists():
        raise ValueError('Choose a new run name; existing experiments are immutable')
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    baseline_hash = digest(ROOT / 'backend/yolov8n.pt')
    if baseline_hash != digest(WORK / 'baseline-yolov8n.pt'):
        raise ValueError('Baseline copy differs from original')
    # Save the exact annotations and file hashes used by this run.
    snapshot = WORK / f'{name}-dataset-snapshot.json'
    save_json(snapshot, dict(baseline_sha256=baseline_hash,
        annotations=json.loads((WORK / 'annotations.json').read_text(encoding='utf-8')),
        files={str(p.relative_to(WORK)): digest(p) for p in sorted((WORK / 'dataset').rglob('*')) if p.is_file() and p.suffix in ('.jpg','.txt')}))
    model = YOLO(str(WORK / 'baseline-yolov8n.pt'))
    start = time.monotonic()
    model.add_callback('on_train_start', lambda trainer: torch.set_num_threads(2))
    model.train(data=str(WORK / 'dataset.yaml'), device='cpu', epochs=epochs, batch=1, imgsz=imgsz,
                workers=0, cache=False, freeze=10, optimizer='AdamW', lr0=0.001,
                nbs=8, patience=15, seed=42, deterministic=True, amp=False, plots=False,
                mosaic=0, mixup=0, degrees=3, translate=0.05, scale=0.2, fliplr=0.5,
                project=str(WORK / 'runs'), name=name, exist_ok=False, save=True)
    print('Elapsed seconds:', round(time.monotonic()-start,1))
    assert baseline_hash == digest(ROOT / 'backend/yolov8n.pt'), 'Original weights changed'


def evaluate(name):
    """Fixed IoU and confidence; count accuracy alone can hide false detections."""
    labels = json.loads((WORK / 'annotations.json').read_text(encoding='utf-8'))
    predictions = json.loads((WORK / name / 'predictions.json').read_text(encoding='utf-8'))
    def iou(a, b):
        inter = max(0, min(a[2],b[2])-max(a[0],b[0])) * max(0, min(a[3],b[3])-max(a[1],b[1]))
        return inter / max(1, (a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-inter)
    rows = []
    for record in predictions:
        if record['id'] not in labels:
            continue
        annotation = labels[record['id']]
        unmatched = set(range(len(annotation['boxes'])))
        tp = 0
        for pred in sorted(record['boxes'], key=lambda b: -b['confidence']):
            options = [(iou(pred['xyxy'], annotation['boxes'][i]), i) for i in unmatched]
            if options and max(options)[0] >= 0.5:
                unmatched.remove(max(options)[1])
                tp += 1
        expected = len(annotation['boxes'])
        rows.append(dict(id=record['id'], split=annotation['split'], expected=expected,
                         predicted=record['count'], tp=tp, fp=record['count']-tp, fn=expected-tp,
                         absolute_error=abs(expected-record['count'])))
    summary = {}
    for split in ('train','val','test'):
        selected = [r for r in rows if r['split'] == split]
        if not selected: continue
        tp, fp, fn = (sum(r[k] for r in selected) for k in ('tp','fp','fn'))
        summary[split] = dict(images=len(selected), precision=tp/max(1,tp+fp), recall=tp/max(1,tp+fn),
                              count_mae=sum(r['absolute_error'] for r in selected)/len(selected),
                              exact_count=sum(r['absolute_error']==0 for r in selected), tp=tp, fp=fp, fn=fn)
    settings_path = WORK / name / 'settings.json'
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {'confidence':0.25, 'imgsz':640, 'nms_iou':0.7}
    report = dict(settings=settings, iou=0.5, limitation='Same classroom; related scenes, not an independent deployment benchmark.', summary=summary, images=rows)
    save_json(WORK / name / 'evaluation.json', report)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'predict', 'dataset', 'train', 'evaluate'])
    parser.add_argument('--weights', type=Path, default=WORK / 'baseline-yolov8n.pt')
    parser.add_argument('--name', default='baseline')
    parser.add_argument('--epochs', type=int, default=20)
    parser.add_argument('--imgsz', type=int, default=640)
    parser.add_argument('--confidence', type=float, default=0.25)
    parser.add_argument('--nms-iou', type=float, default=0.7)
    parser.add_argument('--split', choices=['train','val','test'])
    args = parser.parse_args()
    if args.action == 'prepare': prepare()
    elif args.action == 'predict': predict(args.weights, args.name, args.confidence, args.imgsz, args.split, args.nms_iou)
    elif args.action == 'dataset': dataset()
    elif args.action == 'train': train(args.epochs, args.name, args.imgsz)
    else: evaluate(args.name)
