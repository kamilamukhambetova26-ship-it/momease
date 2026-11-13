import Link from 'next/link';
import { logoutAction, setLocaleAction, setThemeAction } from '@/app/actions';
import { LOCALES, LOCALE_LABEL, LOCALE_NAME, isStaff, type Locale, type Theme } from '@/lib/constants';
import type { TFn } from '@/lib/i18n';

/** Переключатель языка. Название «momease» не переводится и от языка не зависит. */
export function LangSwitcher({ locale, t }: { locale: Locale; t: TFn }) {
  return (
    <form action={setLocaleAction} className="langs" aria-label={t('lang.label')}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="submit"
          name="lang"
          value={l}
          className="lang-btn"
          aria-pressed={l === locale}
          aria-label={LOCALE_NAME[l]}
          lang={l}
        >
          {LOCALE_LABEL[l]}
        </button>
      ))}
    </form>
  );
}

/** Переключатель светлой и тёмной темы */
export function ThemeToggle({ theme, t }: { theme: Theme; t: TFn }) {
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = t(next === 'dark' ? 'theme.toDark' : 'theme.toLight');
  return (
    <form action={setThemeAction} className="theme-form">
      <input type="hidden" name="theme" value={next} />
      <button type="submit" className="theme-btn" aria-label={label} title={label}>
        <svg className="sun" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
        </svg>
        <svg className="moon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" />
        </svg>
      </button>
    </form>
  );
}

export function Logo() {
  return (
    <Link href="/" className="logo" lang="en" translate="no">
      <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="17" fill="#0F766E" />
        <circle cx="13" cy="15" r="4.5" fill="#FFD770" />
        <circle cx="23.5" cy="15" r="4.5" fill="#FFFFFF" />
        <path d="M9 25c2.5 3 5.5 4.5 9 4.5s6.5-1.5 9-4.5" stroke="#FFFFFF" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </svg>
      momease
    </Link>
  );
}

export function SiteHeader({
  user,
  locale,
  theme,
  t,
  unread = 0,
  unreadMessages = 0,
}: {
  user: { name: string; role: string } | null;
  locale: Locale;
  theme: Theme;
  t: TFn;
  unread?: number;
  unreadMessages?: number;
}) {
  const staff = user ? isStaff(user.role) : false;
  return (
    <header className="site-header">
      <div className="wrap">
        <Logo />
        <nav className="nav" aria-label={t('nav.main')}>
          <Link className="plain" href="/#about">{t('nav.about')}</Link>
          <Link className="plain" href="/#search">{t('nav.find')}</Link>
          {user && !staff && (
            <Link className="plain" href="/messages">
              {t('nav.messages')}
              {unreadMessages > 0 && (
                <span className="count-dot" aria-label={t('messages.bellUnread', { n: unreadMessages })}>{unreadMessages > 9 ? '9+' : unreadMessages}</span>
              )}
            </Link>
          )}
          <Link className="plain" href="/faq">{t('nav.faq')}</Link>
          <Link className="plain" href="/support">{t('nav.support')}</Link>
        </nav>
        <div className="header-right">
          <div className="tools">
            <LangSwitcher locale={locale} t={t} />
            <ThemeToggle theme={theme} t={t} />
          </div>
          <div className="auth-nav">
            {user ? (
              <>
                <Link className="bell" href="/notifications" aria-label={unread ? t('notif.bellUnread', { n: unread }) : t('notif.title')} title={t('notif.title')}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
                    <path d="M10 19.5a2 2 0 0 0 4 0" />
                  </svg>
                  {unread > 0 && <span className="bell-n">{unread > 9 ? '9+' : unread}</span>}
                </Link>
                <Link className="btn small" href="/dashboard">{t('nav.dashboard')}</Link>
                <form action={logoutAction}>
                  <button type="submit" className="btn small outline">{t('nav.logout')}</button>
                </form>
              </>
            ) : (
              <>
                <Link className="btn small outline" href="/login">{t('nav.login')}</Link>
                <Link className="btn small" href="/register">{t('nav.register')}</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ t }: { t: TFn }) {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>{t('footer.note')}</span>
        <nav className="footer-nav" aria-label={t('footer.nav')}>
          <Link href="/faq">{t('nav.faq')}</Link>
          <Link href="/support">{t('nav.support')}</Link>
          <Link href="/policy">{t('footer.rules')}</Link>
          <Link href="/privacy">{t('footer.privacy')}</Link>
        </nav>
        <span translate="no">© momease</span>
      </div>
    </footer>
  );
}
