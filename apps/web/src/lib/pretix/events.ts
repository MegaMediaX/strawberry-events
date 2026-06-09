import { pretixFetch, pretixFetchAll } from "./client";
import { fromI18n, toI18n, type PretixI18n } from "./mappers";

interface PretixEventRaw {
  slug: string;
  name: PretixI18n;
  live: boolean;
  date_from: string | null;
  date_to: string | null;
}

export interface PretixEvent {
  slug: string;
  titleEn: string;
  titleAr: string | null;
  live: boolean;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface CreateEventInput {
  slug: string;
  titleEn: string;
  titleAr?: string | null;
  live?: boolean;
  /** Required by pretix (ISO 8601). */
  date_from: string;
  date_to?: string | null;
  /** Defaults to USD per platform policy. */
  currency?: string;
}

function mapEvent(raw: PretixEventRaw): PretixEvent {
  const { titleEn, titleAr } = fromI18n(raw.name);
  return {
    slug: raw.slug,
    titleEn,
    titleAr,
    live: raw.live,
    dateFrom: raw.date_from,
    dateTo: raw.date_to,
  };
}

const base = (org: string) => `/organizers/${org}/events/`;

export async function listEvents(
  organizerSlug: string,
  token?: string,
): Promise<PretixEvent[]> {
  const raw = await pretixFetchAll<PretixEventRaw>(base(organizerSlug), token);
  return raw.map(mapEvent);
}

export async function getEvent(
  organizerSlug: string,
  eventSlug: string,
  token?: string,
): Promise<PretixEvent> {
  const raw = await pretixFetch<PretixEventRaw>(
    `${base(organizerSlug)}${eventSlug}/`,
    {},
    token,
  );
  return mapEvent(raw);
}

export async function createEvent(
  organizerSlug: string,
  input: CreateEventInput,
  token?: string,
): Promise<PretixEvent> {
  const raw = await pretixFetch<PretixEventRaw>(
    base(organizerSlug),
    {
      method: "POST",
      body: JSON.stringify({
        slug: input.slug,
        name: toI18n(input.titleEn, input.titleAr),
        live: input.live ?? false,
        date_from: input.date_from,
        date_to: input.date_to ?? null,
        currency: input.currency ?? "USD",
      }),
    },
    token,
  );
  return mapEvent(raw);
}

/** Delete an event (best-effort rollback). Only works on non-live events. */
export async function deleteEvent(
  organizerSlug: string,
  eventSlug: string,
  token?: string,
): Promise<void> {
  await pretixFetch(
    `${base(organizerSlug)}${eventSlug}/`,
    { method: "DELETE" },
    token,
  );
}

export async function updateEvent(
  organizerSlug: string,
  eventSlug: string,
  patch: Partial<CreateEventInput>,
  token?: string,
): Promise<PretixEvent> {
  const body: Record<string, unknown> = { ...patch };
  if (patch.titleEn !== undefined) {
    body.name = toI18n(patch.titleEn, patch.titleAr);
    delete body.titleEn;
    delete body.titleAr;
  }
  const raw = await pretixFetch<PretixEventRaw>(
    `${base(organizerSlug)}${eventSlug}/`,
    { method: "PATCH", body: JSON.stringify(body) },
    token,
  );
  return mapEvent(raw);
}
