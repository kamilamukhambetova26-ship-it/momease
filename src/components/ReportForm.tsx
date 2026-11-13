import { reportAction } from '@/app/actions';
import { REPORT_REASONS, type ReportTarget } from '@/lib/constants';
import type { TFn } from '@/lib/i18n';

/** Свёрнутая форма жалобы. Показывается только вошедшим пользователям. */
export function ReportForm({
  targetType,
  targetId,
  back,
  t,
  label,
}: {
  targetType: ReportTarget;
  targetId: number;
  back: string;
  t: TFn;
  label?: string;
}) {
  return (
    <details className="report">
      <summary>{label ?? t('report.button')}</summary>
      <form action={reportAction} className="report-form">
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="back" value={back} />
        <label>
          <span className="label">{t('report.reason')}</span>
          <select name="reason" defaultValue="inappropriate">
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>{t(`report.reason.${r}`)}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">{t('report.details')}</span>
          <textarea name="details" maxLength={1000} />
        </label>
        <button className="btn small danger" type="submit">{t('report.send')}</button>
      </form>
    </details>
  );
}
