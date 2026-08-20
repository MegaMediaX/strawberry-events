import { describe, it, expect, vi, afterEach } from "vitest";
import { rawZplData, stripToRawOptions, isRawOnly, PrintError, isPersistentPrintFailure} from "@/lib/checkin/print-client";

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

describe("probePrinter", () => {
  // The door needs to learn the printer is down BEFORE the queue forms. Every
  // failure must name a fix, because the raw errors point at the wrong thing:
  // a browser blocked by CSP and a QZ Tray that is genuinely not running look
  // identical from here.
  const withQz = (impl: Record<string, unknown>) => {
    vi.doMock("qz-tray", () => ({ default: impl }));
    vi.resetModules();
    return import("@/lib/checkin/print-client");
  };

  afterEach(() => {
    vi.doUnmock("qz-tray");
    vi.resetModules();
  });

  it("reports ready with the printer name", async () => {
    const { probePrinter } = await withQz({
      websocket: { isActive: () => true, connect: async () => {} },
      security: { setCertificatePromise: () => {}, setSignaturePromise: () => {} },
      printers: { find: async () => "PC42d" },
      configs: { create: () => ({ getOptions: () => ({}) }) },
      print: async () => {},
    });
    expect(await probePrinter()).toEqual({ ok: true, printer: "PC42d" });
  });

  it("says QZ Tray is unreachable, and how to fix it", async () => {
    const { probePrinter } = await withQz({
      websocket: { isActive: () => false, connect: async () => { throw new Error("refused"); } },
      security: { setCertificatePromise: () => {}, setSignaturePromise: () => {} },
      printers: { find: async () => "PC42d" },
      configs: { create: () => ({ getOptions: () => ({}) }) },
      print: async () => {},
    });
    const h = await probePrinter();
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.reason).toMatch(/not reachable/i);
      expect(h.fixHint).toMatch(/QZ Tray/i);
    }
  });

  it("says when the printer itself cannot be found", async () => {
    const { probePrinter } = await withQz({
      websocket: { isActive: () => true, connect: async () => {} },
      security: { setCertificatePromise: () => {}, setSignaturePromise: () => {} },
      printers: { find: async () => { throw new Error("no such printer"); } },
      configs: { create: () => ({ getOptions: () => ({}) }) },
      print: async () => {},
    });
    const h = await probePrinter();
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.fixHint).toMatch(/connected|settings/i);
  });

  it("never prints while probing", async () => {
    // A health check that emits a label would waste stock every 30 seconds.
    let printed = 0;
    const { probePrinter } = await withQz({
      websocket: { isActive: () => true, connect: async () => {} },
      security: { setCertificatePromise: () => {}, setSignaturePromise: () => {} },
      printers: { find: async () => "PC42d" },
      configs: { create: () => ({ getOptions: () => ({}) }) },
      print: async () => { printed += 1; },
    });
    await probePrinter();
    expect(printed).toBe(0);
  });
});

describe("which print failures should stop the door retrying", () => {
  // A single jammed label must NOT downgrade every remaining attendee. The
  // panel latches on a persistent failure and stops dialling QZ; latching on a
  // rejected label would send the whole rest of the queue to browser printing
  // after one bad badge.
  it("treats a rejected label as transient", () => {
    const jam = new PrintError("The printer rejected that label.", "job");
    expect(jam.kind).toBe("job");
    expect(isPersistentPrintFailure(jam)).toBe(false);
  });

  it("treats QZ Tray being unreachable as persistent", () => {
    expect(isPersistentPrintFailure(new PrintError("no qz", "transport"))).toBe(true);
  });

  it("treats a missing printer as persistent", () => {
    expect(isPersistentPrintFailure(new PrintError("no printer", "printer"))).toBe(true);
  });

  it("does not treat an unrelated error as a print failure at all", () => {
    expect(isPersistentPrintFailure(new Error("boom"))).toBe(false);
    expect(isPersistentPrintFailure(null)).toBe(false);
  });

  it("a rejected job surfaces as kind 'job' from printZpl", async () => {
    // The real path: QZ connects, the printer exists, but print() throws.
    vi.doMock("qz-tray", () => ({
      default: {
        websocket: { isActive: () => true, connect: async () => {} },
        security: { setCertificatePromise: () => {}, setSignaturePromise: () => {} },
        printers: { find: async () => "PC42d" },
        configs: { create: () => ({ getOptions: () => ({ altPrinting: true }) }) },
        print: async () => {
          throw new Error("out of paper");
        },
      },
    }));
    vi.resetModules();
    const mod = await import("@/lib/checkin/print-client");

    await expect(mod.printZpl("^XA^XZ")).rejects.toMatchObject({ kind: "job" });

    vi.doUnmock("qz-tray");
    vi.resetModules();
  });

  it("an unreachable QZ surfaces as kind 'transport'", async () => {
    vi.doMock("qz-tray", () => ({
      default: {
        websocket: {
          isActive: () => false,
          connect: async () => {
            throw new Error("refused");
          },
        },
        security: { setCertificatePromise: () => {}, setSignaturePromise: () => {} },
        printers: { find: async () => "PC42d" },
        configs: { create: () => ({ getOptions: () => ({}) }) },
        print: async () => {},
      },
    }));
    vi.resetModules();
    const mod = await import("@/lib/checkin/print-client");

    await expect(mod.printZpl("^XA^XZ")).rejects.toMatchObject({ kind: "transport" });

    vi.doUnmock("qz-tray");
    vi.resetModules();
  });
});
