import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../actions", () => ({ counterAction: vi.fn() }));

import { DoorCounters } from "../door-counters";

/**
 * The header figure was rendered once, server-side, under a panel that never
 * causes the page to re-render — so it showed the count from before the doors
 * opened for the rest of the shift.
 */
describe("the door count", () => {
  it("paints the server's figure immediately, not a placeholder", () => {
    const html = renderToStaticMarkup(
      <DoorCounters eventId="evt" listId={7} initial={{ checkedIn: 128, total: 400 }} />,
    );
    expect(html).toContain("Checked in 128 / 400");
  });
});
