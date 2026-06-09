import { renderProviderPage } from "../provider-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return renderProviderPage(
    locale, "pretix", "pretix",
    "Per-organization pretix settings. The API token is encrypted at rest and never displayed; the environment PRETIX_API_TOKEN is used as a fallback.",
    [
      { key: "baseUrl", label: "pretix base URL" },
      { key: "organizerSlug", label: "Organizer slug" },
      { key: "apiToken", label: "API token", secret: true },
    ],
  );
}
