import { describe, it, expect } from "vitest";
import { buildSecurityHeaders } from "@/lib/security/headers";

describe("buildSecurityHeaders", () => {
  it("includes core headers and no X-Powered-By", () => {
    const h = buildSecurityHeaders(false);
    const keys = h.map((x) => x.key);
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("Permissions-Policy");
    expect(keys).not.toContain("X-Powered-By");
  });

  it("CSP denies framing and restricts default-src to self", () => {
    const csp = buildSecurityHeaders(false).find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("allows unsafe-eval only in development (prod stays strict)", () => {
    const dev = buildSecurityHeaders(false).find((h) => h.key === "Content-Security-Policy")!.value;
    const prod = buildSecurityHeaders(true).find((h) => h.key === "Content-Security-Policy")!.value;
    expect(dev).toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it("emits HSTS only in production", () => {
    expect(buildSecurityHeaders(false).some((h) => h.key === "Strict-Transport-Security")).toBe(false);
    const prod = buildSecurityHeaders(true).find((h) => h.key === "Strict-Transport-Security");
    expect(prod?.value).toContain("max-age=63072000");
    expect(prod?.value).toContain("includeSubDomains");
  });
});
