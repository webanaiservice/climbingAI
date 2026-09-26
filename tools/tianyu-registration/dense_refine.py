#!/usr/bin/env python3
"""Local image registration with forward/backward consistency diagnostics.

This refines the image-to-surface lookup, not the original geometry. Dense
image residuals are NOT presented as independent sparse holdout accuracy.
"""
import argparse
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--fit', type=Path, required=True)
ap.add_argument('--photo', type=Path, required=True)
args = ap.parse_args()
data = np.load(args.fit / 'registration.npz')
photo = np.asarray(Image.open(args.photo).convert('RGB'))
scan = np.asarray(Image.open(args.fit / 'registered-local.jpg').convert('RGB'))
photo_gray = cv2.GaussianBlur(cv2.cvtColor(photo, cv2.COLOR_RGB2GRAY), (0, 0), .9)
scan_gray = cv2.GaussianBlur(cv2.cvtColor(scan, cv2.COLOR_RGB2GRAY), (0, 0), .9)
algorithm = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
algorithm.setFinestScale(0)
forward = algorithm.calc(scan_gray, photo_gray, None)
backward = algorithm.calc(photo_gray, scan_gray, None)
y, x = np.indices(photo.shape[:2], dtype=np.float32)
sx, sy = x + backward[:, :, 0], y + backward[:, :, 1]
sampled_forward = cv2.remap(forward, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
consistency = np.linalg.norm(backward + sampled_forward, axis=2)
triangles = cv2.remap(data['triangles'].astype(np.float32), sx, sy, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=-1).astype(np.int32)
inverse_x = cv2.remap(data['inverseMapX'], sx, sy, cv2.INTER_LINEAR)
inverse_y = cv2.remap(data['inverseMapY'], sx, sy, cv2.INTER_LINEAR)
xyz = cv2.remap(data['xyz'], sx, sy, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=(float('nan'),) * 3)
rgb = cv2.remap(scan, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(242, 242, 242))
# Missing source geometry and unbounded flows must remain missing in the output.
valid = (triangles >= 0) & (data['triangles'] >= 0) & (np.linalg.norm(backward, axis=2) < 48) & (sx >= 0) & (sy >= 0) & (sx < photo.shape[1]-1) & (sy < photo.shape[0]-1)
triangles[~valid] = -1
xyz[~valid] = np.nan
rgb[~valid] = 242
Image.fromarray(rgb).save(args.fit / 'registered-dense.jpg', quality=95)
Image.fromarray(np.rint(photo.astype(float) * .5 + rgb * .5).astype(np.uint8)).save(args.fit / 'overlay-dense.jpg', quality=95)
np.savez_compressed(args.fit / 'dense.npz', xyz=xyz, triangles=triangles, inverseMapX=inverse_x, inverseMapY=inverse_y,
                    flow=backward, consistency=consistency)
print({'coveredPixelFraction': float(valid.mean()), 'bidirectionalErrorMedianPx': float(np.median(consistency[valid])),
       'bidirectionalErrorP95Px': float(np.quantile(consistency[valid], .95))}, flush=True)
