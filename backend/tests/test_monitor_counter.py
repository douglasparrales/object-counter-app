import unittest
import asyncio
import io

from fastapi import UploadFile
from PIL import Image
from routes.static_count import crear_router

from services.monitor_counter import is_monitor_target, monitor_requested, soft_nms


class MonitorRoutingTests(unittest.TestCase):
    def test_user_request_and_identify_label_select_same_detector(self):
        for name in ('monitor', ' MONITORES ', 'computer monitor', 'computer monitors'):
            self.assertTrue(is_monitor_target(name))

    def test_other_screens_and_categories_keep_original_route(self):
        for name in ('tv', 'televisor', 'pantalla', 'laptop', 'mouse', 'teclado', '', 'monitor de signos vitales'):
            self.assertFalse(is_monitor_target(name))

    def test_legacy_tv_label_cannot_override_user_intent(self):
        self.assertFalse(monitor_requested('computer monitor', {'objetivo_original': 'televisor'}))
        self.assertTrue(monitor_requested('computer monitor', {'objetivo_original': 'monitores'}))


class DuplicateMonitorTests(unittest.TestCase):
    def test_weaker_fragment_is_removed_but_overlapping_neighbor_survives(self):
        rows = [[0,0,100,60,.99,0], [60,25,160,85,.98,0], [70,0,100,60,.72,0]]
        self.assertEqual([i for i,_ in soft_nms(rows,.7)], [0,1])

    def test_distinct_monitors_and_empty_frame(self):
        self.assertEqual(soft_nms([], .7), [])
        rows = [[0,0,100,60,.9,0], [110,0,210,60,.8,0]]
        self.assertEqual(soft_nms(rows, .7), [(0,.9),(1,.8)])

    def test_two_strong_overlapping_monitors_remain_separate(self):
        rows = [[0,0,100,100,.99,0], [45,0,145,100,.99,0]]
        self.assertEqual([i for i,_ in soft_nms(rows,.7)], [0,1])


class PhotoRouteTests(unittest.TestCase):
    def test_only_explicit_monitor_uses_experimental_counter(self):
        class Counter:
            def __init__(self, name): self.name = name
            def contar(self, image, objetivo, seleccion):
                return {'total': 0, 'source': self.name, 'diagnostico': {
                    'candidatos_generales': 0, 'candidatos_dirigidos': 0,
                    'candidatos_apariencia': 0, 'ruta': self.name, 'mosaicos': 1,
                    'duracion_segundos': 0}}
        original, experimental = Counter('original'), Counter('experimental')
        data = io.BytesIO()
        Image.new('RGB', (32, 32)).save(data, format='JPEG')
        for enabled, target, expected in [(True, 'monitores', 'experimental'),
                                           (True, 'tv', 'original'),
                                           (True, 'teclado', 'original'),
                                           (False, 'monitores', 'original')]:
            endpoint = crear_router(original, experimental if enabled else None).routes[0].endpoint
            result = asyncio.run(endpoint(file=UploadFile(file=io.BytesIO(data.getvalue()), filename='test.jpg'),
                objetivo=target, seleccion_x=None, seleccion_y=None, seleccion_w=None, seleccion_h=None))
            self.assertEqual(result['source'], expected)
