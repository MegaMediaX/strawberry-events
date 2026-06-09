import { describe, it, expect } from "vitest";
import { providers, selectProvider } from "@/lib/payments/provider";

describe("payment providers", () => {
  it("manual_cod is enabled, whish is a disabled placeholder", () => {
    expect(providers.manual_cod.enabled).toBe(true);
    expect(providers.whish.enabled).toBe(false);
  });

  it("selects 'free' for zero total, else manual_cod", () => {
    expect(selectProvider(0)).toBe("free");
    expect(selectProvider(2500)).toBe("manual_cod");
  });
});
