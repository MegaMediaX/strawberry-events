import { NextResponse } from "next/server";

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
}

export function paginationMeta(page: number, perPage: number, total: number) {
  return { pagination: { page, perPage, total } as Pagination };
}

/** Success envelope: { data, meta, error: null }. */
export function ok(
  data: unknown,
  meta: Record<string, unknown> = {},
  init?: ResponseInit,
) {
  return NextResponse.json({ data, meta, error: null }, init);
}

/** Error envelope: { data: null, meta: {}, error: { code, message } }. */
export function fail(code: string, message: string, status = 400) {
  return NextResponse.json(
    { data: null, meta: {}, error: { code, message } },
    { status },
  );
}

/** Parse ?page / ?perPage with sane bounds. */
export function readPaging(url: URL): { page: number; perPage: number; skip: number; take: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? "25") || 25));
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}
