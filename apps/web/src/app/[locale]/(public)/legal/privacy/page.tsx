import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="mt-4 text-muted-foreground">
        This policy explains what personal data we collect when you register
        (name, email, phone) and how it is used to process your registration and
        admit you to the event. The full policy text will be published here before
        public launch. We store your consent at the time of registration.
      </p>
    </main>
  );
}
