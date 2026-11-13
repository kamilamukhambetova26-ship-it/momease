import Link from 'next/link';
import { getI18n } from '@/lib/i18n-server';

const FAQ_COUNT = 10;

export default async function FaqPage() {
  const { t } = await getI18n();
  return (
    <main className="wrap section doc">
      <h1>{t('faq.title')}</h1>
      <p className="lead">{t('faq.lead')}</p>
      <div className="faq-list">
        {Array.from({ length: FAQ_COUNT }, (_, i) => i + 1).map((n) => (
          <details key={n}>
            <summary>{t(`faq.${n}.q`)}</summary>
            <p>{t(`faq.${n}.a`)}</p>
          </details>
        ))}
      </div>
      <p>
        <Link className="btn" href="/support">{t('nav.support')}</Link>{' '}
        <Link className="btn outline" href="/policy">{t('footer.rules')}</Link>
      </p>
    </main>
  );
}
