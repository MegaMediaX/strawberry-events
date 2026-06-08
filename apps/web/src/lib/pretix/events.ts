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
  date_from?: string | null;
  date_to?: string | null;
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

export async function listEvents(organizerSlug: string): Promise<PretixEvent[]> {
  const raw = await pretixFetchAll<PretixEventRaw>(base(organizerSlug));
  return raw.map(mapEvent);
}

export async function getEvent(
  organizerSlug: string,
  eventSlug: string,
): Promise<PretixEvent> {
  const raw = await pretixFetch<PretixEventRaw>(
    `${base(organizerSlug)}${eventSlug}/`,
  );
  return mapEvent(raw);
}

export async function createEvent(
  organizerSlug: string,
  input: CreateEventInput,
): Promise<PretixEvent> {
  const raw = await pretixFetch<PretixEventRaw>(base(organizerSlug), {
    method: "POST",
    body: JSON.stringify({
      slug: input.slug,
      name: toI18n(input.titleEn, input.titleAr),
      live: input.live ?? false,
      date_from: input.date_from ?? null,
      date_to: input.date_to ?? null,
    }),
  });
  return mapEvent(raw);
}

export async function updateEvent(
  organizerSlug: string,
  eventSlug: string,
  patch: Partial<CreateEventInput>,
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
  );
  return mapEvent(raw);
}
