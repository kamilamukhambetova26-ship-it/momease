import Link from 'next/link';
import { getI18n } from '@/lib/i18n-server';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="wrap section">
      <div className="empty">
        <p style={{ margin: '0 0 14px' }}>{t('msg.not_found')}</p>
        <Link className="btn" href="/">momease</Link>
      </div>
    </main>
  );
}
