import { badgeProfileUrl } from "./badge-slug";
import { LABEL_W, LABEL_H, QR_X, QR_Y, QR_MAG } from "./badge-layout";

/**
 * TSPL2 badge for the Xprinter XP-365B.
 *
 * That printer speaks TSPL2 and REJECTS ZPL outright — a ZPL label prints
 * nothing at all. The two languages are not interchangeable, so this is a
 * second emitter rather than a translation layer.
 *
 * The text is sent as a rendered IMAGE, not as printer text. TSPL's built-in
 * fonts are fixed-cell bitmap faces that cannot match ZPL's smooth `^A0N`, and
 * TSPL has no centring and no wrapping — all three would have to be computed by
 * hand, and every one of them is a way to produce a badge that looks right and
 * does not scan. Rendering once and shipping the picture makes both printers
 * agree by construction.
 *
 * The QR stays NATIVE. The printer renders it at full device resolution; a
 * bitmapped QR is resampled and risks exactly the ragged module edges that made
 * an earlier badge unscannable.
 */

/** One dot row is this many bytes. TSPL's BITMAP takes a byte width, not dots. */
export const ROW_BYTES = LABEL_W / 8;

/**
 * Pack a row-major array of "is this dot black" into TSPL bitmap bytes.
 *
 * TSPL BITMAP mode 0 treats a **0 bit as black** — the inverse of nearly every
 * image format, including the PBM this was first prototyped from. Sending the
 * un-inverted bits prints a photographic negative, which is unmistakable once
 * seen and baffling until then.
 */
export function packBitmap(black: ArrayLike<boolean>, width = LABEL_W, height = LABEL_H): Uint8Array {
  if (width % 8 !== 0) throw new Error(`width must be a multiple of 8, got ${width}`);
  if (black.length !== width * height) {
    throw new Error(`expected ${width * height} pixels, got ${black.length}`);
  }
  const rowBytes = width / 8;
  const out = new Uint8Array(rowBytes * height).fill(0xff); // start all white
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!black[y * width + x]) continue;
      const i = y * rowBytes + (x >> 3);
      out[i] &= ~(0x80 >> (x & 7)); // clear the bit → black
    }
  }
  return out;
}

/** Latin-1 bytes for a TSPL command string. */
function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * Build the complete TSPL job: the rendered badge as a bitmap, plus a native QR.
 *
 * `bitmap` must already be packed by `packBitmap`. Returns bytes rather than a
 * string because the bitmap is binary and would not survive a UTF-8 round trip.
 */
export function buildBadgeTspl(bitmap: Uint8Array, badgeSlug?: string | null): Uint8Array {
  const expected = ROW_BYTES * LABEL_H;
  if (bitmap.length !== expected) {
    throw new Error(`bitmap must be ${expected} bytes, got ${bitmap.length}`);
  }

  const parts: Uint8Array[] = [
    ascii("SIZE 60 mm,40 mm\r\n"),
    ascii("GAP 2 mm,0\r\n"),
    ascii("DIRECTION 1\r\n"),
    ascii("CLS\r\n"),
    ascii(`BITMAP 0,0,${ROW_BYTES},${LABEL_H},0,`),
    bitmap,
    ascii("\r\n"),
  ];

  // No slug, no QR — a test badge, or a row predating the column, must still
  // produce a printable label rather than throwing at the door.
  if (badgeSlug) {
    try {
      // Error correction Q, mode A (auto), matching the ZPL badge exactly.
      parts.push(ascii(`QRCODE ${QR_X},${QR_Y},Q,${QR_MAG},A,0,"${badgeProfileUrl(badgeSlug)}"\r\n`));
    } catch (err) {
      // badgeProfileUrl throws when the configured host outgrows the reserved
      // box. A badge with no QR still opens the door; an exception does not.
      //
      // Logged, matching the ZPL path. This was a bare `catch {}`: the TSPL lane
      // could print badges with no QR all day and leave no trace anywhere, while
      // the same failure on a PC42d at least reached the console.
      console.error("[badge] QR omitted:", (err as Error).message);
    }
  }

  parts.push(ascii("PRINT 1,1\r\n"));
  return concat(parts);
}
