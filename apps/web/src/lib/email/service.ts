import nodemailer, { type Transporter } from "nodemailer";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

let cached: Transporter | null = null;

/**
 * Returns a real SMTP transport when SMTP_HOST is configured, otherwise a dev
 * transport that does not send mail (jsonTransport) — messages are logged.
 */
export function getTransport(): Transporter {
  if (cached) return cached;
  if (process.env.SMTP_HOST) {
    cached = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  } else {
    cached = nodemailer.createTransport({ jsonTransport: true });
  }
  return cached;
}

export function isDevTransport(): boolean {
  return !process.env.SMTP_HOST;
}

/** Send an email. Never throws — failures are logged and swallowed. */
export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const from = process.env.SMTP_FROM_EMAIL
    ? `${process.env.SMTP_FROM_NAME ?? "Strawberry Events"} <${process.env.SMTP_FROM_EMAIL}>`
    : "Strawberry Events <noreply@strawberry.local>";
  try {
    const info = await getTransport().sendMail({ from, ...email });
    if (isDevTransport()) {
      console.info("[email:dev]", email.to, "—", email.subject);
      console.info(email.text);
      void info;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed:", (err as Error).message);
    return false;
  }
}
