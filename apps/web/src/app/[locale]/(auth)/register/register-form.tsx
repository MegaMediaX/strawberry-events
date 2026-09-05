"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registerAction, verifyEmailAction, resendCodeAction } from "./actions";

const schema = z
  .object({
    name: z.string().optional(),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string().min(1, "Please confirm your password"),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

type FormValues = z.infer<typeof schema>;

/**
 * Shown whether or not an account was created. A taken address receives "you
 * already have an account" rather than a code, so the box below simply never
 * accepts one — which is what keeps the two cases indistinguishable from here.
 */
const SENT = "We've emailed you a 6-digit code. It expires in 10 minutes.";

export function RegisterForm({ locale }: { locale: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(null);
    const res = await registerAction({ ...values, locale });
    if (!res.ok) {
      // Only input/throttle failures reach here. Whether the address is taken
      // is NOT one of them, by design.
      setError(res.error ?? "Registration failed.");
      return;
    }
    setCreds({ email: values.email, password: values.password });
    setSent(true);
  }

  async function onVerify() {
    setCodeError(null);
    setResendNote(null);
    if (!creds) return;
    setBusy(true);
    const res = await verifyEmailAction({ email: creds.email, code });
    setBusy(false);
    if (!res.ok) {
      setCodeError(res.error ?? "That code isn't right.");
      return;
    }
    // The address is proved, so signing in here gives back the convenience the
    // neutral flow had to remove — without the oracle, because reaching this
    // point requires a code that only the mailbox owner received.
    const signin = await signIn("credentials", {
      email: creds.email,
      password: creds.password,
      redirect: false,
    });
    if (signin?.error) {
      router.push(`/${locale}/login`);
      return;
    }
    router.push(`/${locale}/my-registrations`);
    router.refresh();
  }

  async function onResend() {
    setCodeError(null);
    if (!creds) return;
    setBusy(true);
    // A dedicated action, NOT a second registerAction: the first submit created
    // the account, so re-running signup would find it already present, take the
    // existing-address branch, and mail "you already have an account" without
    // ever issuing a new code.
    await resendCodeAction({ email: creds.email, locale });
    setBusy(false);
    setResendNote("If that address is waiting on a code, a new one is on its way.");
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{SENT}</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">6-digit code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
            />
            {codeError && <p className="text-sm text-destructive">{codeError}</p>}
            {resendNote && <p className="text-sm text-muted-foreground">{resendNote}</p>}
          </div>
          <Button onClick={onVerify} disabled={busy || code.length !== 6}>
            Verify
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={onResend}
              disabled={busy}
              className="text-primary underline-offset-4 hover:underline disabled:opacity-50"
            >
              Send a new code
            </button>
            <Link
              href={`/${locale}/login`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Go to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" {...register("name")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" {...register("confirm")} />
            {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isSubmitting}>Create account</Button>
        </form>
      </CardContent>
    </Card>
  );
}
