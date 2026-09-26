import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../cover-actions", () => ({
  uploadCoverAction: vi.fn(),
  removeCoverAction: vi.fn(),
  setCoverFocusAction: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CoverUploader } from "../cover-uploader";

/**
 * The crop picker.
 *
 * Its whole job is to show the organiser what the frame will throw away, so
 * the overlay has to sit on the PICTURE and not on the element containing it.
 * The first cut had a full-width button with an object-contain image inside
 * it, which meant every percentage was a percentage of the button — letterbox
 * bars included — and the crop box was drawn across grey nothing while the
 * marker landed where the photograph was not. It was caught by a screenshot,
 * so what is asserted here is the one structural property that prevents it:
 * the box is sized by the image.
 */
const render = (props: Partial<Parameters<typeof CoverUploader>[0]> = {}) =>
  renderToStaticMarkup(
    <CoverUploader
      locale="en"
      eventId="evt1"
      initialUrl="/media/event-cover/evt1-abc.jpg"
      initialSize={{ width: 1200, height: 1600 }}
      initialFocus={{ x: 50, y: 12 }}
      {...props}
    />,
  );

describe("the cover crop picker", () => {
  it("sizes its overlay box to the picture, not to the element around it", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*class="[^"]*inline-block/);
    // object-contain would letterbox the image inside a wider box, and every
    // percentage below is relative to that box.
    expect(html).not.toMatch(/<img[^>]*class="[^"]*object-contain/);
  });

  /**
   * The geometry itself is `safeCropBox`, asserted in lib/events. What matters
   * here is that the same numbers reach the clip, the outline and the marker —
   * three places that can disagree.
   */
  it("lights exactly the surviving window", () => {
    const html = render();
    // The preview is the listing card's 16/9 crop — the only crop left, since
    // the event page and homepage feature now show the poster whole. (It was
    // 16/6, which would now promise a loss that no longer happens.)
    // 1200x1600 at 16/9 keeps 42.1875% of the height; at focus 12% it starts
    // 6.9375% down, so 50.875% is left below it. Numbers from safeCropBox.
    expect(html).toContain("clip-path:inset(6.9375% 0% 50.875% 0%)");
    expect(html).toContain("height:42.1875%");
    expect(html).toContain("top:6.9375%");
  });

  it("puts the marker where the organiser pointed", () => {
    const html = render();
    expect(html).toMatch(/left:50%;top:12%/);
  });

  it("dims everything outside the window", () => {
    expect(render()).toContain("bg-black/55");
  });

  /**
   * Without the file's size there is no honest crop preview, so it promises
   * nothing rather than drawing a box it cannot justify.
   */
  it("says so plainly when the cover's size was never recorded", () => {
    const html = render({ initialSize: null });
    expect(html).not.toContain("clip-path");
    expect(html).toContain("Re-upload it to choose a focal point");
  });

  it("reaches a keyboard, not only a pointer", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*aria-label="Focal point: 50% across, 12% down\./);
  });

  it("still offers the upload control with no cover at all", () => {
    const html = render({ initialUrl: null, initialSize: null });
    expect(html).toContain("No cover photo yet");
    expect(html).toContain('type="file"');
    expect(html).not.toContain("clip-path");
  });

  /** Landscape is what the frame wants; the copy says so before the upload. */
  it("warns that a tall photo loses most of itself", () => {
    expect(render()).toMatch(/tall photo loses most of its\s+height/);
  });
});
