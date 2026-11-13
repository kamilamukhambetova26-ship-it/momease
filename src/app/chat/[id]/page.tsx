import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sendMessageAction } from '@/app/actions';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ReportForm } from '@/components/ReportForm';
import { Flash } from '@/components/Shared';
import { requireUser } from '@/lib/auth';
import { listMessages } from '@/lib/chat';
import { MAX_MESSAGE_LEN } from '@/lib/constants';
import { formatDate } from '@/lib/dates';
import { getI18n } from '@/lib/i18n-server';
import { ServiceError } from '@/lib/services';

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { t, locale } = await getI18n();

  let data;
  try {
    data = await listMessages({ id: user.id, role: user.role }, Number(id));
  } catch (e) {
    if (e instanceof ServiceError) notFound();
    throw e;
  }
  const { access, rows } = data;
  const timeFmt = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Almaty',
  });

  return (
    <main className="wrap section">
      <p style={{ margin: '0 0 16px' }}>
        <Link href="/dashboard">{t('chat.back')}</Link>
      </p>
      <Flash code={sp.msg} t={t} />
      <div className="panel chat">
        <div className="chat-head">
          <div>
            <h1 className="display" style={{ fontSize: 20, margin: 0 }}>{access.otherName}</h1>
            <div className="muted" style={{ fontSize: 14 }}>
              {formatDate(access.booking.date, locale)} · {t(`bk.${access.booking.status}`)}
            </div>
          </div>
          {!access.staffView && (
            <ReportForm targetType="chat" targetId={access.booking.id} back={`/chat/${access.booking.id}`} t={t} label={t('report.chat')} />
          )}
        </div>
        {access.staffView && <div className="flash err">{t('chat.staffView')}</div>}

        <div className="msgs" aria-live="polite">
          {rows.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t('chat.empty')}</p>
          ) : (
            rows.map((m) => (
              <div key={m.id} className={`msg${m.senderId === user.id ? ' me' : ''}`}>
                <p>{m.body}</p>
                <small>{timeFmt.format(m.createdAt)}</small>
              </div>
            ))
          )}
        </div>

        {access.canWrite ? (
          <form action={sendMessageAction} className="chat-form">
            <input type="hidden" name="bookingId" value={access.booking.id} />
            <label className="sr-only" htmlFor="body">{t('chat.placeholder')}</label>
            <textarea id="body" name="body" required maxLength={MAX_MESSAGE_LEN} placeholder={t('chat.placeholder')} />
            <button className="btn" type="submit">{t('chat.send')}</button>
          </form>
        ) : (
          !access.staffView && <p className="muted" style={{ margin: 0 }}>{t('chat.closed')}</p>
        )}
      </div>
      {!access.staffView && <AutoRefresh />}
    </main>
  );
}
