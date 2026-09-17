import { describe, it, expect } from "vitest";
import { imageDimensions, detectImageType, validateCoverBytes } from "../cover-image";

/**
 * The cover's own size, read from its header.
 *
 * Asserted against files a real encoder produced, not hand-written bytes,
 * because the interesting part is the shapes an encoder actually emits: the
 * JPEG below carries a 456-byte ICC profile BEFORE its frame marker, and both
 * WebPs arrive as VP8X containers rather than the bare VP8 chunk the format's
 * name suggests. A parser written against the spec alone passes on neither.
 *
 * The two bare-chunk WebP cases at the end ARE hand-built: Chromium will not
 * emit them, and `cwebp` will, so they are the shapes this has to read without
 * a fixture to prove it.
 */
const b64 = (s: string) => Uint8Array.from(Buffer.from(s.replace(/\s+/g, ""), "base64"));

/** Chromium canvas, toBlob, solid fill. */
const FIXTURES = {
  /** PNG, 3x7 — IHDR is at a fixed offset, so size does not matter here. */
  png: b64(`
    iVBORw0KGgoAAAANSUhEUgAAAAMAAAAHCAYAAADNufepAAAAIklEQVR4AaTHsQkAAAwCweBK7r9BdtJKsPfhi8OTyrhq
    hgEAAP//cwBmJAAAAAZJREFUAwAt8QaiPr5gKAAAAABJRU5ErkJggg==
  `),
  /** JPEG, 37x91 — a tall one, so a width/height swap cannot pass. */
  jpeg: b64(`
    /9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEA
    AAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAA
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRi
    WFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAA
    ADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABi
    mQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKn
    AAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMA
    LgAgADIAMAAxADb/2wBDABsSFBcUERsXFhceHBsgKEIrKCUlKFE6PTBCYFVlZF9VXVtqeJmBanGQc1tdhbWGkJ6jq62r
    Z4C8ybqmx5moq6T/2wBDARweHigjKE4rK06kbl1upKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSk
    pKSkpKSkpKSkpKT/wAARCABbACUDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAA
    AAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAMF/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmAQa
    wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/2Q==
  `),
  /** WebP lossy, 800x600, wrapped in VP8X by Chromium. */
  webpLossy: b64(`
    UklGRsoFAABXRUJQVlA4WAoAAAAgAAAAHwMAVwIASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEA
    AAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAA
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRi
    WFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAA
    ADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABi
    mQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKn
    AAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMA
    LgAgADIAMAAxADZWUDgg3AMAAPBqAJ0BKiADWAI/EYjAWiwopqQgCAGAIglpbuF3YRtACewEeCUKlG77MPEmx0INBavw
    ShUo3fZh4k2OfNubXi5OQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtlHooFku14uTkPfbJyHvtk5
    D32ych8CUUL3Ie+2TkPfbJyHvtk5D32ych77ZjLT2ych77ZOQ99snIe+2TkPfbJyHwH6Xa8XJyHvtk5D32ych77ZOQ99
    snI/55OQ99snIe+2TkPfbJyHvtk5D32zGWntk5D32ych77ZOQ99snIe+2TkPgP0u14uTkPfbJyHvtk5D32ych77ZOR/z
    ych77ZOQ99snIe+2TkPfbJyHvtmMtPbJyHvtk5D32ych77ZOQ99snIfAfpdrxcnIe+2TkPfbJyHvtk5D32ycj/nk5D32
    ych77ZOQ99snIe+2TkPfbMZae2TkPfbJyHvtk5D32ych77ZOQ+A/S7Xi5OQ99snIe+2TkPfbJyHvtk5H/PJyHvtk5D32
    ych77ZOQ99snIe+2Yy09snIe+2TkPfbJyHvtk5D32ych8B+l2vFych77ZOQ99snIe+2TkPfbJyP+eTkPfbJyHvtk5D32
    ych77ZOQ99sxlp7ZOQ99snIe+2TkPfbJyHvtk5D4D9LteLk5D32ych77ZOQ99snIe+2Tkf88nIe+2TkPfbJyHvtk5D32
    ych77ZjLT2ych77ZOQ99snIe+2TkPfbJyHwH6Xa8XJyHvtk5D32ych77ZOQ99snI/55OQ99snIe+2TkPfbJyHvtk5D32
    zGWntk5D32ych77ZOQ99snIe+2TkPgP0u14uTkPfbJyHvtk5D32ych77ZOR/zych77ZOQ99snIe+2TkPfbJyHvtmMtPb
    JyHvtk5D32ych77ZOQ99snIfAfpdrxcnIe+2TkPfbJyHvtk5D32ycj/nk5D32ych77ZOQ99snIe+2TkPfbMZae2TkPfb
    JyHvtk5D32ych77ZOQ+A/S7Xi5OQ99snIe+2TkPfbJyHvtk5H/PJyHvtk5D32ych77ZOQ99snIe+2Yy09snIe+2TkPfb
    JyHvtk5D32ych8B+l2vFych77ZOQ99snIe+2TkPfbJyP+eTkPfbJyHvtk5D32ych77ZOQ99YAAD+/2HD/pLpchv//Dn2
    x+9iqv7xGpoDOgM6AzoDOgM6AzoDOgM6AzoDOgM6AzoDOgM6AzoDOgM6AzoDOgM6AzoDOetBLYEAAAAAAHdXoUAAAAAA
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
  `),
  /** WebP lossless, 640x480, also VP8X. */
  webpLossless: b64(`
    UklGRgACAABXRUJQVlA4WAoAAAAgAAAAfwIA3wEASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEA
    AAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAA
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRi
    WFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAA
    ADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABi
    mQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKn
    AAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMA
    LgAgADIAMAAxADZWUDhMEQAAAC9/wncAB9CZMnem/4GI6H8AAA==
  `),
};

describe("imageDimensions", () => {
  it.each([
    ["PNG", FIXTURES.png, 3, 7],
    ["JPEG behind a 456-byte ICC profile", FIXTURES.jpeg, 37, 91],
    ["WebP lossy in a VP8X container", FIXTURES.webpLossy, 800, 600],
    ["WebP lossless in a VP8X container", FIXTURES.webpLossless, 640, 480],
  ])("reads %s", (_label, bytes, width, height) => {
    expect(imageDimensions(bytes)).toEqual({ width, height });
  });

  /** Every fixture is also a file the upload path would actually accept. */
  it.each(Object.entries(FIXTURES))("%s is a cover this app accepts", (_name, bytes) => {
    expect(() => validateCoverBytes(bytes)).not.toThrow();
    expect(detectImageType(bytes)).not.toBeNull();
  });

  /**
   * cwebp emits these bare; Chromium never does. Built to the spec, with the
   * stored-minus-one encoding both variants use — the off-by-one is the whole
   * trap, so the dimensions chosen are ones where it would show.
   */
  it("reads a bare VP8L chunk", () => {
    const bytes = new Uint8Array(30);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    bytes.set([0x56, 0x50, 0x38, 0x4c], 12); // VP8L
    bytes[20] = 0x2f; // signature
    const bits = (1919 & 0x3fff) | ((1079 & 0x3fff) << 14); // 1920x1080, minus one
    bytes[21] = bits & 0xff;
    bytes[22] = (bits >>> 8) & 0xff;
    bytes[23] = (bits >>> 16) & 0xff;
    bytes[24] = (bits >>> 24) & 0xff;
    expect(imageDimensions(bytes)).toEqual({ width: 1920, height: 1080 });
  });

  it("reads a bare lossy VP8 chunk", () => {
    const bytes = new Uint8Array(30);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    bytes.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
    bytes.set([0x9d, 0x01, 0x2a], 23); // key-frame start code
    bytes[26] = 1920 & 0xff;
    bytes[27] = (1920 >> 8) & 0x3f;
    bytes[28] = 1080 & 0xff;
    bytes[29] = (1080 >> 8) & 0x3f;
    expect(imageDimensions(bytes)).toEqual({ width: 1920, height: 1080 });
  });

  it("refuses a lossy VP8 chunk whose key-frame start code is wrong", () => {
    const bytes = new Uint8Array(30);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    bytes.set([0x56, 0x50, 0x38, 0x20], 12);
    expect(imageDimensions(bytes)).toBeNull();
  });

  /**
   * Unknown is a real answer here. Every caller treats null as "no dimensions
   * to declare", which is what a link preview did before this existed — and
   * declaring a WRONG size to a scraper is worse than declaring none.
   */
  it.each([
    ["empty input", new Uint8Array(0)],
    ["a truncated PNG header", FIXTURES.png.slice(0, 20)],
    ["a JPEG cut off inside its ICC profile", FIXTURES.jpeg.slice(0, 120)],
    ["something that is not an image at all", new TextEncoder().encode("not an image")],
  ])("returns null for %s", (_label, bytes) => {
    expect(imageDimensions(bytes)).toBeNull();
  });

  /** A header walk over hostile bytes must terminate, not spin. */
  it("terminates on a JPEG whose segment length is nonsense", () => {
    const bytes = new Uint8Array(64);
    bytes.set([0xff, 0xd8], 0);
    bytes.set([0xff, 0xe0, 0x00, 0x00], 2); // length 0: would not advance
    expect(imageDimensions(bytes)).toBeNull();
  });
});
