"""Reviewed crops from training images only, never validation/test frames."""
import json
from PIL import Image
from monitor_experiment import WORK, save_json

if __name__ == '__main__':
    annotations = json.loads((WORK / 'annotations.json').read_text(encoding='utf-8'))
    manifest = json.loads((WORK / 'manifest.json').read_text(encoding='utf-8'))
    crops = {
        'negative_chair': ('photo_01', (0, 0, 450, 850)),
        'negative_laptop': ('photo_02', (0, 0, 360, 290)),
        'negative_electrical_box': ('video_01_02', (350, 105, 478, 275)),
        'negative_chairs_tables': ('video_01_01', (0, 510, 478, 850)),
        'negative_keyboard_mouse': ('photo_00', (150, 750, 1100, 960)),
    }
    for name, (origin, box) in crops.items():
        assert annotations[origin]['split'] == 'train'
        im = Image.open(WORK / 'source' / f'{origin}.jpg').crop(box)
        im.save(WORK / 'source' / f'{name}.jpg', quality=95)
        annotations[name] = dict(split='train', boxes=[])
        manifest = [m for m in manifest if m['id'] != name]
        manifest.append(dict(id=name, origin=origin, crop=box, width=im.width, height=im.height, kind='negative_crop'))
    save_json(WORK / 'annotations.json', annotations)
    save_json(WORK / 'manifest.json', manifest)
