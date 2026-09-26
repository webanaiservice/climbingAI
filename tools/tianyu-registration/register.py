#!/usr/bin/env python3
"""Deterministic photo/GLB registration; no generative image modification.

The GLB stays in its source coordinate system. A 3x4 projective camera maps
that space into the existing rectified photograph, including its homography.
Texture-feature correspondences are used for fitting and independent checks.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.optimize import least_squares
from scipy.interpolate import RBFInterpolator


def read_glb(path):
    raw = Path(path).read_bytes()
    magic, version, total = struct.unpack_from('<4sII', raw)
    if magic != b'glTF' or version != 2 or total != len(raw):
        raise ValueError('Invalid GLB 2.0')
    offset, doc, binary = 12, None, None
    while offset < total:
        length, kind = struct.unpack_from('<II', raw, offset)
        chunk = raw[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            doc = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length
    def accessor(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        dtype = np.dtype({5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']])
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
        return np.ndarray((a['count'], width), dtype=dtype, buffer=binary,
            offset=view.get('byteOffset', 0) + a.get('byteOffset', 0),
            strides=(view.get('byteStride', dtype.itemsize * width), dtype.itemsize)).copy()
    # Reject unsupported transforms instead of silently registering the wrong mesh.
    if len(doc['meshes']) != 1 or len(doc['meshes'][0]['primitives']) != 1:
        raise ValueError('Expected the single-mesh Tianyu source scan')
    if any(any(key in node for key in ('matrix', 'translation', 'rotation', 'scale')) for node in doc['nodes']):
        raise ValueError('Apply GLB node transforms before registering')
    p = doc['meshes'][0]['primitives'][0]
    view = doc['bufferViews'][doc['images'][0]['bufferView']]
    texture = np.asarray(Image.open(BytesIO(binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']])).convert('RGB'))
    return accessor(p['attributes']['POSITION']).astype(float), accessor(p['indices']).reshape(-1, 3), accessor(p['attributes']['TEXCOORD_0']).astype(float), texture, hashlib.sha256(raw).hexdigest()


def rasterize(vertices, faces, uv, texture, screen, depth, size, perspective=False, flip_v=False):
    """Z-buffer with perspective-correct attributes, returning a triangle map.

    depth is positive camera distance for a perspective camera and -Z for the
    initial front orthographic view. Smaller values are closer to the camera.
    Pixel coordinates consistently use integer pixel centers.
    """
    width, height = size
    zbuffer = np.full((height, width), np.inf, np.float32)
    triangle_map = np.full((height, width), -1, np.int32)
    xyz = np.full((height, width, 3), np.nan, np.float32)
    rgb = np.full((height, width, 3), 242, np.uint8)
    for face_id, ids in enumerate(faces):
        s, d = screen[ids], depth[ids]
        if not np.isfinite(s).all() or (perspective and np.any(d <= 0)):
            continue
        lo = np.maximum(np.floor(s.min(axis=0)).astype(int), 0)
        hi = np.minimum(np.ceil(s.max(axis=0)).astype(int), [width - 1, height - 1])
        if np.any(lo > hi):
            continue
        x, y = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        den = (s[1, 1] - s[2, 1]) * (s[0, 0] - s[2, 0]) + (s[2, 0] - s[1, 0]) * (s[0, 1] - s[2, 1])
        if abs(den) < 1e-9:
            continue
        a = ((s[1, 1] - s[2, 1]) * (x - s[2, 0]) + (s[2, 0] - s[1, 0]) * (y - s[2, 1])) / den
        b = ((s[2, 1] - s[0, 1]) * (x - s[2, 0]) + (s[0, 0] - s[2, 0]) * (y - s[2, 1])) / den
        weights = np.stack([a, b, 1 - a - b], axis=-1)
        inside = np.all(weights >= -1e-7, axis=-1)
        if perspective:
            weights = weights / d
            interpolated_depth = 1 / weights.sum(axis=-1)
            weights *= interpolated_depth[..., None]
        else:
            interpolated_depth = weights @ d
        visible = inside & (interpolated_depth < zbuffer[y, x])
        if not visible.any():
            continue
        xx, yy, ww = x[visible], y[visible], weights[visible]
        zbuffer[yy, xx] = interpolated_depth[visible]
        triangle_map[yy, xx] = face_id
        xyz[yy, xx] = ww @ vertices[ids]
        tex = ww @ uv[ids]
        if flip_v:
            tex[:, 1] = 1 - tex[:, 1]
        tx = np.clip(np.rint(tex[:, 0] * (texture.shape[1] - 1)), 0, texture.shape[1] - 1).astype(int)
        ty = np.clip(np.rint(tex[:, 1] * (texture.shape[0] - 1)), 0, texture.shape[0] - 1).astype(int)
        rgb[yy, xx] = texture[ty, tx]
    return rgb, xyz, triangle_map


def feature_matches(render, photo, xyz, threshold=12):
    sift = cv2.SIFT_create(nfeatures=12000, contrastThreshold=0.018)
    kr, dr = sift.detectAndCompute(cv2.cvtColor(render, cv2.COLOR_RGB2GRAY), None)
    kp, dp = sift.detectAndCompute(cv2.cvtColor(photo, cv2.COLOR_RGB2GRAY), None)
    pairs = cv2.BFMatcher().knnMatch(dr, dp, k=2)
    good = [a for a, b in pairs if a.distance < 0.72 * b.distance]
    src = np.float32([kr[m.queryIdx].pt for m in good])
    dst = np.float32([kp[m.trainIdx].pt for m in good])
    if len(src) < 12:
        raise ValueError(f'Too few texture matches: {len(src)}')
    homography, mask = cv2.findHomography(src, dst, cv2.USAC_MAGSAC, threshold)
    selected = mask.ravel().astype(bool)
    positions = np.rint(src).astype(int)
    points = xyz[positions[:, 1], positions[:, 0]]
    selected &= np.isfinite(points).all(axis=1)
    if selected.sum() < 40:
        raise ValueError(f'Insufficient geometrically consistent matches: {selected.sum()}')
    return src[selected], dst[selected], points[selected], {'ratioMatches': len(good), 'homographyInliers': int(selected.sum())}, homography


def project(camera, points):
    p = np.column_stack([points, np.ones(len(points))]) @ camera.T
    return p[:, :2] / p[:, 2:3], p[:, 2]


def fit_camera(points, pixels):
    center3, center2 = points.mean(axis=0), pixels.mean(axis=0)
    scale3 = np.sqrt(3) / np.linalg.norm(points - center3, axis=1).mean()
    scale2 = np.sqrt(2) / np.linalg.norm(pixels - center2, axis=1).mean()
    t3, t2 = np.eye(4), np.eye(3)
    t3[:3, :3] *= scale3
    t3[:3, 3] = -center3 * scale3
    t2[:2, :2] *= scale2
    t2[:2, 2] = -center2 * scale2
    q = np.column_stack([(points - center3) * scale3, np.ones(len(points))])
    v = (pixels - center2) * scale2
    zero = np.zeros_like(q)
    a = np.concatenate([np.column_stack([q, zero, -v[:, :1] * q]), np.column_stack([zero, q, -v[:, 1:] * q])])
    _, _, vt = np.linalg.svd(a, full_matrices=False)
    p = np.linalg.inv(t2) @ vt[-1].reshape(3, 4) @ t3
    p /= p[-1, -1]
    def residual(param):
        camera = np.append(param, 1).reshape(3, 4)
        return (project(camera, points)[0] - pixels).ravel()
    fit = least_squares(residual, p.ravel()[:-1], loss='soft_l1', f_scale=3, max_nfev=1000, x_scale='jac')
    return np.append(fit.x, 1).reshape(3, 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--glb', type=Path, required=True)
    ap.add_argument('--photo', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--flip-v', action='store_true')
    args = ap.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    vertices, faces, uv, texture, digest = read_glb(args.glb)
    photo = np.asarray(Image.open(args.photo).convert('RGB'))
    size = (photo.shape[1], photo.shape[0])
    # Initial view only: these bounds are not the registration or physical scale.
    screen = np.column_stack([(vertices[:, 0] + 2.25) / 4.4 * (size[0] - 1), (2.15 - vertices[:, 1]) / 3.55 * (size[1] - 1)])
    rgb, xyz, triangles = rasterize(vertices, faces, uv, texture, screen, -vertices[:, 2], size, flip_v=args.flip_v)
    Image.fromarray(rgb).save(args.output / 'orthographic.jpg', quality=94)
    src, dst, points, counts, homography = feature_matches(rgb, photo, xyz)
    print(counts, flush=True)
    # Spatial grid-based holdout: nearby features are not split between fit/check.
    cells = np.floor(dst / 160).astype(int)
    check = (cells[:, 0] * 3 + cells[:, 1] * 7) % 5 == 0
    camera = fit_camera(points[~check], dst[~check])
    predicted, _ = project(camera, points)
    error = np.linalg.norm(predicted - dst, axis=1)
    # Tighten fit with robust residuals, keeping validation points entirely out.
    train = (~check) & (error < 10)
    if train.sum() >= 20:
        camera = fit_camera(points[train], dst[train])
        predicted, _ = project(camera, points)
        error = np.linalg.norm(predicted - dst, axis=1)
    screen, depth = project(camera, vertices)
    rgb2, xyz2, triangles2 = rasterize(vertices, faces, uv, texture, screen, depth, size, perspective=True, flip_v=args.flip_v)
    # Rematch at the fitted viewpoint, then retain a spatially separate holdout.
    src, dst, points, refined_counts, _ = feature_matches(rgb2, photo, xyz2, threshold=8)
    counts['refinedMatches'] = refined_counts
    cells = np.floor(dst / 160).astype(int)
    check = (cells[:, 0] * 3 + cells[:, 1] * 7) % 5 == 0
    camera = fit_camera(points[~check], dst[~check])
    predicted, _ = project(camera, points)
    error = np.linalg.norm(predicted - dst, axis=1)
    train = (~check) & (error < 12)
    camera = fit_camera(points[train], dst[train])
    predicted, _ = project(camera, points)
    error = np.linalg.norm(predicted - dst, axis=1)
    screen, depth = project(camera, vertices)
    rgb2, xyz2, triangles2 = rasterize(vertices, faces, uv, texture, screen, depth, size, perspective=True, flip_v=args.flip_v)
    # A smooth residual field accounts for local scan/lens distortion. It never
    # invents geometry: all mapped coordinates still lie on source triangles.
    # Held-out features are excluded from BOTH camera and residual-field fits.
    warp_train = train & (error < 10)
    smooth = RBFInterpolator(predicted[warp_train] / size[0], dst[warp_train] - predicted[warp_train],
                             kernel='thin_plate_spline', smoothing=0.003, neighbors=48)
    refined_predicted = predicted + smooth(predicted / size[0])
    refined_error = np.linalg.norm(refined_predicted - dst, axis=1)
    grid_y, grid_x = np.mgrid[0:size[1]:24, 0:size[0]:24]
    grid = np.column_stack([grid_x.ravel(), grid_y.ravel()])
    delta_grid = smooth(grid / size[0]).reshape(*grid_x.shape, 2).astype(np.float32)
    # Remap destination pixels back to the global projection with fixed-point
    # inversion; sampling the field on its actual coordinates avoids resize drift.
    gy, gx = np.indices((size[1], size[0]), dtype=np.float32)
    mx, my = gx.copy(), gy.copy()
    for _ in range(4):
        delta = cv2.remap(delta_grid, mx / 24, my / 24, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        mx, my = gx - delta[:, :, 0], gy - delta[:, :, 1]
    rgb3 = cv2.remap(rgb2, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(242, 242, 242))
    xyz3 = cv2.remap(xyz2, mx, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=(float('nan'),) * 3)
    triangles3 = cv2.remap(triangles2.astype(np.float32), mx, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=-1).astype(np.int32)
    Image.fromarray(rgb3).save(args.output / 'registered-local.jpg', quality=94)
    Image.fromarray(np.rint(photo.astype(float) * 0.5 + rgb3.astype(float) * 0.5).astype(np.uint8)).save(args.output / 'overlay-local.jpg', quality=94)
    Image.fromarray(rgb2).save(args.output / 'registered.jpg', quality=94)
    overlay = np.rint(photo.astype(float) * 0.5 + rgb2.astype(float) * 0.5).astype(np.uint8)
    Image.fromarray(overlay).save(args.output / 'overlay.jpg', quality=94)
    diagnostic = photo.copy()
    for actual, estimated, e, test in zip(dst, predicted, error, check):
        color = (30, 230, 60) if e < 5 else (255, 150, 0) if e < 10 else (255, 30, 40)
        cv2.line(diagnostic, tuple(np.rint(actual).astype(int)), tuple(np.rint(estimated).astype(int)), color, 2)
        cv2.circle(diagnostic, tuple(np.rint(actual).astype(int)), 4 if test else 2, color, 1)
    Image.fromarray(diagnostic).save(args.output / 'feature-errors.jpg', quality=94)
    stats = {'sourceSha256': digest, 'photoSha256': hashlib.sha256(args.photo.read_bytes()).hexdigest(), 'photoSize': list(size), 'camera': camera.tolist(), **counts,
             'trainingCount': int(train.sum()), 'holdoutCount': int(check.sum()),
             'trainErrorPx': dict(zip(['median', 'p90', 'p95', 'max'], np.quantile(error[train], [.5, .9, .95, 1]).tolist())),
             'holdoutErrorPx': dict(zip(['median', 'p90', 'p95', 'max'], np.quantile(error[check], [.5, .9, .95, 1]).tolist()))}
    stats['localHoldoutErrorPx'] = dict(zip(['median', 'p90', 'p95', 'max'], np.quantile(refined_error[check], [.5, .9, .95, 1]).tolist()))
    stats['localTrainErrorPx'] = dict(zip(['median', 'p90', 'p95', 'max'], np.quantile(refined_error[train], [.5, .9, .95, 1]).tolist()))
    (args.output / 'camera.json').write_text(json.dumps(stats, indent=2) + '\n')
    np.savez_compressed(args.output / 'registration.npz', camera=camera, xyz=xyz3, triangles=triangles3, featureXYZ=points, featurePhoto=dst, featureRender=src, featureError=error, localError=refined_error, localPredicted=refined_predicted, holdout=check, train=train, inverseMapX=mx, inverseMapY=my, residualGrid=delta_grid)
    print(json.dumps(stats, indent=2), flush=True)


if __name__ == '__main__':
    main()
