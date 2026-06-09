import { renderProviderPage } from "../provider-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return renderProviderPage(
    locale, "whish", "Whish (placeholder)",
    "Placeholder for Whish payments. Secrets are encrypted at rest. Live charges are not implemented until credentials/API docs exist.",
    [
      { key: "merchantId", label: "Merchant ID" },
      { key: "environment", label: "Environment (test/live)" },
      { key: "apiSecret", label: "API secret", secret: true },
      { key: "callbackSecret", label: "Callback secret", secret: true },
    ],
  );
}
