import { describe, it, expect, vi } from "vitest";
import { rawZplData } from "@/lib/checkin/print-client";

describe("rawZplData", () => {
  it("wraps ZPL as a single raw/plain print job", () => {
    const data = rawZplData("^XA^XZ");
    expect(data).toEqual([{ type: "raw", format: "plain", data: "^XA^XZ" }]);
  });
});

describe("raw printing", () => {
  it("passes altPrinting through to the printer config", async () => {
    // Without this the job goes through the zebra.ppd filter chain and CUPS
    // renders the ZPL SOURCE as text — the label comes out covered in
    // "^XA ^FO20,60 ^A0N..." instead of a badge. Verified on the real PC42d.
    //
    // Asserts the option reaches configs.create, not merely that a constant
    // exists: dropping the second argument is exactly how this regresses.
    const createCalls: unknown[][] = [];
    const printCalls: unknown[][] = [];

    vi.doMock("qz-tray", () => ({
      default: {
        websocket: { isActive: () => true, connect: async () => {} },
        security: { setCertificatePromise: () => {}, setSignaturePromise: () => {} },
        printers: { find: async () => "PC42d" },
        configs: {
          create: (...args: unknown[]) => {
            createCalls.push(args);
            return { printer: args[0], opts: args[1] };
          },
        },
        print: async (...args: unknown[]) => {
          printCalls.push(args);
        },
      },
    }));

    vi.resetModules();
    const { printZpl } = await import("@/lib/checkin/print-client");
    await printZpl("^XA^FDhello^FS^XZ");

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0][0]).toBe("PC42d");
    expect(createCalls[0][1]).toMatchObject({ altPrinting: true });
    expect(printCalls).toHaveLength(1);

    vi.doUnmock("qz-tray");
    vi.resetModules();
  });
});
