/**
 * Job title vocabulary, shared by the public wizard, the staff walk-in form and
 * the Zod schema.
 *
 * It lives in one module because three surfaces have to agree on what a valid
 * title is. When the option list is duplicated per form, the forms drift, and
 * the drift only shows up as a badge that reads "Other".
 */

/**
 * The dropdown entry that reveals a free-text box. It is a UI sentinel, NEVER a
 * stored value: a row whose job title is literally "Other" would publish
 * "Other" on the contact profile and print it on the badge.
 */
export const JOB_TITLE_OTHER = "Other";

export const JOB_TITLE_PRESETS = [
  "CEO",
  "CTO",
  "CFO",
  "Sales Manager",
  "General Manager",
] as const;

export type JobTitlePreset = (typeof JOB_TITLE_PRESETS)[number];

/**
 * Longest a title may be, chosen or typed.
 *
 * 15 is exactly "General Manager", the longest preset. A cap shorter than the
 * presets is self-contradictory — the original 9 would have rejected "Sales
 * Manager", an option the form itself offers.
 *
 * This is a *character* cap for storage and display sanity. It is NOT what
 * keeps the printed badge inside its column: that is a pixel problem, solved by
 * fitName()/wrapText() in lib/checkin/badge-layout.ts. Do not raise this
 * expecting the badge to cope, and do not lower it expecting the badge to fit.
 */
export const JOB_TITLE_MAX = 15;

/** Trim to a stored value; blank and whitespace-only mean "no title given". */
export function normalizeJobTitle(raw: string | null | undefined): string | null {
  return raw?.trim() || null;
}

export type JobTitleResolution =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Turn a dropdown selection plus its free-text companion into the value to
 * store — the single place that decides what a job title *is*.
 *
 * Extracted from the forms deliberately. The rule "Other must be replaced by
 * real text before it is stored" is the one that fails silently: a form that
 * submits the sentinel produces a valid-looking row nobody notices until 500
 * badges have been printed.
 */
export function resolveJobTitleSelection(
  selection: string | null | undefined,
  otherText: string | null | undefined,
): JobTitleResolution {
  const choice = selection?.trim() ?? "";
  if (!choice) return { ok: true, value: null };

  if (choice === JOB_TITLE_OTHER) {
    const typed = normalizeJobTitle(otherText);
    if (!typed) return { ok: false, error: "Enter your job title." };
    if (typed.length > JOB_TITLE_MAX) {
      return { ok: false, error: `Job title must be ${JOB_TITLE_MAX} characters or fewer.` };
    }
    return { ok: true, value: typed };
  }

  if (!(JOB_TITLE_PRESETS as readonly string[]).includes(choice)) {
    return { ok: false, error: "Choose a job title from the list." };
  }

  return { ok: true, value: choice };
}
