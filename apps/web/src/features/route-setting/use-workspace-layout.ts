'use client';

import { useEffect, useRef } from 'react';

export function workspaceSizing(width: number, viewportHeight: number, dashboardHeight: number, appHeaderHeight: number) {
  return {
    height: Math.floor(Math.max(200, viewportHeight - dashboardHeight - appHeaderHeight)),
    breakpoints: Object.fromEntries([780, 990, 1000, 1179].map(n => [`data-max-${n}`, String(width <= n)])),
  };
}

/** Measured layout also works on iPadOS 15: no @container/cqw/cqh dependency. */
export function useWorkspaceLayout(mode: string) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const header = root.closest('.dashboard-workspace')?.querySelector('.dashboard-header');
    const appHeader = root.querySelector('.app-header');
    const boardFrame = root.querySelector('.wall-frame');
    let raf = 0;
    const measure = () => {
      const width = root.getBoundingClientRect().width;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const {height, breakpoints} = workspaceSizing(width, viewportHeight, header?.getBoundingClientRect().height ?? 0, appHeader?.getBoundingClientRect().height ?? 0);
      for (const [name,value] of Object.entries(breakpoints)) root.setAttribute(name, value);
      root.setAttribute('data-min-781', String(width >= 781));
      root.style.setProperty('--route-workspace-height', `${height}px`);
      if (boardFrame) {
        const rect = boardFrame.getBoundingClientRect();
        root.style.setProperty('--board-fit', `${Math.max(1, Math.floor(Math.min(rect.width, rect.height)))}px`);
      }
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    [root, header, appHeader, boardFrame].forEach(el => { if (el) observer.observe(el); });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    measure();
    return () => { cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); };
  }, [mode]);
  return ref;
}
