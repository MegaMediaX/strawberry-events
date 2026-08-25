"use client";

import type { BadgeData } from "@/components/badges/badge-template";
import { sanitizeZplText } from "./badge-zpl";
import { packBitmap } from "./badge-tspl";
import { badgeBandText } from "@/lib/badges/tags";
import {
  LABEL_W, LABEL_H, BAND_Y, BAND_H,
  TEXT_LEFT, TEXT_WIDTH, NAME_Y, NAME_SIZE, NAME_LINE_H, NAME_MAX_LINES,
  COMPANY_Y, COMPANY_SIZE, JOB_TITLE_Y, JOB_TITLE_SIZE, TAG_SIZE, bandFontSize,
  fitName, centreX,
} from "./badge-layout";

/**
 * Draw the badge to an offscreen canvas and return it packed for TSPL.
 *
 * Browser-only: it needs a real 2D context to measure text. Everything that can
 * be got wrong — wrapping, centring, bit packing — lives in tested modules; this
 * file only draws.
 *
 * The typeface is a Helvetica-class grotesque, matching ZPL's `^A0N` so badges
 * from a TSPL station sit beside PC42d badges without looking different.
 */
const FONT_STACK = 'Arial, Helvetica, "Liberation Sans", sans-serif';

/** Threshold above which a rendered pixel counts as black. */
const INK_THRESHOLD = 128;

export function renderBadgeBitmap(badge: BadgeData): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_W;
  canvas.height = LABEL_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  ctx.textBaseline = "top";

  // Role band: solid black, with the tag reversed out and centred. TSPL cannot
  // centre text itself, which is why this is drawn rather than commanded.
  const tag = sanitizeZplText(badgeBandText(badge.tag));
  // Same shrink rule as ZPL, deliberately by character count rather than by
  // measuring here — measuring would give a better fit and a DIFFERENT size
  // from the other printer for the same badge.
  const tagSize = bandFontSize(tag, TAG_SIZE);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, BAND_Y, LABEL_W, BAND_H);
  ctx.font = `bold ${tagSize}px ${FONT_STACK}`;
  ctx.fillStyle = "#fff";
  ctx.fillText(tag, centreX(ctx.measureText(tag).width), BAND_Y + (BAND_H - tagSize) / 2);

  // Name, kept inside the column that stops short of the QR's quiet zone.
  //
  // wrapText refuses to break a single over-long word — it reports `overflows`
  // instead, so the caller can shrink rather than chop a name in half. ACTING
  // on that is the whole point: drawing an unbounded line puts a surname like
  // "Kouyoumdjian" straight through the quiet zone and into the QR, producing a
  // badge that looks perfect, prints without error, and will not scan.
  ctx.fillStyle = "#000";
  const name = sanitizeZplText(badge.fullName);

  const { size, lines } = fitName(name, TEXT_WIDTH, (px, text) => {
    ctx.font = `bold ${px}px ${FONT_STACK}`;
    return ctx.measureText(text).width;
  });
  ctx.font = `bold ${size}px ${FONT_STACK}`;

  // Clip as well, so even a name that cannot be shrunk enough is cut off at the
  // column edge rather than reaching the QR. Belt and braces: the shrink loop
  // should make this unnecessary, and it is the guarantee that does not depend
  // on font metrics being what we expect.
  ctx.save();
  ctx.beginPath();
  ctx.rect(TEXT_LEFT, NAME_Y - 4, TEXT_WIDTH, NAME_LINE_H * NAME_MAX_LINES + 8);
  ctx.clip();
  const lineH = Math.round(size * (NAME_LINE_H / NAME_SIZE));
  lines.forEach((line, i) => ctx.fillText(line, TEXT_LEFT, NAME_Y + i * lineH));
  ctx.restore();

  if (badge.company) {
    ctx.font = `${COMPANY_SIZE}px ${FONT_STACK}`;
    // Clipped rather than wrapped: the company is secondary, and a second line
    // here would collide with the QR's row.
    ctx.save();
    ctx.beginPath();
    ctx.rect(TEXT_LEFT, COMPANY_Y, TEXT_WIDTH, COMPANY_SIZE + 6);
    ctx.clip();
    ctx.fillText(sanitizeZplText(badge.company), TEXT_LEFT, COMPANY_Y);
    ctx.restore();
  }

  // Job title, on its own line under the company. Clipped to the same column
  // for the same reason: the column stops a full quiet zone short of the QR, and
  // ink past its right edge kills the scan without changing how the badge looks.
  //
  // Trimmed before the check so a title of spaces draws nothing at all — a badge
  // with no title must be identical to the one the lanes were verified against.
  // Sanitised first, for the same reason as ZPL: a title with nothing printable
  // in it must not reserve a line, and must not vanish without a word either.
  const jobTitle = badge.jobTitle?.trim() ? sanitizeZplText(badge.jobTitle) : "";
  if (badge.jobTitle?.trim() && !jobTitle) {
    console.error("[badge] job title dropped — nothing printable:", {
      length: badge.jobTitle.trim().length,
    });
  }
  if (jobTitle) {
    ctx.font = `${JOB_TITLE_SIZE}px ${FONT_STACK}`;
    ctx.save();
    ctx.beginPath();
    ctx.rect(TEXT_LEFT, JOB_TITLE_Y, TEXT_WIDTH, JOB_TITLE_SIZE + 6);
    ctx.clip();
    ctx.fillText(jobTitle, TEXT_LEFT, JOB_TITLE_Y);
    ctx.restore();
  }

  const { data } = ctx.getImageData(0, 0, LABEL_W, LABEL_H);
  const black = new Array<boolean>(LABEL_W * LABEL_H);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    // Luminance, so anti-aliased edges resolve to one side or the other.
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    black[p] = lum < INK_THRESHOLD;
  }
  return packBitmap(black);
}
