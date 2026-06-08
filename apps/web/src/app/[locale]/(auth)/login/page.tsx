import { setRequestLocale } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <LoginForm locale={locale} />
    </main>
  );
}
