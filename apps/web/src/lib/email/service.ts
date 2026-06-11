import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db/client";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/** Optional operational context for the email log (recorded only when provided). */
export interface EmailMeta {
  templateType?: string;
  organizationId?: string | null;
  eventMappingId?: string | null;
  attendeeRef?: string | null;
}

/** Persist an email-log row. Best-effort: never throws, never blocks sending. */
async function logEmail(
  email: OutgoingEmail,
  meta: EmailMeta,
  status: "sent" | "failed" | "disabled",
  provider: "smtp" | "dev_log",
  lastError: string | null,
): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        recipient: email.to,
        subject: email.subject,
        bodyText: email.text,
        templateType: meta.templateType ?? null,
        organizationId: meta.organizationId ?? null,
        eventMappingId: meta.eventMappingId ?? null,
        attendeeRef: meta.attendeeRef ?? null,
        status,
        provider,
        lastError,
      },
    });
  } catch (err) {
    console.error("[email] log write failed:", (err as Error).message);
  }
}

export type EmailMode = "smtp" | "dev-log" | "disabled";

let cached: Transporter | null = null;

/**
 * Outbound email mode:
 * - "smtp": real SMTP transport (SMTP_HOST configured).
 * - "dev-log": development convenience — logs to console, does NOT send.
 * - "disabled": production with no SMTP and email explicitly disabled
 *   (ALLOW_EMAIL_DISABLED_IN_PRODUCTION=true). Never pretends to send.
 *
 * In production with no SMTP and no explicit opt-out, startup env validation
 * (lib/config/env) fails fast, so that combination never reaches runtime.
 */
export function emailMode(): EmailMode {
  if (process.env.SMTP_HOST) return "smtp";
  if (process.env.NODE_ENV === "production") return "disabled";
  return "dev-log";
}

export function isDevTransport(): boolean {
  return emailMode() === "dev-log";
}

function getTransport(): Transporter {
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

/**
 * Send an email. Never throws — failures are logged and swallowed.
 * Returns true only when the message was actually handed to a transport
 * (real SMTP, or the dev-log transport in development). In production with
 * email disabled it returns false and does NOT log a false success.
 */
export async function sendEmail(email: OutgoingEmail, meta?: EmailMeta): Promise<boolean> {
  const mode = emailMode();
  if (mode === "disabled") {
    console.warn("[email] outbound email is disabled in production; not sending to", email.to);
    if (meta) await logEmail(email, meta, "disabled", "dev_log", null);
    return false;
  }

  const from = process.env.SMTP_FROM_EMAIL
    ? `${process.env.SMTP_FROM_NAME ?? "Strawberry Events"} <${process.env.SMTP_FROM_EMAIL}>`
    : "Strawberry Events <noreply@strawberry.local>";
  try {
    const info = await getTransport().sendMail({ from, ...email });
    if (mode === "dev-log") {
      console.info("[email:dev]", email.to, "—", email.subject);
      console.info(email.text);
      void info;
    }
    if (meta) await logEmail(email, meta, "sent", mode === "smtp" ? "smtp" : "dev_log", null);
    return true;
  } catch (err) {
    console.error("[email] send failed:", (err as Error).message);
    if (meta) await logEmail(email, meta, "failed", "smtp", (err as Error).message);
    return false;
  }
}
