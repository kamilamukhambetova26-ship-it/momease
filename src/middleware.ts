import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/constants';

/**
 * Лёгкий барьер: без cookie сессии в кабинет не пускаем.
 * Настоящая проверка (подпись, роль, active) выполняется на сервере в getSessionUser().
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*', '/chat/:path*', '/notifications/:path*', '/messages/:path*'] };
