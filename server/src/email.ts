/**
 * Имэйл илгээх.
 *
 * Үйлчилгээг `EMAIL_PROVIDER` орчны хувьсагчаар сонгоно. Тохируулаагүй бол
 * "консол" горимд ажиллаж, илгээх байсан агуулгыг серверийн лог руу бичнэ —
 * ингэснээр имэйлийн үйлчилгээгүйгээр ч бүх урсгалыг турших боломжтой.
 *
 *   EMAIL_PROVIDER=brevo|sendgrid|resend
 *   EMAIL_API_KEY=…
 *   EMAIL_FROM="Дай Ди <баталгаажуулсан@хаяг>"
 *
 * `EMAIL_FROM` дахь хаяг нь тухайн үйлчилгээн дээр баталгаажсан байх ёстой.
 */

export type EmailProvider = 'resend' | 'sendgrid' | 'brevo' | 'console';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function emailProvider(): EmailProvider {
  const configured = (process.env.EMAIL_PROVIDER ?? '').toLowerCase();
  if (!process.env.EMAIL_API_KEY) return 'console';
  if (configured === 'resend' || configured === 'sendgrid' || configured === 'brevo') {
    return configured;
  }
  return 'console';
}

/** Илгээгчийн хаяг. `EMAIL_FROM` тохируулаагүй бол тод алдаа өгнө. */
function sender(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error('EMAIL_FROM тохируулаагүй байна.');
  return from;
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

  const key = process.env.EMAIL_API_KEY!;
  const from = sender();
  const requests: Record<Exclude<EmailProvider, 'console'>, { url: string; init: RequestInit }> = {
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
          sender: { name: senderName(from), email: bareAddress(from) },
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
      },
    },
  };

  const { url, init } = requests[provider];
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${provider} имэйл илгээж чадсангүй (${response.status}): ${body.slice(0, 200)}`);
  }
  return provider;
}

/** `"Дай Ди <a@b.c>"` → `"Дай Ди"`. Нэргүй бол хаягийг өөрийг нь буцаана. */
function senderName(value: string): string {
  const match = value.match(/^\s*([^<]+?)\s*</);
  return match ? match[1] : bareAddress(value);
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
