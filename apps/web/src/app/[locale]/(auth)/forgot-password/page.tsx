import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link
            href={`/${locale}/events`}
            className="bg-[image:var(--gradient-hero)] bg-clip-text text-2xl font-extrabold tracking-tight text-transparent"
          >
            Strawberry Events
          </Link>
        </div>
        <ForgotPasswordForm locale={locale} />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link className="text-primary underline" href={`/${locale}/login`}>
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
