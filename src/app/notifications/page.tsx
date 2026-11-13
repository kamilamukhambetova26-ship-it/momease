import Link from 'next/link';
import { markNotificationsReadAction } from '@/app/actions';
import { requireUser } from '@/lib/auth';
import { getI18n } from '@/lib/i18n-server';
import { listNotifications, notifVars } from '@/lib/notify';

export default async function NotificationsPage() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const list = await listNotifications(user.id);
  const fmt = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Almaty',
  });
  const unread = list.filter((n) => !n.readAt).length;

  return (
    <main className="wrap section">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 className="display" style={{ fontSize: 26, margin: 0 }}>{t('notif.title')}</h1>
        {unread > 0 && (
          <form action={markNotificationsReadAction}>
            <button className="btn small outline" type="submit">{t('notif.markRead')}</button>
          </form>
        )}
      </div>
      {list.length === 0 ? (
        <div className="empty">{t('notif.empty')}</div>
      ) : (
        <ul className="notif-list">
          {list.map((n) => {
            let params: Record<string, unknown> = {};
            try {
              params = JSON.parse(n.params);
            } catch {
              /* пустые значения */
            }
            return (
              <li key={n.id} className={n.readAt ? '' : 'unread'}>
                <Link href={n.link}>{t(`notif.${n.type}`, notifVars(params, locale))}</Link>
                <small>{fmt.format(n.createdAt)}</small>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
