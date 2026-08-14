import { pretixFetch, pretixFetchAll } from "./client";
import {
  fromI18n,
  toI18n,
  priceToCents,
  centsToPrice,
  type PretixI18n,
} from "./mappers";

interface PretixItemRaw {
  id: number;
  name: PretixI18n;
  default_price: string;
  active: boolean;
}

export interface PretixItem {
  id: number;
  titleEn: string;
  titleAr: string | null;
  priceCents: number;
  active: boolean;
}

export interface CreateItemInput {
  titleEn: string;
  titleAr?: string | null;
  priceCents: number;
  active?: boolean;
}

function mapItem(raw: PretixItemRaw): PretixItem {
  const { titleEn, titleAr } = fromI18n(raw.name);
  return {
    id: raw.id,
    titleEn,
    titleAr,
    priceCents: priceToCents(raw.default_price),
    active: raw.active,
  };
}

const base = (org: string, ev: string) =>
  `/organizers/${org}/events/${ev}/items/`;

export async function listItems(
  organizerSlug: string,
  eventSlug: string,
  token?: string,
): Promise<PretixItem[]> {
  const raw = await pretixFetchAll<PretixItemRaw>(
    base(organizerSlug, eventSlug),
    token,
  );
  return raw.map(mapItem);
}

export async function createItem(
  organizerSlug: string,
  eventSlug: string,
  input: CreateItemInput,
  token?: string,
): Promise<PretixItem> {
  const raw = await pretixFetch<PretixItemRaw>(
    base(organizerSlug, eventSlug),
    {
      method: "POST",
      body: JSON.stringify({
        name: toI18n(input.titleEn, input.titleAr),
        default_price: centsToPrice(input.priceCents),
        active: input.active ?? true,
      }),
    },
    token,
  );
  return mapItem(raw);
}

export interface UpdateItemInput {
  titleEn: string;
  titleAr?: string | null;
  priceCents: number;
  active?: boolean;
}

/** PATCH a pretix item (partial update of name/price/active). */
export async function updateItem(
  organizerSlug: string,
  eventSlug: string,
  itemId: number,
  input: UpdateItemInput,
  token?: string,
): Promise<PretixItem> {
  const raw = await pretixFetch<PretixItemRaw>(
    `${base(organizerSlug, eventSlug)}${itemId}/`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: toI18n(input.titleEn, input.titleAr),
        default_price: centsToPrice(input.priceCents),
        ...(input.active != null && { active: input.active }),
      }),
    },
    token,
  );
  return mapItem(raw);
}

/**
 * DELETE a pretix item. pretix refuses (HTTP 409 Conflict; historically 403)
 * when the item already has order positions — callers translate that into a
 * friendly "has registrations" message rather than deleting.
 */
export async function deleteItem(
  organizerSlug: string,
  eventSlug: string,
  itemId: number,
  token?: string,
): Promise<void> {
  await pretixFetch<void>(
    `${base(organizerSlug, eventSlug)}${itemId}/`,
    { method: "DELETE" },
    token,
  );
}

export interface PretixQuota {
  id: number;
  name: string;
  size: number | null;
  items: number[];
}

export interface PretixQuotaAvailability {
  id: number;
  size: number | null;
  available_number: number | null;
}

/** List quotas including their `items` membership (no availability). Used to
 *  resolve which quota backs a given item when editing/deleting a ticket. */
export async function listQuotasWithItems(
  organizerSlug: string,
  eventSlug: string,
  token?: string,
): Promise<PretixQuota[]> {
  return pretixFetchAll<PretixQuota>(
    `/organizers/${organizerSlug}/events/${eventSlug}/quotas/`,
    token,
  );
}

/** List quotas with live availability (pretix `?with_availability=true`). */
export async function listQuotas(
  organizerSlug: string,
  eventSlug: string,
  token?: string,
): Promise<PretixQuotaAvailability[]> {
  return pretixFetchAll<PretixQuotaAvailability>(
    `/organizers/${organizerSlug}/events/${eventSlug}/quotas/?with_availability=true`,
    token,
  );
}

/**
 * Create a quota. pretix requires every sellable item to belong to a quota,
 * otherwise orders for it are rejected. `size: null` means unlimited.
 */
export async function createQuota(
  organizerSlug: string,
  eventSlug: string,
  input: { name: string; size: number | null; items: number[] },
  token?: string,
): Promise<PretixQuota> {
  return pretixFetch<PretixQuota>(
    `/organizers/${organizerSlug}/events/${eventSlug}/quotas/`,
    { method: "POST", body: JSON.stringify(input) },
    token,
  );
}

/** PATCH a quota's name and/or size (`size: null` = unlimited). */
export async function updateQuota(
  organizerSlug: string,
  eventSlug: string,
  quotaId: number,
  input: { name?: string; size?: number | null },
  token?: string,
): Promise<PretixQuota> {
  return pretixFetch<PretixQuota>(
    `/organizers/${organizerSlug}/events/${eventSlug}/quotas/${quotaId}/`,
    { method: "PATCH", body: JSON.stringify(input) },
    token,
  );
}

/** DELETE a quota. */
export async function deleteQuota(
  organizerSlug: string,
  eventSlug: string,
  quotaId: number,
  token?: string,
): Promise<void> {
  await pretixFetch<void>(
    `/organizers/${organizerSlug}/events/${eventSlug}/quotas/${quotaId}/`,
    { method: "DELETE" },
    token,
  );
}
