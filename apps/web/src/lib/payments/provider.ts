export interface PaymentProviderMeta {
  id: string;
  label: string;
  enabled: boolean;
}

/**
 * Registry of payment providers. COD is implemented; Whish is a disabled
 * placeholder per the platform roadmap (no credentials wired yet).
 */
export const providers: Record<"manual_cod" | "whish", PaymentProviderMeta> = {
  manual_cod: { id: "manual_cod", label: "Cash / manual payment", enabled: true },
  whish: { id: "whish", label: "Whish", enabled: false },
};

export type SelectedProvider = "free" | "manual_cod";

/** Choose how to settle an order: free events skip payment entirely. */
export function selectProvider(totalCents: number): SelectedProvider {
  return totalCents <= 0 ? "free" : "manual_cod";
}
