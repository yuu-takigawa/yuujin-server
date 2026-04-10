import assert from 'node:assert';
import { CreditService } from '../app/module/credit/CreditService';

// ── Helpers ──

function mockBone(data: Record<string, unknown>): any {
  return { ...data, getRaw: () => data };
}

function createMockCtx(overrides: {
  users?: Record<string, unknown>[];
  membershipPlans?: Record<string, unknown>[];
}) {
  const users = (overrides.users || []).map(mockBone);
  const membershipPlans = (overrides.membershipPlans || []).map(mockBone);

  const mutations = {
    usersUpdated: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
  };

  return {
    ctx: {
      model: {
        User: {
          findOne: (query: Record<string, unknown>) => {
            return users.find((u) => u.id === query.id) || null;
          },
          update: (where: Record<string, unknown>, data: Record<string, unknown>) => {
            mutations.usersUpdated.push({ where, data });
            // Apply mutation to the mock user for subsequent reads
            const user = users.find((u) => u.id === where.id);
            if (user) {
              Object.assign(user, data);
              // Also update the getRaw result
              user.getRaw = () => ({ ...user });
              delete (user as any).getRaw;
              const raw = { ...user };
              (user as any).getRaw = () => raw;
            }
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

const PLANS = [
  { tier: 'free', dailyCredits: 100 },
  { tier: 'pro', dailyCredits: 500 },
  { tier: 'max', dailyCredits: 2000 },
];

// ── Tests ──

describe('CreditService - membership expiry', () => {
  let service: CreditService;

  beforeEach(() => {
    service = new CreditService();
  });

  it('should return membershipExpiresAt for time-limited pro user', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 15).toISOString();
    const { ctx } = createMockCtx({
      users: [{
        id: 'user-1', membership: 'pro', credits: 400,
        membershipExpiresAt: futureDate, invited: 0,
        creditsResetAt: new Date().toISOString(),
      }],
      membershipPlans: PLANS,
    });

    const result = await service.getCredits(ctx, 'user-1');
    assert.strictEqual(result.membership, 'pro');
    assert.strictEqual(result.credits, 400);
    assert.strictEqual(result.dailyCredits, 500);
    assert.ok(result.membershipExpiresAt);
  });

  it('should return null membershipExpiresAt for permanent pro user', async () => {
    const { ctx } = createMockCtx({
      users: [{
        id: 'user-1', membership: 'pro', credits: 500,
        membershipExpiresAt: null, invited: 1,
        creditsResetAt: new Date().toISOString(),
      }],
      membershipPlans: PLANS,
    });

    const result = await service.getCredits(ctx, 'user-1');
    assert.strictEqual(result.membership, 'pro');
    assert.strictEqual(result.membershipExpiresAt, null);
  });

  it('should auto-downgrade expired membership on getCredits', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
    const { ctx, mutations } = createMockCtx({
      users: [{
        id: 'user-1', membership: 'pro', credits: 400,
        membershipExpiresAt: pastDate, invited: 0,
        creditsResetAt: new Date().toISOString(),
      }],
      membershipPlans: PLANS,
    });

    const result = await service.getCredits(ctx, 'user-1');

    // Should have downgraded
    assert.strictEqual(mutations.usersUpdated.length >= 1, true);
    const downgrade = mutations.usersUpdated.find((u) => u.data.membership === 'free');
    assert.ok(downgrade, 'Should have downgraded to free');
    assert.strictEqual(downgrade!.data.membershipExpiresAt, null);
    assert.strictEqual(downgrade!.data.credits, 100);

    // The returned result should reflect free
    assert.strictEqual(result.membership, 'free');
    assert.strictEqual(result.credits, 100);
  });

  it('should NOT downgrade permanent pro user', async () => {
    const { ctx, mutations } = createMockCtx({
      users: [{
        id: 'user-1', membership: 'pro', credits: 500,
        membershipExpiresAt: null, invited: 1,
        creditsResetAt: new Date().toISOString(),
      }],
      membershipPlans: PLANS,
    });

    const result = await service.getCredits(ctx, 'user-1');
    assert.strictEqual(result.membership, 'pro');
    // No downgrade update should have occurred
    const downgrade = mutations.usersUpdated.find((u) => u.data.membership === 'free');
    assert.ok(!downgrade);
  });

  it('should NOT downgrade admin user', async () => {
    const { ctx, mutations } = createMockCtx({
      users: [{
        id: 'user-1', membership: 'admin', credits: -1,
        membershipExpiresAt: null, invited: 0,
        creditsResetAt: new Date().toISOString(),
      }],
      membershipPlans: PLANS,
    });

    const result = await service.getCredits(ctx, 'user-1');
    assert.strictEqual(result.membership, 'admin');
    assert.strictEqual(result.credits, -1);
  });

  it('should downgrade expired invited user to pro (not free)', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const { ctx, mutations } = createMockCtx({
      users: [{
        id: 'user-1', membership: 'max', credits: 1500,
        membershipExpiresAt: pastDate, invited: 1,
        creditsResetAt: new Date().toISOString(),
      }],
      membershipPlans: PLANS,
    });

    const result = await service.getCredits(ctx, 'user-1');

    const downgrade = mutations.usersUpdated.find((u) => u.data.membership === 'pro');
    assert.ok(downgrade, 'Should have downgraded to pro, not free');
    assert.strictEqual(downgrade!.data.credits, 500);
    assert.strictEqual(result.membership, 'pro');
  });

  it('should set membershipExpiresAt to null on upgradeMembership', async () => {
    const { ctx, mutations } = createMockCtx({
      users: [{
        id: 'user-1', membership: 'free', credits: 100,
        membershipExpiresAt: null, invited: 1,
        creditsResetAt: new Date().toISOString(),
      }],
      membershipPlans: PLANS,
    });

    await service.upgradeMembership(ctx, 'user-1', 'pro');

    const update = mutations.usersUpdated.find((u) => u.data.membership === 'pro');
    assert.ok(update);
    assert.strictEqual(update!.data.membershipExpiresAt, null);
    assert.strictEqual(update!.data.credits, 500);
  });
});
