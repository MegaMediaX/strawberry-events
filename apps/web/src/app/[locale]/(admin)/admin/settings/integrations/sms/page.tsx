import { renderProviderPage } from "../provider-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return renderProviderPage(
    locale, "sms", "SMS",
    "Placeholder provider for future SMS reminders. The API key is encrypted at rest.",
    [
      { key: "senderId", label: "Sender name / number" },
      { key: "apiKey", label: "API key", secret: true },
    ],
  );
}
