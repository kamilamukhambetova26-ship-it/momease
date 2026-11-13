import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from './constants';
import { getUserById } from './services';
import { SESSION_MAX_AGE, signSessionToken, verifySessionToken } from './token';

export async function createSession(userId: number) {
  const token = await signSessionToken(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Текущий пользователь или null. Роль и «active» читаются из БД на каждый запрос. */
export const getSessionUser = cache(async () => {
  const jar = await cookies();
  const uid = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  const user = await getUserById(uid);
  if (!user || !user.active) return null;
  return user;
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/dashboard');
  return user;
}

/** Разрешает только внутренние пути, чтобы нельзя было увести пользователя на чужой сайт */
export function safeNext(value: unknown, fallback = '/dashboard') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}
