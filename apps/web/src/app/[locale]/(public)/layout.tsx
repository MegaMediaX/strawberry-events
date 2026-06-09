import { setRequestLocale } from "next-intl/server";
import { PublicNav } from "@/components/public/public-nav";

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav locale={locale} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
