import { SignJWT, jwtVerify } from 'jose';

const DEV_SECRET = 'dev-only-secret-change-me-before-production-0123456789';

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET не задан. Задайте длинную случайную строку в переменных окружения.');
    }
    return new TextEncoder().encode(DEV_SECRET);
  }
  return new TextEncoder().encode(s);
}

export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 дней

export async function signSessionToken(userId: number) {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return typeof payload.uid === 'number' ? payload.uid : null;
  } catch {
    return null;
  }
}
