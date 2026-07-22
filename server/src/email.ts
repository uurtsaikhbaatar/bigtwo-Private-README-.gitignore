/**
 * Имэйл илгээх.
 *
 * Үйлчилгээг `EMAIL_PROVIDER` орчны хувьсагчаар сонгоно. Тохируулаагүй бол
 * "консол" горимд ажиллаж, илгээх байсан агуулгыг серверийн лог руу бичнэ —
 * ингэснээр имэйлийн үйлчилгээгүйгээр ч бүх урсгалыг турших боломжтой.
 *
 * Gmail (бүртгэл, SMS шаардлагагүй — хамгийн хялбар зам):
 *   EMAIL_PROVIDER=gmail
 *   EMAIL_USER=тань@gmail.com
 *   EMAIL_APP_PASSWORD=…   ← Google-ийн "App password", жинхэнэ нууц үг БИШ
 *
 * API-тай үйлчилгээ:
 *   EMAIL_PROVIDER=resend|sendgrid|brevo
 *   EMAIL_API_KEY=…
 *   EMAIL_FROM="Дай Ди <тань@жишээ.mn>"
 */

export type EmailProvider = 'gmail' | 'smtp' | 'resend' | 'sendgrid' | 'brevo' | 'console';

/** SMTP-ээр илгээдэг хувилбарууд — API түлхүүр биш, нууц үг ашиглана. */
const SMTP_PROVIDERS = new Set<EmailProvider>(['gmail', 'smtp']);

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function emailProvider(): EmailProvider {
  const configured = (process.env.EMAIL_PROVIDER ?? '').toLowerCase() as EmailProvider;

  // Gmail/SMTP нь нууц үгээр ажиллана.
  if (SMTP_PROVIDERS.has(configured)) {
    const password = process.env.EMAIL_APP_PASSWORD ?? process.env.SMTP_PASS;
    return password ? configured : 'console';
  }

  // Бусад нь API түлхүүртэй.
  if (configured === 'resend' || configured === 'sendgrid' || configured === 'brevo') {
    return process.env.EMAIL_API_KEY ? configured : 'console';
  }
  return 'console';
}

/**
 * Илгээгчийн хаяг. Gmail/SMTP-ийн хувьд `EMAIL_USER` нь анхдагч болно —
 * ингэснээр нэг талбар цөөрнө.
 */
function sender(): string {
  const from = process.env.EMAIL_FROM ?? process.env.EMAIL_USER ?? process.env.SMTP_USER;
  if (!from) throw new Error('EMAIL_FROM (эсвэл EMAIL_USER) тохируулаагүй байна.');
  return from;
}

/**
 * SMTP-ээр илгээнэ (Gmail орно).
 *
 * Gmail-д ЖИНХЭНЭ нууц үг биш, "App password" хэрэгтэй — Google бүртгэлдээ
 * 2 алхамт баталгаажуулалт асаасны дараа үүсгэнэ.
 */
async function sendViaSmtp(message: EmailMessage, provider: 'gmail' | 'smtp'): Promise<void> {
  const nodemailer = await import('nodemailer');
  const user = process.env.EMAIL_USER ?? process.env.SMTP_USER;
  const pass = process.env.EMAIL_APP_PASSWORD ?? process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('EMAIL_USER / EMAIL_APP_PASSWORD тохируулаагүй байна.');

  const transport =
    provider === 'gmail'
      ? nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
      : nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 465),
          secure: Number(process.env.SMTP_PORT ?? 465) === 465,
          auth: { user, pass },
        });

  await transport.sendMail({
    from: sender(),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

/** `"Нэр <хаяг>"` хэлбэрээс зөвхөн хаягийг салгана. */
function bareAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

/**
 * Имэйл илгээнэ. Амжилтгүй бол алдаа шиднэ — дуудагч тал шийднэ.
 * Консол горимд үргэлж амжилттай.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailProvider> {
  const provider = emailProvider();

  if (provider === 'console') {
    console.log('─'.repeat(60));
    console.log(`ИМЭЙЛ (консол горим) → ${message.to}`);
    console.log(`Гарчиг: ${message.subject}`);
    console.log(message.text);
    console.log('─'.repeat(60));
    return provider;
  }

  if (provider === 'gmail' || provider === 'smtp') {
    await sendViaSmtp(message, provider);
    return provider;
  }

  const key = process.env.EMAIL_API_KEY!;
  const from = sender();
  type ApiProvider = 'resend' | 'sendgrid' | 'brevo';
  const requests: Record<ApiProvider, { url: string; init: RequestInit }> = {
    resend: {
      url: 'https://api.resend.com/emails',
      init: {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      },
    },
    sendgrid: {
      url: 'https://api.sendgrid.com/v3/mail/send',
      init: {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: { email: bareAddress(from) },
          subject: message.subject,
          content: [
            { type: 'text/plain', value: message.text },
            ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
          ],
        }),
      },
    },
    brevo: {
      url: 'https://api.brevo.com/v3/smtp/email',
      init: {
        method: 'POST',
        headers: { 'api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { email: bareAddress(from) },
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
      },
    },
  };

  const { url, init } = requests[provider as ApiProvider];
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${provider} имэйл илгээж чадсангүй (${response.status}): ${body.slice(0, 200)}`);
  }
  return provider;
}

/** Баталгаажуулах кодын захидал. */
export function verificationEmail(username: string, code: string): Omit<EmailMessage, 'to'> {
  const text = [
    `Сайн байна уу, ${username}!`,
    '',
    'Дай Ди тоглоомын бүртгэлээ баталгаажуулах код:',
    '',
    `    ${code}`,
    '',
    'Код 15 минутын дараа хүчингүй болно.',
    'Хэрэв та бүртгүүлээгүй бол энэ захидлыг үл тоомсорлоно уу.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:420px">
      <h2 style="margin:0 0 8px">Дай Ди</h2>
      <p>Сайн байна уу, <strong>${escapeHtml(username)}</strong>!</p>
      <p>Бүртгэлээ баталгаажуулах код:</p>
      <p style="font-size:30px;font-weight:800;letter-spacing:6px;margin:16px 0">${code}</p>
      <p style="color:#666;font-size:13px">
        Код 15 минутын дараа хүчингүй болно.<br>
        Хэрэв та бүртгүүлээгүй бол энэ захидлыг үл тоомсорлоно уу.
      </p>
    </div>`;

  return { subject: `Дай Ди — баталгаажуулах код ${code}`, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
