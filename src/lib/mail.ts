/**
 * Transactional email through Resend's HTTP API. Supabase sends sign-in
 * links through the same Resend account (as SMTP); this is for the few
 * emails Radar sends itself.
 */

export const MAIL_FROM_DEFAULT = 'On Your Radar <hello@mail.onyourradar.app>';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function env(name: string): string | undefined {
  return process.env[name] ?? import.meta.env[name];
}

/** Can Radar send email itself here? (Always true in dev, which logs instead.) */
export function mailConfigured(): boolean {
  return !!env('RESEND_API_KEY') || import.meta.env.DEV;
}

export async function sendEmail(email: Email): Promise<void> {
  const key = env('RESEND_API_KEY');
  if (!key) {
    if (import.meta.env.DEV) {
      // No key locally: print the email so the link can be followed by hand.
      console.info(`[mail] to ${email.to}: ${email.subject}\n${email.text}`);
      return;
    }
    throw new Error('RESEND_API_KEY is not set.');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('MAIL_FROM') ?? MAIL_FROM_DEFAULT, ...email, to: [email.to] }),
  });
  if (!res.ok) {
    throw new Error(`Resend refused the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}
