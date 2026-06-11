import Link from "next/link";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { getMyProfile } from "@/lib/portal/account";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSessionContext();
  if (!session) redirect(`/${locale}/login`);

  const profile = await getMyProfile(session);

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <Link href={`/${locale}/my-registrations`} className="text-sm text-primary underline-offset-4 hover:underline">
          My registrations
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Update your contact details and language.</p>
      <ProfileForm initial={profile} />
    </main>
  );
}
