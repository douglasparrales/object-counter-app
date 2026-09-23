import unittest
import cv2
import numpy as np
from PIL import Image
from services.surface_scan import SurfaceScan
from services.visual_reference import crear_perfil_visual


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


if __name__ == '__main__':
    unittest.main()
