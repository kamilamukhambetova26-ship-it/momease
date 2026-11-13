import { redirect } from 'next/navigation';
import { AboutCards } from '@/components/About';
import { RegisterForm } from '@/components/AuthForms';
import { getSessionUser } from '@/lib/auth';
import { PROVIDER_KINDS } from '@/lib/constants';
import { getI18n } from '@/lib/i18n-server';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; role?: string }>;
}) {
  if (await getSessionUser()) redirect('/dashboard');
  const sp = await searchParams;
  // ?type=worker открывает форму специалиста; старые ссылки ?role=nanny тоже работают
  const legacyKind = (PROVIDER_KINDS as readonly string[]).includes(sp.role ?? '') ? sp.role! : null;
  const defaultAcct = sp.type === 'worker' || legacyKind ? 'worker' : 'user';
  const defaultKind = legacyKind ?? 'nanny';
  const { t } = await getI18n();
  const keys = [
    'auth.acct',
    'auth.acct.user',
    'auth.acct.user.d',
    'auth.acct.worker',
    'auth.acct.worker.d',
    'auth.workerKind',
    'auth.name',
    'auth.email',
    'auth.phone',
    'auth.password',
    'auth.passwordHint',
    'auth.submitRegister',
    'auth.haveAccount',
    'nav.login',
    'err.exists',
    'err.fields',
    'err.consent',
    'auth.consentPre',
    'auth.consentRules',
    'auth.consentMid',
    'auth.consentPrivacy',
    ...PROVIDER_KINDS.map((r) => `role.${r}`),
  ];
  const labels = Object.fromEntries(keys.map((k) => [k, t(k)]));
  return (
    <main className="wrap">
      <div className="auth-layout">
        <aside className="about-side">
          <h2 className="display">{t('auth.about.title')}</h2>
          <p className="lead">{t('auth.about.lead')}</p>
          <AboutCards t={t} compact />
        </aside>
        <div className="form-card">
          <h1>{t('auth.registerTitle')}</h1>
          <RegisterForm labels={labels} workerKinds={[...PROVIDER_KINDS]} defaultAcct={defaultAcct} defaultKind={defaultKind} />
        </div>
      </div>
    </main>
  );
}
