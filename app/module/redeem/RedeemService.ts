import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import { v4 as uuidv4 } from 'uuid';

function boneData(bone: Record<string, unknown>): Record<string, unknown> {
  if (typeof (bone as { getRaw?: Function }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone;
}

export interface RedeemResult {
  reward: Record<string, unknown>;
  message: string;
}

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class RedeemService {
  /**
   * Validate and redeem a code for the given user.
   * Applies the reward and records usage.
   */
  async redeem(ctx: Context, userId: string, codeStr: string): Promise<RedeemResult> {
    // 1. Find code (case-insensitive)
    const redeemCode = await ctx.model.RedeemCode.findOne({
      code: codeStr.trim().toUpperCase(),
      isActive: 1,
    });
    if (!redeemCode) {
      throw new Error('兑換コードが存在しないか、無効です');
    }

    const data = boneData(redeemCode as Record<string, unknown>);

    // 2. Check expiry
    if (data.expiresAt && new Date(data.expiresAt as string) < new Date()) {
      throw new Error('兑換コードの有効期限が切れています');
    }

    // 3. Check usage limit
    if ((data.usedCount as number) >= (data.maxUses as number)) {
      throw new Error('兑換コードの利用枠が上限に達しました');
    }

    // 4. Check duplicate redemption
    const existingLog = await ctx.model.RedeemLog.findOne({
      userId,
      redeemCodeId: data.id as string,
    });
    if (existingLog) {
      throw new Error('この兑換コードは既に使用済みです');
    }

    // 5. Apply reward
    const reward = data.reward as Record<string, unknown>;
    await this.applyReward(ctx, userId, reward);

    // 6. Record log + increment used_count
    await ctx.model.RedeemLog.create({
      id: uuidv4(),
      userId,
      redeemCodeId: data.id as string,
      reward,
    });

    await ctx.model.RedeemCode.update(
      { id: data.id as string },
      { usedCount: (data.usedCount as number) + 1 },
    );

    return { reward, message: '兑換成功' };
  }

  private async applyReward(ctx: Context, userId: string, reward: Record<string, unknown>) {
    // invited: true → mark user as invited (can upgrade to Pro for free)
    if (reward.invited === true) {
      await ctx.model.User.update({ id: userId }, { invited: 1 });
    }

    // credits: N → add N credits + write credit_log
    if (typeof reward.credits === 'number' && reward.credits > 0) {
      const user = await ctx.model.User.findOne({ id: userId });
      if (!user) return;
      const userData = boneData(user as Record<string, unknown>);
      const currentCredits = (userData.credits as number) || 0;
      const newBalance = currentCredits + (reward.credits as number);
      await ctx.model.User.update({ id: userId }, { credits: newBalance });
      await ctx.model.CreditLog.create({
        id: uuidv4(),
        userId,
        amount: reward.credits as number,
        type: 'redeem',
        description: '兑換コード報酬',
        balanceAfter: newBalance,
      });
    }

    // membership: "pro" → directly upgrade
    if (typeof reward.membership === 'string') {
      const plan = await ctx.model.MembershipPlan.findOne({ tier: reward.membership });
      if (plan) {
        const planData = boneData(plan as Record<string, unknown>);
        await ctx.model.User.update({ id: userId }, {
          membership: reward.membership,
          credits: planData.dailyCredits as number,
          creditsResetAt: new Date(),
        });
      }
    }
  }
}
