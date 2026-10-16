'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { faces, getFace, HEIGHT, PLINTH, WIDTH, normalFor, pointToSurface, surfacePoint, type Vec3 } from '../../../../../packages/config/tianyu-floor-wall';
import { holdDiameterM, type FloorHold, type FloorPlacement } from './floor-wall-data';

type SurfaceHit = { surfaceId: string; x: number; y: number };
type Props = {
  placements: FloorPlacement[]; selectedId: string | null; faceId: string;
  pendingHold: FloorHold | null; interaction: 'edit' | 'orbit'; view: { kind: 'front' | 'side' | 'all'; nonce: number };
  onSelect(id: string | null): void; onMove(id: string, hit: SurfaceHit): void;
  onPlace(holdId: string, hit: SurfaceHit): void;
};
type Runtime = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; controls: OrbitControls;
  wallMeshes: THREE.Mesh[]; holdGroup: THREE.Group; render(): void; frame(): void;
};

function disposeGroup(group: THREE.Group) {
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Sprite)) return;
    if ('geometry' in object) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) { if ('map' in material) (material.map as THREE.Texture | null)?.dispose(); material.dispose(); }
  });
  group.clear();
}
function positionHold(group: THREE.Object3D, p: Pick<FloorPlacement, 'surfaceId' | 'x' | 'y' | 'rotation'>) {
  const id = p.surfaceId ?? 'F2', normal = new THREE.Vector3(...normalFor(id));
  group.position.set(...surfacePoint(id, p.x, p.y)).addScaledVector(normal, .014);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  group.rotateZ(-p.rotation * Math.PI / 180);
}

export default function FloorWallScene(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null), latest = useRef(props), runtime = useRef<Runtime | null>(null);
  latest.current = props;
  const [ready, setReady] = useState(false), [error, setError] = useState('');

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); }
    catch { setError('当前浏览器无法启动 3D。请启用 WebGL 或使用更新的 Safari / Chrome；岩点草稿仍然保留。'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor('#e5e9e5'); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', '天宇一楼三维墙面，单指编辑岩点，双指平移与缩放');
    renderer.domElement.setAttribute('role', 'application'); renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, .05, 160);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.minDistance = 1.2; controls.maxDistance = 60;
    controls.minPolarAngle = .16; controls.maxPolarAngle = Math.PI * .85;
    controls.minAzimuthAngle = -Math.PI * .48; controls.maxAzimuthAngle = Math.PI * .48;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    const modelGroup = new THREE.Group(), holdGroup = new THREE.Group(); scene.add(modelGroup, holdGroup);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x59665b, 2.3));
    const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(4, 9, 12); scene.add(key);
    const wallMeshes: THREE.Mesh[] = [];
    for (const face of faces) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(face.vertices.flat(), 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: face.kind === 'join' ? '#abb9b3' : '#d2d8cd', side: THREE.DoubleSide, roughness: .9 }));
      mesh.userData.faceId = face.id; wallMeshes.push(mesh); modelGroup.add(mesh);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#6d7a71', transparent: true, opacity: .6 }));
      modelGroup.add(outline);
      if (face.kind === 'main') {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#263b32'; context.fillRect(0, 0, 256, 64); context.fillStyle = '#fff';
          context.font = '28px sans-serif'; context.textAlign = 'center'; context.fillText(face.label, 128, 42);
          const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false }));
          sprite.position.set(...surfacePoint(face.id, 50, 0)); sprite.position.y += .22; sprite.scale.set(1.6, .4, 1); modelGroup.add(sprite);
        }
      }
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, PLINTH, .18), new THREE.MeshStandardMaterial({ color: '#818e84', roughness: 1 }));
    base.position.set(WIDTH/2, -PLINTH/2, -.06); modelGroup.add(base);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH + 4, 7), new THREE.MeshStandardMaterial({ color: '#bcc5ba', roughness: 1, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(WIDTH / 2, -.025, 3.4); modelGroup.add(floor);
    const render = () => renderer.render(scene, camera);
    const frame = () => {
      const f = getFace(latest.current.faceId) ?? faces[2];
      const center = new THREE.Vector3(...surfacePoint(f.id,50,50));
      const all = latest.current.view.kind === 'all';
      if (all) center.set(WIDTH/2, HEIGHT/2, .65);
      const width = all ? WIDTH + 1 : Math.max(f.bottomWidth,f.topWidth) + .8;
      const distance = Math.max((HEIGHT+1)/2/Math.tan(21*Math.PI/180),width/2/Math.tan(21*Math.PI/180)/camera.aspect)*1.12;
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(latest.current.view.kind === 'side' ? distance*.65 : 0, latest.current.view.kind === 'side' ? distance*.12 : 0, distance));
      controls.update(); render();
    };
    runtime.current = { scene, camera, renderer, controls, wallMeshes, holdGroup, render, frame };
    let lastWidth = 0;
    const resize = () => { const r = host.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
      renderer.setSize(r.width, r.height); camera.aspect = r.width/r.height; camera.updateProjectionMatrix();
      if (Math.abs(lastWidth-r.width)>2) frame(); else render(); lastWidth = r.width;
    };
    const observer = new ResizeObserver(resize); observer.observe(host); controls.addEventListener('change', render);
    const raycaster = new THREE.Raycaster();
    function ray(clientX: number, clientY: number) { const r = renderer.domElement.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1, 1-(clientY-r.top)/r.height*2), camera); }
    function wallHit(x: number, y: number): SurfaceHit | null {
      ray(x,y); const hit = raycaster.intersectObjects(wallMeshes)[0]; if (!hit) return null;
      const id = hit.object.userData.faceId as string;
      return { surfaceId: id, ...pointToSurface(id, hit.point.toArray() as Vec3) };
    }
    function pickHold(x: number, y: number): string | null {
      ray(x,y); const hit = raycaster.intersectObjects(holdGroup.children, true)[0];
      const wall = raycaster.intersectObjects(wallMeshes)[0];
      if (hit && (!wall || hit.distance < wall.distance + .02)) return String(hit.object.parent?.userData.instanceId);
      // Small footholds remain touchable when zoomed out; reject occluded faces.
      const r = renderer.domElement.getBoundingClientRect(); let best: { id: string; distance: number } | null = null;
      for (const object of holdGroup.children) {
        const v = object.position.clone().project(camera); if (v.z < -1 || v.z > 1) continue;
        const px = r.left + (v.x + 1) / 2 * r.width, py = r.top + (1 - v.y) / 2 * r.height;
        const distance = Math.hypot(px-x, py-y); if (distance > 22 || (best && distance >= best.distance)) continue;
        ray(px, py); const wall = raycaster.intersectObjects(wallMeshes)[0];
        if (wall && wall.distance + .12 < camera.position.distanceTo(object.position)) continue;
        best = { id: object.userData.instanceId, distance };
      }
      return best?.id ?? null;
    }
    let gesture: { pointer: number; x: number; y: number; id: string | null; moved: boolean; hit: SurfaceHit | null } | null = null;
    const pointers = new Set<number>(); let multi = false;
    function restoreDrag() {
      if (gesture?.id) { const p = latest.current.placements.find(p => p.instanceId === gesture?.id), object = holdGroup.children.find(o => o.userData.instanceId === gesture?.id); if (p && object) positionHold(object, p); }
      gesture = null; controls.enabled = true; render();
    }
    const down = (event: PointerEvent) => {
      pointers.add(event.pointerId);
      if (pointers.size > 1) { multi = true; restoreDrag(); return; }
      multi = false;
      const id = latest.current.interaction === 'edit' && !latest.current.pendingHold ? pickHold(event.clientX, event.clientY) : null;
      gesture = { pointer: event.pointerId, x: event.clientX, y: event.clientY, id, moved: false, hit: null };
      if (id) { latest.current.onSelect(id); controls.enabled = false; event.stopImmediatePropagation(); renderer.domElement.setPointerCapture(event.pointerId); }
    };
    const move = (event: PointerEvent) => {
      if (!gesture || gesture.pointer !== event.pointerId || multi) return;
      if (Math.hypot(event.clientX-gesture.x, event.clientY-gesture.y) > 6) gesture.moved = true;
      if (!gesture.id || !gesture.moved) return;
      event.stopImmediatePropagation();
      const hit = wallHit(event.clientX, event.clientY); gesture.hit = hit;
      const point = latest.current.placements.find(p => p.instanceId === gesture?.id), object = holdGroup.children.find(o => o.userData.instanceId === gesture?.id);
      if (hit && point && object) { positionHold(object, { ...point, ...hit }); render(); }
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId); const current = gesture;
      if (!multi && current?.pointer === event.pointerId) {
        if (current.id && current.moved && current.hit) latest.current.onMove(current.id, current.hit);
        else if (!current.id && !current.moved) {
          const hit = wallHit(event.clientX, event.clientY);
          if (hit && latest.current.pendingHold) latest.current.onPlace(latest.current.pendingHold.id, hit);
          else latest.current.onSelect(pickHold(event.clientX, event.clientY));
        }
      }
      restoreDrag(); if (pointers.size === 0) multi = false;
    };
    const cancel = (event: PointerEvent) => { pointers.delete(event.pointerId); restoreDrag(); };
    const dragover = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => { event.preventDefault(); const id = event.dataTransfer?.getData('text/hold-id'), hit = wallHit(event.clientX,event.clientY); if (id && hit) latest.current.onPlace(id,hit); };
    const lost = (event: Event) => { event.preventDefault(); setError('3D 显示已暂停。草稿仍在，请刷新页面重新打开。'); };
    renderer.domElement.addEventListener('pointerdown', down, true); renderer.domElement.addEventListener('pointermove', move, true);
    renderer.domElement.addEventListener('pointerup', up, true); renderer.domElement.addEventListener('pointercancel', cancel, true);
    renderer.domElement.addEventListener('dragover', dragover); renderer.domElement.addEventListener('drop', drop);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    resize(); setReady(true);
    return () => { observer.disconnect(); controls.removeEventListener('change', render); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', down, true); renderer.domElement.removeEventListener('pointermove', move, true);
      renderer.domElement.removeEventListener('pointerup', up, true); renderer.domElement.removeEventListener('pointercancel', cancel, true);
      renderer.domElement.removeEventListener('dragover', dragover); renderer.domElement.removeEventListener('drop', drop); renderer.domElement.removeEventListener('webglcontextlost', lost);
      disposeGroup(modelGroup); disposeGroup(holdGroup); renderer.dispose(); renderer.domElement.remove(); runtime.current = null;
    };
  }, []);

  useEffect(() => {
    const rt = runtime.current; if (!rt) return;
    let disposed = false; disposeGroup(rt.holdGroup);
    const loader = new THREE.TextureLoader();
    for (const p of props.placements) {
      const group = new THREE.Group(); group.userData.instanceId = p.instanceId; positionHold(group,p);
      const diameter = holdDiameterM(p.hold,p.scale);
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: '#89958d', roughness: .85, transparent:true, opacity:.6 }));
      body.scale.set(diameter*.38,diameter*.28,diameter*.08); group.add(body);
      // Photograph is mounted on the tangent plane; thickness is only a proxy.
      if (p.hold.image.startsWith('/')) {
        loader.load(p.hold.image, texture => { if (disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          const photo = new THREE.Mesh(new THREE.PlaneGeometry(diameter,diameter), new THREE.MeshBasicMaterial({ map:texture, transparent:true, alphaTest:.15, side:THREE.DoubleSide }));
          photo.position.z = diameter*.09; group.add(photo); rt.render();
        }, undefined, () => { /* Keep the shape proxy if a catalogue photo is unavailable. */ });
      }
      const color = p.instanceId === props.selectedId ? '#ffffff' : p.startLimbs?.length || p.role === 'start' ? '#29b96e' : p.role === 'finish' ? '#e84165' : p.role === 'foot' ? '#05a3b4' : p.routeColor;
      const ring = new THREE.Mesh(new THREE.RingGeometry(diameter*.54,diameter*.54 + (p.instanceId===props.selectedId ? .022 : .012),32), new THREE.MeshBasicMaterial({color, side:THREE.DoubleSide}));
      ring.position.z = diameter*.1; group.add(ring); rt.holdGroup.add(group);
    }
    rt.render(); return () => { disposed = true; };
  }, [ready, props.placements, props.selectedId]);

  useEffect(() => {
    const rt = runtime.current; if (!rt) return;
    rt.controls.enableRotate = props.interaction === 'orbit';
    rt.controls.touches.ONE = props.interaction === 'orbit' ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
    rt.controls.mouseButtons.LEFT = props.interaction === 'orbit' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  }, [ready, props.interaction]);

  useEffect(() => {
    const rt = runtime.current; if (!rt) return;
    rt.frame();
    for (const mesh of rt.wallMeshes) (mesh.material as THREE.MeshStandardMaterial).color.set(mesh.userData.faceId===props.faceId ? '#e4e1cc' : getFace(mesh.userData.faceId)?.kind==='join' ? '#abb9b3' : '#d2d8cd');
    rt.render();
  }, [ready, props.faceId, props.view]);

  return <div className="floor-wall-viewport" ref={hostRef} data-ready={ready}>
    {error && <div className="floor-wall-error" role="alert">{error}</div>}
    {!ready && !error && <div className="floor-wall-error" role="status">正在载入三维墙面…</div>}
  </div>;
}
