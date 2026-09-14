import { describe, it, expect, vi } from "vitest";

vi.mock("framer-motion", async () => {
  const { createElement } = await import("react");
  return {
    motion: {
      div: (props: { children?: unknown; className?: string }) =>
        createElement("div", { className: props.className }, props.children as never),
    },
  };
});

vi.mock("../qr-code-display", async () => {
  const { createElement } = await import("react");
  return {
    QrCodeDisplay: (props: { value: string }) =>
      createElement("div", { "data-testid": "qr" }, props.value),
  };
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AttendeeStateView } from "../attendee-state-view";

const base = {
  orderCode: "3XKQ7",
  status: "paid",
  approvalStatus: "not_required",
  eventMapping: { titleEn: "Strawberry Summit" },
} as const;

const render = (props: Parameters<typeof AttendeeStateView>[0]) =>
  renderToStaticMarkup(createElement(AttendeeStateView, props));

/**
 * The ticket named the event and the order code and then stopped — no date, no
 * time — on the screen people reopen the day before and at the door.
 */
describe("the ticket says when the event is", () => {
  it("shows the event's date range", () => {
    const html = render({
      order: {
        ...base,
        schedule: { from: "2026-08-28T09:30:00.000Z", to: "2026-08-30T18:00:00.000Z" },
      },
    });
    expect(html).toContain("When");
    expect(html).toContain("28—30 Aug 2026");
  });

  it("offers to put it in a calendar", () => {
    const html = render({
      locale: "en",
      eventSlug: "summit",
      order: {
        ...base,
        schedule: { from: "2026-08-28T09:30:00.000Z", to: null },
      },
    });
    expect(html).toContain("/en/events/summit/calendar.ics");
    expect(html).toContain("Google Calendar");
  });

  it("shows nothing rather than inventing a date when the event has no schedule", () => {
    const html = render({ order: base });
    expect(html).not.toContain(">When<");
    expect(html).not.toContain("calendar.ics");
  });

  it("drops the date block for a registration that is over", () => {
    const html = render({
      eventSlug: "summit",
      order: {
        ...base,
        status: "canceled",
        schedule: { from: "2026-08-28T09:30:00.000Z", to: null },
      },
    });
    expect(html).toContain("Registration canceled");
    expect(html).not.toContain("calendar.ics");
  });
});
