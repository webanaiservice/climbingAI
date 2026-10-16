/* Shared, dependency-free geometry. Metres; X right, Y up from climbing base,
 * Z towards the climber. Positive angle = overhang (drawing uses the opposite).
 * Screenshot reconstruction, NOT survey/CAD geometry. Top widths and connecting
 * edge lengths are retained; the unknown horizontal origin is centred on base.
 */
const WALL_ID = 'tianyu-floor-1-r1';
const HEIGHT = 3.806;
const PLINTH = 0.6;
const bottomWidths = [3.728, 3.610, 4.029, 5.914, 4.008, 3.244];
const topWidths = [3.046, 3.093, 3.485, 4.767, 3.469, 3.220];
const angles = [-3, 9, 20, 25, 15, 3];
const bridgeEdges = [1.108, 1.087, .735, .976, 1.343];
const WIDTH = bottomWidths.reduce((a, b) => a + b, 0);
const depths = angles.map(a => HEIGHT * Math.tan(a * Math.PI / 180));
const gaps = bridgeEdges.map((edge, i) => Math.sqrt(edge ** 2 - (depths[i + 1] - depths[i]) ** 2));
let bottomX = 0;
let topX = (WIDTH - topWidths.reduce((a, b) => a + b, 0) - gaps.reduce((a, b) => a + b, 0)) / 2;
const faces = [];
for (let i = 0; i < 6; i++) {
  faces.push({ id: `F${i + 1}`, label: `${i + 1} 区 · ${angles[i] < 0 ? '缓斜' : '仰角'} ${Math.abs(angles[i])}°`,
    kind: 'main', angle: angles[i], bottomWidth: bottomWidths[i], topWidth: topWidths[i],
    vertices: [[bottomX, 0, 0], [bottomX + bottomWidths[i], 0, 0], [topX + topWidths[i], HEIGHT, depths[i]], [topX, HEIGHT, depths[i]]] });
  bottomX += bottomWidths[i]; topX += topWidths[i];
  if (i < 5) {
    faces.push({ id: `J${i + 1}`, label: `${i + 1}–${i + 2} 区连接面`, kind: 'join', angle: null,
      bottomWidth: 0, topWidth: bridgeEdges[i],
      vertices: [[bottomX, 0, 0], [bottomX, 0, 0], [topX + gaps[i], HEIGHT, depths[i + 1]], [topX, HEIGHT, depths[i]]] });
    topX += gaps[i];
  }
}
function getFace(id) { return faces.find(face => face.id === id); }
// UV follows the trapezoid (u left→right; v top→bottom), including triangular joins.
function surfacePoint(id, u, v) {
  const face = getFace(id);
  if (!face) throw new Error('未知墙面');
  const t = 1 - v / 100, s = u / 100;
  return [0, 1, 2].map(k => (1 - t) * ((1 - s) * face.vertices[0][k] + s * face.vertices[1][k])
    + t * ((1 - s) * face.vertices[3][k] + s * face.vertices[2][k]));
}
function pointToSurface(id, point) {
  const face = getFace(id);
  if (!face) throw new Error('未知墙面');
  const t = Math.max(.001, Math.min(1, point[1] / HEIGHT));
  const left = face.vertices[0].map((x, k) => x * (1 - t) + face.vertices[3][k] * t);
  const right = face.vertices[1].map((x, k) => x * (1 - t) + face.vertices[2][k] * t);
  const delta = right.map((x, k) => x - left[k]);
  const length2 = delta.reduce((sum, x) => sum + x * x, 0);
  const u = point.reduce((sum, x, k) => sum + (x - left[k]) * delta[k], 0) / length2;
  return { x: Math.max(0, Math.min(100, u * 100)), y: (1 - t) * 100 };
}
function normalFor(id) {
  const f = getFace(id); if (!f) throw new Error('未知墙面');
  const a = f.vertices[2].map((x, k) => x - f.vertices[3][k]);
  const b = f.vertices[3].map((x, k) => x - f.vertices[0][k]);
  const n = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const length = Math.hypot(...n); return n.map(x => x / length);
}
// The AI searches an inscribed rectangle. This keeps metric distances exact on
// the planar face, rather than stretching a 4×4 route onto a tapered wall.
function workingArea(id) {
  const f = getFace(id); if (!f || f.kind !== 'main') throw new Error('AI 请选择主墙段');
  const left = Math.max(f.vertices[0][0], f.vertices[3][0]) + .12;
  const right = Math.min(f.vertices[1][0], f.vertices[2][0]) - .12;
  return { faceId: id, left, widthM: right - left, heightM: HEIGHT / Math.cos(f.angle * Math.PI / 180), angle: f.angle };
}
function workingToSurface(id, x, y) {
  const area = workingArea(id), f = getFace(id), t = 1 - y / 100;
  return pointToSurface(id, [area.left + area.widthM * x / 100, HEIGHT * t, f.vertices[3][2] * t]);
}
module.exports = { WALL_ID, HEIGHT, PLINTH, WIDTH, faces, getFace, surfacePoint, pointToSurface, normalFor, workingArea, workingToSurface };
