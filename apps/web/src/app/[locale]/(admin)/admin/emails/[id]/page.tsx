import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getEmailDetail } from "@/lib/admin/emails";
import { ResendButton } from "./resend-button";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-border py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default async function EmailDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin", "finance"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  let log;
  try {
    log = await getEmailDetail(session, id);
  } catch {
    notFound();
  }

  const canResend =
    !session.impersonating &&
    (session.isSuperAdmin || session.memberships.some((m) => m.role === "organizer_admin"));

  return (
    <div className="mx-auto max-w-2xl">
      <Link className="text-sm text-primary underline" href={`/${locale}/admin/emails`}>← Email log</Link>
      <h1 className="mt-2 text-2xl font-bold">{log.subject}</h1>
      <p className="text-sm text-muted-foreground">to {log.recipient}</p>

      <div className="mt-4">
        <Row label="Status" value={log.status} />
        <Row label="Provider" value={log.provider} />
        <Row label="Template" value={log.templateType ?? "—"} />
        <Row label="Attendee / order" value={log.attendeeRef ?? "—"} />
        <Row label="When" value={new Date(log.createdAt).toLocaleString()} />
        {log.lastError && <Row label="Last error" value={<span className="text-destructive">{log.lastError}</span>} />}
      </div>

      <div className="mt-6">
        <ResendButton id={log.id} canResend={canResend} />
        <p className="mt-2 text-xs text-muted-foreground">
          The email body is not displayed here; resending re-sends the original content.
        </p>
      </div>
    </div>
  );
}
