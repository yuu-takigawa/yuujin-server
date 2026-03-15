import { ContextProto, AccessLevel } from '@eggjs/tegg';
import { Context } from 'egg';
import { v4 as uuidv4 } from 'uuid';

function boneData(bone: Record<string, unknown>): Record<string, unknown> {
  if (typeof (bone as { getRaw?: Function }).getRaw === 'function') {
    return (bone as { getRaw: () => Record<string, unknown> }).getRaw();
  }
  return bone;
}

// Membership tier weight for comparison
const TIER_WEIGHT: Record<string, number> = {
  free: 0,
  basic: 1,
  premium: 2,
  admin: 3,
};

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class CreditService {
  /**
   * Get user's credit balance and membership info
   */
  async getCredits(ctx: Context, userId: string) {
    const user = await ctx.model.User.findOne({ id: userId });
    if (!user) throw new Error('User not found');
    const userData = boneData(user as Record<string, unknown>);

    const membership = (userData.membership as string) || 'free';

    // Get plan info for daily credits
    const plan = await ctx.model.MembershipPlan.findOne({ tier: membership });
    const planData = plan ? boneData(plan as Record<string, unknown>) : null;

    const isAdmin = membership === 'admin';

    return {
      credits: isAdmin ? -1 : (userData.credits as number) || 0,
      dailyCredits: isAdmin ? -1 : (planData?.dailyCredits as number) || 100,
      membership,
      creditsResetAt: userData.creditsResetAt,
    };
  }

  /**
   * Get available AI models for user's membership tier
   */
  async getModels(ctx: Context, userId: string) {
    const user = await ctx.model.User.findOne({ id: userId });
    if (!user) throw new Error('User not found');
    const userData = boneData(user as Record<string, unknown>);
    const membership = (userData.membership as string) || 'free';
    const userWeight = TIER_WEIGHT[membership] ?? 0;

    const models = await ctx.model.AiModel.find({ isActive: 1 }).order('display_order ASC');

    return models.map((m: Record<string, unknown>) => {
      const model = boneData(m);
      const minTier = model.minTier as string;
      const modelWeight = TIER_WEIGHT[minTier] ?? 0;
      return {
        ...model,
        available: userWeight >= modelWeight,
      };
    });
  }

  /**
   * Validate model access and credit sufficiency before chat
   * Returns model info or throws error
   */
  async validateChatCredits(ctx: Context, userId: string, modelId?: string) {
    const user = await ctx.model.User.findOne({ id: userId });
    if (!user) throw new Error('User not found');
    const userData = boneData(user as Record<string, unknown>);
    const membership = (userData.membership as string) || 'free';
    const credits = (userData.credits as number) || 0;
    const isAdmin = membership === 'admin';

    // Determine which model to use
    let model: Record<string, unknown> | null = null;
    if (modelId) {
      const found = await ctx.model.AiModel.findOne({ id: modelId, isActive: 1 });
      if (found) model = boneData(found as Record<string, unknown>);
    }
    if (!model) {
      // Default: best available model for user's tier
      const userWeight = TIER_WEIGHT[membership] ?? 0;
      const allModels = await ctx.model.AiModel.find({ isActive: 1 }).order('display_order ASC');
      for (const m of allModels) {
        const md = boneData(m as Record<string, unknown>);
        const mWeight = TIER_WEIGHT[md.minTier as string] ?? 0;
        if (userWeight >= mWeight) {
          model = md; // Keep iterating to find the highest tier model user can access
        }
      }
    }
    if (!model) throw new Error('No available model');

    const minTier = model.minTier as string;
    const creditsPerChat = model.creditsPerChat as number;
    const userWeight = TIER_WEIGHT[membership] ?? 0;
    const modelWeight = TIER_WEIGHT[minTier] ?? 0;

    // Check tier access
    if (userWeight < modelWeight) {
      throw Object.assign(new Error('Model not available for your membership tier'), {
        code: 'TIER_INSUFFICIENT',
        requiredTier: minTier,
        currentTier: membership,
      });
    }

    // Check credits (admin has unlimited)
    if (!isAdmin && credits < creditsPerChat) {
      throw Object.assign(new Error('Insufficient credits'), {
        code: 'CREDITS_INSUFFICIENT',
        required: creditsPerChat,
        current: credits,
      });
    }

    return {
      model,
      provider: model.provider as string,
      apiModelId: model.modelId as string,
      creditsPerChat,
      isAdmin,
    };
  }

  /**
   * Deduct credits after successful AI response
   */
  async deductCredits(ctx: Context, userId: string, modelId: string, creditsPerChat: number, isAdmin: boolean) {
    if (isAdmin) return; // Admin has unlimited credits

    // Deduct credits
    const user = await ctx.model.User.findOne({ id: userId });
    if (!user) return;
    const userData = boneData(user as Record<string, unknown>);
    const currentCredits = (userData.credits as number) || 0;
    const balanceAfter = Math.max(0, currentCredits - creditsPerChat);

    await ctx.model.User.update({ id: userId }, { credits: balanceAfter });

    // Get model name for log description
    const model = await ctx.model.AiModel.findOne({ id: modelId });
    const modelData = model ? boneData(model as Record<string, unknown>) : null;
    const modelName = (modelData?.name as string) || 'Unknown';

    // Write credit log
    await ctx.model.CreditLog.create({
      id: uuidv4(),
      userId,
      amount: -creditsPerChat,
      type: 'chat_consume',
      description: `${modelName} 対話消耗`,
      modelId,
      balanceAfter,
    });
  }
}
