import Link from 'next/link';
import { getI18n } from '@/lib/i18n-server';

export default async function PrivacyPage() {
  const { t } = await getI18n();
  return (
    <main className="wrap section doc">
      <h1>{t('privacy.title')}</h1>
      <p className="lead">{t('privacy.lead')}</p>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
        <section key={n} id={`s${n}`}>
          <h2>{t(`privacy.s${n}.t`)}</h2>
          <p>{t(`privacy.s${n}.p`)}</p>
        </section>
      ))}
      <p>
        <Link className="btn" href="/support">{t('privacy.contact')}</Link>{' '}
        <Link className="btn outline" href="/policy">{t('footer.rules')}</Link>
      </p>
    </main>
  );
}
