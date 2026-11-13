import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { ServiceError, getDocumentFile } from '@/lib/services';

/** Скачивание документа. Доступно только владельцу и команде (менеджер, админ). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await params;
  try {
    const doc = await getDocumentFile({ id: user.id, role: user.role }, Number(id));
    const safeName = encodeURIComponent(doc.fileName);
    return new NextResponse(new Uint8Array(doc.data), {
      headers: {
        'Content-Type': doc.mime,
        'Content-Length': String(doc.data.length),
        'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof ServiceError) return new NextResponse('Not found', { status: 404 });
    throw e;
  }
}
