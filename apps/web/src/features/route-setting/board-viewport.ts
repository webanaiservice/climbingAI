export type Viewport = { scale: number; x: number; y: number };
export type XY = { x: number; y: number };
export const INITIAL_VIEW: Viewport = { scale: 1, x: 0, y: 0 };
export function clampView(view: Viewport, width: number, height: number): Viewport {
  const scale = Math.max(1, Math.min(4, view.scale));
  const size = Math.min(width, height);
  const limitX = Math.max(0, (size * scale - width) / 2);
  const limitY = Math.max(0, (size * scale - height) / 2);
  return { scale, x: Math.max(-limitX, Math.min(limitX, view.x)), y: Math.max(-limitY, Math.min(limitY, view.y)) };
}
/** The anchor is relative to the viewport center; spreading fingers increases scale. */
export function zoomView(view: Viewport, factor: number, anchor: XY, width: number, height: number): Viewport {
  const scale = Math.max(1, Math.min(4, view.scale * factor)), ratio = scale / view.scale;
  return clampView({ scale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio }, width, height);
}
export function fingerPair(points: XY[]) {
  const [a,b] = points;
  return { distance: Math.max(1, Math.hypot(b.x-a.x,b.y-a.y)), center: { x: (a.x+b.x)/2, y: (a.y+b.y)/2 } };
}
/** Convert a transformed/bordered photograph back to its unscaled content pixels. */
export function photoCoordinates(client: XY, rect: {left:number;top:number;width:number;height:number}, layout: {width:number;height:number;borderX:number;borderY:number;outerWidth:number;outerHeight:number}) {
  const sx = rect.width / layout.outerWidth, sy = rect.height / layout.outerHeight;
  return { x: (client.x-rect.left)/sx-layout.borderX, y: (client.y-rect.top)/sy-layout.borderY };
}
