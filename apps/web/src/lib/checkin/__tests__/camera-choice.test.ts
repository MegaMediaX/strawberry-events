import { describe, it, expect } from "vitest";

import { pickCamera, type CameraOption } from "@/lib/checkin/camera-choice";

const lid: CameraOption = { id: "lid-1", label: "Integrated Camera (04f2:b6d9)" };
const logi: CameraOption = { id: "logi-1", label: "Logitech HD Pro Webcam C920" };
const other: CameraOption = { id: "x-1", label: "Some Capture Device" };

describe("pickCamera", () => {
  // The bug this exists to prevent: facingMode is a mobile concept, so the
  // browser satisfied it with the lid camera while a USB webcam aimed at the
  // badges sat idle. The preview showed the operator's face.
  it("prefers the external webcam over the laptop's own", () => {
    expect(pickCamera(null, [lid, logi])?.id).toBe("logi-1");
    expect(pickCamera(null, [logi, lid])?.id).toBe("logi-1");
  });

  it("honours what the operator chose on this lane, whatever the labels say", () => {
    // A heuristic that overrules a deliberate choice is worse than none.
    expect(pickCamera("lid-1", [lid, logi])?.id).toBe("lid-1");
  });

  it("chooses again when the saved camera has been unplugged", () => {
    expect(pickCamera("gone-99", [lid, logi])?.id).toBe("logi-1");
  });

  it("falls back to the only camera there is", () => {
    expect(pickCamera(null, [lid])?.id).toBe("lid-1");
  });

  it("prefers an unknown label over a known built-in", () => {
    // An unlabelled device is more likely deliberate than the lid camera.
    expect(pickCamera(null, [lid, other])?.id).toBe("x-1");
  });

  it("returns null when there is no camera at all", () => {
    expect(pickCamera(null, [])).toBeNull();
    expect(pickCamera("lid-1", [])).toBeNull();
  });
});
