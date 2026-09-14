import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AttendeeFields,
  EMPTY_WALK_IN_ATTENDEE,
  resolveWalkInAttendee,
  type WalkInAttendee,
} from "../attendee-fields";

const filled: WalkInAttendee = {
  ...EMPTY_WALK_IN_ATTENDEE,
  firstName: " Marven ",
  lastName: " Mouaalem ",
  email: " marven@strawberry.agency ",
  phone: " 70123456 ",
  company: " Strawberry ",
  jobTitle: "CEO",
};

const render = (value: WalkInAttendee) =>
  renderToStaticMarkup(<AttendeeFields value={value} onChange={() => {}} />);

/**
 * One definition of the attendee half of a walk-in, for the door and the desk.
 * They had drifted on how a job title and a badge role resolve, and the desk
 * form announced almost every field unlabelled.
 */
describe("every field is named", () => {
  it("associates each label with its own control", () => {
    const html = render(filled);
    // for="…-first" and id="…-first" must be the same generated id.
    for (const field of ["first", "last", "email", "phone", "company", "role"]) {
      const forMatch = html.match(new RegExp(`for="([^"]*-${field})"`));
      expect(forMatch, `no label for ${field}`).toBeTruthy();
      expect(html).toContain(`id="${forMatch![1]}"`);
    }
  });

  it("gives the bare country-code box a name of its own", () => {
    expect(render(filled)).toContain('aria-label="Country code"');
  });
});

describe("the job title only exists against an employer", () => {
  it("is hidden until a company is entered", () => {
    expect(render(EMPTY_WALK_IN_ATTENDEE)).not.toContain("Job title");
  });

  it("appears once there is one", () => {
    expect(render(filled)).toContain("Job title");
  });
});

describe("resolveWalkInAttendee", () => {
  it("trims what is stored", () => {
    const res = resolveWalkInAttendee(filled);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.firstName).toBe("Marven");
    expect(res.value.email).toBe("marven@strawberry.agency");
    expect(res.value.company).toBe("Strawberry");
    expect(res.value.jobTitle).toBe("CEO");
  });

  it("requires both halves of a name", () => {
    const res = resolveWalkInAttendee({ ...filled, lastName: "  " });
    expect(res).toEqual({ ok: false, error: "First and last name are required." });
  });

  it("never lets the job-title sentinel through", () => {
    const res = resolveWalkInAttendee({ ...filled, jobTitle: "Other", jobTitleOther: "" });
    expect(res.ok).toBe(false);
  });

  it("never lets the badge-role sentinel through", () => {
    const res = resolveWalkInAttendee({ ...filled, roleTag: "other", roleOther: "  " });
    expect(res.ok).toBe(false);
  });

  it("stores the typed role, not the sentinel", () => {
    const res = resolveWalkInAttendee({
      ...filled,
      roleTag: "other",
      roleOther: "Accelerator",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.roleLabel).toBe("Accelerator");
  });

  it("drops a role label for every role that is not Other", () => {
    // A value left in the box after switching back must never be stored.
    const res = resolveWalkInAttendee({ ...filled, roleTag: "visitor", roleOther: "Leftover" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.roleLabel).toBeNull();
  });

  it("ignores a title held behind a company that was cleared", () => {
    // The form clears it as the company empties; this is the second line of
    // defence, so a hidden control can never fail a submit.
    const res = resolveWalkInAttendee({ ...filled, company: "", jobTitle: "Other", jobTitleOther: "" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.jobTitle).toBeNull();
    expect(res.value.company).toBeNull();
  });
});
