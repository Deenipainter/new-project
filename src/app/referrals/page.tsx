import React from 'react';

import { AppShell } from "@/components/layout/app-shell";
import { ReferralCard } from "@/components/referral-card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateShort } from "@/lib/format";
import { formatNaira } from "@/lib/money";

export const metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const user = await requireUser();

  const referrals = await prisma.referral
    .findMany({
      where: { referrerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { referee: { select: { fullName: true, createdAt: true } } },
      take: 50,
    })
    .catch(() => []);

  const qualified = referrals.filter((row) => row.qualifiedAt).length;
  const earnedKobo = referrals.reduce((total, row) => total + (row.rewardClaimedAt ? row.rewardKobo : 0), 0);

  return (
    <AppShell
      user={{
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        balanceKobo: user.balanceKobo,
      }}
    >
      <div className="mx-auto max-w-[720px] space-y-4">
        <div>
          <h1 className="text-[20px] font-bold sm:text-[24px]">My referrals</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            Share your code. Rewards are paid only on a verified qualifying event.
          </p>
        </div>

        <ReferralCard code={user.referralCode} total={referrals.length} qualified={qualified} />

        <div className="grid grid-cols-2 gap-2.5">
          <div className="panel px-4 py-3">
            <p className="section-label">Qualified</p>
            <p className="numeric mt-1 text-[20px] font-bold">{qualified}</p>
          </div>
          <div className="panel px-4 py-3">
            <p className="section-label">Rewards paid</p>
            <p className="numeric mt-1 text-[20px] font-bold">
              {formatNaira(earnedKobo, { withDecimals: true })}
            </p>
          </div>
        </div>

        <section className="panel overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">Your referrals</h2>
          </div>
          {referrals.length === 0 ? (
            <div className="empty-state m-4 border-0 bg-transparent">
              <p className="text-[13px] font-semibold">No referrals yet</p>
              <p className="mt-1 max-w-[36ch] text-[11.5px] leading-relaxed text-ink-muted">
                Share your link with friends. When they create an account and fund it for the first time,
                the referral qualifies automatically.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {referrals.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold">{row.referee.fullName}</p>
                    <p className="text-[11px] text-ink-muted">
                      Joined {formatDateShort(row.referee.createdAt)}
                    </p>
                  </div>
                  <span
                    className={
                      row.rewardClaimedAt
                        ? "rounded-full border border-[#C9EBD9] bg-[#EAF7F0] px-2 py-0.5 text-[10.5px] font-semibold text-[#0B7A45]"
                        : row.qualifiedAt
                          ? "rounded-full border border-[#F3E2C0] bg-[#FBF4E6] px-2 py-0.5 text-[10.5px] font-semibold text-[#8A5B12]"
                          : "rounded-full border border-line bg-secondary px-2 py-0.5 text-[10.5px] font-semibold text-ink-muted"
                    }
                  >
                    {row.rewardClaimedAt ? "Rewarded" : row.qualifiedAt ? "Qualified" : "Pending funding"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="text-[14px] font-semibold">Reward rules</h2>
          <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-ink-muted">
            <li>A referral counts only after the invited account is created with your code.</li>
            <li>It qualifies only after that account completes its first verified wallet funding.</li>
            <li>Self-referral is blocked and reward amounts must be configured server-side.</li>
            <li>Each referral can pay at most once — the ledger reference makes double payment impossible.</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
