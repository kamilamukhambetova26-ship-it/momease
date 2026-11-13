import Link from 'next/link';
import {
  addSlotAction,
  cancelBookingAction,
  deleteDocumentAction,
  removeSlotAction,
  resolveReportAction,
  closeTicketAction,
  respondBookingAction,
  reviewAction,
  setDocumentStatusAction,
  setProviderStatusAction,
  setUserActiveAction,
  setUserRoleAction,
  setVerifiedAction,
  updateProfileAction,
  uploadDocumentAction,
} from '@/app/actions';
import {
  ASSIGNABLE_ROLES,
  DISTRICTS,
  DOC_TYPES,
  KIND_SEGMENTS,
  PRICE_UNITS,
  type ProviderKind,
  isProviderRole,
} from '@/lib/constants';
import { addDays, formatDate, todayStr } from '@/lib/dates';
import { listFavorites } from '@/lib/favorites';
import { countOpenReports, listReports } from '@/lib/reports';
import { countOpenTickets, listTickets } from '@/lib/support';
import { formatPrice } from '@/lib/i18n';
import { getI18n } from '@/lib/i18n-server';
import {
  getProviderByUser,
  getStats,
  listAllBookings,
  listAllProviders,
  listDocuments,
  listDocumentsForStaff,
  listParentBookings,
  listProviderBookings,
  listProviderSlots,
  listUsers,
  type Actor,
} from '@/lib/services';

/** Кнопка чата с числом непрочитанных */
function ChatLink({ id, unread, t }: { id: number; unread: number; t: (k: string, v?: Record<string, string | number>) => string }) {
  return (
    <Link className="btn small outline" href={`/chat/${id}`}>
      {t('chat.open')}
      {unread > 0 && <span className="count-dot" aria-label={t('chat.unread', { n: unread })}>{unread}</span>}
    </Link>
  );
}

function docBadge(status: string) {
  if (status === 'accepted') return 'badge';
  if (status === 'pending') return 'badge warn';
  return 'badge bad';
}

function statusBadgeClass(status: string) {
  if (status === 'confirmed' || status === 'completed' || status === 'approved') return 'badge';
  if (status === 'pending') return 'badge warn';
  return 'badge bad';
}

// ───────────────────────── Родитель ─────────────────────────

export async function ParentView({ userId }: { userId: number }) {
  const { t, locale } = await getI18n();
  const list = await listParentBookings(userId);
  const favs = await listFavorites(userId);
  const active = list.filter((b) => b.status === 'pending' || b.status === 'confirmed');
  const today = todayStr();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <>
      <section className="panel">
        <h2>{t('dash.schedule')}</h2>
        <div className="week">
          {days.map((d) => {
            const items = active.filter((b) => b.date === d).sort((a, b) => (a.time < b.time ? -1 : 1));
            return (
              <div className="day" key={d}>
                <h4>{formatDate(d, locale)}</h4>
                {items.map((b) => (
                  <div className="ent" key={b.id}>
                    <b>{b.time}</b>
                    {b.providerTitle}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>{t('fav.title')}</h2>
        {favs.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{t('fav.empty')}</p>
        ) : (
          <div className="actions">
            {favs.map((f) => (
              <Link key={f.id} className="btn small outline" href={`/provider/${f.id}`}>♥ {f.title}</Link>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('dash.parent.bookings')}</h2>
        {list.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t('dash.parent.empty')} <Link href="/#search">{t('nav.find')}</Link>
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/provider/${b.providerId}`}>{b.providerTitle}</Link>
                      <div className="muted" style={{ fontSize: 14 }}>
                        {formatDate(b.date, locale)} · {b.time}
                      </div>
                    </td>
                    <td>
                      <span className={statusBadgeClass(b.status)}>{t(`bk.${b.status}`)}</span>
                    </td>
                    <td>
                      <div className="actions">
                        <ChatLink id={b.id} unread={b.unread} t={t} />
                        {b.status === 'completed' && (
                          <Link className="btn small" href={`/provider/${b.providerId}`}>{t('dash.again')}</Link>
                        )}
                        {(b.status === 'pending' || b.status === 'confirmed') && (
                          <form action={cancelBookingAction}>
                            <input type="hidden" name="bookingId" value={b.id} />
                            <button className="btn small danger" type="submit">{t('dash.cancel')}</button>
                          </form>
                        )}
                        {(b.status === 'confirmed' || b.status === 'completed') &&
                          (b.reviewId ? (
                            <span className="muted">{t('dash.reviewed')}</span>
                          ) : (
                            <details>
                              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('dash.leaveReview')}</summary>
                              <form action={reviewAction} style={{ marginTop: 10, display: 'grid', gap: 10, minWidth: 240 }}>
                                <input type="hidden" name="bookingId" value={b.id} />
                                <label>
                                  <span className="label">{t('dash.rating')}</span>
                                  <select name="rating" defaultValue="5">
                                    {[5, 4, 3, 2, 1].map((n) => (
                                      <option key={n} value={n}>{n}</option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span className="label">{t('dash.reviewText')}</span>
                                  <textarea name="text" maxLength={1000} />
                                </label>
                                <button className="btn small" type="submit">{t('dash.send')}</button>
                              </form>
                            </details>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ───────────────────────── Специалист (няня / репетитор / кружок) ─────────────────────────

export async function ProviderView({ userId }: { userId: number }) {
  const { t, locale } = await getI18n();
  const provider = await getProviderByUser(userId);
  if (!provider) return null;
  const [slots, bookings, docs] = await Promise.all([
    listProviderSlots(provider.id),
    listProviderBookings(provider.id),
    listDocuments(provider.id),
  ]);

  return (
    <>
      <section className="panel">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{t('dash.prov.profile')}</h2>
          <span className={statusBadgeClass(provider.status)}>{t(`status.${provider.status}`)}</span>
          {provider.verified && <span className="badge">{t('card.verified')}</span>}
          {provider.status === 'approved' && (
            <Link href={`/provider/${provider.id}`}>→</Link>
          )}
        </div>
        {provider.status === 'pending' && <p className="muted">{t('status.pendingHint')}</p>}
        {provider.status === 'rejected' && <p className="muted">{t('status.rejectedHint')}</p>}

        <form action={updateProfileAction} style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="title">{t('dash.prov.title')}</label>
            <input id="title" name="title" type="text" defaultValue={provider.title} required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="segment">{t('dash.prov.segment')}</label>
            <select id="segment" name="segment" defaultValue={provider.segment}>
              {KIND_SEGMENTS[provider.kind as ProviderKind].map((sg) => (
                <option key={sg} value={sg}>{t(`seg.${sg}`)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bio">{t('dash.prov.bio')}</label>
            <textarea id="bio" name="bio" defaultValue={provider.bio} maxLength={2000} />
          </div>
          <div className="inline-fields">
            <div className="field">
              <label htmlFor="district">{t('dash.prov.district')}</label>
              <select id="district" name="district" defaultValue={provider.district}>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>{t(`district.${d}`)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="priceAmount">{t('dash.prov.price')}</label>
              <input id="priceAmount" name="priceAmount" type="number" min={0} max={5000000} step={100} defaultValue={provider.priceAmount} />
            </div>
            <div className="field">
              <label htmlFor="priceUnit">{t('dash.prov.unit')}</label>
              <select id="priceUnit" name="priceUnit" defaultValue={provider.priceUnit}>
                {PRICE_UNITS.map((u) => (
                  <option key={u} value={u}>{t(`unit.${u}`)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="inline-fields">
            <div className="field">
              <label htmlFor="ageFrom">{t('dash.prov.ageFrom')}</label>
              <input id="ageFrom" name="ageFrom" type="number" min={0} max={18} defaultValue={provider.ageFrom} />
            </div>
            <div className="field">
              <label htmlFor="ageTo">{t('dash.prov.ageTo')}</label>
              <input id="ageTo" name="ageTo" type="number" min={0} max={18} defaultValue={provider.ageTo} />
            </div>
          </div>
          <div className="field">
            <label className="consent" htmlFor="online" style={{ margin: 0 }}>
              <input id="online" name="online" type="checkbox" defaultChecked={provider.online} />
              <span>{t('dash.prov.online')}</span>
            </label>
            <label className="consent" htmlFor="trial" style={{ margin: 0 }}>
              <input id="trial" name="trial" type="checkbox" defaultChecked={provider.trial} />
              <span>{t('dash.prov.trial')}</span>
            </label>
          </div>
          <button className="btn" type="submit">{t('dash.prov.save')}</button>
        </form>
      </section>

      <section className="panel">
        <h2>{t('docs.title')}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t('docs.hint')} {t('docs.private')}</p>
        <div className="doc-list">
          {docs.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t('docs.empty')}</p>
          ) : (
            docs.map((d) => (
              <div className="doc-row" key={d.id}>
                <div className="doc-name">
                  <b>{d.title}</b>
                  <small>{t(`docs.type.${d.docType}`)} · {d.fileName} · {Math.max(1, Math.round(d.size / 1024))} KB</small>
                </div>
                <div className="actions">
                  <span className={docBadge(d.status)}>{t(`docs.status.${d.status}`)}</span>
                  <a className="btn small outline" href={`/api/documents/${d.id}`} target="_blank" rel="noopener">{t('docs.open')}</a>
                  <form action={deleteDocumentAction}>
                    <input type="hidden" name="docId" value={d.id} />
                    <button className="btn small danger" type="submit">{t('docs.delete')}</button>
                  </form>
                </div>
              </div>
            ))
          )}
        </div>
        <form action={uploadDocumentAction} encType="multipart/form-data">
          <div className="inline-fields">
            <div className="field">
              <label htmlFor="docType">{t('docs.type')}</label>
              <select id="docType" name="docType">
                {DOC_TYPES.map((x) => (
                  <option key={x} value={x}>{t(`docs.type.${x}`)}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: '2 1 220px' }}>
              <label htmlFor="docTitle">{t('docs.name')}</label>
              <input id="docTitle" name="title" type="text" required minLength={2} maxLength={120} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="docFile">{t('docs.file')}</label>
            <input id="docFile" name="file" type="file" accept="application/pdf,image/png,image/jpeg" required />
          </div>
          <button className="btn" type="submit">{t('docs.upload')}</button>
        </form>
      </section>

      <section className="panel">
        <h2>{t('dash.prov.slots')}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t('dash.prov.slotsHint')}</p>
        <form action={addSlotAction} className="inline-fields" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="weekday">{t('dash.prov.weekday')}</label>
            <select id="weekday" name="weekday">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>{t(`day.${d}`)}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="time">{t('dash.prov.time')}</label>
            <input id="time" name="time" type="time" defaultValue="17:00" required />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <button className="btn" type="submit">{t('dash.prov.addSlot')}</button>
          </div>
        </form>
        <div className="slot-list">
          {slots.map((s) => (
            <div className="slot-row" key={s.id}>
              <b>{t(`day.${s.weekday}`)} {s.time}</b>
              <form action={removeSlotAction}>
                <input type="hidden" name="slotId" value={s.id} />
                <button className="btn small danger" type="submit">{t('dash.prov.remove')}</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>{t('dash.prov.incoming')}</h2>
        {bookings.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{t('dash.prov.noRequests')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <b>{b.parentName}</b>
                      {b.parentPhone && <div className="muted" style={{ fontSize: 14 }}>{b.parentPhone}</div>}
                    </td>
                    <td>{formatDate(b.date, locale)} · {b.time}</td>
                    <td>
                      <span className={statusBadgeClass(b.status)}>{t(`bk.${b.status}`)}</span>
                    </td>
                    <td>
                      <div className="actions">
                        <ChatLink id={b.id} unread={b.unread} t={t} />
                        {b.status === 'pending' && (
                          <>
                            <form action={respondBookingAction}>
                              <input type="hidden" name="bookingId" value={b.id} />
                              <input type="hidden" name="action" value="confirm" />
                              <button className="btn small" type="submit">{t('dash.prov.confirm')}</button>
                            </form>
                            <form action={respondBookingAction}>
                              <input type="hidden" name="bookingId" value={b.id} />
                              <input type="hidden" name="action" value="decline" />
                              <button className="btn small danger" type="submit">{t('dash.prov.decline')}</button>
                            </form>
                          </>
                        )}
                        {b.status === 'confirmed' && (
                          <form action={respondBookingAction}>
                            <input type="hidden" name="bookingId" value={b.id} />
                            <input type="hidden" name="action" value="complete" />
                            <button className="btn small outline" type="submit">{t('dash.prov.complete')}</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ───────────────────────── Менеджер (и админ, вкладка «Специалисты») ─────────────────────────

export async function ModerationView({ actor }: { actor: Actor }) {
  const { t } = await getI18n();
  const [all, docs] = await Promise.all([listAllProviders(), listDocumentsForStaff(actor)]);
  const pending = all.filter((p) => p.status === 'pending');
  const docsPending = docs.filter((d) => d.status === 'pending');

  const statusForm = (id: number, status: string, label: string, cls: string) => (
    <form action={setProviderStatusAction}>
      <input type="hidden" name="providerId" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={`btn small ${cls}`} type="submit">{label}</button>
    </form>
  );
  const docRow = (d: (typeof docs)[number]) => (
    <tr key={d.id}>
      <td>
        <b>{d.title}</b>
        <div className="muted" style={{ fontSize: 14 }}>
          {t(`docs.type.${d.docType}`)} · {d.fileName} · {Math.max(1, Math.round(d.size / 1024))} KB
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          {t('docs.provider')}: <Link href={`/provider/${d.providerId}`}>{d.providerTitle}</Link> ({d.ownerEmail})
        </div>
      </td>
      <td><span className={docBadge(d.status)}>{t(`docs.status.${d.status}`)}</span></td>
      <td>
        <div className="actions">
          <a className="btn small outline" href={`/api/documents/${d.id}`} target="_blank" rel="noopener">{t('docs.open')}</a>
          {d.status !== 'accepted' && (
            <form action={setDocumentStatusAction}>
              <input type="hidden" name="docId" value={d.id} />
              <input type="hidden" name="status" value="accepted" />
              <button className="btn small" type="submit">{t('docs.accept')}</button>
            </form>
          )}
          {d.status !== 'rejected' && (
            <form action={setDocumentStatusAction}>
              <input type="hidden" name="docId" value={d.id} />
              <input type="hidden" name="status" value="rejected" />
              <button className="btn small danger" type="submit">{t('docs.reject')}</button>
            </form>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <>
      <section className="panel">
        <h2>{t('docs.queue')}</h2>
        {docsPending.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{t('docs.noQueue')}</p>
        ) : (
          <div className="table-wrap">
            <table><tbody>{docsPending.map(docRow)}</tbody></table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('mgr.queue')}</h2>
        {pending.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{t('mgr.noPending')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/provider/${p.id}`}>{p.title}</Link>
                      <div className="muted" style={{ fontSize: 14 }}>
                        {t(`role.${p.kind}`)} · {t(`seg.${p.segment}`)} · {t(`district.${p.district}`)} · {formatPrice(p.priceAmount, p.priceUnit, t)}
                      </div>
                      <div className="muted" style={{ fontSize: 14 }}>
                        {t('mgr.owner')}: {p.ownerName} ({p.ownerEmail})
                      </div>
                    </td>
                    <td>
                      <div className="actions">
                        {statusForm(p.id, 'approved', t('mgr.approve'), '')}
                        {statusForm(p.id, 'rejected', t('mgr.reject'), 'danger')}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('mgr.all')}</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              {all.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/provider/${p.id}`}>{p.title}</Link>
                    <div className="muted" style={{ fontSize: 14 }}>
                      {t(`role.${p.kind}`)} · {t(`seg.${p.segment}`)} · {p.ownerEmail}
                    </div>
                  </td>
                  <td>
                    <span className={statusBadgeClass(p.status)}>{t(`status.${p.status}`)}</span>{' '}
                    {p.verified && <span className="badge">{t('card.verified')}</span>}
                  </td>
                  <td>
                    <div className="actions">
                      {p.status !== 'approved' && statusForm(p.id, 'approved', t('mgr.approve'), '')}
                      {p.status !== 'rejected' && statusForm(p.id, 'rejected', t('mgr.reject'), 'danger')}
                      <form action={setVerifiedAction}>
                        <input type="hidden" name="providerId" value={p.id} />
                        <input type="hidden" name="verified" value={p.verified ? '0' : '1'} />
                        <button className="btn small outline" type="submit">
                          {p.verified ? t('mgr.unverify') : t('mgr.verify')}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>{t('docs.title')}</h2>
        {docs.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{t('docs.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table><tbody>{docs.map(docRow)}</tbody></table>
          </div>
        )}
      </section>
    </>
  );
}

// ───────────────────────── Администратор: видит все данные ─────────────────────────

export const ADMIN_TABS = ['overview', 'users', 'providers', 'bookings', 'reports', 'support'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export async function AdminView({ actor, tab }: { actor: Actor; tab: AdminTab }) {
  const { t, locale } = await getI18n();
  const openReports = await countOpenReports(actor);
  const openTickets = await countOpenTickets(actor);
  const dateFmt = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const tabs = (
    <nav className="tabs" aria-label="admin">
      {ADMIN_TABS.map((x) => (
        <Link key={x} className={`pill sm${tab === x ? ' on' : ''}`} href={`/dashboard?tab=${x}`} aria-current={tab === x}>
          {t(`adm.tab.${x}`)}
          {x === 'reports' && openReports > 0 && <span className="count-dot">{openReports}</span>}
          {x === 'support' && openTickets > 0 && <span className="count-dot">{openTickets}</span>}
        </Link>
      ))}
    </nav>
  );

  if (tab === 'support') {
    return (
      <>
        {tabs}
        <SupportView actor={actor} />
      </>
    );
  }

  if (tab === 'reports') {
    return (
      <>
        {tabs}
        <ReportsView actor={actor} />
      </>
    );
  }

  if (tab === 'providers') {
    return (
      <>
        {tabs}
        <ModerationView actor={actor} />
      </>
    );
  }

  if (tab === 'bookings') {
    const list = await listAllBookings(actor);
    return (
      <>
        {tabs}
        <section className="panel">
          <h2>{t('adm.tab.bookings')}</h2>
          {list.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t('adm.none')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('adm.userCol')}</th>
                    <th>{t('docs.provider')}</th>
                    <th>{t('adm.when')}</th>
                    <th>{t('adm.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <b>{b.parentName}</b>
                        <div className="muted" style={{ fontSize: 14 }}>{b.parentEmail}</div>
                      </td>
                      <td>
                        <Link href={`/provider/${b.providerId}`}>{b.providerTitle}</Link>
                        <div className="muted" style={{ fontSize: 14 }}>{t(`role.${b.providerKind}`)}</div>
                      </td>
                      <td>{formatDate(b.date, locale)} · {b.time}</td>
                      <td><span className={statusBadgeClass(b.status)}>{t(`bk.${b.status}`)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    );
  }

  if (tab === 'users') {
    const allUsers = await listUsers(actor);
    return (
      <>
        {tabs}
        <section className="panel">
          <h2>{t('adm.users')}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('auth.name')}</th>
                  <th>{t('adm.phone')}</th>
                  <th>{t('adm.created')}</th>
                  <th>{t('adm.role')}</th>
                  <th>{t('adm.status')}</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((u) => {
                  const isSelf = u.id === actor.id;
                  const fixed = isProviderRole(u.role);
                  return (
                    <tr key={u.id}>
                      <td>
                        <b>{u.name}</b> {isSelf && <span className="badge">{t('adm.you')}</span>}
                        <div className="muted" style={{ fontSize: 14 }}>{u.email}</div>
                      </td>
                      <td>{u.phone ?? '—'}</td>
                      <td>{dateFmt.format(u.createdAt)}</td>
                      <td>
                        {fixed || isSelf ? (
                          <span title={fixed ? t('adm.fixedRole') : undefined}>{t(`role.${u.role}`)}</span>
                        ) : (
                          <form action={setUserRoleAction}>
                            <input type="hidden" name="userId" value={u.id} />
                            <select name="role" defaultValue={u.role} aria-label={t('adm.role')}>
                              {ASSIGNABLE_ROLES.map((r) => (
                                <option key={r} value={r}>{t(`role.${r}`)}</option>
                              ))}
                            </select>
                            <button className="btn small outline" type="submit">{t('adm.setRole')}</button>
                          </form>
                        )}
                      </td>
                      <td>
                        <span className={u.active ? 'badge' : 'badge bad'}>
                          {u.active ? t('adm.status.active') : t('adm.status.off')}
                        </span>{' '}
                        {!u.active && u.blockedReason && (
                          <div className="muted" style={{ fontSize: 13 }}>{t('adm.reason')}: {u.blockedReason}</div>
                        )}
                        {!isSelf && (
                          <form action={setUserActiveAction} className="block-form">
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="active" value={u.active ? '0' : '1'} />
                            {u.active && (
                              <input name="reason" type="text" required minLength={3} maxLength={300} placeholder={t('adm.reasonPlaceholder')} aria-label={t('adm.reason')} />
                            )}
                            <button className={`btn small ${u.active ? 'danger' : 'outline'}`} type="submit">
                              {u.active ? t('adm.deactivate') : t('adm.activate')}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  const st = await getStats(actor);
  const card = (n: number | string, label: string) => (
    <div className="stat"><b>{n}</b><span>{label}</span></div>
  );
  return (
    <>
      {tabs}
      <section>
        <h2 className="display" style={{ fontSize: 20, margin: '8px 0 14px' }}>{t('adm.stats')}</h2>
        <div className="stats">
          {card(st.users, t('adm.stat.users'))}
          {card(st.parents, t('adm.stat.parents'))}
          {card(st.providers, t('adm.stat.providers'))}
          {card(st.staff, t('adm.stat.staff'))}
          {card(st.inactive, t('adm.stat.inactive'))}
        </div>
        <div className="stats">
          {card(st.nannies, t('adm.stat.nannies'))}
          {card(st.tutors, t('adm.stat.tutors'))}
          {card(st.clubs, t('adm.stat.clubs'))}
          {card(st.pending, t('adm.stat.pending'))}
          {card(st.verified, t('adm.stat.verified'))}
        </div>
        <div className="stats">
          {card(st.bookings, t('adm.stat.bookings'))}
          {card(st.bookingsActive, t('adm.stat.active'))}
          {card(st.bookingsCompleted, t('adm.stat.completed'))}
          {card(st.reviews, t('adm.stat.reviews'))}
          {card(st.avgRating === null ? '—' : st.avgRating.toFixed(1), t('adm.stat.rating'))}
        </div>
        <div className="stats">
          {card(st.reportsOpen, t('adm.stat.reports'))}
          {card(st.messages, t('adm.stat.messages'))}
        </div>
        <div className="stats">
          {card(st.docsPending, t('adm.stat.docsPending'))}
          {card(st.docsTotal, t('adm.stat.docs'))}
        </div>
      </section>
    </>
  );
}

// ───────────────────────── Жалобы (менеджер и админ) ─────────────────────────

export async function SupportView({ actor }: { actor: Actor }) {
  const { t, locale } = await getI18n();
  const [open, closed] = await Promise.all([listTickets(actor, 'open'), listTickets(actor, 'closed')]);
  const fmt = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Almaty',
  });
  const card = (x: (typeof open)[number], canClose: boolean) => (
    <article className="ticket" key={x.id}>
      <div className="actions" style={{ marginBottom: 6 }}>
        <span className={`badge ${x.topic === 'appeal' ? 'bad' : 'warn'}`}>{t(`support.topic.${x.topic}`)}</span>
        <span className="muted" style={{ fontSize: 13 }}>{fmt.format(x.createdAt)}</span>
      </div>
      <p style={{ margin: '0 0 6px', whiteSpace: 'pre-line' }}>{x.message}</p>
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 14 }}>
        {t('sup.from')}: {x.name} ({x.email}){x.userId === null ? ` · ${t('sup.guest')}` : ''}
      </p>
      {canClose && (
        <form action={closeTicketAction}>
          <input type="hidden" name="ticketId" value={x.id} />
          <button className="btn small" type="submit">{t('sup.close')}</button>
        </form>
      )}
    </article>
  );
  return (
    <>
      <section className="panel">
        <h2>{t('sup.open')}</h2>
        {open.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('sup.none')}</p> : open.map((x) => card(x, true))}
      </section>
      {closed.length > 0 && (
        <section className="panel">
          <h2>{t('sup.closed')}</h2>
          {closed.map((x) => card(x, false))}
        </section>
      )}
    </>
  );
}

export async function ReportsView({ actor }: { actor: Actor }) {
  const { t, locale } = await getI18n();
  const [open, closed] = await Promise.all([listReports(actor, 'open'), listReports(actor, 'closed')]);
  const fmt = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Almaty',
  });
  const act = (id: number, action: string, label: string, cls = '') => (
    <form action={resolveReportAction}>
      <input type="hidden" name="reportId" value={id} />
      <input type="hidden" name="action" value={action} />
      <button className={`btn small ${cls}`} type="submit">{label}</button>
    </form>
  );

  return (
    <>
      <section className="panel">
        <h2>{t('rep.open')}</h2>
        {open.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{t('rep.none')}</p>
        ) : (
          <div className="report-list">
            {open.map((r) => (
              <article className="report-card" key={r.id}>
                <div className="actions" style={{ marginBottom: 6 }}>
                  <span className="badge warn">{t(`rep.type.${r.targetType}`)}</span>
                  <span className="badge bad">{t(`report.reason.${r.reason}`)}</span>
                  <span className="muted" style={{ fontSize: 13 }}>{fmt.format(r.createdAt)}</span>
                </div>
                <p style={{ margin: '0 0 6px' }}>
                  <b>{t('rep.target')}:</b> {r.targetName} ({r.targetEmail}, {t(`role.${r.targetRole}`)})
                  {!r.targetActive && <span className="badge bad" style={{ marginLeft: 6 }}>{t('adm.status.off')}</span>}
                </p>
                {r.details && <p style={{ margin: '0 0 6px', whiteSpace: 'pre-line' }}>«{r.details}»</p>}
                {r.reviewText !== null && <p className="muted" style={{ margin: '0 0 6px' }}>{t('rep.reviewText')}: {r.reviewText || '—'}</p>}
                <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>{t('rep.from')}: {r.reporterName} ({r.reporterEmail})</p>
                <div className="actions">
                  {r.targetType === 'provider' && <Link className="btn small outline" href={`/provider/${r.targetId}`}>{t('rep.openProfile')}</Link>}
                  {r.targetType === 'chat' && <Link className="btn small outline" href={`/chat/${r.targetId}`}>{t('rep.openChat')}</Link>}
                  {act(r.id, 'dismiss', t('rep.dismiss'), 'outline')}
                  {act(r.id, 'resolve', t('rep.resolve'))}
                  {r.targetType === 'review' && act(r.id, 'hide_review', t('rep.hideReview'), 'danger')}
                  {r.providerId !== null && act(r.id, 'reject_provider', t('rep.rejectProvider'), 'danger')}
                </div>
                {actor.role === 'admin' && r.targetActive && (
                  <form action={resolveReportAction} className="block-form" style={{ marginTop: 10 }}>
                    <input type="hidden" name="reportId" value={r.id} />
                    <input type="hidden" name="action" value="block_user" />
                    <input name="note" type="text" required minLength={3} maxLength={300} placeholder={t('adm.reasonPlaceholder')} aria-label={t('adm.reason')} />
                    <button className="btn small danger" type="submit">{t('rep.blockUser')}</button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section className="panel">
          <h2>{t('rep.closed')}</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {closed.slice(0, 30).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.targetName}</b>
                      <div className="muted" style={{ fontSize: 14 }}>{t(`rep.type.${r.targetType}`)} · {t(`report.reason.${r.reason}`)}</div>
                    </td>
                    <td><span className={r.status === 'dismissed' ? 'badge' : 'badge warn'}>{t(`rep.res.${r.resolution ?? 'resolve'}`)}</span></td>
                    <td className="muted">{fmt.format(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
