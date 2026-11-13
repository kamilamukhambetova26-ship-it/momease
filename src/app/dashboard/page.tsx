import Link from 'next/link';
import { Flash } from '@/components/Shared';
import { requireUser } from '@/lib/auth';
import { isProviderRole } from '@/lib/constants';
import { getI18n } from '@/lib/i18n-server';
import { ADMIN_TABS, AdminView, ModerationView, ParentView, ProviderView, ReportsView, SupportView, type AdminTab } from './views';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const { t } = await getI18n();
  const actor = { id: user.id, role: user.role };

  // три интерфейса: пользователь, специалист, администратор (менеджер видит только модерацию)
  const kind = user.role === 'admin' ? 'admin' : user.role === 'manager' ? 'manager' : isProviderRole(user.role) ? 'provider' : 'parent';
  const tab: AdminTab = (ADMIN_TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as AdminTab) : 'overview';

  return (
    <main className="wrap section">
      <div className="dash-banner" data-role={kind}>
        <div>
          <h1>{t('dash.hello', { name: user.name })}</h1>
          <p>{t(`dash.about.${kind}`)}</p>
        </div>
        <span className="badge">{t(`role.${user.role}`)}</span>
      </div>
      <Flash code={sp.msg} t={t} />
      {(kind === 'parent' || kind === 'provider') && (
        <p>
          <Link className="btn outline" href="/messages">{t('messages.all')}</Link>
        </p>
      )}

      {kind === 'parent' && <ParentView userId={user.id} />}
      {kind === 'provider' && <ProviderView userId={user.id} />}
      {kind === 'manager' && (
        <>
          <ReportsView actor={actor} />
          <ModerationView actor={actor} />
          <SupportView actor={actor} />
        </>
      )}
      {kind === 'admin' && <AdminView actor={actor} tab={tab} />}
    </main>
  );
}
