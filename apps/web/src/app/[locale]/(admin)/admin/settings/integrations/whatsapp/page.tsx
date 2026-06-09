import { renderProviderPage } from "../provider-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return renderProviderPage(
    locale, "whatsapp", "WhatsApp",
    "Placeholder provider for future WhatsApp reminders. The access token is encrypted at rest.",
    [
      { key: "apiBaseUrl", label: "API base URL" },
      { key: "phoneNumberId", label: "Phone number / sender ID" },
      { key: "accessToken", label: "Access token", secret: true },
    ],
  );
}
