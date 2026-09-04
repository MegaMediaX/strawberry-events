import { describe, it, expect, afterEach, vi } from "vitest";
import { signMagicLink, verifyMagicLink } from "@/lib/tokens/magic-link";
import { signInvite, verifyInvite } from "@/lib/tokens/invite";

/**
 * What signs a ticket link is an entry credential: `/t/<token>` is the only
 * surface that renders the pretix entrance QR. These cover which key is used
 * and, more importantly, which keys are NOT.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the ticket-signing key", () => {
  it("ignores WEBHOOK_SECRET entirely", () => {
    vi.stubEnv("MAGIC_LINK_SECRET", "the-real-key");
    const token = signMagicLink("ABC12");

    // The name the removed fallback used to read. Setting it must change
    // nothing — before, an unrelated-looking variable could sign tickets.
    vi.stubEnv("WEBHOOK_SECRET", "an-unrelated-value");
    expect(verifyMagicLink(token)).toBe("ABC12");
  });

  it("does not fall back to WEBHOOK_SECRET when MAGIC_LINK_SECRET is absent", () => {
    vi.stubEnv("MAGIC_LINK_SECRET", "");
    vi.stubEnv("WEBHOOK_SECRET", "would-have-signed-before");
    vi.stubEnv("NODE_ENV", "test");
    const signedWithoutMagicKey = signMagicLink("ABC12");

    // If the fallback still existed this token would have been signed with
    // "would-have-signed-before" and would fail to verify once it is gone.
    vi.stubEnv("WEBHOOK_SECRET", "");
    expect(verifyMagicLink(signedWithoutMagicKey)).toBe("ABC12");
  });

  it("a token signed under one key does not verify under another", () => {
    vi.stubEnv("MAGIC_LINK_SECRET", "key-a");
    const token = signMagicLink("ABC12");
    vi.stubEnv("MAGIC_LINK_SECRET", "key-b");
    expect(verifyMagicLink(token)).toBeNull();
  });

  it("refuses to sign with the public constant outside development and test", () => {
    vi.stubEnv("MAGIC_LINK_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => signMagicLink("ABC12")).toThrow(/MAGIC_LINK_SECRET is required/);

    // The case the old code got wrong: an unset NODE_ENV silently signed with
    // "dev-secret", a value that is in the repository.
    vi.stubEnv("NODE_ENV", undefined);
    expect(() => signMagicLink("ABC12")).toThrow(/MAGIC_LINK_SECRET is required/);

    vi.stubEnv("NODE_ENV", "staging");
    expect(() => signMagicLink("ABC12")).toThrow(/MAGIC_LINK_SECRET is required/);
  });

  it("still allows the constant in development and test", () => {
    vi.stubEnv("MAGIC_LINK_SECRET", "");
    for (const env of ["development", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      expect(verifyMagicLink(signMagicLink("ABC12"))).toBe("ABC12");
    }
  });
});

describe("the invite-signing key", () => {
  it("follows the same rules — an invite token is a free registration", () => {
    vi.stubEnv("MAGIC_LINK_SECRET", "the-real-key");
    const token = signInvite({ ev: "leb-tech", items: [1] });

    vi.stubEnv("WEBHOOK_SECRET", "an-unrelated-value");
    expect(verifyInvite(token)?.ev).toBe("leb-tech");

    vi.stubEnv("MAGIC_LINK_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => signInvite({ ev: "leb-tech", items: [1] })).toThrow(
      /MAGIC_LINK_SECRET is required/,
    );
  });
});
