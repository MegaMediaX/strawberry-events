// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Press, PressLink } from "../press";
import { Stamp } from "../stamp";
import { Ticket, TicketBody, TicketStub } from "../plate";

/**
 * The custom layer replaces primitives that used to come from a headless
 * library, so the properties that library was providing are now this file's
 * job to hold. These are those properties — not the paint.
 */
describe("Press", () => {
  it("is a real button, so the platform provides activation", () => {
    render(<Press>Buy</Press>);
    expect(screen.getByRole("button", { name: "Buy" }).tagName).toBe("BUTTON");
  });

  it("activates with the keyboard", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Press onClick={onClick}>Buy</Press>);
    screen.getByRole("button").focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    // Enter and Space both, because a div-with-onClick passes a click test and
    // fails exactly this one.
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("defaults to type=button, so it cannot submit a form by accident", () => {
    render(<Press>Next</Press>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("still allows an explicit submit", () => {
    render(<Press type="submit">Register</Press>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Press disabled onClick={onClick}>
        Buy
      </Press>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("PressLink", () => {
  it("is an anchor with an href, so it can be opened in a new tab", () => {
    render(<PressLink href="https://example.test">Channel</PressLink>);
    const el = screen.getByRole("link", { name: "Channel" });
    expect(el.tagName).toBe("A");
    expect(el.getAttribute("href")).toBe("https://example.test");
  });
});

describe("Stamp", () => {
  /**
   * The one property that matters: the state is READABLE, not merely coloured.
   * WCAG 1.4.1 — a ticket whose status is only a tint is a ticket with no
   * status for anyone who cannot see the tint.
   */
  it("carries its state as words", () => {
    render(<Stamp>Admit one</Stamp>);
    expect(screen.getByText("Admit one")).toBeTruthy();
  });

  it("keeps the words when an icon is present", () => {
    render(<Stamp icon={<svg data-testid="i" />}>Void</Stamp>);
    expect(screen.getByText("Void")).toBeTruthy();
  });
});

describe("Ticket", () => {
  it("cuts the body at the bottom and the stub at the top", () => {
    const { container } = render(
      <Ticket>
        <TicketBody>body</TicketBody>
        <TicketStub>stub</TicketStub>
      </Ticket>,
    );
    // The two halves must bite from facing edges; matching ones would leave a
    // hole in the wrong place and no seam at all.
    expect(container.querySelector(".paper-cut-bottom")).toBeTruthy();
    expect(container.querySelector(".paper-cut-top")).toBeTruthy();
    expect(container.querySelectorAll(".paper-plate")).toHaveLength(2);
  });
});
