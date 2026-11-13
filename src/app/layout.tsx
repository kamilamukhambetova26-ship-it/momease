import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/Chrome';
import { SideNav, type SideItem } from '@/components/SideNav';
import { getProviderByUser } from '@/lib/services';
import { getSessionUser } from '@/lib/auth';
import { THEME_COOKIE, isProviderRole, isStaff, type Theme } from '@/lib/constants';
import { getI18n } from '@/lib/i18n-server';
import { countUnreadMessages } from '@/lib/chat';
import { countUnreadNotifications } from '@/lib/notify';
import './globals.css';

export const metadata: Metadata = {
  title: 'momease',
  description: 'momease: nannies, clubs and tutors near home / няни, кружки и репетиторы рядом с домом',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getI18n();
  const user = await getSessionUser();
  const unread = user ? await countUnreadNotifications(user.id) : 0;
  const unreadMessages = user ? await countUnreadMessages(user.id) : 0;
  const providerId = user && isProviderRole(user.role) ? ((await getProviderByUser(user.id))?.id ?? null) : null;
  const side: SideItem[] = [{ href: '/', label: t('nav.home'), icon: 'home' }];
  if (user) {
    side.push({ href: '/dashboard', label: t('side.profile'), icon: 'user' });
    if (providerId) side.push({ href: `/provider/${providerId}`, label: t('side.public'), icon: 'users' });
  } else {
    side.push({ href: '/login', label: t('nav.login'), icon: 'login' }, { href: '/register', label: t('nav.register'), icon: 'add' });
  }
  side.push({ href: '/#search', label: t('side.catalog'), icon: 'search' });
  if (user && !isStaff(user.role)) side.push({ href: '/messages', label: t('nav.messages'), icon: 'chat', badge: unreadMessages });
  if (user) side.push({ href: '/notifications', label: t('notif.title'), icon: 'bell', badge: unread });
  if (user?.role === 'admin') {
    side.push({ href: '/dashboard?tab=users', label: t('side.users'), icon: 'users' }, { href: '/dashboard?tab=reports', label: t('side.reports'), icon: 'flag' });
  }
  side.push({ href: '/faq', label: t('nav.faq'), icon: 'help' }, { href: '/support', label: t('nav.support'), icon: 'support' }, { href: '/policy', label: t('footer.rules'), icon: 'rules' });
  const theme: Theme = (await cookies()).get(THEME_COOKIE)?.value === 'dark' ? 'dark' : 'light';
  return (
    <html lang={locale} data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Unbounded:wght@500;600&display=swap"
        />
      </head>
      <body id="top">
        <a className="skip-link" href="#main">{t('a11y.skip')}</a>
        <SiteHeader user={user ? { name: user.name, role: user.role } : null} locale={locale} theme={theme} t={t} unread={unread} unreadMessages={unreadMessages} />
        <div id="main" tabIndex={-1}>{children}</div>
        <SiteFooter t={t} />
        <SideNav items={side} labels={{ aria: t('nav.quick'), back: t('nav.back'), top: t('nav.top') }} />
      </body>
    </html>
  );
}
