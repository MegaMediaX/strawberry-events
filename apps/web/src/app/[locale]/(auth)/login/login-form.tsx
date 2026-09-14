"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { landingPathAction } from "./actions";

const schema = z.object({
  // Written for the person reading them: the defaults ("Invalid email", and
  // for the password a length message) describe the rule, not the fix — on the
  // one screen every staff member passes through on an unfamiliar machine.
  email: z.string().min(1, "Enter your email address.").email("That doesn't look like an email address."),
  password: z.string().min(1, "Enter your password."),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm({ locale, justReset = false }: { locale: string; justReset?: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(null);
    const res = await signIn("credentials", {
      ...values,
      redirect: false,
    });
    if (res?.error) {
      // Announced and focused: the message renders below two fields the person
      // is still looking at, and a failed sign-in with nothing moving reads as
      // a button that did nothing.
      setError("That email and password don't match an account. Check both and try again.");
      setFocus("password");
      return;
    }
    const dest = await landingPathAction(locale);
    router.push(dest);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("login")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            {/* autoComplete, so browsers and password managers can fill the one
                screen staff meet on machines that are not theirs. Without it
                they guess, and on a door laptop they guess wrong. */}
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p id="email-error" className="text-sm font-medium text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            {errors.password && (
              <p id="password-error" className="text-sm font-medium text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          {justReset && !error && (
            <p role="status" className="text-sm font-medium text-[var(--brand-success-text)]">
              Password reset — sign in with your new password.
            </p>
          )}
          {/* role=alert: a sign-in refusal is the one thing on this page that
              has to reach someone who is not watching the space under the
              fields. */}
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11 px-6" disabled={isSubmitting}>
            {t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
