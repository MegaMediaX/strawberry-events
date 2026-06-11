import Link from "next/link";
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
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link
            href={`/${locale}/events`}
            className="bg-[image:var(--gradient-hero)] bg-clip-text text-2xl font-extrabold tracking-tight text-transparent"
          >
            Strawberry Events
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
        </div>
        <LoginForm locale={locale} />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link className="text-primary underline" href={`/${locale}/forgot-password`}>
            Forgot password?
          </Link>
        </p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link className="text-primary underline" href={`/${locale}/register`}>
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
