"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export interface EventRow {
  id: string;
  titleEn: string;
  titleAr: string | null;
  slug: string;
  visibility: string;
  comingSoon: boolean;
}

type View = "table" | "cards";
const STORAGE_KEY = "admin.events.view";

function statusLabel(e: EventRow): string {
  if (e.comingSoon) return "🟡 Coming soon";
  if (e.visibility === "hidden") return "⚪ Hidden";
  if (e.visibility === "private") return "🔒 Private";
  return "🟢 Public";
}

export function EventList({
  events,
  locale,
}: {
  events: EventRow[];
  locale: string;
}) {
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "table";
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "cards" ? "cards" : "table";
  });

  function choose(v: View) {
    setView(v);
    localStorage.setItem(STORAGE_KEY, v);
  }

  const editHref = (id: string) => `/${locale}/admin/events/${id}/edit`;

  return (
    <div>
      <div className="mb-3 flex justify-end gap-1">
        <Button
          size="sm"
          variant={view === "table" ? "default" : "outline"}
          onClick={() => choose("table")}
        >
          Table
        </Button>
        <Button
          size="sm"
          variant={view === "cards" ? "default" : "outline"}
          onClick={() => choose("cards")}
        >
          Cards
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-muted-foreground">No events yet.</p>
      ) : view === "table" ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Event</th>
              <th>Slug</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="py-2">{e.titleEn}</td>
                <td className="text-muted-foreground">{e.slug}</td>
                <td>{statusLabel(e)}</td>
                <td className="text-end">
                  <Link className="text-primary underline" href={editHref(e.id)}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <Link
              key={e.id}
              href={editHref(e.id)}
              className="overflow-hidden rounded-lg border transition hover:shadow-md"
            >
              <div className="h-20 bg-gradient-to-br from-pink-500 to-orange-300" />
              <div className="p-3">
                <div className="font-semibold">{e.titleEn}</div>
                <div className="text-sm text-muted-foreground">{e.slug}</div>
                <div className="mt-1 text-sm">{statusLabel(e)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
