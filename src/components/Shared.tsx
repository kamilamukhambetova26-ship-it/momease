import Link from 'next/link';
import { SEGMENT_EMOJI, type Segment } from '@/lib/constants';
import { formatPrice, hasKey, type TFn } from '@/lib/i18n';

export function segLabel(segment: string, t: TFn) {
  const e = SEGMENT_EMOJI[segment as Segment] ?? '';
  return `${e} ${t('seg.' + segment)}`.trim();
}

const OK_CODES = ['saved', 'booked', 'cancelled', 'reviewed', 'slot_added', 'slot_removed', 'updated', 'doc_added', 'doc_removed', 'sent', 'reported', 'ticket_sent', 'favorite_saved'];

export function Flash({ code, t }: { code?: string; t: TFn }) {
  if (!code) return null;
  const key = `msg.${code}`;
  if (!hasKey(key)) return null;
  const ok = OK_CODES.includes(code);
  return (
    <div className={ok ? 'flash' : 'flash err'} role={ok ? 'status' : 'alert'}>
      {t(key)}
    </div>
  );
}

const TINTS = ['#CFE8E1', '#FFE7A3', '#D9E4F7', '#F6D9D3', '#E3DAF3'];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Avatar({ name, id, large }: { name: string; id: number; large?: boolean }) {
  return (
    <div className="av" style={{ background: TINTS[id % TINTS.length] }} aria-hidden="true">
      {initials(name)}
    </div>
  );
}

export function Star() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2l3 6.9 7.5.7-5.7 5 1.7 7.4L12 18.1 5.5 22l1.7-7.4-5.7-5 7.5-.7z" fill="#E0A800" />
    </svg>
  );
}

export function Rating({
  avg,
  count,
  t,
}: {
  avg: number | null;
  count: number;
  t: TFn;
}) {
  if (!count || avg === null) return <span>{t('card.noReviews')}</span>;
  return (
    <>
      <span className="rt">
        <Star />
        {avg.toFixed(1)}
      </span>
      <span>{t('card.reviews', { n: count })}</span>
    </>
  );
}

type CardProvider = {
  id: number;
  kind: string;
  segment: string;
  title: string;
  ownerName: string;
  district: string;
  priceAmount: number;
  priceUnit: string;
  ageFrom: number;
  ageTo: number;
  verified: boolean;
  online: boolean;
  trial: boolean;
  ratingAvg: number | null;
  ratingCount: number;
};

export function ProviderCardView({ p, t }: { p: CardProvider; t: TFn }) {
  return (
    <article className="card">
      <div className="row">
        <Avatar name={p.ownerName} id={p.id} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>
            <Link href={`/provider/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {p.title}
            </Link>
          </h3>
          <div className="muted" style={{ fontSize: 14 }}>{t(`role.${p.kind}`)}</div>
        </div>
      </div>
      <div className="facts">
        <Rating avg={p.ratingAvg} count={p.ratingCount} t={t} />
        <span>{t(`district.${p.district}`)}</span>
        <span>{t('card.age', { a: p.ageFrom, b: p.ageTo })}</span>
      </div>
      <div className="badges">
        <span className="badge">{segLabel(p.segment, t)}</span>
        {p.verified && <span className="badge">{t('card.verified')}</span>}
        {p.online && <span className="badge">{t('card.online')}</span>}
        {p.trial && <span className="badge">{t('card.trial')}</span>}
      </div>
      <div className="foot">
        <b>{formatPrice(p.priceAmount, p.priceUnit, t)}</b>
        <Link className="btn small" href={`/provider/${p.id}`}>{t('card.view')}</Link>
      </div>
    </article>
  );
}
