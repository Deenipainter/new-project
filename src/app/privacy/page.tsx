import React from 'react';

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Privacy" };

const SECTIONS = [
  {
    title: "What we collect",
    body: "Your name, email address and Nigerian phone number when you create an account. Wallet and transaction records created when you fund your wallet or buy a service. Technical logs needed to keep the service secure.",
  },
  {
    title: "What we do not collect",
    body: "We do not ask for your card PIN, banking passwords, BVN or NIN unless a specific, lawfully licensed verification service is enabled and clearly explained first. We never ask for cryptocurrency seed phrases or private keys.",
  },
  {
    title: "How your data is used",
    body: "To operate your wallet, deliver the services you order, send receipts, secure your account (verification and password reset emails), and meet accounting and audit obligations.",
  },
  {
    title: "Who can see it",
    body: "Only you can see your own transactions. Administrators can see operational records needed to reconcile orders and resolve disputes. Provider and payment partners receive only what is required to fulfil a request.",
  },
  {
    title: "Retention",
    body: "Ledger and order records are retained for accounting and dispute resolution. Password reset and verification tokens expire and are single-use.",
  },
  {
    title: "Your choices",
    body: "You can update your name and phone number from your profile. For account deletion or a data request, contact support from the email on your account.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-8 sm:px-6">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        Back
      </Link>
      <h1 className="text-[24px] font-bold">Privacy notice</h1>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
        A plain summary of what DP Data Sub stores and why. This is not legal advice; the account owner
        should have it reviewed for NDPR compliance before public launch.
      </p>
      <div className="mt-5 space-y-3">
        {SECTIONS.map((section) => (
          <section key={section.title} className="panel p-4">
            <h2 className="text-[14px] font-semibold">{section.title}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
