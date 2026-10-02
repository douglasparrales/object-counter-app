import asyncio
import io
import unittest
from threading import Lock
from fastapi import UploadFile
from PIL import Image
from routes.static_count import crear_router
from services.classroom_counter import ClassroomCounter, classroom_target, merge_mouse_indices


class ClassroomRoutingTests(unittest.TestCase):
    def test_mouse_fusion_preserves_prior_boxes_and_adds_only_distinct_objects(self):
        old=[[0,0,100,100,.95,1],[110,0,210,100,.9,1]]
        new=[[5,0,105,100,.99,1],[20,20,60,60,.8,1],[220,0,320,100,.9,1]]
        self.assertEqual(merge_mouse_indices(old,new),[0,1,4])
        self.assertEqual(merge_mouse_indices([],new[:1]),[0])
        self.assertEqual(merge_mouse_indices(old,[]),[0,1])

    def test_keyboard_soft_nms_removes_fragment_but_keeps_neighbor(self):
        import torch
        from types import SimpleNamespace
        class Result:
            def __init__(self):
                self.boxes=SimpleNamespace(data=torch.tensor([
                    [0,0,100,50,.99,2], [10,0,100,50,.98,2], [110,0,210,50,.97,2]]))
            def update(self,boxes):self.boxes.data=boxes
        class Model:
            names={0:'monitor',1:'mouse',2:'keyboard'}
            def predict(self,image,**kwargs):return [Result()]
        counter=ClassroomCounter.__new__(ClassroomCounter)
        counter.model=Model();counter.lock=Lock();counter.imgsz=640;counter.previous_model=None;counter.preserve_previous_monitor=False
        counter.confidences={'monitor':.7,'mouse':.85,'keyboard':.85}
        counter.keyboard_soft_nms_sigma=.5
        rows=counter.predict(None,'teclado')[0].boxes.data
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[:,0].tolist(),[0,110])
        self.assertEqual(len(counter.predict(None,'mouse')[0].boxes.data),3)

    def test_inference_filters_the_selected_class_and_its_threshold(self):
        class Model:
            names={0:'monitor',1:'mouse',2:'keyboard'}
            def predict(self,image,**kwargs):return kwargs
        counter=ClassroomCounter.__new__(ClassroomCounter)
        counter.model=Model();counter.lock=Lock();counter.imgsz=640;counter.previous_model=None;counter.preserve_previous_monitor=False;counter.keyboard_soft_nms_sigma=None
        counter.confidences={'monitor':.7,'mouse':.35,'keyboard':.5}
        self.assertEqual(counter.predict(None,'ratones')['classes'],[1])
        self.assertEqual(counter.predict(None,'ratones')['conf'],.35)
        self.assertEqual(counter.predict(None,'monitores')['classes'],[0])
        self.assertEqual(counter.predict(None,'monitores')['conf'],.7)
        class Previous:
            names={0:'monitor',1:'mouse'}
            def predict(self,image,**kwargs):return dict(kwargs,previous=True)
        counter.previous_model=Previous();counter.preserve_previous_monitor=True
        self.assertTrue(counter.predict(None,'monitores')['previous'])
        counter.previous_model=None;counter.preserve_previous_monitor=False
        self.assertEqual(counter.predict(None,'teclados')['classes'],[2])
        self.assertEqual(counter.predict(None,'teclados')['conf'],.5)
        self.assertTrue(counter.supports('teclado'))
        counter.model.names={0:'monitor',1:'mouse'}
        self.assertFalse(counter.supports('teclado'))
        with self.assertRaises(ValueError):counter.predict(None,'teclado')
        with self.assertRaises(ValueError):counter.predict(None,'mouse pad')

    def test_original_intent_wins_over_identify_alias(self):
        self.assertIsNone(classroom_target('monitor', {'objetivo_original':'televisor'}))
        self.assertEqual(classroom_target('tv', {'objetivo_original':'monitores'}), 'monitor')
        for name in ('mouse', 'mouses', ' RATÓN ', 'ratones', 'computer mouse'):
            self.assertEqual(classroom_target(name), 'mouse')
        for name in ('mouse pad', 'pantalla', ''):
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
                (True,'teclados','aula'),(True,'tv','original'),(False,'monitores','monitor'),(False,'mouse','original')]:
            endpoint=crear_router(original,monitor,classroom if enabled else None).routes[0].endpoint
            result=asyncio.run(endpoint(file=UploadFile(file=io.BytesIO(encoded.getvalue()),filename='test.jpg'),
                objetivo=target,seleccion_x=None,seleccion_y=None,seleccion_w=None,seleccion_h=None))
            self.assertEqual(result['source'],expected)
            self.assertEqual(result['target'],target)
