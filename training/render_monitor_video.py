"""Render visible detections at 2 fps. This is NOT a unique-object tracker."""
import argparse
import json
import sys
from pathlib import Path

from monitor_experiment import ROOT, WORK, save_json


def render(weights, imgsz, confidence, name, app_pipeline=False):
    import cv2
    import torch
    from ultralytics import YOLO
    torch.set_num_threads(2)
    if app_pipeline:
        sys.path.insert(0, str(ROOT / 'backend'))
        from services.monitor_counter import MonitorCounter
        model = MonitorCounter(str(weights), confidence=confidence, imgsz=imgsz)
    else:
        model = YOLO(str(weights))
    output = WORK / name
    output.mkdir(exist_ok=True)
    for index, path in enumerate(sorted((ROOT / 'media-entrenamiento/monitor').glob('*.mp4'))):
        capture = cv2.VideoCapture(str(path))
        fps = capture.get(cv2.CAP_PROP_FPS)
        total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        writer = None
        rows = []
        for frame in range(0, total, max(1, round(fps / 2))):
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame)
            ok, image = capture.read()
            if not ok: break
            result = (model.predict(image)[0] if app_pipeline else
                      model.predict(image, imgsz=imgsz, conf=confidence, iou=0.45, device='cpu', verbose=False)[0])
            annotated = result.plot()
            count = len(result.boxes)
            cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 42), (15,15,15), -1)
            cv2.putText(annotated, f'Visibles: {count} | {frame/fps:.1f}s | EXPERIMENTAL', (8,27),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255,255,255), 1, cv2.LINE_AA)
            if writer is None:
                writer = cv2.VideoWriter(str(output / f'video_{index:02d}.mp4'), cv2.VideoWriter_fourcc(*'mp4v'), 2,
                                         (annotated.shape[1], annotated.shape[0]))
                if not writer.isOpened(): raise RuntimeError('Video writer unavailable')
            writer.write(annotated)
            rows.append(dict(frame=frame, seconds=frame/fps, visible=count))
        capture.release()
        if writer is not None: writer.release()
        save_json(output / f'video_{index:02d}.json', dict(source=path.name, weights=str(weights),
            imgsz=imgsz, confidence=confidence, app_pipeline=app_pipeline,
            description='Visible objects only, not cumulative unique count', frames=rows))
        print(path.name, len(rows), 'sampled frames', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--weights', type=Path, required=True)
    parser.add_argument('--imgsz', type=int, required=True)
    parser.add_argument('--confidence', type=float, required=True)
    parser.add_argument('--name', default='videos-evaluados')
    parser.add_argument('--app-pipeline', action='store_true')
    args = parser.parse_args()
    render(args.weights, args.imgsz, args.confidence, args.name, args.app_pipeline)
