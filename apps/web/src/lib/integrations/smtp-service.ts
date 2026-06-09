import { prisma } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/types";
import { assertCanEditIntegration, assertCanViewIntegration } from "./guards";
import { encryptField } from "./secrets";

export interface SmtpView {
  host: string;
  port: number;
  username: string | null;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  encryption: "none" | "tls" | "ssl";
  passwordConfigured: boolean;
  lastTestedAt: Date | null;
  lastError: string | null;
}

/** SMTP settings without the secret. Returns null if unconfigured. */
export async function getSmtp(session: SessionContext, organizationId: string): Promise<SmtpView | null> {
  assertCanViewIntegration(session, organizationId);
  const s = await prisma.smtpSetting.findUnique({ where: { organizationId } });
  if (!s) return null;
  return {
    host: s.host, port: s.port, username: s.username, fromName: s.fromName,
    fromEmail: s.fromEmail, replyTo: s.replyTo, encryption: s.encryption,
    passwordConfigured: Boolean(s.passwordEnc),
    lastTestedAt: s.lastTestedAt, lastError: s.lastError,
  };
}

export interface SaveSmtpInput {
  host: string;
  port: number;
  username?: string | null;
  password?: string | null; // plaintext; encrypted here. Omit/empty to keep existing.
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  encryption: "none" | "tls" | "ssl";
}

/** Create/update SMTP settings; encrypts the password, never stores plaintext. Audited. */
export async function saveSmtp(session: SessionContext, organizationId: string, input: SaveSmtpInput) {
  assertCanEditIntegration(session, organizationId);
  const data = {
    host: input.host, port: input.port, username: input.username ?? null,
    fromName: input.fromName, fromEmail: input.fromEmail, replyTo: input.replyTo ?? null,
    encryption: input.encryption, updatedByUserId: session.userId,
    ...(input.password ? { passwordEnc: encryptField(input.password) } : {}),
  };
  const saved = await prisma.smtpSetting.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
  await prisma.auditLog.create({
    data: {
      organizationId, actorUserId: session.userId,
      impersonatedUserId: session.impersonating ? session.userId : null,
      action: "integration.updated", entityType: "smtp", entityId: saved.id, success: true,
    },
  });
  return getSmtp(session, organizationId);
}

/** Record the outcome of an SMTP test send (the actual send is performed by the caller/UI). */
export async function recordSmtpTest(
  session: SessionContext,
  organizationId: string,
  ok: boolean,
  error?: string,
) {
  assertCanEditIntegration(session, organizationId);
  await prisma.smtpSetting.update({
    where: { organizationId },
    data: { lastTestedAt: new Date(), lastError: ok ? null : (error ?? "unknown error") },
  });
  await prisma.auditLog.create({
    data: {
      organizationId, actorUserId: session.userId,
      action: ok ? "smtp.test_sent" : "smtp.test_failed",
      entityType: "smtp", entityId: organizationId, success: ok,
    },
  });
}
