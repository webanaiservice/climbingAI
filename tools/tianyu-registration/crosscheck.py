#!/usr/bin/env python3
"""Check source-mesh positions against additional, independent photographs."""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps
from register import feature_matches, fit_camera, project

ap = argparse.ArgumentParser()
ap.add_argument('--front', type=Path, required=True)
ap.add_argument('--registration', type=Path, required=True)
ap.add_argument('--photos', type=Path, nargs='+', required=True)
ap.add_argument('--output', type=Path, required=True)
args = ap.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
front = np.asarray(Image.open(args.front).convert('RGB'))
data = np.load(args.registration)
summary = []
for path in args.photos:
    photo = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    photo.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
    photo = np.asarray(photo)
    src, dst, points, counts, _ = feature_matches(front, photo, data['xyz'], threshold=18)
    cells = np.floor(src / 160).astype(int)
    check = (cells[:, 0] * 3 + cells[:, 1] * 7) % 5 == 0
    camera = fit_camera(points[~check], dst[~check])
    predicted, _ = project(camera, points)
    error = np.linalg.norm(predicted - dst, axis=1)
    train = (~check) & (error < 14)
    camera = fit_camera(points[train], dst[train])
    predicted, _ = project(camera, points)
    error = np.linalg.norm(predicted - dst, axis=1)
    stats = {'photo': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'size': [photo.shape[1], photo.shape[0]],
        **counts, 'camera': camera.tolist(), 'trainCount': int(train.sum()), 'holdoutCount': int(check.sum()),
        'trainErrorPx': dict(zip(['median', 'p90', 'p95', 'max'], np.quantile(error[train], [.5, .9, .95, 1]).tolist())),
        'holdoutErrorPx': dict(zip(['median', 'p90', 'p95', 'max'], np.quantile(error[check], [.5, .9, .95, 1]).tolist()))}
    np.savez_compressed(args.output / f'{path.stem}.npz', camera=camera, front=src, photo=dst, xyz=points, error=error, holdout=check, train=train)
    diagnostic = photo.copy()
    for actual, estimated, e in zip(dst, predicted, error):
        color = (20, 230, 60) if e < 5 else (255, 150, 0) if e < 10 else (255, 20, 20)
        cv2.line(diagnostic, tuple(np.rint(actual).astype(int)), tuple(np.rint(estimated).astype(int)), color, 2)
        cv2.circle(diagnostic, tuple(np.rint(actual).astype(int)), 3, color, 1)
    Image.fromarray(diagnostic).save(args.output / f'{path.stem}.jpg', quality=94)
    summary.append(stats)
    print(json.dumps(stats, indent=2), flush=True)
(args.output / 'crosscheck.json').write_text(json.dumps(summary, indent=2) + '\n')
