/**
 * Отправка писем. Если SMTP_URL не задан, письма не отправляются (уведомления всё равно видны в кабинете).
 *   SMTP_URL=smtps://user:pass@smtp.example.com:465
 *   MAIL_FROM="momease <no-reply@example.com>"
 */
export async function sendMail(to: string, subject: string, text: string) {
  const url = process.env.SMTP_URL;
  if (!url) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport(url);
    await transport.sendMail({ from: process.env.MAIL_FROM || 'momease <no-reply@momease.kz>', to, subject, text });
  } catch (e) {
    console.error('Не удалось отправить письмо', e instanceof Error ? e.message : e);
  }
}
