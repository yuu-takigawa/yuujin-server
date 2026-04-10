/**
 * membership-expiry — 每小时检查并回退过期的时限会员
 */

import { Subscription } from 'egg';

function boneData(bone: unknown): Record<string, unknown> {
  if (bone && typeof (bone as { getRaw?: () => Record<string, unknown> }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone as Record<string, unknown>;
}

export default class MembershipExpiry extends Subscription {
  static schedule = {
    interval: '1h',
    type: 'worker',
  };

  async subscribe() {
    const { ctx } = this;
    const now = new Date();

    try {
      // Find all users with expired time-limited memberships
      // Leoric: use raw SQL for the comparison
      const expiredUsers = await ctx.model.User.find(
        'membership_expires_at IS NOT NULL AND membership_expires_at < ?',
        now,
      );

      if (!expiredUsers || expiredUsers.length === 0) {
        return;
      }

      // Get free plan credits
      const freePlan = await ctx.model.MembershipPlan.findOne({ tier: 'free' });
      const freeCredits = freePlan ? (boneData(freePlan).dailyCredits as number) : 100;

      let count = 0;
      for (const user of expiredUsers) {
        const userData = boneData(user);
        await ctx.model.User.update({ id: userData.id as string }, {
          membership: 'free',
          membershipExpiresAt: null,
          credits: freeCredits,
          creditsResetAt: new Date(),
        });
        count++;
      }

      if (count > 0) {
        ctx.logger.info('[membership-expiry] Downgraded %d expired memberships', count);
      }
    } catch (err) {
      ctx.logger.error('[membership-expiry] Error:', err);
    }
  }
}
