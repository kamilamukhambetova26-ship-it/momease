import type { TFn } from '@/lib/i18n';

const ITEMS = [
  { key: 'who', icon: '👩‍👧' },
  { key: 'what', icon: '🔎' },
  { key: 'how', icon: '✅' },
] as const;

/** Краткое описание платформы: кто мы, что делаем, как это работает */
export function AboutCards({ t, compact }: { t: TFn; compact?: boolean }) {
  return (
    <div className={compact ? 'about about-mini' : 'about'}>
      {ITEMS.map((i) => (
        <div className="about-card" key={i.key}>
          {!compact && <div className="ico" aria-hidden="true">{i.icon}</div>}
          <h3>{t(`about.${i.key}.t`)}</h3>
          <p>{t(`about.${i.key}.d`)}</p>
        </div>
      ))}
    </div>
  );
}
