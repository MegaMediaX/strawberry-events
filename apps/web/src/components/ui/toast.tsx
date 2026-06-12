"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

// Minimal module-level store so any client component can call `toast(...)`
// without threading a context provider through the tree.
let counter = 0;
const listeners = new Set<(toasts: Toast[]) => void>();
let toasts: Toast[] = [];

function emit() {
  for (const l of listeners) l(toasts);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(
  message: string,
  variant: ToastVariant = "info",
  durationMs = 3000,
) {
  const id = ++counter;
  toasts = [...toasts, { id, message, variant }];
  emit();
  if (durationMs > 0) {
    setTimeout(() => dismiss(id), durationMs);
  }
  return id;
}

toast.success = (message: string, durationMs?: number) =>
  toast(message, "success", durationMs);
toast.error = (message: string, durationMs?: number) =>
  toast(message, "error", durationMs);

const variantStyles: Record<ToastVariant, string> = {
  success: "border-primary/30 bg-primary text-primary-foreground",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-border bg-background text-foreground",
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.add(setItems);
    setItems(toasts);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-4 end-4 z-50 flex w-full max-w-sm flex-col gap-2"
      role="region"
      aria-live="polite"
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cn(
            "pointer-events-auto rounded-lg border px-4 py-2.5 text-start text-sm font-medium shadow-lg transition-all",
            variantStyles[t.variant],
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
