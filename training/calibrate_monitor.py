"""Pick an operating threshold on validation only, before final diagnostics."""
import argparse
import json
from pathlib import Path
from monitor_experiment import WORK, predict, save_json


def overlap(a, b):
    area = max(0,min(a[2],b[2])-max(a[0],b[0])) * max(0,min(a[3],b[3])-max(a[1],b[1]))
    return area / max(1,(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-area)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--weights', type=Path, required=True)
    parser.add_argument('--imgsz', type=int, default=640)
    parser.add_argument('--name', default='calibration-v3')
    args = parser.parse_args()
    predict(args.weights, args.name, 0.05, args.imgsz, 'val', 0.45)
    records = json.loads((WORK / args.name / 'predictions.json').read_text())
    annotations = json.loads((WORK / 'annotations.json').read_text())
    trials = []
    for confidence in [0.25,0.4,0.5,0.6,0.7,0.8,0.9]:
        tp = fp = fn = error = 0
        for record in records:
            boxes = annotations[record['id']]['boxes']
            remaining = set(range(len(boxes)))
            predicted = [p for p in record['boxes'] if p['confidence'] >= confidence]
            matches = 0
            for pred in sorted(predicted, key=lambda p: -p['confidence']):
                options = [(overlap(pred['xyxy'], boxes[i]),i) for i in remaining]
                if options and max(options)[0] >= 0.5:
                    matches += 1
                    remaining.remove(max(options)[1])
            tp += matches
            fp += len(predicted)-matches
            fn += len(boxes)-matches
            error += abs(len(predicted)-len(boxes))
        trials.append(dict(confidence=confidence, tp=tp, fp=fp, fn=fn, absolute_error=error,
                           f1=2*tp/max(1,2*tp+fp+fn)))
    selected = max(trials, key=lambda r: (r['f1'], -r['absolute_error'], -r['confidence']))
    result = dict(weights=str(args.weights.resolve()), imgsz=args.imgsz, nms_iou=0.45,
                  confidence=selected['confidence'], selected=selected, trials=trials,
                  limitation='One related classroom photo only; this is not a robust deployment calibration.')
    save_json(WORK / args.name / 'selection.json', result)
    print(json.dumps(result, indent=2))
