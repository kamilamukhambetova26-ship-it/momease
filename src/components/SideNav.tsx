'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export type SideItem = { href: string; label: string; icon: string; badge?: number };
type Labels = { aria: string; back: string; top: string };

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.5 3-5.5 6.5-5.5S15.5 16.5 15.5 20M17 5.5a3 3 0 0 1 0 5.8M18.5 14.8c2 .6 3 2.3 3 5.2',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  chat: 'M4 5h16v11H9l-5 4z',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 19.5a2 2 0 0 0 4 0',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01',
  support: 'M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v5H5a1 1 0 0 1-1-1zM20 13h-3v5h2a1 1 0 0 0 1-1zM17 18c0 2-2 3-5 3',
  rules: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  login: 'M14 4h5v16h-5M10 8l4 4-4 4M14 12H3',
  add: 'M12 5v14M5 12h14',
};

function Svg({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name] ?? ICONS.home} />
    </svg>
  );
}

/** Навигация справа: переходы по основным разделам, плюс «назад» и «наверх» */
export function SideNav({ items, labels }: { items: SideItem[]; labels: Labels }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <nav className="side-nav" aria-label={labels.aria}>
      {items.map((i) => {
        const here = i.href === '/' ? path === '/' : i.href.split(/[?#]/)[0] === path && !i.href.includes('#');
        return (
          <Link key={i.href + i.label} href={i.href} title={i.label} aria-current={here ? 'page' : undefined} className={here ? 'on' : undefined}>
            <Svg name={i.icon} />
            <span>{i.label}</span>
            {!!i.badge && <b className="count-dot">{i.badge > 9 ? '9+' : i.badge}</b>}
          </Link>
        );
      })}
      <div className="side-sep" role="separator" />
      <button type="button" onClick={() => router.back()} title={labels.back}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        <span>{labels.back}</span>
      </button>
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title={labels.top}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7" /></svg>
        <span>{labels.top}</span>
      </button>
    </nav>
  );
}
