import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bookSlotAction } from '@/app/actions';
import { toggleFavoriteAction } from '@/app/actions';
import { isFavorite } from '@/lib/favorites';
import { ReportForm } from '@/components/ReportForm';
import { Avatar, Flash, Rating, segLabel } from '@/components/Shared';
import { CALENDAR_DAYS } from '@/lib/constants';
import { formatDate, formatMonthDay, isDateStr, weekdayOf } from '@/lib/dates';
import { getSessionUser } from '@/lib/auth';
import { formatPrice } from '@/lib/i18n';
import { getI18n } from '@/lib/i18n-server';
import { getCalendar, getProviderForViewer, listReviews, listSlotsForDate } from '@/lib/services';
import { Star } from '@/components/Shared';

export default async function ProviderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; date?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { t, locale } = await getI18n();
  const user = await getSessionUser();

  const provider = await getProviderForViewer(Number(id), user ? { id: user.id, role: user.role } : null);
  if (!provider) notFound();

  const [calendar, reviews] = await Promise.all([getCalendar(provider.id, CALENDAR_DAYS), listReviews(provider.id)]);
  // выбранная дата: из адреса, иначе ближайшая со свободным временем
  const picked = sp.date && isDateStr(sp.date) ? calendar.find((d) => d.date === sp.date) : undefined;
  const selected = (picked ?? calendar.find((d) => d.free > 0))?.date ?? null;
  const slots = selected ? await listSlotsForDate(provider.id, selected) : [];
  const lead = weekdayOf(calendar[0].date); // сколько пустых клеток до первого дня в сетке
  const selfPath = `/provider/${provider.id}${selected ? `?date=${selected}` : ''}`;

  const canBook = user?.role === 'parent' && provider.status === 'approved';
  const dateFmt = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU', {
    dateStyle: 'medium',
  });

  const fav = user?.role === 'parent' ? await isFavorite(user.id, provider.id) : false;
  return (
    <main className="wrap section">
      <p style={{ margin: '0 0 16px' }}>
        <Link href="/#search">{t('prov.back')}</Link>
      </p>
      <Flash code={sp.msg} t={t} />
      {provider.status !== 'approved' && <div className="flash err">{t('prov.pendingNote')}</div>}

      <div className="profile-head">
        <Avatar name={provider.ownerName} id={provider.id} large />
        <div>
          <h1 className="display" style={{ fontSize: 28, lineHeight: 1.2 }}>{provider.title}</h1>
          {user?.role === 'parent' && provider.status === 'approved' && (
            <form action={toggleFavoriteAction} style={{ margin: '8px 0 0' }}>
              <input type="hidden" name="providerId" value={provider.id} />
              <button className="btn small outline" type="submit" aria-pressed={fav}>
                {fav ? '♥ ' + t('fav.remove') : '♡ ' + t('fav.add')}
              </button>
            </form>
          )}
          <div className="facts" style={{ marginTop: 8 }}>
            <span>{t(`role.${provider.kind}`)}</span>
            <span className="badge">{segLabel(provider.segment, t)}</span>
            <span>{t(`district.${provider.district}`)}</span>
            <span>{t('card.age', { a: provider.ageFrom, b: provider.ageTo })}</span>
            <Rating avg={provider.ratingAvg} count={provider.ratingCount} t={t} />
            {provider.verified && <span className="badge">{t('card.verified')}</span>}
            {provider.online && <span className="badge">{t('card.online')}</span>}
            {provider.trial && <span className="badge">{t('card.trial')}</span>}
            {provider.docsAccepted > 0 && <span className="badge">{t('docs.confirmed', { n: provider.docsAccepted })}</span>}
          </div>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 24 }}>
        <div className="main">
          <section className="panel">
            <h2>{t('prov.about')}</h2>
            <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{provider.bio || t('prov.noBio')}</p>
            {user && user.id !== provider.ownerId && (
              <ReportForm targetType="provider" targetId={provider.id} back={selfPath} t={t} label={t('report.provider')} />
            )}
          </section>

          <section className="panel">
            <h2>{t('prov.reviews')}</h2>
            {reviews.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>{t('card.noReviews')}</p>
            ) : (
              reviews.map((r) => (
                <div className="review" key={r.id}>
                  <div className="facts">
                    <span className="rt">
                      <Star />
                      {r.rating}
                    </span>
                    <b>{r.parentName}</b>
                    <span className="muted">{dateFmt.format(r.createdAt)}</span>
                  </div>
                  {r.text && <p style={{ margin: '6px 0 0' }}>{r.text}</p>}
                  {user && user.id !== r.parentId && (
                    <ReportForm targetType="review" targetId={r.id} back={selfPath} t={t} label={t('report.review')} />
                  )}
                </div>
              ))
            )}
          </section>
        </div>

        <aside className="side">
          <section className="panel">
            <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 22, marginBottom: 16 }}>
              {formatPrice(provider.priceAmount, provider.priceUnit, t)}
            </div>
            <h2 style={{ fontSize: 17 }}>{t('prov.pickDate')}</h2>
            <div className="cal" role="grid" aria-label={t('prov.pickDate')}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <div className="cal-h" key={d} role="columnheader">{t(`day.${d}`)}</div>
              ))}
              {Array.from({ length: lead }).map((_, i) => (
                <div key={`e${i}`} aria-hidden="true" />
              ))}
              {calendar.map((d, i) => {
                const num = Number(d.date.slice(8));
                const first = i === 0 || num === 1;
                const inner = (
                  <>
                    <span className="cal-n">{first ? formatMonthDay(d.date, locale) : num}</span>
                    {d.free > 0 && <span className="cal-f">{d.free}</span>}
                  </>
                );
                return d.free > 0 ? (
                  <Link
                    key={d.date}
                    role="gridcell"
                    href={`/provider/${provider.id}?date=${d.date}`}
                    className={`cal-d has${selected === d.date ? ' on' : ''}`}
                    aria-label={`${formatDate(d.date, locale, 'long')}: ${t('prov.freeCount', { n: d.free })}`}
                    aria-current={selected === d.date ? 'date' : undefined}
                  >
                    {inner}
                  </Link>
                ) : (
                  <span key={d.date} role="gridcell" className="cal-d off" aria-disabled="true">
                    {inner}
                  </span>
                );
              })}
            </div>
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 14px' }}>{t('prov.calHint')}</p>
            {selected ? (
              <>
                <h2 style={{ fontSize: 16 }}>{formatDate(selected, locale, 'long')}</h2>
                {slots.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>{t('prov.noSlots')}</p>
                ) : (
                  <div className="slot-list">
                    {slots.map((s) => (
                      <div className="slot-row" key={s.id}>
                        <b>{s.time}</b>
                        {s.taken ? (
                          <span className="badge warn">{t('prov.taken')}</span>
                        ) : canBook ? (
                          <form action={bookSlotAction}>
                            <input type="hidden" name="slotId" value={s.id} />
                            <input type="hidden" name="providerId" value={provider.id} />
                            <input type="hidden" name="date" value={selected} />
                            <button className="btn small" type="submit">{t('prov.book')}</button>
                          </form>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>{t('prov.noSlots')}</p>
            )}
            {!user && provider.status === 'approved' && (
              <p style={{ margin: '16px 0 0' }}>
                <Link href={`/login?next=/provider/${provider.id}`}>{t('prov.loginToBook')}</Link>
              </p>
            )}
            {user && user.role !== 'parent' && (
              <p className="muted" style={{ margin: '16px 0 0' }}>{t('prov.onlyParents')}</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
