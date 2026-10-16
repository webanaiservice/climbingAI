import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { workspaceSizing } from './use-workspace-layout';

const css = readFileSync(new URL('./route-setting.css', import.meta.url), 'utf8');
describe('iPadOS 15 workspace compatibility', () => {
  it('never puts essential styles behind unsupported scope/container syntax', () => {
    expect(css).not.toMatch(/@(?:scope|container)\s*\(/);
    expect(css).not.toMatch(/@container\s+route-workspace/);
    expect(css).not.toMatch(/\d+cq[wh]/);
    expect(css).toContain(':where(.route-app) .hold-image-wrap img');
    expect(css).toContain('.dashboard-main.route-dashboard-main');
    expect(css).toContain('width: var(--board-fit, 360px)');
  });
  it('subtracts Safari chrome and both in-page toolbars from the live viewport', () => {
    expect(workspaceSizing(1024,636,56,52).height).toBe(528);
    expect(workspaceSizing(1024,636,56,0).height).toBe(580);
    expect(workspaceSizing(768,892,56,52).height).toBe(784);
    expect(workspaceSizing(768,460,56,52).height).toBe(352);
  });
  it('uses content width (not device UA) for sidebar and split-view breakpoints', () => {
    expect(workspaceSizing(1024,636,56,52).breakpoints['data-max-1179']).toBe('true');
    expect(workspaceSizing(768,892,56,52).breakpoints['data-max-780']).toBe('true');
    expect(workspaceSizing(1400,900,74,64).breakpoints['data-max-1179']).toBe('false');
  });
  it('keeps an empty inspector out of the canvas and bounds catalogue thumbnails', () => {
    expect(css).toContain('.floor-wall-selection[hidden] { display: none; }');
    expect(css).toContain('.floor-scene-area > .floor-wall-viewport { position: absolute; inset: 0;');
    expect(css).toContain('.route-app.floor-workspace .hold-image-wrap { width: 100%; height: 72px; }');
  });
});
