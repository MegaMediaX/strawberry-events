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

describe("headers the door depends on", () => {
  // Both of these shipped wrong and would have surfaced on event morning as
  // "the camera is broken" and "QZ Tray isn't running" — error messages that
  // point at the operator's machine rather than at these two lines.
  const csp = (prod: boolean) =>
    buildSecurityHeaders(prod).find((h) => h.key === "Content-Security-Policy")?.value ?? "";
  const permissions = (prod: boolean) =>
    buildSecurityHeaders(prod).find((h) => h.key === "Permissions-Policy")?.value ?? "";

  it.each([true, false])("permits our own origin to open the camera (prod=%s)", (prod) => {
    // `camera=()` is an EMPTY allowlist: it denies every origin including self,
    // so getUserMedia rejects and the check-in QR scanner cannot start.
    expect(permissions(prod)).toContain("camera=(self)");
    expect(permissions(prod)).not.toMatch(/camera=\(\)/);
  });

  it.each([true, false])("still denies microphone and geolocation (prod=%s)", (prod) => {
    // Widening camera must not widen anything else.
    expect(permissions(prod)).toContain("microphone=()");
    expect(permissions(prod)).toContain("geolocation=()");
  });

  it.each([true, false])("lets the browser reach QZ Tray on localhost (prod=%s)", (prod) => {
    // QZ Tray is a localhost WebSocket, which is not 'self'. Without these the
    // browser refuses the connection and no badge can ever print.
    const value = csp(prod);
    expect(value).toMatch(/connect-src[^;]*wss:\/\/localhost:\*/);
    expect(value).toMatch(/connect-src[^;]*ws:\/\/localhost:\*/);
    expect(value).toMatch(/connect-src[^;]*wss:\/\/localhost\.qz\.io:\*/);
  });

  it("does not open connect-src to arbitrary remote hosts", () => {
    // The widening above must stay confined to the operator's own machine.
    const connectSrc = /connect-src ([^;]*)/.exec(csp(true))![1];
    const remote = connectSrc
      .split(/\s+/)
      .filter((t) => t && t !== "'self'")
      .filter((t) => !/(localhost|127\.0\.0\.1)/.test(t));
    expect(remote).toEqual([]);
  });
});
