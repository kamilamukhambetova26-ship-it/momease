import Link from 'next/link';
import { AboutCards } from '@/components/About';
import { ProviderCardView, segLabel } from '@/components/Shared';
import {
  AGE_GROUPS,
  DISTRICTS,
  KIND_SEGMENTS,
  PROVIDER_KINDS,
  SEGMENTS,
  SEGMENT_EMOJI,
  SORTS,
  type ProviderKind,
} from '@/lib/constants';
import { getSessionUser } from '@/lib/auth';
import { getI18n } from '@/lib/i18n-server';
import { listProviders } from '@/lib/services';

type SP = { cat?: string; segment?: string; age?: string; district?: string; verified?: string; online?: string; trial?: string; q?: string; sort?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const user = await getSessionUser();

  const kind = (PROVIDER_KINDS as readonly string[]).includes(sp.cat ?? '') ? (sp.cat as ProviderKind) : undefined;
  const district = (DISTRICTS as readonly string[]).includes(sp.district ?? '') ? sp.district : undefined;
  const age = AGE_GROUPS.some((g) => g.id === sp.age) ? sp.age : undefined;
  // направление должно подходить выбранному типу
  const segmentOptions = kind ? KIND_SEGMENTS[kind] : SEGMENTS;
  const segment = (segmentOptions as readonly string[]).includes(sp.segment ?? '') ? sp.segment : undefined;
  const verified = sp.verified === '1';
  const online = sp.online === '1';
  const trial = sp.trial === '1';

  const q = (sp.q ?? '').trim().slice(0, 80);
  const sort = (SORTS as readonly string[]).includes(sp.sort ?? '') && sp.sort !== 'best' ? sp.sort : undefined;

  const list = await listProviders({ kind, district, segment, age, verifiedOnly: verified, online, trial, q, sort });

  type Over = Partial<{ cat: string | null; segment: string | null; age: string | null; district: string | null; verified: boolean; online: boolean; trial: boolean; sort: string | null }>;
  const query = q;
  const href = (over: Over) => {
    const next = {
      cat: 'cat' in over ? over.cat : (kind ?? null),
      segment: 'segment' in over ? over.segment : (segment ?? null),
      age: 'age' in over ? over.age : (age ?? null),
      district: 'district' in over ? over.district : (district ?? null),
      verified: 'verified' in over ? over.verified : verified,
      online: 'online' in over ? over.online : online,
      trial: 'trial' in over ? over.trial : trial,
      sort: 'sort' in over ? over.sort : (sort ?? null),
    };
    // смена типа сбрасывает направление, если оно ему не подходит
    if (next.cat && next.segment && !(KIND_SEGMENTS[next.cat as ProviderKind] as readonly string[]).includes(next.segment)) {
      next.segment = null;
    }
    const q = new URLSearchParams();
    if (next.cat) q.set('cat', next.cat);
    if (next.segment) q.set('segment', next.segment);
    if (next.age) q.set('age', next.age);
    if (next.district) q.set('district', next.district);
    if (next.verified) q.set('verified', '1');
    if (next.online) q.set('online', '1');
    if (next.trial) q.set('trial', '1');
    if (next.sort) q.set('sort', next.sort);
    if (query) q.set('q', query);
    const s = q.toString();
    return `/${s ? `?${s}` : ''}#search`;
  };
  const filtered = Boolean(kind || segment || age || district || verified || online || trial || query || sort);

  return (
    <main>
      <section className="wrap hero">
        <div className="eyebrow">{t('home.badge')}</div>
        <h1 className="display">{t('home.title')}</h1>
        <p className="lead">{t('home.lead')}</p>
        <div className="hero-actions">
          <Link className="btn big" href="/#search">{t('home.browse')}</Link>
          {!user && <Link className="btn big outline" href="/register">{t('home.register')}</Link>}
        </div>
      </section>

      <section id="about" className="wrap section" aria-labelledby="about-title">
        <h2 className="display" id="about-title">{t('about.title')}</h2>
        <AboutCards t={t} />
      </section>

      <section className="wrap section">
        <h2 className="display">{t('home.segmentsTitle')}</h2>
        <div className="segments">
          {SEGMENTS.map((sg) => (
            <Link key={sg} className={`seg${segment === sg ? ' on' : ''}`} href={href({ segment: sg, cat: null })}>
              <span className="e" aria-hidden="true">{SEGMENT_EMOJI[sg]}</span>
              <span>{t(`seg.${sg}`)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="search" className="wrap section">
        <h2 className="display">{t('home.searchTitle')}</h2>

        <form className="search-box" action="/" method="get" role="search">
          {kind && <input type="hidden" name="cat" value={kind} />}
          {segment && <input type="hidden" name="segment" value={segment} />}
          {age && <input type="hidden" name="age" value={age} />}
          {district && <input type="hidden" name="district" value={district} />}
          {verified && <input type="hidden" name="verified" value="1" />}
          {online && <input type="hidden" name="online" value="1" />}
          {trial && <input type="hidden" name="trial" value="1" />}
          {sort && <input type="hidden" name="sort" value={sort} />}
          <label className="sr-only" htmlFor="q">{t('search.label')}</label>
          <input id="q" name="q" type="search" defaultValue={query} maxLength={80} placeholder={t('search.placeholder')} />
          <button className="btn" type="submit">{t('search.go')}</button>
        </form>

        <div className="filter-row">
          <span className="flabel">{t('filter.type')}</span>
          <div className="pills">
            <Link className={`pill${!kind ? ' on' : ''}`} href={href({ cat: null })} aria-current={!kind}>
              {t('cat.all')}
            </Link>
            {PROVIDER_KINDS.map((k) => (
              <Link key={k} className={`pill${kind === k ? ' on' : ''}`} href={href({ cat: k })} aria-current={kind === k}>
                {t(`cat.${k}`)}
              </Link>
            ))}
          </div>
        </div>

        <div className="filter-row">
          <span className="flabel">{t('filter.segment')}</span>
          <div className="pills">
            <Link className={`pill sm${!segment ? ' on' : ''}`} href={href({ segment: null })}>{t('seg.all')}</Link>
            {segmentOptions.map((sg) => (
              <Link key={sg} className={`pill sm${segment === sg ? ' on' : ''}`} href={href({ segment: sg })}>
                {segLabel(sg, t)}
              </Link>
            ))}
          </div>
        </div>

        <div className="filter-row">
          <span className="flabel">{t('filter.age')}</span>
          <div className="pills">
            <Link className={`pill sm${!age ? ' on' : ''}`} href={href({ age: null })}>{t('age.all')}</Link>
            {AGE_GROUPS.map((g) => (
              <Link key={g.id} className={`pill sm${age === g.id ? ' on' : ''}`} href={href({ age: g.id })}>
                {t(`age.${g.id}`)}
              </Link>
            ))}
          </div>
        </div>

        <div className="filter-row">
          <span className="flabel">{t('filter.district')}</span>
          <div className="pills">
            <Link className={`pill sm${!district ? ' on' : ''}`} href={href({ district: null })}>{t('district.all')}</Link>
            {DISTRICTS.map((d) => (
              <Link key={d} className={`pill sm${district === d ? ' on' : ''}`} href={href({ district: d })}>
                {t(`district.${d}`)}
              </Link>
            ))}
            <Link className={`pill sm${verified ? ' on' : ''}`} href={href({ verified: !verified })}>
              {t('home.verifiedOnly')}
            </Link>
            <Link className={`pill sm${online ? ' on' : ''}`} href={href({ online: !online })}>{t('filter.online')}</Link>
            <Link className={`pill sm${trial ? ' on' : ''}`} href={href({ trial: !trial })}>{t('filter.trial')}</Link>
          </div>
        </div>

        <div className="filter-row">
          <span className="flabel">{t('sort.label')}</span>
          <div className="pills">
            {SORTS.map((x) => {
              const on = (sort ?? 'best') === x;
              return (
                <Link key={x} className={`pill sm${on ? ' on' : ''}`} href={href({ sort: x === 'best' ? null : x })} aria-current={on}>
                  {t(`sort.${x}`)}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="meta">
          {t('home.count', { n: list.length })}
          {filtered && (
            <>
              {' · '}
              <Link href="/#search">{t('filter.reset')}</Link>
            </>
          )}
        </div>

        {list.length === 0 ? (
          <div className="empty">{query ? t('search.none', { q: query }) : t('home.empty')}</div>
        ) : (
          <div className="grid">
            {list.map((p) => (
              <ProviderCardView key={p.id} p={p} t={t} />
            ))}
          </div>
        )}
      </section>

      <section id="how" className="wrap section">
        <h2 className="display">{t('home.howTitle')}</h2>
        <div className="steps">
          {[1, 2, 3].map((n) => (
            <div className="step" key={n}>
              <div className="n">{n}</div>
              <h3>{t(`how.${n}.t`)}</h3>
              <p>{t(`how.${n}.d`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <div className="cta-band">
          <div style={{ flex: '1 1 400px', minWidth: 0 }}>
            <h2>{t('home.cta.title')}</h2>
            <p>{t('home.cta.text')}</p>
          </div>
          <Link className="btn white" href="/register?type=worker">{t('home.cta.btn')}</Link>
        </div>
      </section>
    </main>
  );
}
