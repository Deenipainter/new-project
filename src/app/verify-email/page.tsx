import React from 'react';

import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailClient } from "@/components/auth/verify-email-client";

export const metadata = { title: "Verify email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = (params.token ?? "").trim();

  return (
    <AuthShell
      title="Email verification"
      subtitle="We confirm your address so account recovery and receipts reach the right inbox."
      footer={
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Back to sign in
        </Link>
      }
    >
      {token ? (
        <VerifyEmailClient token={token} />
      ) : (
        <div className="space-y-3">
          <p className="rounded-xl border border-[#F3E2C0] bg-[#FBF6EA] px-4 py-3 text-[12.5px] text-[#6B4A10]">
            This page needs a verification token. Open the link from your email, or resend one from your
            dashboard banner.
          </p>
          <Link href="/" className="btn-brand w-full">
            Go to dashboard
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
