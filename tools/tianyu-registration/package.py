#!/usr/bin/env python3
"""Publish auditable point/surface links and comparison images from a fit."""
import argparse
import json
import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from register import read_glb, project

REVISION = 'photo-glb-r1-20260926'
ap = argparse.ArgumentParser()
ap.add_argument('--glb', type=Path, required=True)
ap.add_argument('--photo', type=Path, required=True)
ap.add_argument('--holds', type=Path, required=True)
ap.add_argument('--fit', type=Path, required=True)
ap.add_argument('--crosscheck', type=Path, required=True)
ap.add_argument('--public', type=Path, required=True)
ap.add_argument('--diagnostics', type=Path, required=True)
args = ap.parse_args()
args.diagnostics.mkdir(parents=True, exist_ok=True)
vertices, faces, uv, texture, digest = read_glb(args.glb)
fit = np.load(args.fit / 'registration.npz')
dense = np.load(args.fit / 'dense.npz')
stats = json.loads((args.fit / 'camera.json').read_text())
crosscheck = json.loads((args.crosscheck / 'crosscheck.json').read_text())
holds = json.loads(args.holds.read_text())['holds']
photo = Image.open(args.photo).convert('RGB')
registered = Image.open(args.fit / 'registered-dense.jpg').convert('RGB')
width, height = photo.size
photo_gray = cv2.GaussianBlur(cv2.cvtColor(np.asarray(photo), cv2.COLOR_RGB2GRAY), (0, 0), 1.2)
scan_gray = cv2.GaussianBlur(cv2.cvtColor(np.asarray(registered), cv2.COLOR_RGB2GRAY), (0, 0), 1.2)
assert stats['sourceSha256'] == digest
assert stats['holdoutCount'] >= 100 and stats['localHoldoutErrorPx']['p95'] <= 8, 'Fit did not meet publication criteria'
assert len(crosscheck) == 2 and all(item['holdoutCount'] >= 40 and item['holdoutErrorPx']['p95'] <= 10 for item in crosscheck)
camera = fit['camera']
inv_camera = np.linalg.inv(camera[:, :3])
origin = -inv_camera @ camera[:, 3]
controls = fit['featurePhoto']
cross_validation = np.load(args.fit / 'cross-validation.npz')
checks = controls
check_errors = cross_validation['errors']
surface_map = dense['triangles']
inverse_x, inverse_y = dense['inverseMapX'], dense['inverseMapY']
dense_flow, dense_consistency = dense['flow'], dense['consistency']
screen, _ = project(camera, vertices)
tri_a = vertices[faces[:, 0]]
tri_ab = vertices[faces[:, 1]] - tri_a
tri_ac = vertices[faces[:, 2]] - tri_a

def intersect(direction):
    h = np.cross(np.broadcast_to(direction, tri_ac.shape), tri_ac)
    determinant = np.einsum('ij,ij->i', tri_ab, h)
    safe = np.abs(determinant) > 1e-10
    inverse = np.zeros_like(determinant)
    inverse[safe] = 1 / determinant[safe]
    s = origin - tri_a
    u = inverse * np.einsum('ij,ij->i', s, h)
    q = np.cross(s, tri_ab)
    v = inverse * (q @ direction)
    distance = inverse * np.einsum('ij,ij->i', tri_ac, q)
    accepted = safe & (u >= -1e-7) & (v >= -1e-7) & (u + v <= 1 + 1e-7) & (distance > 0)
    if not accepted.any():
        return -1, None
    face = int(np.argmin(np.where(accepted, distance, np.inf)))
    return face, np.array([1 - u[face] - v[face], u[face], v[face]])

points = {}
for hold in holds:
    pixel = np.array([hold['x'] / 100 * (width - 1), hold['y'] / 100 * (height - 1)])
    ix, iy = np.rint(pixel).astype(int)
    face_id = int(surface_map[iy, ix])
    distances = np.linalg.norm(controls - pixel, axis=1)
    local_checks = np.linalg.norm(checks - pixel, axis=1) < 180
    nearest_check = float(np.linalg.norm(checks - pixel, axis=1).min())
    local_error = float(np.quantile(check_errors[local_checks], .9)) if local_checks.any() else None
    record = {'revision': REVISION, 'photoAnchor': {'x': hold['x'], 'y': hold['y']},
        'status': 'missing', 'localCheckP90Px': round(local_error, 2) if local_error is not None else None,
        'localCheckCount': int(local_checks.sum()), 'nearestControlPx': round(float(distances.min()), 2),
        'controlCount': int((distances <= 90).sum())}
    record['localImageCorrectionPx'] = np.round(dense_flow[iy, ix], 3).tolist()
    record['bidirectionalErrorPx'] = round(float(dense_consistency[iy, ix]), 3)
    radius = int(np.clip(hold['radius'] / 100 * width * 1.2, 18, 72))
    search = 20
    if radius + search <= ix < width - radius - search and radius + search <= iy < height - radius - search:
        template = scan_gray[iy-radius:iy+radius+1, ix-radius:ix+radius+1]
        window = photo_gray[iy-radius-search:iy+radius+search+1, ix-radius-search:ix+radius+search+1]
        coverage = float((surface_map[iy-radius:iy+radius+1, ix-radius:ix+radius+1] >= 0).mean())
        if coverage > 0.95 and template.std() > 10:
            correlation = cv2.matchTemplate(window, template, cv2.TM_CCOEFF_NORMED)
            _, peak, _, location = cv2.minMaxLoc(correlation)
            sy, sx = np.indices(correlation.shape)
            competitors = correlation[np.hypot(sx-location[0], sy-location[1]) > 8]
            offset = float(np.hypot(location[0] - search, location[1] - search))
            record['patchCheck'] = {'correlation': round(float(peak), 4), 'offsetPx': round(offset, 2), 'peakMargin': round(float(peak - competitors.max()), 4), 'windowRadiusPx': radius}
    if face_id >= 0:
        # Invert the residual displacement, then intersect the actual source
        # triangle. Barycentric coordinates make the association reproducible.
        query_x, query_y = np.float32([[pixel[0]]]), np.float32([[pixel[1]]])
        px = float(cv2.remap(inverse_x, query_x, query_y, cv2.INTER_LINEAR)[0, 0])
        py = float(cv2.remap(inverse_y, query_x, query_y, cv2.INTER_LINEAR)[0, 0])
        direction = inv_camera @ [px, py, 1]
        face_id, bary = intersect(direction)
        if face_id < 0:
            record['status'] = 'missing'
            record['reason'] = '像素边缘射线未命中原始扫描'
            points[hold['id']] = record
            continue
        tri = vertices[faces[face_id]]
        ab, ac = tri[1] - tri[0], tri[2] - tri[0]
        if bary.min() < -1e-6:
            # Only a raster-boundary ambiguity; reject it rather than clamp the
            # point onto the wrong hold or fabricate a successful registration.
            record['status'] = 'uncertain'
            record['reason'] = '点位位于扫描三角面边缘，需人工核对'
        else:
            xyz = bary @ tri
            normal = np.cross(ab, ac)
            normal /= np.linalg.norm(normal)
            if normal[2] < 0:
                normal = -normal
            edge = max(np.linalg.norm(screen[faces[face_id]][i] - screen[faces[face_id]][j]) for i, j in [(0, 1), (1, 2), (2, 0)])
            sparse_sufficient = distances.min() <= 90 and local_error is not None and local_error <= 8 and nearest_check <= 180
            patch = record.get('patchCheck')
            patch_sufficient = patch is not None and patch['correlation'] >= .75 and patch['peakMargin'] >= .025 and patch['offsetPx'] <= 3
            sufficient = (sparse_sufficient or patch_sufficient) and dense_consistency[iy, ix] <= 2.5 and np.linalg.norm(dense_flow[iy, ix]) <= 35 and (patch is None or patch['offsetPx'] <= 5) and edge <= max(60, hold['radius'] / 100 * width * 4)
            record.update({'status': 'registered' if sufficient else 'uncertain',
                'faceIndex': face_id, 'barycentric': np.round(bary, 7).tolist(), 'surfacePoint': np.round(xyz, 6).tolist(),
                'surfaceNormal': np.round(normal, 6).tolist(), 'triangleMaxEdgePx': round(float(edge), 2),
                'reason': '照片点位已关联原 GLB 表面，局部对齐与正反向一致性检查通过' if sufficient else '已关联扫描表面，但局部对齐或扫描细节不足，建议核对'})
    if record['status'] == 'missing':
        record['reason'] = '该照片点位不在原始 GLB 覆盖范围内；需补扫，保留照片点位用于定线'
    points[hold['id']] = record

counts = {status: sum(p['status'] == status for p in points.values()) for status in ['registered', 'uncertain', 'missing']}
public_assets = args.public / 'boards/tianyu/registration-r1'
public_assets.mkdir(parents=True, exist_ok=True)
rgba = np.dstack([np.asarray(registered), np.where(surface_map >= 0, 255, 0).astype(np.uint8)])
Image.fromarray(rgba).save(public_assets / 'registered.webp', quality=90)
shutil.copyfile(args.glb, public_assets / 'source.glb')
Image.open(args.fit / 'feature-errors.jpg').save(public_assets / 'check-points.webp', quality=90)
overview = photo.copy()
draw = ImageDraw.Draw(overview)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
palette = {'registered': '#16a878', 'uncertain': '#e89c14', 'missing': '#c54150'}
for hold in holds:
    x, y = hold['x'] / 100 * width, hold['y'] / 100 * height
    color = palette[points[hold['id']]['status']]
    draw.ellipse((x - 9, y - 9, x + 9, y + 9), outline=color, width=3)
    draw.text((x + 10, y - 10), hold['serial'][3:], font=font, fill=color, stroke_fill='white', stroke_width=1)
overview.save(public_assets / 'coverage.webp', quality=93)

# Every point gets a paired photo/GLB crop for inspection. Missing geometry is
# gray in the scan crop, never filled in using the photograph.
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 15)
for page in range((len(holds) + 47) // 48):
    sheet = Image.new('RGB', (6 * 216, 8 * 126), 'white')
    drawing = ImageDraw.Draw(sheet)
    for offset, hold in enumerate(holds[page * 48:(page + 1) * 48]):
        x, y = hold['x'] / 100 * width, hold['y'] / 100 * height
        radius = max(30, hold['radius'] / 100 * width * 1.35)
        box = (round(x - radius), round(y - radius), round(x + radius), round(y + radius))
        ox, oy = (offset % 6) * 216, (offset // 6) * 126
        for side, source in enumerate([photo, registered]):
            crop = source.crop(box).resize((104, 104), Image.Resampling.LANCZOS)
            cd = ImageDraw.Draw(crop)
            cd.line((47, 52, 57, 52), fill='#00ffcc', width=1)
            cd.line((52, 47, 52, 57), fill='#00ffcc', width=1)
            sheet.paste(crop, (ox + side * 108, oy + 21))
        drawing.text((ox + 3, oy + 2), f'{hold["serial"]} {points[hold["id"]]["status"]}', font=font, fill=palette[points[hold['id']]['status']])
    sheet.save(args.diagnostics / f'points-{page + 1}.jpg', quality=94)

report = {'version': 1, 'revision': REVISION, 'boardId': 'TY-01',
    'source': {'glbSha256': digest, 'photoSha256': stats['photoSha256'], 'meshCount': 1, 'vertexCount': len(vertices), 'triangleCount': len(faces), 'meshUrl': '/boards/tianyu/registration-r1/source.glb'},
    'photoSize': [width, height], 'counts': counts,
    'method': 'SIFT纹理匹配 → 留出空间分区 → 三维投影相机 → 平滑残差及双向局部图像对齐 → 原网格三角面射线相交 → 双侧照片交叉检查',
    'validation': {'matches': stats['refinedMatches']['homographyInliers'], 'trainingCount': stats['trainingCount'], 'holdoutCount': stats['holdoutCount'],
        'globalHoldoutErrorPx': stats['holdoutErrorPx'], 'holdoutErrorPx': stats['localHoldoutErrorPx'], 'sidePhotos': crosscheck,
        'spatialCrossValidation': json.loads((args.fit / 'cross-validation.json').read_text()),
        'meaning': 'holdoutErrorPx为局部密集对齐之前的稀疏模型留出误差。逐点密集对齐以双向一致性和局部纹理残差检查；二者均不是实物测量精度，也不是每个岩点均有独立实测控制点。'},
    'camera': stats['camera'], 'residualGrid': {'stepPixels': 24, 'values': np.round(fit['residualGrid'], 4).tolist()},
    'assets': {'projection': '/boards/tianyu/registration-r1/registered.webp', 'coverage': '/boards/tianyu/registration-r1/coverage.webp', 'checkPoints': '/boards/tianyu/registration-r1/check-points.webp'},
    'limitations': ['GLB未覆盖照片顶部约15%的板面；缺失点不虚构三维坐标。', '逐点关联的是已有照片标记中心与扫描三角面，不代表完成了整颗岩点的三维分割。', '整体网格经简化；小脚点、凹窝和遮挡面可能缺少细节。', '扫描尺度未经现场量尺校验，不从配准结果推断毫米抓深、摩擦或可攀难度。', '仍保留人工编辑；移动照片点位后原三维关联会标为已失效，避免继续使用旧坐标。'],
    'points': points}
(args.public / 'data/tianyu-registration-r1.json').write_text(json.dumps(report, ensure_ascii=False, separators=(',', ':')) + '\n')
(args.diagnostics / 'summary.json').write_text(json.dumps({'counts': counts, 'validation': report['validation']}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'counts': counts, 'total': len(points), 'output': str(args.public / 'data/tianyu-registration-r1.json')}, ensure_ascii=False))
