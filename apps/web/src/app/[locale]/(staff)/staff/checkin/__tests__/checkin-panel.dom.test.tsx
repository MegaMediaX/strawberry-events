// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The door panel, driven through the DOM.
 *
 * This suite exists because of where the bugs actually were. Three adversarial
 * passes over this screen found the same class of defect three times — an
 * action reports something, and one of the handlers that consumes it does the
 * wrong thing with it — and every instance lived in an event handler no
 * node-environment test could reach. The actions were covered; the code
 * reading them was not.
 *
 * So these tests press buttons. They assert what an operator would SEE, not
 * what a function returned.
 *
 * Every test here was checked by reintroducing the bug it describes and
 * confirming it fails — a regression test that passes against the broken code
 * is worse than none, and the first draft of the cross-lane test was exactly
 * that: it rendered once instead of switching lanes, so it passed either way.
 *
 * Known boundary: the save effect's key guard in the panel is NOT independently
 * covered. Removing it leaves a transient write of the old lane's entries under
 * the new lane's key, corrected by the next render inside the same flush — so
 * no assertion can observe it. The guard stays as defence for the day the
 * restore becomes conditional or async again, which is how the leak happened
 * the first time.
 */

const actions = vi.hoisted(() => ({
  searchAction: vi.fn(),
  checkInAction: vi.fn(),
  scanAction: vi.fn(),
  reprintAction: vi.fn(),
  correctAttendeeAction: vi.fn(),
  attendeeForEditAction: vi.fn(),
  walkInAndCheckInAction: vi.fn(),
}));

vi.mock("../actions", () => actions);
// The scanner reaches for a camera, the printer pill for QZ Tray, and the
// counter for a server action. None of them is what this suite is about.
vi.mock("../qr-scanner", () => ({ QrScanner: () => null }));
vi.mock("../printer-status", () => ({ PrinterStatus: () => null }));
vi.mock("../printer-settings", () => ({ PrinterSettings: () => null }));
vi.mock("../door-counters", () => ({ DoorCounters: () => null, bumpDoorCount: vi.fn() }));
vi.mock("@/components/badges/badge-print-dialog", () => ({ BadgePrintDialog: () => null }));
vi.mock("@/lib/checkin/print-badge", () => ({ printBadge: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/checkin/print-client", () => ({
  // Mirrors the real signature — (message, kind) — so a test cannot construct
  // one the application could not.
  PrintError: class PrintError extends Error {
    constructor(
      message: string,
      readonly kind: string = "transient",
    ) {
      super(message);
    }
  },
  isPersistentPrintFailure: () => false,
  probePrinter: vi.fn().mockResolvedValue({ ok: true, printer: "PC42d" }),
}));

import { CheckinPanel } from "../checkin-panel";
import { recentKey } from "@/lib/checkin/recent-store";

const EVENT = "evt_1";
const LIST = 7;

const badge = {
  orderCode: "3XKQ7",
  tag: "visitor" as const,
  secret: null,
  fullName: "Marven Mouaalem",
  company: null,
  jobTitle: null,
  roleLabel: null,
  badgeSlug: "marven-x7",
};

const attendeeRow = {
  orderCode: "3XKQ7",
  email: "marven@strawberry.agency",
  name: "Marven Mouaalem",
  phone: "70123456",
  eligible: true,
};

/** Every action reports an ended session the same way. */
const SESSION_ENDED = {
  ok: false as const,
  authExpired: true as const,
  reason: "Your session has ended. Sign in again to keep checking people in.",
};

function panel(listId = LIST) {
  const ui = (id: number) => (
    <CheckinPanel eventId={EVENT} listId={id} tickets={[{ id: 1, title: "General" }]} locale="en" />
  );
  const view = render(ui(listId));
  /** What the day switcher does: a client nav that keeps the panel mounted. */
  return { ...view, switchLane: (id: number) => view.rerender(ui(id)) };
}

/** Type a name and wait for the debounced search to answer. */
async function search(user: ReturnType<typeof userEvent.setup>, query = "marven") {
  await user.type(screen.getByLabelText("Search attendees"), query);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  actions.searchAction.mockResolvedValue({ ok: true, rows: [] });
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("an ended session is never reported as a refusal", () => {
  /**
   * The bug, three times over: a valid attendee shown STOP in red, with
   * nothing on screen leading back to a sign-in, once per person for the rest
   * of the queue. Each path below is one that got it wrong at some point.
   */
  async function expectSessionEndedBanner() {
    expect(await screen.findByText("SESSION ENDED")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Sign in again" });
    expect(link.getAttribute("href")).toBe("/en/login");
    // Never the refusal's words — that is what sent operators hunting for a
    // problem with a ticket that was fine.
    expect(screen.queryByText("STOP")).toBeNull();
  }

  it("when a search meets one", async () => {
    const user = userEvent.setup();
    actions.searchAction.mockResolvedValue(SESSION_ENDED);
    panel();
    await search(user);
    await expectSessionEndedBanner();
  });

  it("when checking someone in from a search row", async () => {
    const user = userEvent.setup();
    actions.searchAction.mockResolvedValue({ ok: true, rows: [attendeeRow] });
    actions.checkInAction.mockResolvedValue(SESSION_ENDED);
    panel();
    await search(user);
    await user.click(await screen.findByRole("button", { name: /check in & print/i }));
    await expectSessionEndedBanner();
  });

  it("when registering a walk-in", async () => {
    const user = userEvent.setup();
    actions.walkInAndCheckInAction.mockResolvedValue(SESSION_ENDED);
    panel();
    await user.click(screen.getByRole("button", { name: /register a walk-in/i }));
    await user.type(screen.getByLabelText("First name"), "Elias");
    await user.type(screen.getByLabelText("Last name"), "Daou");
    await user.click(screen.getByRole("button", { name: /register, check in & print/i }));
    await expectSessionEndedBanner();
  });

  it("when opening Fix", async () => {
    const user = userEvent.setup();
    seedRecent();
    actions.attendeeForEditAction.mockResolvedValue({
      ok: false,
      authExpired: true,
      reason: SESSION_ENDED.reason,
    });
    panel();
    await user.click(await screen.findByRole("button", { name: "Fix" }));
    await expectSessionEndedBanner();
  });

  it("when SAVING a correction, not only when opening one", async () => {
    // openEdit handled the flag and the save three lines away did not, so the
    // dialog opened correctly and then refused the attendee on save.
    const user = userEvent.setup();
    seedRecent();
    actions.attendeeForEditAction.mockResolvedValue({
      ok: true,
      attendee: {
        orderCode: "3XKQ7",
        fullName: "Marven Mouaalem",
        email: "marven@strawberry.agency",
        phone: "70123456",
        phoneCC: "+961",
        company: null,
        jobTitle: null,
        roleTag: "visitor",
        roleLabel: null,
      },
    });
    actions.correctAttendeeAction.mockResolvedValue(SESSION_ENDED);
    panel();
    await user.click(await screen.findByRole("button", { name: "Fix" }));
    await user.click(await screen.findByRole("button", { name: /save & reprint/i }));
    await expectSessionEndedBanner();
  });

  it("when the reprint AFTER a saved correction meets one", async () => {
    // This one rendered as a yellow "details saved, but no badge printed",
    // which sends the operator to inspect a printer that is fine.
    const user = userEvent.setup();
    seedRecent();
    actions.attendeeForEditAction.mockResolvedValue({
      ok: true,
      attendee: {
        orderCode: "3XKQ7",
        fullName: "Marven Mouaalem",
        email: "marven@strawberry.agency",
        phone: "70123456",
        phoneCC: "+961",
        company: null,
        jobTitle: null,
        roleTag: "visitor",
        roleLabel: null,
      },
    });
    actions.correctAttendeeAction.mockResolvedValue({ ok: true });
    actions.reprintAction.mockResolvedValue(SESSION_ENDED);
    panel();
    await user.click(await screen.findByRole("button", { name: "Fix" }));
    await user.click(await screen.findByRole("button", { name: /save & reprint/i }));
    await expectSessionEndedBanner();
    expect(screen.queryByText(/no badge printed/i)).toBeNull();
  });

  it("but an ordinary refusal still stops the door", async () => {
    const user = userEvent.setup();
    actions.searchAction.mockResolvedValue({ ok: true, rows: [attendeeRow] });
    actions.checkInAction.mockResolvedValue({ ok: false, reason: "Ticket not found" });
    panel();
    await search(user);
    await user.click(await screen.findByRole("button", { name: /check in & print/i }));
    expect(await screen.findByText("STOP")).toBeTruthy();
    expect(screen.queryByText("SESSION ENDED")).toBeNull();
  });
});

describe("the door never offers to register someone it could not look up", () => {
  /**
   * An empty list is what turns on "no one matches — register them". An
   * expired session and a failed query both empty the list, and offering the
   * walk-in form then duplicates a registration that already exists.
   */
  it("hides both walk-in paths when the session ended", async () => {
    const user = userEvent.setup();
    actions.searchAction.mockResolvedValue(SESSION_ENDED);
    panel();
    await search(user);
    await screen.findByText("SESSION ENDED");
    expect(screen.queryByText(/No one matches/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /register “marven” as a walk-in/i })).toBeNull();
    expect(screen.getByRole("button", { name: /register a walk-in/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("hides both when the query itself failed", async () => {
    const user = userEvent.setup();
    actions.searchAction.mockResolvedValue({ ok: false, failed: true });
    panel();
    await search(user);
    expect(await screen.findByText(/could not search just now/i)).toBeTruthy();
    expect(screen.queryByText(/No one matches/i)).toBeNull();
    expect(screen.getByRole("button", { name: /register a walk-in/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("offers one when the search genuinely found nobody", async () => {
    const user = userEvent.setup();
    actions.searchAction.mockResolvedValue({ ok: true, rows: [] });
    panel();
    await search(user);
    expect(await screen.findByText(/No one matches/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /register “marven” as a walk-in/i }),
    ).toBeTruthy();
  });

  it("recovers once a search answers again", async () => {
    // The banner is deliberately sticky, so nothing else cleared it: signing
    // in elsewhere left both walk-in paths disabled over working results.
    const user = userEvent.setup();
    actions.searchAction.mockResolvedValue(SESSION_ENDED);
    panel();
    await search(user);
    await screen.findByText("SESSION ENDED");

    actions.searchAction.mockResolvedValue({ ok: true, rows: [attendeeRow] });
    await user.type(screen.getByLabelText("Search attendees"), "n");
    expect(await screen.findByText("Marven Mouaalem")).toBeTruthy();
    expect(screen.queryByText("SESSION ENDED")).toBeNull();
  });
});

describe("the recent list belongs to one lane", () => {
  it("comes back after a reload, with its Fix and Reprint", async () => {
    seedRecent();
    panel();
    const list = await screen.findByRole("region", { name: "Recent" });
    expect(within(list).getByText("Marven Mouaalem")).toBeTruthy();
    expect(within(list).getByRole("button", { name: "Fix" })).toBeTruthy();
    expect(within(list).getByRole("button", { name: "Reprint" })).toBeTruthy();
  });

  it("does not carry one lane's attendees onto another", async () => {
    // The day switcher is a client navigation that keeps this panel MOUNTED,
    // so the lane changes under a live component. Restoring only when the new
    // lane had stored history left the previous lane's entries on screen —
    // with live Fix and Reprint — and the save effect then wrote them under
    // the new lane's key. Rendering once cannot catch this: the switch is the
    // bug.
    seedRecent(LIST);
    const { switchLane } = panel();
    expect(await screen.findByText("Marven Mouaalem")).toBeTruthy();

    switchLane(LIST + 1);

    expect(await screen.findByText(/scan a badge or ticket/i)).toBeTruthy();
    expect(screen.queryByText("Marven Mouaalem")).toBeNull();
    // And nothing was written under the new lane's key on the way past.
    expect(window.sessionStorage.getItem(recentKey(EVENT, LIST + 1))).not.toContain(
      "Marven",
    );
  });

  it("brings a lane's own history back when it is switched to", async () => {
    seedRecent(LIST + 1);
    const { switchLane } = panel();
    expect(await screen.findByText(/scan a badge or ticket/i)).toBeTruthy();

    switchLane(LIST + 1);
    expect(await screen.findByText("Marven Mouaalem")).toBeTruthy();
  });

  it("says a check-in cannot be undone, where that is discovered", async () => {
    seedRecent();
    panel();
    expect(await screen.findByText(/cannot be undone here/i)).toBeTruthy();
  });
});

describe("a check-in that works", () => {
  it("admits, prints, and remembers the person", async () => {
    const user = userEvent.setup();
    actions.searchAction.mockResolvedValue({ ok: true, rows: [attendeeRow] });
    actions.checkInAction.mockResolvedValue({ ok: true, badge });
    panel();
    await search(user);
    await user.click(await screen.findByRole("button", { name: /check in & print/i }));

    expect(await screen.findByText("ENTER")).toBeTruthy();
    expect(screen.getByText("Badge printed")).toBeTruthy();
    // And the search box is clear for the next person.
    expect(screen.getByLabelText("Search attendees")).toHaveProperty("value", "");
  });

  it("warns — and does not claim a badge — when the printer refuses", async () => {
    const user = userEvent.setup();
    const { printBadge } = await import("@/lib/checkin/print-badge");
    const { PrintError } = await import("@/lib/checkin/print-client");
    vi.mocked(printBadge).mockRejectedValueOnce(new PrintError("Printer offline", "printer"));
    actions.searchAction.mockResolvedValue({ ok: true, rows: [attendeeRow] });
    actions.checkInAction.mockResolvedValue({ ok: true, badge });
    panel();
    await search(user);
    await user.click(await screen.findByRole("button", { name: /check in & print/i }));

    // A green "checked in" over a badge that never emerged is the worst
    // outcome here: the attendee walks away believing they are done.
    expect(await screen.findByText("Not printed")).toBeTruthy();
    expect(screen.getByText(/badge NOT printed/i)).toBeTruthy();
    expect(screen.queryByText("ENTER")).toBeNull();
  });
});

/** A lane's stored history, as the panel would have written it. */
function seedRecent(listId = LIST) {
  window.sessionStorage.setItem(
    recentKey(EVENT, listId),
    JSON.stringify([
      { id: 1, orderCode: "3XKQ7", name: "Marven Mouaalem", kind: "in", at: "09:12" },
    ]),
  );
}
