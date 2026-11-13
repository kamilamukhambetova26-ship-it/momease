import { redirect } from 'next/navigation';
import { AboutCards } from '@/components/About';
import { LoginForm } from '@/components/AuthForms';
import { getSessionUser, safeNext } from '@/lib/auth';
import { getI18n } from '@/lib/i18n-server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getSessionUser()) redirect(next);
  const { t } = await getI18n();
  const labels = Object.fromEntries(
    [
      'auth.email',
      'auth.password',
      'auth.submitLogin',
      'auth.noAccount',
      'nav.register',
      'err.invalid',
      'err.fields',
      'err.disabled',
      'err.throttle',
      'auth.disabledRules',
      'auth.disabledAppeal',
    ].map((k) => [k, t(k)]),
  );
  return (
    <main className="wrap">
      <div className="auth-layout">
        <aside className="about-side">
          <h2 className="display">{t('auth.about.title')}</h2>
          <p className="lead">{t('auth.about.lead')}</p>
          <AboutCards t={t} compact />
        </aside>
        <div className="form-card">
          <h1>{t('auth.loginTitle')}</h1>
          <LoginForm labels={labels} next={next} />
        </div>
      </div>
    </main>
  );
}
