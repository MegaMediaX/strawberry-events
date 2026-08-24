import { describe, it, expect } from "vitest";

import {
  JOB_TITLE_MAX,
  JOB_TITLE_OTHER,
  JOB_TITLE_PRESETS,
  normalizeJobTitle,
  resolveJobTitleSelection,
  resolveVisibleJobTitle,
  jobTitleForCompanyChange,
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

describe("resolveVisibleJobTitle — validation must track visibility", () => {
  // The walk-in desk shows the job title fields only once a company name has
  // been typed. Validating a HIDDEN field blocks the desk with an error about
  // a control that is not on screen:
  //
  //   type "Acme" -> pick "Other" -> leave the text blank
  //   -> clear the Company field (both title fields disappear)
  //   -> press Register walk-in
  //   -> "Enter your job title." and the operator cannot proceed,
  //      with no job title field anywhere to fill in.
  //
  // At a door with a queue, the only escape is re-typing a company name, which
  // nothing on screen suggests.
  it("does not validate a field that is not on screen", () => {
    expect(resolveVisibleJobTitle(false, JOB_TITLE_OTHER, "")).toEqual({ ok: true, value: null });
  });

  it("discards a stale selection left behind when the field was hidden", () => {
    // Same sequence but with text already typed: the title must not be stored
    // for someone who ended up with no company.
    expect(resolveVisibleJobTitle(false, JOB_TITLE_OTHER, "Head of Ops")).toEqual({
      ok: true,
      value: null,
    });
  });

  it("still validates normally while the field IS on screen", () => {
    expect(resolveVisibleJobTitle(true, JOB_TITLE_OTHER, "").ok).toBe(false);
    expect(resolveVisibleJobTitle(true, "CEO", "")).toEqual({ ok: true, value: "CEO" });
  });
});

describe("jobTitleForCompanyChange — a cleared company clears the title", () => {
  // The walk-in desk hides the title fields when the company is empty, but the
  // selection stayed in state behind them:
  //
  //   type "Acme Corp" -> pick "CTO"
  //   -> clear Company entirely (the dropdown disappears, "CTO" is still held)
  //   -> type a DIFFERENT company, "TechCorp"
  //   -> the dropdown reappears already reading "CTO"
  //
  // On screen that is indistinguishable from a deliberate choice, so an
  // operator correcting the company name silently reattaches the old title to
  // a different one.
  it("drops the held title when the company is cleared", () => {
    expect(jobTitleForCompanyChange({ company: "", jobTitle: "CTO", jobTitleOther: "" })).toEqual({ jobTitle: "", jobTitleOther: "" });
  });

  it("drops it for a whitespace-only company too", () => {
    expect(jobTitleForCompanyChange({ company: "   ", jobTitle: "CTO", jobTitleOther: "" })).toEqual({ jobTitle: "", jobTitleOther: "" });
  });

  it("keeps it while the company is merely being edited", () => {
    // "Acme" -> "Acme Corp" is one company being corrected, not a new one.
    //
    // THE INVARIANT IS "never hold a title while its field is invisible", NOT
    // "a title belongs to a company string". A review asked for the title to
    // be dropped on ANY company edit, including select-all-and-retype. That is
    // deliberately not done, on both forms:
    //
    //   - Nothing is concealed. The dropdown stays on screen through the whole
    //     edit, still reading "CTO". The round-2 bug was a field that HID and
    //     came back pre-filled, so the user had no cue it was still set;
    //     editing visible text has no such cue to lose.
    //   - Dropping it would cost real data. Fixing a typo in an employer name
    //     would silently wipe a title the person did choose, and most would
    //     not notice and re-pick.
    //
    // Clearing therefore triggers on empty — which is exactly when the field
    // disappears — and on nothing else.
    expect(jobTitleForCompanyChange({ company: "Acme Corp", jobTitle: "CTO", jobTitleOther: "" })).toEqual({
      jobTitle: "CTO",
      jobTitleOther: "",
    });
  });

  it("drops free text typed behind Other as well", () => {
    expect(jobTitleForCompanyChange({ company: "", jobTitle: JOB_TITLE_OTHER, jobTitleOther: "Head of Ops" })).toEqual({
      jobTitle: "",
      jobTitleOther: "",
    });
  });

  // The two below are the ones that matter. The first version of this helper
  // took the whole form-state object and returned it unchanged when the
  // company was non-empty. Spread after `company:` in the component, that
  // stale object put the PREVIOUS company back — so every keystroke in the
  // walk-in Company field was silently discarded and the field could never be
  // filled in at all.
  //
  // The original tests passed a bare { jobTitle, jobTitleOther } literal, so
  // "returns the argument" and "returns just these two keys" looked identical
  // and the bug was invisible.
  it("returns ONLY the two keys it owns", () => {
    expect(Object.keys(jobTitleForCompanyChange({ company: "Acme", jobTitle: "CTO", jobTitleOther: "" })).sort()).toEqual([
      "jobTitle",
      "jobTitleOther",
    ]);
  });

  it("survives the exact merge the walk-in form performs", () => {
    // Reproduces walk-in-form.tsx's onChange verbatim, which is the only place
    // the defect could show itself.
    let state = { firstName: "Jane", company: "", jobTitle: "", jobTitleOther: "" };
    for (const typed of ["A", "Ac", "Acm", "Acme"]) {
      state = {
        ...state,
        company: typed,
        ...jobTitleForCompanyChange({
          company: typed,
          jobTitle: state.jobTitle,
          jobTitleOther: state.jobTitleOther,
        }),
      };
    }
    expect(state.company).toBe("Acme");
    expect(state.firstName).toBe("Jane");
  });
});
