#!/usr/bin/env python3
"""Check that all published 3D links really belong to the unmodified GLB."""
import argparse
import json
from pathlib import Path
import numpy as np
from register import read_glb, project

ap = argparse.ArgumentParser()
ap.add_argument('--public', type=Path, required=True)
args = ap.parse_args()
report = json.loads((args.public / 'data/tianyu-registration-r1.json').read_text())
seed = json.loads((args.public / 'data/tianyu-reviewed-holds.json').read_text())
vertices, faces, _, _, digest = read_glb(args.public / report['source']['meshUrl'].lstrip('/'))
assert digest == report['source']['glbSha256']
assert set(report['points']) == {h['id'] for h in seed['holds']}
assert sum(report['counts'].values()) == len(seed['holds'])
linked = 0
for hold in seed['holds']:
    record = report['points'][hold['id']]
    assert record['photoAnchor'] == {'x': hold['x'], 'y': hold['y']}
    assert hold['confirmed']
    if record['status'] == 'missing':
        assert 'surfacePoint' not in record and 'faceIndex' not in record
        continue
    if 'surfacePoint' not in record:
        assert record['status'] == 'uncertain'
        continue
    face, bary = record['faceIndex'], np.asarray(record['barycentric'])
    assert 0 <= face < len(faces)
    assert bary.min() >= -1e-6 and abs(bary.sum()-1) < 1e-6
    reconstructed = bary @ vertices[faces[face]]
    assert np.linalg.norm(reconstructed - record['surfacePoint']) < 2e-6
    _, depth = project(np.asarray(report['camera']), reconstructed[None])
    assert depth[0] > 0
    if record['status'] == 'registered':
        assert record['bidirectionalErrorPx'] <= 2.5
        if 'patchCheck' in record:
            assert record['patchCheck']['offsetPx'] <= 5
    linked += 1
assert report['validation']['holdoutCount'] >= 100
assert report['validation']['holdoutErrorPx']['p95'] <= 8
print(json.dumps({'status': 'PASS', 'sourceMeshUnchanged': True, 'holds': len(seed['holds']), 'sourceTriangleLinks': linked, 'counts': report['counts']}))
