import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

// Next.js 16 renamed the `middleware` file convention to `proxy`.
// next-intl's request handler is exported as the default `proxy`.
const handleI18n = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Arabic was retired, but /ar/... links have already been shared. Redirect
  // them to the English equivalent rather than letting next-intl treat "ar"
  // as a path segment and 404. 307 (not 308) so the redirect is not cached
  // permanently — restoring the locale later should not fight stale browsers.
  if (pathname === "/ar" || pathname.startsWith("/ar/")) {
    const url = request.nextUrl.clone();
    url.pathname = `/en${pathname.slice(3)}`;
    return NextResponse.redirect(url, 307);
  }

  return handleI18n(request);
}

export const config = {
  // Match all pathnames except API routes, Next internals, and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
