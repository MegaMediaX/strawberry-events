import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
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
        {token ? (
          <ResetPasswordForm locale={locale} token={token} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            This reset link is invalid or has expired.{" "}
            <Link className="text-primary underline" href={`/${locale}/forgot-password`}>
              Request a new one
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
