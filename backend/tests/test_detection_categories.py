import unittest
from services.detection_categories import device_category


class DeviceCategoryTests(unittest.TestCase):
    def test_spanish_plural_and_reference_labels_keep_category(self):
        for name, expected in [('ratones', 64), ('mouses', 64), (' RATÓN ', 64),
                               ('monitores', 62), ('teclados', 66), ('portátiles', 63)]:
            category, labels = device_category(name)
            self.assertEqual(category, expected)
            self.assertEqual(device_category(labels[0])[0], expected)

    def test_other_objects_keep_existing_detector(self):
        for name in ('esfero', 'ballpoint pen', 'bottle', 'object', 'mouse pad'):
            self.assertIsNone(device_category(name))
