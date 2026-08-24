import { describe, it, expect } from "vitest";

import {
  JOB_TITLE_MAX,
  JOB_TITLE_OTHER,
  JOB_TITLE_PRESETS,
  normalizeJobTitle,
  resolveJobTitleSelection,
} from "@/lib/registration/job-title";

describe("job title presets", () => {
  it("offers the six options the organiser asked for", () => {
    expect(JOB_TITLE_PRESETS).toEqual(["CEO", "CTO", "CFO", "Sales Manager", "General Manager"]);
  });

  // The cap exists to keep every title — chosen or typed — the same size. A
  // preset longer than the cap would be rejected by the very rule meant to
  // protect it, which is how "Sales Manager" (13) broke a 9-character limit.
  it("every preset fits inside the free-text cap", () => {
    for (const preset of JOB_TITLE_PRESETS) {
      expect(preset.length).toBeLessThanOrEqual(JOB_TITLE_MAX);
    }
  });
});

describe("normalizeJobTitle", () => {
  it("trims", () => {
    expect(normalizeJobTitle("  CEO  ")).toBe("CEO");
  });

  it("treats blank and whitespace as absent", () => {
    expect(normalizeJobTitle("")).toBeNull();
    expect(normalizeJobTitle("   ")).toBeNull();
    expect(normalizeJobTitle(null)).toBeNull();
    expect(normalizeJobTitle(undefined)).toBeNull();
  });
});

describe("resolveJobTitleSelection", () => {
  it("passes a preset straight through", () => {
    expect(resolveJobTitleSelection("CEO", "")).toEqual({ ok: true, value: "CEO" });
  });

  it("no selection means no title — the common path", () => {
    // 526 of 1,154 existing registrations are company attendees with no title.
    // Leaving the dropdown alone must stay valid forever.
    expect(resolveJobTitleSelection("", "")).toEqual({ ok: true, value: null });
  });

  it("Other stores the typed text, never the sentinel", () => {
    // The bug this guards: submitting the literal "Other" would print "Other"
    // on the badge and publish it as the person's job title.
    expect(resolveJobTitleSelection(JOB_TITLE_OTHER, " Head of Ops ")).toEqual({
      ok: true,
      value: "Head of Ops",
    });
  });

  it("rejects Other with the text left blank", () => {
    const r = resolveJobTitleSelection(JOB_TITLE_OTHER, "   ");
    expect(r.ok).toBe(false);
  });

  it("rejects free text over the cap", () => {
    const r = resolveJobTitleSelection(JOB_TITLE_OTHER, "x".repeat(JOB_TITLE_MAX + 1));
    expect(r.ok).toBe(false);
  });

  it("accepts free text exactly at the cap", () => {
    const value = "x".repeat(JOB_TITLE_MAX);
    expect(resolveJobTitleSelection(JOB_TITLE_OTHER, value)).toEqual({ ok: true, value });
  });

  it("rejects a selection that is not on the list", () => {
    // Guards a tampered <select>: only the presets and the sentinel are values.
    const r = resolveJobTitleSelection("Supreme Leader", "");
    expect(r.ok).toBe(false);
  });
});
