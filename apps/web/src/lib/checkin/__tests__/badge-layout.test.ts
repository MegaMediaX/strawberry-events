import { describe, it, expect } from "vitest";
import {
  LABEL_W, QR_X, QR_SIZE, QR_QUIET, QR_MAG, TEXT_LEFT, TEXT_RIGHT, TEXT_WIDTH,
  wrapText, centreX,
} from "@/lib/checkin/badge-layout";

// A stand-in for canvas metrics: every glyph is 20 dots wide. Enough to pin the
// wrapping rules without a real 2D context.
const measure = (s: string) => s.length * 20;

describe("the QR always keeps its quiet zone", () => {
  it("leaves at least 4 modules on both sides", () => {
    // 4 modules is the spec floor. Below it a decoder cannot find the symbol at
    // all — it does not read a marginal code, it sees none.
    const MIN = 4 * QR_MAG;
    expect(LABEL_W - (QR_X + QR_SIZE)).toBeGreaterThanOrEqual(MIN);
    expect(QR_X - TEXT_RIGHT).toBeGreaterThanOrEqual(MIN);
  });

  it("stops the text column short of the QR", () => {
    // The Xprinter bug: an unwrapped name reached x≈300 where the QR begins.
    // The badge looked perfect and would not scan.
    expect(TEXT_RIGHT).toBe(QR_X - QR_QUIET);
    expect(TEXT_WIDTH).toBe(TEXT_RIGHT - TEXT_LEFT);
    expect(TEXT_RIGHT).toBeLessThan(QR_X);
  });
});

describe("wrapText", () => {
  it("keeps a short name on one line", () => {
    expect(wrapText("Ana Haddad", 249, measure).lines).toEqual(["Ana Haddad"]);
  });

  it("wraps a name that would otherwise reach the QR", () => {
    // "Marven Mouaalem" at 20/char is 300 dots — wider than the 249 column, and
    // exactly the case that killed the quiet zone on a real label.
    const { lines, overflows } = wrapText("Marven Mouaalem", 249, measure);
    expect(lines).toEqual(["Marven", "Mouaalem"]);
    expect(overflows).toBe(false);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(249);
  });

  it("never returns more lines than allowed", () => {
    const { lines, overflows } = wrapText("Abdul Rahman Constantine Fitzgerald", 249, measure);
    expect(lines.length).toBeLessThanOrEqual(2);
    // Reported, so the caller can shrink rather than silently losing a name.
    expect(overflows).toBe(true);
  });

  it("reports overflow for a single word too wide to break", () => {
    // Not chopped mid-word: a name cut in half at a door is worse than one
    // slightly too wide, and the caller can react.
    const { lines, overflows } = wrapText("Konstantinopoulos", 249, measure);
    expect(lines).toEqual(["Konstantinopoulos"]);
    expect(overflows).toBe(true);
  });

  it("handles empty and whitespace-only input", () => {
    expect(wrapText("", 249, measure).lines).toEqual([]);
    expect(wrapText("   ", 249, measure).lines).toEqual([]);
  });

  it("collapses runs of whitespace", () => {
    expect(wrapText("Ana    Haddad", 249, measure).lines).toEqual(["Ana Haddad"]);
  });
});

describe("centreX", () => {
  it("centres across the label", () => {
    expect(centreX(224)).toBe((LABEL_W - 224) / 2);
    expect(centreX(0)).toBe(LABEL_W / 2);
  });

  it("never goes negative for text wider than the label", () => {
    // TSPL would happily accept a negative x and clip the tag off the edge.
    expect(centreX(LABEL_W + 100)).toBe(0);
  });
});
