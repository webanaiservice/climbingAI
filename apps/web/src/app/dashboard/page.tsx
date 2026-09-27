import { CoreModuleCard, SectionCard, StatGrid } from '../../features/dashboard/page-components';
import { requireSession } from '../../lib/server-session';
import { canUseRouteSetting } from '../../lib/route-setting-access';

const overviewStats = [
  {
    label: '岩点资产',
    value: '可管理',
    detail: '档案、数量、状态与模型',
    tone: 'accent' as const,
  },
  { label: '线路档案', value: '可发布', detail: '位置、二维码与生命周期' },
  { label: '会员反馈', value: 'QR', detail: '匿名 10 秒反馈' },
  { label: '试点区域', value: 'W03–W05', detail: '线路视觉定位', tone: 'warning' as const },
];

export default async function DashboardPage() {
  const session = await requireSession();
  const routeSettingEnabled = canUseRouteSetting(session.account.email);
  return (
    <div className="page-stack">
      <OverviewHero />
      <StatGrid items={overviewStats} />
      <section className="overview-grid business-centers-grid">
        <SectionCard
          title="训练中心"
          description="以运动员为主体，连接档案、训练记录与复盘。"
          className="module-section"
        >
          <div className="core-module-grid">
            <CoreModuleCard
              href="/dashboard/training"
              icon="team"
              title="运动员训练"
              description="运动员档案、视频复盘与复测"
              status="训练闭环"
            />
            {routeSettingEnabled && <CoreModuleCard
              href="/dashboard/training/board-setting"
              icon="walls"
              title="训练板定线"
              description="天宇板选点、AI 辅助与人工调整"
              status="固定安装点"
            />}
          </div>
        </SectionCard>
        <SectionCard
          title="运营中心"
          description="以岩馆为主体，管理岩点、线路与视频识别。"
          className="readiness-section"
        >
          <div className="core-module-grid">
            <CoreModuleCard href="/dashboard/assets/holds" icon="holds" title="岩点库" description="档案、库存、照片与 3D" status="岩点资产" />
            <CoreModuleCard href="/dashboard/assets/routes" icon="routes" title="线路库" description="发布、反馈与历史线路" status="线路资产" />
            {routeSettingEnabled && <CoreModuleCard href="/dashboard/route-setting" icon="routes" title="AI 辅助定线" description="自由定线与虚拟固定板设计" status="辅助设计" />}
            <CoreModuleCard href="/dashboard/camera" icon="camera" title="视频识别" description="监控采集、攀爬观察与人工复核" status="运营观察" />
          </div>
        </SectionCard>
      </section>
      <SectionCard
        title="当前演示路径"
        description="从资产、线路到训练，逐步建立可追溯的日常运营记录。"
      >
        <div className="demo-path">
          <span>1</span>
          <p>
            <strong>岩点入库</strong>
            <small>同款建档一次，记录数量与状态</small>
          </p>
          <b>→</b>
          <span>2</span>
          <p>
            <strong>线路建档</strong>
            <small>关联 W03–W05 墙段并确认视觉位置</small>
          </p>
          <b>→</b>
          <span>3</span>
          <p>
            <strong>发布与反馈</strong>
            <small>二维码收集完攀、难度与喜好</small>
          </p>
          <b>→</b>
          <span>4</span>
          <p>
            <strong>查看结果</strong>
            <small>库存清晰，线路表现可复盘</small>
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

function OverviewHero() {
  return (
    <section className="overview-hero">
      <div className="overview-hero-copy">
        <p className="page-eyebrow">CLIMBING GYM · DIGITAL FOUNDATION</p>
        <h2>让岩馆运营与训练有据可依</h2>
        <p>管理岩点与线路，记录运动员成长，用视频复盘连接每一次训练。</p>
        <span className="poc-badge is-inverse">
          <i />
          POC 环境
        </span>
      </div>
      <RouteVisual />
    </section>
  );
}

function RouteVisual() {
  return (
    <div className="overview-route-visual" aria-hidden="true">
      <svg viewBox="0 0 420 250" role="presentation">
        <path d="M58 230C65 177 100 185 119 145c21-45-10-71 32-106 36-30 79-1 106 39 29 43 47 16 82 51 27 27 29 65 23 101" />
        <circle cx="59" cy="229" r="8" />
        <circle cx="119" cy="145" r="8" />
        <circle cx="151" cy="39" r="8" />
        <circle cx="257" cy="78" r="8" />
        <circle cx="339" cy="129" r="8" />
        <circle cx="362" cy="230" r="8" />
      </svg>
      <span className="route-visual-label">
        <small>当前产品范围</small>
        <strong>岩点资产 · 线路运营 · 运动员训练</strong>
      </span>
    </div>
  );
}
