import { cookies } from "next/headers";

/**
 * Where the flow token lives between asking for a code and typing it.
 *
 * One definition, imported by every action that touches it. It lived in two
 * files before, name and options duplicated verbatim, so a change to one — the
 * maxAge most obviously — would have silently desynced the other and made codes
 * unverifiable on whichever flow still held the old cookie.
 *
 * httpOnly so page scripts cannot read it, and short-lived because the code it
 * accompanies lasts ten minutes.
 */
export const FLOW_COOKIE = "verify_flow";

const OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 15 * 60,
} as const;

export async function setFlowCookie(token: string): Promise<void> {
  (await cookies()).set(FLOW_COOKIE, token, OPTIONS);
}

export async function readFlowCookie(): Promise<string | null> {
  return (await cookies()).get(FLOW_COOKIE)?.value ?? null;
}
