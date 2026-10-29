import React from 'react';

import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { OutageNotice } from "@/components/outage-notice";
import { getCurrentUser } from "@/lib/auth";
import { isDatabaseUp } from "@/lib/health";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const [user, dbUp] = await Promise.all([getCurrentUser(), isDatabaseUp()]);
  if (user) redirect("/");

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your wallet, buy data and check your receipts."
      footer={
        <p>
          New to DP Data Sub?{" "}
          <Link href="/register" className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      {!dbUp && <OutageNotice />}
      <LoginForm />
    </AuthShell>
  );
}
