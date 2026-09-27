import { describe, expect, it } from 'vitest';
import { navigationCenter, navigationHref, operationsNavigation, pageTitles, primaryNavigation, trainingNavigation, visibleNavigation } from './dashboard-navigation';
import { trainingHref, trainingSection, trainingSections } from '../training/training-navigation';

describe('业务中心导航', () => {
  it('总览独立，训练与运营入口不重复', () => {
    expect(primaryNavigation.map((item) => item.label)).toEqual(['总览']);
    expect(trainingNavigation.map((item) => item.label)).toEqual(['运动员档案', '训练日志', '视频复盘', '训练任务', '成长报告', '训练板定线']);
    expect(operationsNavigation.map((item) => item.label)).toEqual(['岩点库', '线路库', 'AI 辅助定线', '视频识别']);
    const paths = [...primaryNavigation, ...trainingNavigation, ...operationsNavigation].map((item) => item.href);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('训练深链接可恢复，未知页签回到运动员档案', () => {
    for (const section of trainingSections) {
      expect(trainingSection(section.id)).toBe(section.id);
      expect(navigationHref('/dashboard/training', section.id)).toBe(trainingHref(section.id));
      expect(pageTitles[trainingHref(section.id)]).toBe(section.label);
    }
    expect(navigationHref('/dashboard/training', 'unknown')).toBe('/dashboard/training');
    expect(navigationHref('/dashboard/training', null)).toBe('/dashboard/training');
  });

  it('训练板和视频识别归入正确中心，查询参数不影响其他模块', () => {
    expect(navigationCenter('/dashboard/training/board-setting')).toBe('training');
    expect(navigationCenter('/dashboard/camera')).toBe('operations');
    expect(navigationCenter('/dashboard/assets/routes')).toBe('operations');
    expect(navigationCenter('/dashboard/route-setting')).toBe('operations');
    expect(navigationCenter('/dashboard')).toBeNull();
    expect(navigationCenter('/dashboard/team')).toBeNull();
    expect(navigationHref('/dashboard/training/board-setting', 'review')).toBe('/dashboard/training/board-setting');
  });

  it('原 AI 灰度开关同时控制两个入口，其他功能不受影响', () => {
    expect(visibleNavigation(trainingNavigation, false)).toHaveLength(5);
    expect(visibleNavigation(operationsNavigation, false).map((item) => item.label)).toEqual(['岩点库', '线路库', '视频识别']);
    expect(visibleNavigation(trainingNavigation, true)).toHaveLength(6);
    expect(visibleNavigation(operationsNavigation, true)).toHaveLength(4);
  });

  it('保留旧运营网址和标题映射', () => {
    expect(operationsNavigation.map((item) => item.href)).toEqual(['/dashboard/assets/holds', '/dashboard/assets/routes', '/dashboard/route-setting', '/dashboard/camera']);
    for (const item of [...trainingNavigation, ...operationsNavigation]) expect(pageTitles[item.href]).toBe(item.label);
  });
});
