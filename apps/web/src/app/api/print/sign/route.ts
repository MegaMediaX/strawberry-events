import { getSessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/guards";
import { signForQz, qzSigningConfigured } from "@/lib/checkin/qz-signing";

/**
 * Sign a QZ Tray challenge so the door never sees the "anonymous request wants
 * to access connected printers" dialog.
 *
 * THIS IS A SIGNING ORACLE. Anything it signs, QZ Tray will trust and execute
 * on whatever machine trusts our certificate — so authentication is the entire
 * security boundary, not the contents of the payload.
 *
 * Gated to the same roles that may check people in. A signature is exactly as
 * powerful as the ability to print, so the two permissions belong together.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Impersonation must not be able to drive a physical printer.
  if (session.impersonating) {
    return Response.json({ error: "Not permitted while impersonating" }, { status: 403 });
  }
  if (!hasAnyRole(session, ["checkin_staff", "organizer_admin"])) {
    return Response.json({ error: "Requires check-in staff" }, { status: 403 });
  }

  if (!qzSigningConfigured()) {
    // Not an error: an unsigned deployment falls back to QZ's own prompt, which
    // still works. Say so plainly so the client can stop asking.
    return Response.json({ error: "QZ signing not configured" }, { status: 501 });
  }

  let body: { toSign?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.toSign !== "string") {
    return Response.json({ error: "toSign must be a string" }, { status: 400 });
  }

  try {
    return Response.json({ signature: signForQz(body.toSign) });
  } catch (err) {
    // Never leak the reason — it would describe the key material's state.
    console.error("[qz-sign]", (err as Error).message);
    return Response.json({ error: "Could not sign" }, { status: 500 });
  }
}
