import Link from 'next/link';
import { getI18n } from '@/lib/i18n-server';

export default async function PolicyPage() {
  const { t } = await getI18n();
  return (
    <main className="wrap section doc">
      <h1>{t('policy.title')}</h1>
      <p className="lead">{t('policy.lead')}</p>
      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
        <section key={n} id={`s${n}`}>
          <h2>{t(`policy.s${n}.t`)}</h2>
          <p>{t(`policy.s${n}.p`)}</p>
        </section>
      ))}
      <p>
        <Link className="btn" href="/support?topic=appeal">{t('policy.appeal')}</Link>{' '}
        <Link className="btn outline" href="/privacy">{t('policy.privacyLink')}</Link>
      </p>
    </main>
  );
}
