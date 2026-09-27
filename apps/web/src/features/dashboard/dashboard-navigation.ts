import type { IconName } from './dashboard-icons';
import { trainingHref, trainingSection, trainingSections } from '../training/training-navigation';

export interface NavigationItem {
  href: string;
  icon: IconName;
  label: string;
  requiresRouteSetting?: boolean;
}

export const primaryNavigation: NavigationItem[] = [
  { href: '/dashboard', icon: 'overview', label: '总览' },
];

export const trainingNavigation: NavigationItem[] = [
  ...trainingSections.map((section) => ({
    href: trainingHref(section.id), label: section.label,
    icon: ({ athletes: 'team', sessions: 'calendar', review: 'camera', tasks: 'routes', progress: 'data' } as const)[section.id],
  })),
  { href: '/dashboard/training/board-setting', icon: 'walls', label: '训练板定线', requiresRouteSetting: true },
];

export const operationsNavigation: NavigationItem[] = [
  { href: '/dashboard/assets/holds', icon: 'holds', label: '岩点库' },
  { href: '/dashboard/assets/routes', icon: 'routes', label: '线路库' },
  { href: '/dashboard/route-setting', icon: 'routes', label: 'AI 辅助定线', requiresRouteSetting: true },
  { href: '/dashboard/camera', icon: 'camera', label: '视频识别' },
];

export function visibleNavigation(items: NavigationItem[], routeSettingEnabled: boolean): NavigationItem[] {
  return items.filter((item) => !item.requiresRouteSetting || routeSettingEnabled);
}

export function navigationHref(pathname: string, tab: string | null): string {
  return pathname === '/dashboard/training' ? trainingHref(trainingSection(tab)) : pathname;
}

export function navigationCenter(pathname: string): 'training' | 'operations' | null {
  if (pathname === '/dashboard/training' || pathname.startsWith('/dashboard/training/')) return 'training';
  if (operationsNavigation.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))) return 'operations';
  return null;
}

export const secondaryNavigation: NavigationItem[] = [
  { href: '/dashboard/team', icon: 'team', label: '员工管理' },
];

export const pageTitles: Record<string, string> = {
  '/dashboard': '数字化看板',
  '/dashboard/team': '员工管理',
  '/dashboard/assets/holds': '岩点库',
  '/dashboard/assets/routes': '线路库',
  ...Object.fromEntries([...trainingNavigation, ...operationsNavigation].map((item) => [item.href, item.label])),
  ...Object.fromEntries(secondaryNavigation.map((item) => [item.href, item.label])),
};
