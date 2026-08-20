import { createSign, constants } from "node:crypto";

/**
 * Server-side signing for QZ Tray requests.
 *
 * QZ prompts "an anonymous request wants to access connected printers" for
 * every unsigned origin, and that grant is per QZ SESSION — restarting QZ Tray
 * brings the dialog back. At a door that means the first badge of the morning
 * blocks behind a modal nobody is watching for.
 *
 * Signing removes the prompt. The private key MUST stay here: putting it in the
 * browser bundle would let anyone who views source extract it and print to any
 * QZ Tray that trusts this certificate. So the client never sees the key — it
 * sends QZ's challenge to an authenticated endpoint and gets back a signature.
 *
 * The certificate itself is public by design; it is handed to QZ verbatim.
 */

/** QZ 2.1+ signs with SHA512withRSA. Older builds used SHA1; this install is 2.2.6. */
const ALGORITHM = "RSA-SHA512";

export class QzSigningUnavailable extends Error {}

function privateKey(): string {
  const raw = process.env.QZ_PRIVATE_KEY;
  if (!raw || !raw.trim()) {
    throw new QzSigningUnavailable("QZ_PRIVATE_KEY is not configured");
  }
  // Env vars cannot hold real newlines in every deployment path, so the key is
  // stored with literal \n and restored here.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function qzCertificate(): string {
  const raw = process.env.QZ_CERTIFICATE;
  if (!raw || !raw.trim()) {
    throw new QzSigningUnavailable("QZ_CERTIFICATE is not configured");
  }
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/** True when both halves are present, so callers can degrade instead of erroring. */
export function qzSigningConfigured(): boolean {
  return Boolean(process.env.QZ_PRIVATE_KEY?.trim() && process.env.QZ_CERTIFICATE?.trim());
}

/**
 * Sign QZ's challenge and return base64.
 *
 * `toSign` is opaque to us — QZ builds it from the call it is about to make.
 * We deliberately do NOT parse or restrict it: QZ's format is its own business,
 * and a partial parser here would break silently on a QZ upgrade. The security
 * boundary is the ENDPOINT's authentication, not the shape of this string.
 */
export function signForQz(toSign: string): string {
  if (typeof toSign !== "string" || toSign.length === 0) {
    throw new Error("Nothing to sign");
  }
  // A signing oracle should not accept unbounded input. QZ's challenges are a
  // few hundred bytes; anything far larger is not QZ.
  if (toSign.length > 8192) {
    throw new Error("Payload too large to be a QZ challenge");
  }

  const signer = createSign(ALGORITHM);
  signer.update(toSign, "utf8");
  signer.end();
  return signer.sign({ key: privateKey(), padding: constants.RSA_PKCS1_PADDING }, "base64");
}
