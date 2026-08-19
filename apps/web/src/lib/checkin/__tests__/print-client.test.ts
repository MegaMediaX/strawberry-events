import { describe, it, expect, vi } from "vitest";
import { rawZplData, stripToRawOptions, isRawOnly } from "@/lib/checkin/print-client";

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
            // Mirrors the real QZ Config: create() injects its full default set
            // regardless of what you pass, and getOptions() hands back the LIVE
            // object that print() reads at send time.
            const live: Record<string, unknown> = {
              bounds: null, colorType: "color", copies: 1, density: 0,
              duplex: false, interpolation: "bicubic", jobName: null,
              margins: 0, rasterize: false, scaleContent: true, units: "in",
              forceRaw: false, encoding: null, spool: null,
              ...(args[1] as Record<string, unknown>),
            };
            return { printer: args[0], getOptions: () => live };
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
    expect(printCalls).toHaveLength(1);

    vi.doUnmock("qz-tray");
    vi.resetModules();
  });
});


describe("reducing options to raw-only", () => {
  it("leaves altPrinting and nothing else", () => {
    // QZ only takes the raw CLI path when altPrinting is the ONLY option. The
    // presence of ANY other key makes it fall back to sun.print.UnixPrintJob,
    // which rasterises the ZPL into a picture of its own source.
    const live: Record<string, unknown> = { copies: 1, colorType: "color", altPrinting: true };
    stripToRawOptions(live);
    expect(Object.keys(live)).toEqual(["altPrinting"]);
    expect(live.altPrinting).toBe(true);
  });

  it("mutates in place, because qz.print reads the live object", () => {
    const live: Record<string, unknown> = { copies: 1 };
    const returned = stripToRawOptions(live);
    expect(returned).toBe(live);
  });

  it("isRawOnly rejects anything with extra keys", () => {
    expect(isRawOnly({ altPrinting: true })).toBe(true);
    expect(isRawOnly({ altPrinting: true, copies: 1 })).toBe(false);
    expect(isRawOnly({ copies: 1 })).toBe(false);
    expect(isRawOnly({})).toBe(false);
    expect(isRawOnly({ altPrinting: false })).toBe(false);
  });

  it("the printed job carries exactly one option", async () => {
    // The assertion that matters. The previous test asserted altPrinting was
    // SET, which it was — and badges still printed as text, because the other
    // 20 defaults rode along beside it.
    let sentOptions: Record<string, unknown> | null = null;

    vi.doMock("qz-tray", () => {
      const live: Record<string, unknown> = {
        copies: 1, colorType: "color", encoding: null, spool: null, altPrinting: true,
      };
      return {
        default: {
          websocket: { isActive: () => true, connect: async () => {} },
          security: { setCertificatePromise: () => {}, setSignaturePromise: () => {} },
          printers: { find: async () => "PC42d" },
          configs: { create: () => ({ getOptions: () => live }) },
          print: async (config: { getOptions: () => Record<string, unknown> }) => {
            sentOptions = { ...config.getOptions() };
          },
        },
      };
    });

    vi.resetModules();
    const { printZpl } = await import("@/lib/checkin/print-client");
    await printZpl("^XA^FDhi^FS^XZ");

    expect(sentOptions).toEqual({ altPrinting: true });

    vi.doUnmock("qz-tray");
    vi.resetModules();
  });
});
