export type QrViewState = "loading" | "error" | "ready";

/**
 * Decides what a QR display should render.
 * `ready` wins when a data URL exists; `error` is only shown when generation
 * failed and there is no image to fall back on — this guarantees a failed QR
 * never leaves the attendee stuck on the loading skeleton.
 */
export function qrViewState({
  src,
  error,
}: {
  src: string | null;
  error: boolean;
}): QrViewState {
  if (src) return "ready";
  if (error) return "error";
  return "loading";
}
