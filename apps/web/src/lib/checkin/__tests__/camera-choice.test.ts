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

  it("recognises a laptop that names its camera after itself", () => {
    // Observed live on a MacBook: "MacBook Air Camera (0000:0001)" matched no
    // built-in hint, tied with an unknown external camera, and won on order —
    // so the lid camera was chosen over the one pointed at the badges.
    const macbook: CameraOption = { id: "mb-1", label: "MacBook Air Camera (0000:0001)" };
    const unknown: CameraOption = { id: "u-1", label: "Marven's Camera" };
    expect(pickCamera(null, [macbook, unknown])?.id).toBe("u-1");
  });

  it.each([
    "Surface Camera Front",
    "HP TrueVision HD Camera",
    "Dell Webcam Central",
    "Lenovo EasyCamera",
  ])("treats %s as the machine's own", (label) => {
    const builtIn: CameraOption = { id: "b-1", label };
    const usb: CameraOption = { id: "u-1", label: "Some Unnamed Device" };
    expect(pickCamera(null, [builtIn, usb])?.id).toBe("u-1");
  });

  it.each([
    "Logitech HD Pro Webcam C920",
    "HD Pro Webcam C920 (046d:0892)",
    "Logitech BRIO",
    "Logitech StreamCam",
    "C922 Pro Stream Webcam",
    "USB Video Device",
  ])("picks %s over the laptop's own camera", (label) => {
    // The lanes run Logitechs. If any of these ever stops scoring as external,
    // that lane silently scans with the camera pointed at the operator.
    const builtIn: CameraOption = { id: "b-1", label: "Integrated Camera" };
    const external: CameraOption = { id: "e-1", label };
    expect(pickCamera(null, [builtIn, external])?.id).toBe("e-1");
  });

  it.each(["Dell Webcam WB7022", "ThinkPad USB Webcam", "Lenovo 500 FHD Webcam"])(
    "does not mistake the vendor-branded external %s for a built-in",
    (label) => {
      // The hints once read "dell webcam" and "thinkpad", which matched these
      // real USB webcams and scored them as the machine's own — picking the lid
      // camera instead. "usb" now wins outright, and the vendor hints are
      // narrowed to the names built-ins actually use.
      const builtIn: CameraOption = { id: "b-1", label: "Integrated Camera" };
      const external: CameraOption = { id: "e-1", label };
      expect(pickCamera(null, [builtIn, external])?.id).toBe("e-1");
    },
  );

  it("still knows Dell's own built-in software name", () => {
    // "Dell Webcam Central" is a built-in; "Dell Webcam WB7022" is not. The
    // hint has to be specific enough to tell them apart.
    const dellBuiltIn: CameraOption = { id: "b-1", label: "Dell Webcam Central" };
    const unknown: CameraOption = { id: "u-1", label: "Some Device" };
    expect(pickCamera(null, [dellBuiltIn, unknown])?.id).toBe("u-1");
  });

  it("returns null when there is no camera at all", () => {
    expect(pickCamera(null, [])).toBeNull();
    expect(pickCamera("lid-1", [])).toBeNull();
  });
});
