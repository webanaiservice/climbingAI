#!/usr/bin/env python3
"""Spatial five-fold validation for local confidence, not training residuals."""
import argparse
import json
from pathlib import Path
import numpy as np
from scipy.interpolate import RBFInterpolator
from register import fit_camera, project

ap = argparse.ArgumentParser()
ap.add_argument('--fit', type=Path, required=True)
args = ap.parse_args()
data = np.load(args.fit / 'registration.npz')
points, pixels = data['featureXYZ'], data['featurePhoto']
cells = np.floor(pixels / 160).astype(int)
folds = (cells[:, 0] * 3 + cells[:, 1] * 7) % 5
predictions = np.empty_like(pixels)
summary = []
for fold in range(5):
    train = folds != fold
    camera = fit_camera(points[train], pixels[train])
    projected, _ = project(camera, points)
    train &= np.linalg.norm(projected - pixels, axis=1) < 12
    camera = fit_camera(points[train], pixels[train])
    projected, _ = project(camera, points)
    train &= np.linalg.norm(projected - pixels, axis=1) < 10
    smooth = RBFInterpolator(projected[train] / 2048, pixels[train] - projected[train],
                             kernel='thin_plate_spline', smoothing=0.003, neighbors=48)
    check = folds == fold
    predictions[check] = projected[check] + smooth(projected[check] / 2048)
    error = np.linalg.norm(predictions[check] - pixels[check], axis=1)
    summary.append({'fold': fold, 'count': int(check.sum()), 'medianPx': float(np.median(error)), 'p95Px': float(np.quantile(error, .95))})
errors = np.linalg.norm(predictions - pixels, axis=1)
np.savez_compressed(args.fit / 'cross-validation.npz', predictions=predictions, errors=errors, folds=folds)
result = {'method': '5-fold spatial grid cross-validation; each feature is checked by a camera and residual field not fitted to its grid fold', 'count': len(errors),
    'errorPx': dict(zip(['median', 'p90', 'p95', 'max'], np.quantile(errors, [.5, .9, .95, 1]).tolist())), 'folds': summary}
(args.fit / 'cross-validation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
