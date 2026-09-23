"""Persistent inventory on a stationary, approximately planar surface.

Frames are registered against saved keyframes, not against the last object's
screen position. Losing registration freezes additions; it never starts a new map.
"""
from dataclasses import dataclass
from threading import Lock
import time
import cv2
import numpy as np


def project(points, matrix):
    return cv2.perspectiveTransform(np.float32(points).reshape(-1, 1, 2), matrix).reshape(-1, 2)


@dataclass
class Landmark:
    center: np.ndarray
    radius: float
    hits: int = 1
    id: int = 0


class SurfaceScan:
    def __init__(self, reference):
        self.reference = reference
        self.lock = Lock()
        self.updated = time.monotonic()
        self.sequence = -1
        self.last_response = None
        self.features = cv2.SIFT_create(nfeatures=1600)
        self.keys = []
        self.latest = None
        self.landmarks = []
        self.total = 0

    def _align(self, points, descriptors, shape, usable_area):
        h, w = shape
        best = None
        matcher = cv2.BFMatcher(cv2.NORM_L2)
        # Include old keyframes so returning to the start does not accumulate drift.
        references = self.keys + ([self.latest] if self.latest is not None else [])
        for key in reversed(references):
            pairs = matcher.knnMatch(descriptors, key['desc'], k=2)
            good = [p[0] for p in pairs if len(p) == 2 and p[0].distance < 0.70 * p[1].distance]
            if len(good) < 18:
                continue
            src = np.float32([points[m.queryIdx] for m in good])
            dst = np.float32([key['points'][m.trainIdx] for m in good])
            matrix, mask = cv2.findHomography(src, dst, cv2.RANSAC, 2.5)
            if matrix is None or mask is None or not np.isfinite(matrix).all():
                continue
            inliers = mask.ravel().astype(bool)
            n = int(inliers.sum())
            if n < 18 or n / len(good) < 0.55:
                continue
            coverage = cv2.contourArea(cv2.convexHull(src[inliers])) / max(1, usable_area)
            if coverage < 0.08:
                continue
            corners = project([[0, 0], [w, 0], [w, h], [0, h]], matrix)
            area = cv2.contourArea(corners)
            if not cv2.isContourConvex(corners) or not 0.2 < area / (w*h) < 5:
                continue
            error = float(np.median(np.linalg.norm(project(src[inliers], matrix) - dst[inliers], axis=1)))
            if error > 2:
                continue
            score = n * min(coverage, 0.5) / (1 + error)
            if best is None or score > best[0]:
                best = (score, key['world'] @ matrix, n, error)
        return best

    def process(self, image, objects, sequence, feature_mask=None):
        with self.lock:
            self.updated = time.monotonic()
            if sequence <= self.sequence:
                if sequence == self.sequence:
                    return self.last_response
                raise ValueError('Frame fuera de orden')
            rgb = np.asarray(image)
            scale = min(1.0, 960 / max(rgb.shape[:2]))
            gray = cv2.cvtColor(cv2.resize(rgb, None, fx=scale, fy=scale), cv2.COLOR_RGB2GRAY)
            h, w = gray.shape
            mask = np.full((h, w), 255, np.uint8)
            if feature_mask is not None:
                mask = cv2.resize(feature_mask, (w, h), interpolation=cv2.INTER_NEAREST)
            # Track table details, not the movable/identical objects themselves.
            for o in objects:
                x, y, bw, bh = o['cx']*w, o['cy']*h, o['w']*w, o['h']*h
                cv2.rectangle(mask, (int(x-bw/2-4), int(y-bh/2-4)),
                              (int(x+bw/2+4), int(y+bh/2+4)), 0, -1)
            kp, desc = self.features.detectAndCompute(gray, mask)
            points = np.float32([p.pt for p in kp])
            status, world, matches, error = 'SIN_COINCIDENCIA', None, 0, None
            if desc is not None and len(kp) >= 40:
                if not self.keys:
                    world, status = np.eye(3), 'INICIANDO'
                else:
                    fit = self._align(points, desc, gray.shape, np.count_nonzero(mask))
                    if fit:
                        _, world, matches, error = fit
                        status = 'SIGUIENDO'
            boxes = []
            if world is not None:
                used = set()
                for o in objects:
                    full = min(o['cx']-o['w']/2, o['cy']-o['h']/2) > 0.015 and max(o['cx']+o['w']/2, o['cy']+o['h']/2) < 0.985
                    if not full:
                        boxes.append({**o, 'id': 0, 'confirmado': False})
                        continue
                    center, edge = project([[o['cx']*w, o['cy']*h],
                        [(o['cx']+min(o['w'], o['h'])/2)*w, o['cy']*h]], world)
                    radius = max(5, min(20, float(np.linalg.norm(edge-center))*0.8))
                    nearby = [(float(np.linalg.norm(l.center-center)), i) for i, l in enumerate(self.landmarks)
                              if np.linalg.norm(l.center-center) <= max(radius, l.radius)]
                    nearby.sort()
                    # An ambiguous second box must not create an extra identity.
                    if nearby and nearby[0][1] in used:
                        continue
                    if nearby:
                        _, idx = nearby[0]
                        landmark = self.landmarks[idx]
                        landmark.hits += 1
                    else:
                        idx = len(self.landmarks)
                        landmark = Landmark(center, radius)
                        self.landmarks.append(landmark)
                    used.add(idx)
                    if landmark.hits >= 2 and not landmark.id:
                        self.total += 1
                        landmark.id = self.total
                    boxes.append({**o, 'id': landmark.id, 'confirmado': landmark.id > 0})
                # Keep first and all later selected views; never discard old inventory.
                center = project([[w/2, h/2]], world)[0]
                self.latest = dict(points=points, desc=desc, world=world, center=center)
                if len(self.keys) < 32 and (not self.keys or
                        min(np.linalg.norm(center-k['center']) for k in self.keys) > min(w,h)*0.18):
                    self.keys.append(dict(points=points, desc=desc, world=world, center=center))
            else:
                boxes = [{**o, 'id': 0, 'confirmado': False} for o in objects]
            response = dict(total=self.total, estado=status, coincidencias=matches,
                            error_px=error, objetos=boxes, secuencia=sequence,
                            vistas=len(self.keys))
            self.sequence, self.last_response = sequence, response
            return response
