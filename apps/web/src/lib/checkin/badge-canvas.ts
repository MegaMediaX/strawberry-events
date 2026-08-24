"use client";

import type { BadgeData } from "@/components/badges/badge-template";
import { sanitizeZplText } from "./badge-zpl";
import { packBitmap } from "./badge-tspl";
import {
  LABEL_W, LABEL_H, BAND_Y, BAND_H,
  TEXT_LEFT, TEXT_WIDTH, NAME_Y, NAME_SIZE, NAME_LINE_H,
  COMPANY_Y, COMPANY_SIZE, TAG_SIZE,
  wrapText, centreX,
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
  const tag = sanitizeZplText(badge.tag).toUpperCase();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, BAND_Y, LABEL_W, BAND_H);
  ctx.font = `bold ${TAG_SIZE}px ${FONT_STACK}`;
  ctx.fillStyle = "#fff";
  ctx.fillText(tag, centreX(ctx.measureText(tag).width), BAND_Y + (BAND_H - TAG_SIZE) / 2);

  // Name, wrapped inside the column that stops short of the QR's quiet zone.
  ctx.fillStyle = "#000";
  ctx.font = `bold ${NAME_SIZE}px ${FONT_STACK}`;
  const measure = (s: string) => ctx.measureText(s).width;
  const { lines } = wrapText(sanitizeZplText(badge.fullName), TEXT_WIDTH, measure);
  lines.forEach((line, i) => ctx.fillText(line, TEXT_LEFT, NAME_Y + i * NAME_LINE_H));

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

  const { data } = ctx.getImageData(0, 0, LABEL_W, LABEL_H);
  const black = new Array<boolean>(LABEL_W * LABEL_H);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    // Luminance, so anti-aliased edges resolve to one side or the other.
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    black[p] = lum < INK_THRESHOLD;
  }
  return packBitmap(black);
}
