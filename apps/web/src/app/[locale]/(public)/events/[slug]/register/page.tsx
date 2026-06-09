import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getPublicEvent } from "@/lib/events/public";
import { RegistrationWizard } from "@/components/registration/registration-wizard";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const data = await getPublicEvent(slug);
  if (!data) notFound();

  const title = locale === "ar" && data.event.titleAr ? data.event.titleAr : data.event.titleEn;
  const tickets = data.tickets.map((t) => ({
    id: t.id,
    title: locale === "ar" && t.titleAr ? t.titleAr : t.titleEn,
    priceCents: t.priceCents,
  }));

  return (
    <div>
      <div className="mx-auto max-w-xl px-4 pt-6">
        <h1 className="text-xl font-semibold">Register — {title}</h1>
      </div>
      <RegistrationWizard locale={locale} slug={slug} tickets={tickets} />
    </div>
  );
}
