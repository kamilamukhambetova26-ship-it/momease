import Link from 'next/link';
import { supportAction } from '@/app/actions';
import { Flash } from '@/components/Shared';
import { getSessionUser } from '@/lib/auth';
import { getI18n } from '@/lib/i18n-server';
import { TICKET_TOPICS } from '@/lib/support';

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ msg?: string; topic?: string }> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const user = await getSessionUser();
  const topic = (TICKET_TOPICS as readonly string[]).includes(sp.topic ?? '') ? sp.topic! : 'question';
  return (
    <main className="wrap section doc">
      <h1>{t('support.title')}</h1>
      <p className="lead">{t('support.lead')}</p>
      <Flash code={sp.msg} t={t} />
      <p className="muted">
        <Link href="/faq">{t('support.faqHint')}</Link>
      </p>
      <form action={supportAction} className="form-card" style={{ maxWidth: 640 }}>
        <div className="field">
          <label htmlFor="topic">{t('support.topic')}</label>
          <select id="topic" name="topic" defaultValue={topic}>
            {TICKET_TOPICS.map((x) => (
              <option key={x} value={x}>{t(`support.topic.${x}`)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="name">{t('support.name')}</label>
          <input id="name" name="name" type="text" required minLength={2} maxLength={80} autoComplete="name" defaultValue={user?.name ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="email">{t('support.email')}</label>
          <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" defaultValue={user?.email ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="message">{t('support.message')}</label>
          <textarea id="message" name="message" required minLength={10} maxLength={2000} aria-describedby="message-hint" />
          <div className="hint" id="message-hint">{t('support.hint')}</div>
        </div>
        <button className="btn big" type="submit">{t('support.send')}</button>
      </form>
    </main>
  );
}
