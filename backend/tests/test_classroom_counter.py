import asyncio
import io
import unittest
from threading import Lock
from fastapi import UploadFile
from PIL import Image
from routes.static_count import crear_router
from services.classroom_counter import ClassroomCounter, classroom_target


class ClassroomRoutingTests(unittest.TestCase):
    def test_inference_filters_the_selected_class_and_its_threshold(self):
        class Model:
            def predict(self,image,**kwargs):return kwargs
        counter=ClassroomCounter.__new__(ClassroomCounter)
        counter.model=Model();counter.lock=Lock();counter.imgsz=640
        counter.confidences={'monitor':.7,'mouse':.35}
        self.assertEqual(counter.predict(None,'ratones')['classes'],[1])
        self.assertEqual(counter.predict(None,'ratones')['conf'],.35)
        self.assertEqual(counter.predict(None,'monitores')['classes'],[0])
        self.assertEqual(counter.predict(None,'monitores')['conf'],.7)
        with self.assertRaises(ValueError):counter.predict(None,'mouse pad')

    def test_original_intent_wins_over_identify_alias(self):
        self.assertIsNone(classroom_target('monitor', {'objetivo_original':'televisor'}))
        self.assertEqual(classroom_target('tv', {'objetivo_original':'monitores'}), 'monitor')
        for name in ('mouse', 'mouses', ' RATÓN ', 'ratones', 'computer mouse'):
            self.assertEqual(classroom_target(name), 'mouse')
        for name in ('teclado', 'mouse pad', 'pantalla', ''):
            self.assertIsNone(classroom_target(name))

    def test_photo_uses_requested_class_only_and_falls_back(self):
        class Counter:
            def __init__(self,name):self.name=name
            def supports(self,target):return classroom_target(target) is not None
            def contar(self,image,target,selection):
                return dict(total=0,source=self.name,target=target,diagnostico=dict(
                    candidatos_generales=0,candidatos_dirigidos=0,candidatos_apariencia=0,
                    ruta=self.name,mosaicos=1,duracion_segundos=0))
        encoded=io.BytesIO();Image.new('RGB',(32,32)).save(encoded,format='JPEG')
        original,monitor,classroom=[Counter(s) for s in ('original','monitor','aula')]
        for enabled,target,expected in [(True,'mouses','aula'),(True,'monitores','aula'),
                (True,'tv','original'),(False,'monitores','monitor'),(False,'mouse','original')]:
            endpoint=crear_router(original,monitor,classroom if enabled else None).routes[0].endpoint
            result=asyncio.run(endpoint(file=UploadFile(file=io.BytesIO(encoded.getvalue()),filename='test.jpg'),
                objetivo=target,seleccion_x=None,seleccion_y=None,seleccion_w=None,seleccion_h=None))
            self.assertEqual(result['source'],expected)
            self.assertEqual(result['target'],target)
