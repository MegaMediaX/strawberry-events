import { describe, it, expect } from "vitest";
import {
  detectImageType,
  validateCoverBytes,
  isValidCoverFilename,
  resolveCoverPath,
  coverImageUrl,
  CoverImageError,
  MAX_COVER_BYTES,
} from "@/lib/events/cover-image";

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = () =>
  new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("detectImageType — sniffs magic bytes, not the declared type", () => {
  it("recognizes JPEG / PNG / WebP", () => {
    expect(detectImageType(jpeg())).toBe("jpg");
    expect(detectImageType(png())).toBe("png");
    expect(detectImageType(webp())).toBe("webp");
  });
  it("rejects non-image content (e.g. an HTML/script payload)", () => {
    expect(detectImageType(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });
});

describe("validateCoverBytes", () => {
  it("returns the sniffed extension for a valid image", () => {
    expect(validateCoverBytes(png())).toBe("png");
  });
  it("rejects empty files", () => {
    expect(() => validateCoverBytes(new Uint8Array([]))).toThrow(CoverImageError);
  });
  it("rejects oversize files", () => {
    const big = new Uint8Array(MAX_COVER_BYTES + 1);
    big.set(jpeg(), 0);
    expect(() => validateCoverBytes(big)).toThrow(/5 MB/);
  });
  it("rejects unsupported content even if large enough", () => {
    expect(() => validateCoverBytes(new Uint8Array([1, 2, 3, 4, 5, 6]))).toThrow(
      /Unsupported/,
    );
  });
});

describe("filename safety — traversal cannot escape the uploads root", () => {
  it("accepts only well-formed generated names", () => {
    expect(isValidCoverFilename("abc123-d4e5.webp")).toBe(true);
    expect(isValidCoverFilename("evt-uuid.jpg")).toBe(true);
  });
  it("rejects path traversal and stray separators", () => {
    for (const bad of [
      "../secret.png",
      "..\\secret.png",
      "a/b.png",
      "a\\b.png",
      "evt.gif",
      "evt.php",
      "evt",
      ".env",
      "",
    ]) {
      expect(isValidCoverFilename(bad)).toBe(false);
      expect(resolveCoverPath(bad)).toBeNull();
    }
  });
  it("resolves a valid name to a path inside the root", () => {
    const p = resolveCoverPath("evt-uuid.png");
    expect(p).toBeTruthy();
    expect(p).toMatch(/event-covers/);
  });
});

describe("coverImageUrl", () => {
  it("maps a stored filename to the public media route", () => {
    expect(coverImageUrl("evt-uuid.webp")).toBe("/media/event-cover/evt-uuid.webp");
  });
});
