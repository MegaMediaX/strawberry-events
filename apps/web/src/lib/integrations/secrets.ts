import { encrypt, decrypt } from "@/lib/crypto";

/** Encrypt a secret field value (AES-256-GCM). */
export function encryptField(value: string): string {
  return encrypt(value);
}

/** Decrypt a stored secret field. */
export function decryptField(value: string): string {
  return decrypt(value);
}

/**
 * Produce a UI/API-safe view of a config object: secret fields are removed and
 * replaced with `<field>Configured: boolean`. Decrypted secrets are never returned.
 */
export function redactConfig(
  config: Record<string, unknown>,
  secretKeys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (secretKeys.includes(k)) continue;
    out[k] = v;
  }
  for (const k of secretKeys) {
    out[`${k}Configured`] = Boolean(config[k]);
  }
  return out;
}
