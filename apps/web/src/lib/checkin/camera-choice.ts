/**
 * Which camera the door should scan with.
 *
 * The scanner asked for `{ facingMode: "environment" }`. That is a MOBILE
 * concept: phones report front/back, desktop cameras generally report neither.
 * The constraint was not `exact`, so the browser satisfied it with whatever it
 * liked — the built-in lid camera — even on a lane with a USB webcam plugged in
 * and aimed at the badges. The preview showed the operator's own face while the
 * right camera sat idle beside it.
 *
 * So the camera is chosen explicitly, remembered per lane, and pickable by the
 * operator. Labels are only available after permission has been granted, which
 * is why the choice is made after enumeration rather than in the constraint.
 */
export interface CameraOption {
  id: string;
  label: string;
}

/** localStorage key. Per lane, like the printer name. */
export const CAMERA_KEY = "strawberry.checkin.cameraId";

/**
 * Labels that suggest a camera someone deliberately plugged in and pointed at
 * something. An external webcam on a check-in lane is there to read badges;
 * the built-in one is there to look at the operator.
 */
const EXTERNAL_HINTS = [
  "logitech", "brio", "streamcam", "c920", "c922", "c925", "c930", "c270",
  "usb camera", "usb video", "hd pro", "webcam c",
];

/** Labels that are almost certainly the laptop's own lid camera. */
const BUILT_IN_HINTS = ["integrated", "built-in", "builtin", "facetime", "internal"];

function score(label: string): number {
  const l = label.toLowerCase();
  if (EXTERNAL_HINTS.some((h) => l.includes(h))) return 2;
  if (BUILT_IN_HINTS.some((h) => l.includes(h))) return 0;
  return 1;
}

/**
 * The camera to start with: the operator's saved choice if it is still
 * plugged in, otherwise the one that looks most like a deliberate external
 * webcam, otherwise the first available.
 *
 * A saved id always wins. An operator who picked a camera on this lane meant
 * it, and a heuristic that overrides them is worse than no heuristic.
 */
export function pickCamera(
  saved: string | null,
  cameras: readonly CameraOption[],
): CameraOption | null {
  if (cameras.length === 0) return null;
  if (saved) {
    const kept = cameras.find((c) => c.id === saved);
    if (kept) return kept;
    // Saved camera is gone — unplugged, or a different lane's laptop. Fall
    // through and choose again rather than failing to start.
  }
  let best = cameras[0];
  for (const c of cameras) {
    if (score(c.label) > score(best.label)) best = c;
  }
  return best;
}
