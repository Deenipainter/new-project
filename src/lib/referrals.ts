import "server-only";

import { prisma } from "@/lib/db";
import { creditWallet } from "@/lib/wallet";

/**
 * A referral qualifies only after the referred user's FIRST verified wallet
 * funding. The reward is credited at most once (unique ledger reference) and
 * only when REFERRAL_REWARD_KOBO is explicitly configured.
 */
export async function qualifyReferralAndReward(refereeId: string): Promise<{
  qualified: boolean;
  rewarded: boolean;
  rewardKobo: number;
  note?: string;
}> {
  const referral = await prisma.referral.findUnique({ where: { refereeId } });
  if (!referral) return { qualified: false, rewarded: false, rewardKobo: 0 };
  if (referral.qualifiedAt) return { qualified: true, rewarded: Boolean(referral.rewardClaimedAt), rewardKobo: referral.rewardKobo };

  const rewardKobo = Number(process.env.REFERRAL_REWARD_KOBO || 0);

  // Guard against self-referral at the data level as well as at signup.
  const [referralRow, referee] = await Promise.all([
    prisma.referral.update({
      where: { id: referral.id },
      data: { qualifiedAt: new Date(), rewardKobo: Number.isFinite(rewardKobo) ? Math.max(0, rewardKobo) : 0 },
    }),
    prisma.user.findUnique({ where: { id: refereeId }, select: { referredById: true } }),
  ]);

  if (!Number.isFinite(rewardKobo) || rewardKobo <= 0) {
    return {
      qualified: true,
      rewarded: false,
      rewardKobo: 0,
      note: "Referral qualified. No reward is paid until REFERRAL_REWARD_KOBO is configured.",
    };
  }
  if (!referee?.referredById || referee.referredById === refereeId) {
    return { qualified: true, rewarded: false, rewardKobo: 0, note: "Referral could not be validated." };
  }

  try {
    await creditWallet({
      userId: referralRow.referrerId,
      amountKobo: rewardKobo,
      type: "REFERRAL_REWARD",
      narration: "Referral reward for a verified funded referral",
      reference: `REFERRAL-${referralRow.id}`,
      metadata: { referralId: referralRow.id, refereeId },
    });
  } catch (error) {
    const duplicate =
      error instanceof Error && "code" in error && (error as { code?: string }).code === "DUPLICATE_REFERENCE";
    if (!duplicate) throw error;
  }

  await prisma.referral.update({
    where: { id: referralRow.id },
    data: { rewardClaimedAt: new Date() },
  });
  await prisma.auditEvent.create({
    data: {
      action: "referral.reward_paid",
      entity: "Referral",
      entityId: referralRow.id,
      actorRole: "SYSTEM",
      metadata: { amountKobo: rewardKobo, referrerId: referralRow.referrerId },
    },
  });

  return { qualified: true, rewarded: true, rewardKobo };
}
