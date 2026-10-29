import React from 'react';

import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { OutageNotice } from "@/components/outage-notice";
import { getCurrentUser } from "@/lib/auth";
import { isDatabaseUp } from "@/lib/health";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const [user, dbUp] = await Promise.all([getCurrentUser(), isDatabaseUp()]);
  if (user) redirect("/");
  const params = await searchParams;
  const referral = (params.ref ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase();

  return (
    <AuthShell
      title="Create your account"
      subtitle="One wallet for data, airtime and bills — with receipts you can trace."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {!dbUp && <OutageNotice />}
      <RegisterForm initialReferral={referral} />
    </AuthShell>
  );
}
