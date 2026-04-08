import assert from 'node:assert';
import { RedeemService } from '../app/module/redeem/RedeemService';

// ── Helpers ──

/** Create a mock bone record that mimics Leoric's getRaw() pattern */
function mockBone(data: Record<string, unknown>): any {
  return { ...data, getRaw: () => data };
}

/** Build a mock Egg context with model stubs */
function createMockCtx(overrides: {
  redeemCodes?: Record<string, unknown>[];
  redeemLogs?: Record<string, unknown>[];
  users?: Record<string, unknown>[];
  creditLogs?: Record<string, unknown>[];
  membershipPlans?: Record<string, unknown>[];
}) {
  const redeemCodes = (overrides.redeemCodes || []).map(mockBone);
  const redeemLogs = (overrides.redeemLogs || []).map(mockBone);
  const users = (overrides.users || []).map(mockBone);
  const membershipPlans = (overrides.membershipPlans || []).map(mockBone);

  // Track mutations for assertions
  const mutations = {
    redeemLogsCreated: [] as Record<string, unknown>[],
    redeemCodesUpdated: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    usersUpdated: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    creditLogsCreated: [] as Record<string, unknown>[],
  };

  return {
    ctx: {
      model: {
        RedeemCode: {
          findOne: (query: Record<string, unknown>) => {
            return redeemCodes.find(
              (c) => c.code === query.code && (query.isActive === undefined || c.isActive === query.isActive),
            ) || null;
          },
          update: (where: Record<string, unknown>, data: Record<string, unknown>) => {
            mutations.redeemCodesUpdated.push({ where, data });
          },
        },
        RedeemLog: {
          findOne: (query: Record<string, unknown>) => {
            return redeemLogs.find(
              (l) => l.userId === query.userId && l.redeemCodeId === query.redeemCodeId,
            ) || null;
          },
          create: (data: Record<string, unknown>) => {
            mutations.redeemLogsCreated.push(data);
          },
        },
        User: {
          findOne: (query: Record<string, unknown>) => {
            return users.find((u) => u.id === query.id) || null;
          },
          update: (where: Record<string, unknown>, data: Record<string, unknown>) => {
            mutations.usersUpdated.push({ where, data });
          },
        },
        CreditLog: {
          create: (data: Record<string, unknown>) => {
            mutations.creditLogsCreated.push(data);
          },
        },
        MembershipPlan: {
          findOne: (query: Record<string, unknown>) => {
            return membershipPlans.find((p) => p.tier === query.tier) || null;
          },
        },
      },
    } as any,
    mutations,
  };
}

// ── Tests ──

describe('RedeemService', () => {
  let service: RedeemService;

  beforeEach(() => {
    service = new RedeemService();
  });

  // -- Validation tests --

  it('should throw when code does not exist', async () => {
    const { ctx } = createMockCtx({ redeemCodes: [] });
    await assert.rejects(
      () => service.redeem(ctx, 'user-1', 'INVALID'),
      (err: Error) => err.message.includes('存在しない'),
    );
  });

  it('should throw when code is expired', async () => {
    const { ctx } = createMockCtx({
      redeemCodes: [{
        id: 'rc-1', code: 'EXPIRED', reward: { credits: 100 },
        maxUses: 10, usedCount: 0, isActive: 1,
        expiresAt: '2020-01-01T00:00:00Z',
      }],
    });
    await assert.rejects(
      () => service.redeem(ctx, 'user-1', 'expired'),
      (err: Error) => err.message.includes('有効期限'),
    );
  });

  it('should throw when code has reached max uses', async () => {
    const { ctx } = createMockCtx({
      redeemCodes: [{
        id: 'rc-1', code: 'FULL', reward: { credits: 100 },
        maxUses: 5, usedCount: 5, isActive: 1, expiresAt: null,
      }],
    });
    await assert.rejects(
      () => service.redeem(ctx, 'user-1', 'full'),
      (err: Error) => err.message.includes('上限'),
    );
  });

  it('should throw when user already redeemed this code', async () => {
    const { ctx } = createMockCtx({
      redeemCodes: [{
        id: 'rc-1', code: 'USED', reward: { credits: 100 },
        maxUses: 10, usedCount: 1, isActive: 1, expiresAt: null,
      }],
      redeemLogs: [{ userId: 'user-1', redeemCodeId: 'rc-1' }],
    });
    await assert.rejects(
      () => service.redeem(ctx, 'user-1', 'used'),
      (err: Error) => err.message.includes('使用済み'),
    );
  });

  // -- Reward: invited --

  it('should set invited=1 for invite-type codes', async () => {
    const { ctx, mutations } = createMockCtx({
      redeemCodes: [{
        id: 'rc-1', code: 'YUUJIN2026', reward: { invited: true },
        maxUses: 100, usedCount: 17, isActive: 1, expiresAt: null,
      }],
    });

    const result = await service.redeem(ctx, 'user-1', 'yuujin2026');

    assert.deepStrictEqual(result.reward, { invited: true });
    assert.strictEqual(mutations.usersUpdated.length, 1);
    assert.deepStrictEqual(mutations.usersUpdated[0].where, { id: 'user-1' });
    assert.strictEqual(mutations.usersUpdated[0].data.invited, 1);
    // Should record log
    assert.strictEqual(mutations.redeemLogsCreated.length, 1);
    assert.strictEqual(mutations.redeemLogsCreated[0].userId, 'user-1');
    // Should increment used_count
    assert.strictEqual(mutations.redeemCodesUpdated.length, 1);
    assert.strictEqual(mutations.redeemCodesUpdated[0].data.usedCount, 18);
  });

  // -- Reward: credits --

  it('should add credits for credit-type codes', async () => {
    const { ctx, mutations } = createMockCtx({
      redeemCodes: [{
        id: 'rc-2', code: 'BONUS500', reward: { credits: 500 },
        maxUses: 100, usedCount: 0, isActive: 1, expiresAt: null,
      }],
      users: [{ id: 'user-1', credits: 80 }],
    });

    const result = await service.redeem(ctx, 'user-1', 'bonus500');

    assert.deepStrictEqual(result.reward, { credits: 500 });
    // Should update user credits: 80 + 500 = 580
    const userUpdate = mutations.usersUpdated.find((u) => u.data.credits !== undefined);
    assert.ok(userUpdate);
    assert.strictEqual(userUpdate!.data.credits, 580);
    // Should write credit log
    assert.strictEqual(mutations.creditLogsCreated.length, 1);
    assert.strictEqual(mutations.creditLogsCreated[0].amount, 500);
    assert.strictEqual(mutations.creditLogsCreated[0].type, 'redeem');
    assert.strictEqual(mutations.creditLogsCreated[0].balanceAfter, 580);
  });

  // -- Reward: membership --

  it('should upgrade membership for membership-type codes', async () => {
    const { ctx, mutations } = createMockCtx({
      redeemCodes: [{
        id: 'rc-3', code: 'GOPRO', reward: { membership: 'pro' },
        maxUses: 50, usedCount: 0, isActive: 1, expiresAt: null,
      }],
      membershipPlans: [{ tier: 'pro', dailyCredits: 500 }],
    });

    const result = await service.redeem(ctx, 'user-1', 'gopro');

    assert.deepStrictEqual(result.reward, { membership: 'pro' });
    const userUpdate = mutations.usersUpdated.find((u) => u.data.membership !== undefined);
    assert.ok(userUpdate);
    assert.strictEqual(userUpdate!.data.membership, 'pro');
    assert.strictEqual(userUpdate!.data.credits, 500);
  });

  // -- Case insensitivity --

  it('should match codes case-insensitively', async () => {
    const { ctx, mutations } = createMockCtx({
      redeemCodes: [{
        id: 'rc-1', code: 'YUUJIN2026', reward: { invited: true },
        maxUses: 100, usedCount: 0, isActive: 1, expiresAt: null,
      }],
    });

    await service.redeem(ctx, 'user-1', 'Yuujin2026');
    assert.strictEqual(mutations.redeemLogsCreated.length, 1);
  });

  // -- Different user can use the same code --

  it('should allow different users to use the same code', async () => {
    const { ctx, mutations } = createMockCtx({
      redeemCodes: [{
        id: 'rc-1', code: 'SHARED', reward: { invited: true },
        maxUses: 100, usedCount: 1, isActive: 1, expiresAt: null,
      }],
      redeemLogs: [{ userId: 'user-1', redeemCodeId: 'rc-1' }],
    });

    // user-2 should be able to use it
    await service.redeem(ctx, 'user-2', 'shared');
    assert.strictEqual(mutations.redeemLogsCreated.length, 1);
    assert.strictEqual(mutations.redeemLogsCreated[0].userId, 'user-2');
  });

  // -- Non-expired code with future date --

  it('should accept codes with future expiry', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const { ctx, mutations } = createMockCtx({
      redeemCodes: [{
        id: 'rc-1', code: 'FUTURE', reward: { credits: 100 },
        maxUses: 10, usedCount: 0, isActive: 1, expiresAt: futureDate,
      }],
      users: [{ id: 'user-1', credits: 0 }],
    });

    await service.redeem(ctx, 'user-1', 'future');
    assert.strictEqual(mutations.redeemLogsCreated.length, 1);
  });
});
