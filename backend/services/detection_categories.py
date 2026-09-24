"""Explicit device vocabulary, independent of reference colour and network translation."""
import unicodedata


GROUPS = (
    (64, ('computer mouse', 'mouse'), ('mouse', 'mouses', 'mice', 'raton', 'ratones')),
    (66, ('computer keyboard', 'keyboard'), ('teclado', 'teclados', 'keyboard', 'keyboards')),
    (62, ('computer monitor', 'monitor'), ('monitor', 'monitores', 'pantalla', 'pantallas', 'tv', 'televisor', 'televisores', 'computer monitor')),
    (63, ('laptop',), ('laptop', 'laptops', 'portatil', 'portatiles', 'notebook', 'notebooks')),
)


def device_category(name):
    normalized = ''.join(c for c in unicodedata.normalize('NFD', name.strip().lower())
                         if unicodedata.category(c) != 'Mn')
    for class_id, labels, aliases in GROUPS:
        if normalized in aliases or normalized in labels:
            return class_id, list(labels)
    return None
