'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSession, destroySession, getSessionUser, safeNext } from '@/lib/auth';
import { LOCALE_COOKIE, THEMES, THEME_COOKIE, MAX_DOC_BYTES, type Theme } from '@/lib/constants';
import { normalizeLocale } from '@/lib/i18n';
import * as chat from '@/lib/chat';
import { markAllNotificationsRead } from '@/lib/notify';
import * as rep from '@/lib/reports';
import * as svc from '@/lib/services';
import * as fav from '@/lib/favorites';
import * as sup from '@/lib/support';
import { ServiceError, type Actor } from '@/lib/services';

export type AuthState = { error?: string } | null;

function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}
function num(fd: FormData, key: string) {
  const n = Number(str(fd, key));
  return Number.isInteger(n) ? n : NaN;
}

// ───────────── язык и сессия ─────────────

export async function setLocaleAction(formData: FormData) {
  const locale = normalizeLocale(str(formData, 'lang'));
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  revalidatePath('/', 'layout');
}

export async function setThemeAction(formData: FormData) {
  const v = str(formData, 'theme');
  const theme: Theme = (THEMES as readonly string[]).includes(v) ? (v as Theme) : 'light';
  const jar = await cookies();
  jar.set(THEME_COOKIE, theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  revalidatePath('/', 'layout');
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  let userId: number;
  try {
    const user = await svc.authenticate(str(formData, 'email'), str(formData, 'password'));
    userId = user.id;
  } catch (e) {
    if (e instanceof ServiceError) return { error: `err.${e.code}` };
    throw e;
  }
  await createSession(userId);
  redirect(safeNext(str(formData, 'next')));
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  let userId: number;
  try {
    const user = await svc.registerUser({
      email: str(formData, 'email'),
      password: str(formData, 'password'),
      name: str(formData, 'name'),
      phone: str(formData, 'phone'),
      role: str(formData, 'role'),
      consent: str(formData, 'consent'),
    });
    userId = user.id;
  } catch (e) {
    if (e instanceof ServiceError) return { error: `err.${e.code}` };
    throw e;
  }
  await createSession(userId);
  redirect('/dashboard');
}

export async function logoutAction() {
  await destroySession();
  redirect('/');
}

// ───────────── действия в кабинете ─────────────

async function currentActor(): Promise<Actor> {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/dashboard');
  return { id: user.id, role: user.role };
}

/** Выполняет действие и возвращает пользователя на страницу с сообщением (?msg=код) */
async function run(
  path: string,
  okCode: string,
  fn: (actor: Actor) => Promise<unknown>,
  okPath = path,
): Promise<never> {
  const actor = await currentActor();
  let code = okCode;
  let target = okPath;
  try {
    await fn(actor);
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
    code = e.code;
    target = path;
  }
  revalidatePath('/', 'layout');
  redirect(`${target}${target.includes('?') ? '&' : '?'}msg=${code}`);
}

export async function bookSlotAction(formData: FormData) {
  const slotId = num(formData, 'slotId');
  const providerId = num(formData, 'providerId');
  const date = str(formData, 'date');
  const back = Number.isInteger(providerId) ? `/provider/${providerId}${/^\d{4}-\d{2}-\d{2}$/.test(date) ? `?date=${date}` : ''}` : '/';
  await run(back, 'booked', (a) => svc.createBooking(a, slotId, date), '/dashboard');
}

export async function cancelBookingAction(formData: FormData) {
  await run('/dashboard', 'cancelled', (a) => svc.cancelBooking(a, num(formData, 'bookingId')));
}

export async function reviewAction(formData: FormData) {
  await run('/dashboard', 'reviewed', (a) =>
    svc.createReview(a, num(formData, 'bookingId'), {
      rating: str(formData, 'rating'),
      text: str(formData, 'text'),
    }),
  );
}

export async function updateProfileAction(formData: FormData) {
  await run('/dashboard', 'saved', (a) =>
    svc.updateProviderProfile(a, {
      title: str(formData, 'title'),
      segment: str(formData, 'segment'),
      bio: str(formData, 'bio'),
      district: str(formData, 'district'),
      priceAmount: str(formData, 'priceAmount'),
      priceUnit: str(formData, 'priceUnit'),
      ageFrom: str(formData, 'ageFrom'),
      ageTo: str(formData, 'ageTo'),
      online: formData.get('online') === 'on',
      trial: formData.get('trial') === 'on',
    }),
  );
}

export async function addSlotAction(formData: FormData) {
  await run('/dashboard', 'slot_added', (a) =>
    svc.addSlot(a, { weekday: str(formData, 'weekday'), time: str(formData, 'time') }),
  );
}

export async function removeSlotAction(formData: FormData) {
  await run('/dashboard', 'slot_removed', (a) => svc.removeSlot(a, num(formData, 'slotId')));
}

export async function respondBookingAction(formData: FormData) {
  await run('/dashboard', 'updated', (a) =>
    svc.respondBooking(a, num(formData, 'bookingId'), str(formData, 'action')),
  );
}

export async function setProviderStatusAction(formData: FormData) {
  await run('/dashboard', 'updated', (a) =>
    svc.setProviderStatus(a, num(formData, 'providerId'), str(formData, 'status')),
  );
}

export async function setVerifiedAction(formData: FormData) {
  await run('/dashboard', 'updated', (a) =>
    svc.setVerified(a, num(formData, 'providerId'), str(formData, 'verified') === '1'),
  );
}

export async function setUserRoleAction(formData: FormData) {
  await run('/dashboard', 'updated', (a) =>
    svc.setUserRole(a, num(formData, 'userId'), str(formData, 'role')),
  );
}

export async function setUserActiveAction(formData: FormData) {
  await run('/dashboard?tab=users', 'updated', (a) =>
    svc.setUserActive(a, num(formData, 'userId'), str(formData, 'active') === '1', str(formData, 'reason')),
  );
}

// ───────────── чат, жалобы, уведомления ─────────────

export async function sendMessageAction(formData: FormData) {
  const id = num(formData, 'bookingId');
  await run(`/chat/${id}`, 'sent', (a) => chat.sendMessage(a, id, str(formData, 'body')));
}

export async function reportAction(formData: FormData) {
  const back = safeNext(str(formData, 'back'));
  await run(back, 'reported', (a) =>
    rep.createReport(a, {
      targetType: str(formData, 'targetType'),
      targetId: str(formData, 'targetId'),
      reason: str(formData, 'reason'),
      details: str(formData, 'details'),
    }),
  );
}

export async function resolveReportAction(formData: FormData) {
  await run('/dashboard?tab=reports', 'updated', (a) =>
    rep.resolveReport(a, num(formData, 'reportId'), str(formData, 'action'), str(formData, 'note')),
  );
}

export async function markNotificationsReadAction() {
  const actor = await currentActor();
  await markAllNotificationsRead(actor.id);
  revalidatePath('/', 'layout');
  redirect('/notifications');
}

// ───────────── документы специалиста ─────────────

export async function uploadDocumentAction(formData: FormData) {
  const file = formData.get('file');
  await run('/dashboard', 'doc_added', async (a) => {
    if (!(file instanceof File) || file.size === 0) throw new ServiceError('file_empty');
    if (file.size > MAX_DOC_BYTES) throw new ServiceError('file_too_big');
    await svc.addDocument(a, {
      docType: str(formData, 'docType'),
      title: str(formData, 'title'),
      fileName: file.name,
      data: Buffer.from(await file.arrayBuffer()),
    });
  });
}

export async function deleteDocumentAction(formData: FormData) {
  await run('/dashboard', 'doc_removed', (a) => svc.deleteDocument(a, num(formData, 'docId')));
}

export async function setDocumentStatusAction(formData: FormData) {
  await run('/dashboard', 'updated', (a) =>
    svc.setDocumentStatus(a, num(formData, 'docId'), str(formData, 'status')),
  );
}

// ───────────── поддержка ─────────────

/** Форма поддержки доступна и гостям: войти для неё не нужно */
export async function supportAction(formData: FormData) {
  const user = await getSessionUser();
  let code = 'ticket_sent';
  try {
    await sup.createTicket(user ? { id: user.id, role: user.role } : null, {
      name: str(formData, 'name'),
      email: str(formData, 'email'),
      topic: str(formData, 'topic'),
      message: str(formData, 'message'),
    });
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
    code = e.code;
  }
  redirect(`/support?msg=${code}`);
}

export async function closeTicketAction(formData: FormData) {
  await run('/dashboard?tab=support', 'updated', (a) => sup.closeTicket(a, num(formData, 'ticketId')));
}

// ───────────── избранное ─────────────

export async function toggleFavoriteAction(formData: FormData) {
  const providerId = num(formData, 'providerId');
  const back = Number.isInteger(providerId) ? `/provider/${providerId}` : '/';
  await run(back, 'favorite_saved', (a) => fav.toggleFavorite(a, providerId));
}
