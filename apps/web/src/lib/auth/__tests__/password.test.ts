import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("s3cret-pa$$word");
    expect(hash).not.toBe("s3cret-pa$$word");
    expect(await verifyPassword(hash, "s3cret-pa$$word")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword(hash, "battery staple")).toBe(false);
  });

  it("produces distinct hashes for the same input (salted)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });
});
