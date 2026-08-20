import { getSessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/guards";
import { qzCertificate, qzSigningConfigured } from "@/lib/checkin/qz-signing";

/**
 * The public signing certificate, handed to QZ Tray verbatim.
 *
 * A certificate is public by definition — this is the half that is SAFE to
 * publish, and QZ needs it before it will accept any signature. It is still
 * behind the same auth as signing, because there is no reason for the open
 * internet to enumerate our print infrastructure.
 */
export async function GET() {
  const session = await getSessionContext();
  if (!session || !hasAnyRole(session, ["checkin_staff", "organizer_admin"])) {
    return new Response("Not permitted", { status: 403 });
  }
  if (!qzSigningConfigured()) {
    return new Response("QZ signing not configured", { status: 501 });
  }
  return new Response(qzCertificate(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
