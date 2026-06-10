import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({
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
          <p className="mt-1 text-sm text-muted-foreground">Create an attendee account</p>
        </div>
        <RegisterForm locale={locale} />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link className="text-primary underline" href={`/${locale}/login`}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
