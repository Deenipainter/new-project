import React from 'react';

import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export const metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = (params.token ?? "").trim();

  if (!token) {
    return (
      <AuthShell
        title="This link is incomplete"
        subtitle="Reset links must include their token. Request a fresh one and open it from your email."
        footer={
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Link href="/forgot-password" className="btn-brand w-full">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password. Your other sessions will be signed out."
      footer={
        <p>
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
