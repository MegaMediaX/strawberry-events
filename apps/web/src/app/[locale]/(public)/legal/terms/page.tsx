import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Terms and Conditions" };

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Terms and Conditions</h1>
      <p className="mt-4 text-muted-foreground">
        These are the terms governing your registration and attendance. The full
        terms text will be published here before public launch. By registering you
        agree to be bound by the organizer&rsquo;s event rules and these terms.
      </p>
    </main>
  );
}
