import { prisma } from "@/lib/db/client";
import { hashPassword } from "./password";

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface RegisterResult {
  ok: boolean;
  userId?: string;
  error?: string;
}

/**
 * Create a role-less attendee account: email + argon2id password hash, no
 * OrganizationMember (admin/staff roles are granted only via user management).
 * No email-verification gate (parity with guest magic-link) — emailVerified
 * stays null. Does NOT auto-link prior guest orders made with the same email.
 */
export async function registerAttendee(
  email: string,
  password: string,
  name?: string,
): Promise<RegisterResult> {
  const e = email.toLowerCase().trim();
  if (!EMAIL_RE.test(e)) return { ok: false, error: "Enter a valid email address." };
  if (!password || password.length < MIN_PASSWORD) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }

  const existing = await prisma.user.findUnique({ where: { email: e } });
  if (existing) return { ok: false, error: "An account with this email already exists." };

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email: e, passwordHash, name: name?.trim() || null, emailVerified: null },
  });
  return { ok: true, userId: user.id };
}
