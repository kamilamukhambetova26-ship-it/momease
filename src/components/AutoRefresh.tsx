'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Раз в несколько секунд обновляет серверные данные страницы (новые сообщения), пока вкладка открыта */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
