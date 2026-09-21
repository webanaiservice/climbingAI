import { notFound } from 'next/navigation';
import RouteSettingPage from '../../../features/route-setting/route-setting-page';
import { canUseRouteSetting } from '../../../lib/route-setting-access';
import { requireSession } from '../../../lib/server-session';
import '../../../features/route-setting/route-setting.css';

export default async function Page() {
  const session = await requireSession();
  if (!canUseRouteSetting(session.account.email)) notFound();
  return <RouteSettingPage />;
}
