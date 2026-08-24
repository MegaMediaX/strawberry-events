import { describe, it, expect } from "vitest";
import { packBitmap, buildBadgeTspl, ROW_BYTES } from "@/lib/checkin/badge-tspl";
import { LABEL_W, LABEL_H, QR_X, QR_Y, QR_MAG } from "@/lib/checkin/badge-layout";

const blank = () => new Array<boolean>(LABEL_W * LABEL_H).fill(false);
const ascii = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("packBitmap", () => {
  it("uses 0 for black — the inverse of most image formats", () => {
    // TSPL BITMAP mode 0 prints where the bit is CLEAR. Sending un-inverted
    // bits produces a photographic negative, which is exactly what one real
    // label did before this was pinned down.
    const px = blank();
    px[0] = true; // top-left black
    const out = packBitmap(px);
    expect(out[0] & 0x80).toBe(0); // black → bit clear
    expect(out[1]).toBe(0xff); // untouched → white
  });

  it("is all-white for an empty badge", () => {
    expect(packBitmap(blank()).every((b) => b === 0xff)).toBe(true);
  });

  it("sets the right bit for a given x", () => {
    const px = blank();
    px[9] = true; // x=9 → byte 1, bit 6
    const out = packBitmap(px);
    expect(out[1] & (0x80 >> 1)).toBe(0);
    expect(out[0]).toBe(0xff);
  });

  it("produces one byte per 8 dots", () => {
    expect(packBitmap(blank()).length).toBe(ROW_BYTES * LABEL_H);
    expect(ROW_BYTES).toBe(LABEL_W / 8);
  });

  it("refuses a pixel count that does not match the label", () => {
    // A silent mismatch would shift every row and print diagonal noise.
    expect(() => packBitmap(new Array(10).fill(false))).toThrow(/expected/);
  });
});

describe("buildBadgeTspl", () => {
  const bitmap = packBitmap(blank());

  it("emits the label setup and a bitmap of the right size", () => {
    const job = ascii(buildBadgeTspl(bitmap, "ABC12345"));
    expect(job).toContain("SIZE 60 mm,40 mm");
    expect(job).toContain("GAP 2 mm,0");
    expect(job).toContain(`BITMAP 0,0,${ROW_BYTES},${LABEL_H},0,`);
    expect(job.trimEnd().endsWith("PRINT 1,1")).toBe(true);
  });

  it("sends the QR as a native command, not as pixels", () => {
    // Bitmapping the QR resamples it and risks ragged module edges.
    const job = ascii(buildBadgeTspl(bitmap, "ABC12345"));
    expect(job).toContain(`QRCODE ${QR_X},${QR_Y},Q,${QR_MAG},A,0,`);
    expect(job).toContain("HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/ABC12345");
  });

  it("still prints a badge when there is no slug", () => {
    // TEST_BADGE and rows predating the column must not throw at the door.
    for (const slug of [null, undefined, ""]) {
      const job = ascii(buildBadgeTspl(bitmap, slug));
      expect(job).not.toContain("QRCODE");
      expect(job).toContain("PRINT 1,1");
    }
  });

  it("never leaks the pretix secret", () => {
    expect(ascii(buildBadgeTspl(bitmap, "ABC12345"))).not.toMatch(/secret/i);
  });

  it("refuses a bitmap of the wrong size", () => {
    expect(() => buildBadgeTspl(new Uint8Array(10), "ABC12345")).toThrow(/bitmap must be/);
  });

  it("keeps the binary bitmap intact", () => {
    // Bytes, not a string: a UTF-8 round trip would corrupt every byte above
    // 0x7f and print noise.
    const px = blank();
    px[0] = true;
    const job = buildBadgeTspl(packBitmap(px), null);
    expect(job).toBeInstanceOf(Uint8Array);
    expect(job.includes(0xff)).toBe(true);
  });
});
