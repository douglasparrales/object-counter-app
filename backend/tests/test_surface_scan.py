import unittest
import cv2
import numpy as np
from PIL import Image
from services.surface_scan import SurfaceScan
from services.visual_reference import crear_perfil_visual, detectar_por_perfil_ar


class SurfaceScanTests(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(12)
        self.scene = rng.integers(0, 256, (600, 1500, 3), dtype=np.uint8)
        self.scene = cv2.GaussianBlur(self.scene, (5, 5), 0)
        self.scan = SurfaceScan('reference')
        self.seq = 0

    def frame(self, offset, centers):
        image = Image.fromarray(self.scene[:, offset:offset+700])
        boxes = [dict(cx=(x-offset)/700, cy=.5, w=.025, h=.12,
                      clase='pen', confianza=.9, frame_width=700, frame_height=600)
                 for x in centers if offset+30 < x < offset+670]
        result = self.scan.process(image, boxes, self.seq)
        self.seq += 1
        return result

    def test_leave_view_and_return_keeps_two_ids(self):
        self.assertEqual(self.frame(0, [200, 900])['total'], 0)
        self.assertEqual(self.frame(0, [200, 900])['total'], 1)
        for offset in (150, 300, 450, 600, 600):
            result = self.frame(offset, [200, 900])
            self.assertNotEqual(result['estado'], 'SIN_COINCIDENCIA')
        self.assertEqual(result['total'], 2)
        result = self.frame(0, [200, 900])
        self.assertEqual(result['total'], 2)
        self.assertEqual(result['objetos'][0]['id'], 1)

    def test_loss_freezes_and_relocalizes(self):
        self.frame(0, [200]); self.frame(0, [200])
        blank = Image.new('RGB', (700, 600))
        result = self.scan.process(blank, [dict(cx=.5, cy=.5, w=.1, h=.1)], self.seq)
        self.seq += 1
        self.assertEqual((result['total'], result['estado']), (1, 'SIN_COINCIDENCIA'))
        self.assertEqual(self.frame(0, [200])['objetos'][0]['id'], 1)

    def test_repeated_request_cannot_confirm(self):
        first = self.frame(0, [200])
        self.assertEqual(self.scan.process(Image.fromarray(self.scene[:, :700]), [], 0), first)
        self.assertEqual(self.scan.total, 0)

    def test_two_adjacent_objects_remain_distinct(self):
        self.frame(0, [200, 230])
        result = self.frame(0, [200, 230])
        self.assertEqual(result['total'], 2)
        self.assertEqual(len({o['id'] for o in result['objetos']}), 2)

    def test_three_objects_discovered_during_scan_keep_ids_on_return(self):
        centers = [100, 750, 1300]
        self.frame(0, centers)
        self.assertEqual(self.frame(0, centers)['total'], 1)
        for offset in (150, 300, 450, 600, 750, 800, 800):
            result = self.frame(offset, centers)
            self.assertNotEqual(result['estado'], 'SIN_COINCIDENCIA')
        self.assertEqual(result['total'], 3)
        self.assertEqual(result['objetos'][0]['id'], 3)
        returned = self.frame(0, centers)
        self.assertEqual(returned['total'], 3)
        self.assertEqual(returned['objetos'][0]['id'], 1)

    def test_diagonal_reference_measures_pen_shape(self):
        rgb = np.full((300, 300, 3), 220, dtype=np.uint8)
        cv2.line(rgb, (70, 70), (220, 220), (20, 40, 180), 12)
        profile = crear_perfil_visual(Image.fromarray(rgb), (50, 50, 240, 240))
        self.assertEqual(profile['aspecto'], 1)
        self.assertGreater(profile['aspecto_ar'], 10)

    def test_tiny_same_color_mark_is_not_another_pen(self):
        rgb = np.full((800, 600, 3), 220, dtype=np.uint8)
        cv2.rectangle(rgb, (105, 110), (135, 410), (20, 40, 180), -1)
        cv2.rectangle(rgb, (250, 120), (262, 240), (20, 40, 180), -1)
        cv2.rectangle(rgb, (400, 120), (414, 165), (20, 40, 180), -1)
        image = Image.fromarray(rgb)
        profile = crear_perfil_visual(image, (100, 100, 145, 430))
        detections = detectar_por_perfil_ar(image, profile, 'pen')
        self.assertEqual(len(detections), 2)
        self.assertTrue(all(box[0] < 300 for _, _, box in detections))

    def test_neighboring_hue_background_needs_reference_color_core(self):
        hsv = np.zeros((400, 400, 3), np.uint8)
        hsv[:] = (0, 0, 220)
        hsv[80:300, 70:90] = (118, 175, 100)
        hsv[80:300, 200:220] = (101, 175, 100)
        image = Image.fromarray(cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB))
        profile = crear_perfil_visual(image, (65, 75, 95, 305))
        profile['tolerancia_h'] = 22
        detections = detectar_por_perfil_ar(image, profile, 'pen')
        self.assertEqual(len(detections), 1)
        self.assertLess(detections[0][2][0], 100)

    def test_rotated_long_objects_with_changed_box_centers_keep_ids(self):
        # A detector can trim one end differently after a camera rotation.
        # Its center then moves beyond the old 5px association radius.
        image = self.scene[:, :700]
        boxes = [dict(cx=x/700, cy=.5, w=18/700, h=180/600)
                 for x in (200, 230, 400)]
        self.scan.process(Image.fromarray(image), boxes, 0)
        before = self.scan.process(Image.fromarray(image), boxes, 1)
        self.assertEqual(before['total'], 3)
        rotated = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
        changed = [dict(cx=(300+22)/600, cy=x/700, w=136/600, h=18/700)
                   for x in (200, 230, 400)]
        for sequence in (2, 3):
            result = self.scan.process(Image.fromarray(rotated), changed, sequence)
            self.assertEqual(result['estado'], 'SIGUIENDO')
            self.assertEqual(result['total'], 3)
            self.assertEqual([o['id'] for o in result['objetos']], [1, 2, 3])
        returned = self.scan.process(Image.fromarray(image), boxes, 4)
        self.assertEqual(returned['total'], 3)

    def test_perspective_narrows_existing_box_without_merging_neighbor(self):
        image = Image.fromarray(self.scene[:, :700])
        initial = [dict(cx=500/700, cy=.5, w=120/700, h=.5),
                   dict(cx=410/700, cy=.5, w=18/700, h=.5)]
        self.scan.process(image, initial, 0)
        self.assertEqual(self.scan.process(image, initial, 1)['total'], 2)
        # A nearly vertical view occupies much less of the old diagonal box.
        narrowed = [dict(cx=480/700, cy=280/600, w=32/700, h=.46), initial[1]]
        for sequence in (2, 3):
            result = self.scan.process(image, narrowed, sequence)
            self.assertEqual(result['total'], 2)
            self.assertEqual([o['id'] for o in result['objetos']], [1, 2])
        # A genuinely new object outside those footprints still increments.
        extra = narrowed + [dict(cx=200/700, cy=.5, w=18/700, h=.5)]
        self.scan.process(image, extra, 4)
        result = self.scan.process(image, extra, 5)
        self.assertEqual(result['total'], 3)
        self.assertEqual([o['id'] for o in result['objetos']], [1, 2, 3])


if __name__ == '__main__':
    unittest.main()
