import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AutoRefresh } from '@/components/AutoRefresh';
import { Avatar } from '@/components/Shared';
import { requireUser } from '@/lib/auth';
import { listChats } from '@/lib/chat';
import { isStaff } from '@/lib/constants';
import { getI18n } from '@/lib/i18n-server';

export default async function MessagesPage() {
  const user = await requireUser();
  if (isStaff(user.role)) redirect('/dashboard');
  const { t, locale } = await getI18n();
  const chats = await listChats({ id: user.id, role: user.role });
  const fmt = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Almaty',
  });
  return (
    <main className="wrap section doc">
      <AutoRefresh />
      <h1>{t('messages.title')}</h1>
      <p className="lead">{t('messages.lead')}</p>
      {chats.length === 0 ? (
        <div className="empty">{t('messages.none')}</div>
      ) : (
        <ul className="inbox">
          {chats.map((c) => (
            <li key={c.id}>
              <Link href={`/chat/${c.id}`} aria-label={`${t('messages.open')}: ${c.other}`}>
                <Avatar name={c.other} id={c.id} />
                <div className="grow">
                  <div className="who">{c.other}</div>
                  <div className="last">{c.lastBody ?? t('messages.empty')}</div>
                </div>
                <div>
                  {c.lastAt && <div className="when">{fmt.format(c.lastAt)}</div>}
                  {c.unread > 0 && <span className="count-dot" aria-label={t('messages.unread', { n: c.unread })}>{c.unread}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
