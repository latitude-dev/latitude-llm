import { addDays } from 'date-fns'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { SubscriptionPlan, TRIAL_DAYS } from '../../plans'
import { Workspace } from '../../schema/models/types/Workspace'
import { createWorkspace } from '../../tests/factories'
import { createSubscription } from './create'

const NOW = new Date('2025-01-15T12:00:00Z')

describe('createSubscription', () => {
  let workspace: Workspace

  beforeAll(async () => {
    const result = await createWorkspace()
    workspace = result.workspace
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('free plans (with trial)', () => {
    it('creates subscription with trial end date for HobbyV3', async () => {
      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.HobbyV3,
      }).then((r) => r.unwrap())

      expect(subscription).toEqual(
        expect.objectContaining({
          plan: SubscriptionPlan.HobbyV3,
          workspaceId: workspace.id,
          trialEndsAt: addDays(NOW, TRIAL_DAYS),
          cancelledAt: null,
        }),
      )
    })

    it('creates subscription with trial end date for HobbyV2', async () => {
      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.HobbyV2,
      }).then((r) => r.unwrap())

      expect(subscription).toEqual(
        expect.objectContaining({
          plan: SubscriptionPlan.HobbyV2,
          workspaceId: workspace.id,
          trialEndsAt: addDays(NOW, TRIAL_DAYS),
        }),
      )
    })

    it('creates subscription with trial end date for HobbyV1', async () => {
      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.HobbyV1,
      }).then((r) => r.unwrap())

      expect(subscription).toEqual(
        expect.objectContaining({
          plan: SubscriptionPlan.HobbyV1,
          workspaceId: workspace.id,
          trialEndsAt: addDays(NOW, TRIAL_DAYS),
        }),
      )
    })
  })

  describe('paid plans (no trial)', () => {
    it('creates subscription without trial end date for TeamV4', async () => {
      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.TeamV4,
      }).then((r) => r.unwrap())

      expect(subscription).toEqual(
        expect.objectContaining({
          plan: SubscriptionPlan.TeamV4,
          workspaceId: workspace.id,
          trialEndsAt: null,
          cancelledAt: null,
        }),
      )
    })

    it('creates subscription without trial end date for TeamV3', async () => {
      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.TeamV3,
      }).then((r) => r.unwrap())

      expect(subscription).toEqual(
        expect.objectContaining({
          plan: SubscriptionPlan.TeamV3,
          workspaceId: workspace.id,
          trialEndsAt: null,
        }),
      )
    })

    it('creates subscription without trial end date for ProV2', async () => {
      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.ProV2,
      }).then((r) => r.unwrap())

      expect(subscription).toEqual(
        expect.objectContaining({
          plan: SubscriptionPlan.ProV2,
          workspaceId: workspace.id,
          trialEndsAt: null,
        }),
      )
    })
  })

  describe('createWithTrialExpired option', () => {
    it('creates free plan subscription with expired trial when createWithTrialExpired is true', async () => {
      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.HobbyV3,
        createWithTrialExpired: true,
      }).then((r) => r.unwrap())

      expect(subscription).toEqual(
        expect.objectContaining({
          plan: SubscriptionPlan.HobbyV3,
          workspaceId: workspace.id,
          trialEndsAt: NOW,
        }),
      )
    })

    it('creates paid plan subscription with expired trial when createWithTrialExpired is true', async () => {
      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.TeamV4,
        createWithTrialExpired: true,
      }).then((r) => r.unwrap())

      expect(subscription).toEqual(
        expect.objectContaining({
          plan: SubscriptionPlan.TeamV4,
          workspaceId: workspace.id,
          trialEndsAt: NOW,
        }),
      )
    })
  })

  describe('custom createdAt', () => {
    it('creates subscription with custom createdAt date', async () => {
      const customDate = new Date('2024-01-15T10:00:00Z')

      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.TeamV4,
        createdAt: customDate,
      }).then((r) => r.unwrap())

      expect(subscription).toEqual(
        expect.objectContaining({
          plan: SubscriptionPlan.TeamV4,
          workspaceId: workspace.id,
          createdAt: customDate,
        }),
      )
    })

    it('uses database default when createdAt is not provided', async () => {
      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.TeamV4,
      }).then((r) => r.unwrap())

      expect(subscription.createdAt).toBeInstanceOf(Date)
    })
  })

  describe('subscription data', () => {
    it('creates subscription linked to workspace', async () => {
      const subscription = await createSubscription({
        workspace,
        plan: SubscriptionPlan.TeamV4,
      }).then((r) => r.unwrap())

      expect(subscription).toEqual(
        expect.objectContaining({
          workspaceId: workspace.id,
          plan: SubscriptionPlan.TeamV4,
          cancelledAt: null,
        }),
      )
      expect(subscription.id).toBeDefined()
    })

    it('creates multiple subscriptions for the same workspace', async () => {
      const subscription1 = await createSubscription({
        workspace,
        plan: SubscriptionPlan.HobbyV3,
      }).then((r) => r.unwrap())

      const subscription2 = await createSubscription({
        workspace,
        plan: SubscriptionPlan.TeamV4,
      }).then((r) => r.unwrap())

      expect(subscription1).toEqual(
        expect.objectContaining({
          workspaceId: workspace.id,
          plan: SubscriptionPlan.HobbyV3,
        }),
      )
      expect(subscription2).toEqual(
        expect.objectContaining({
          workspaceId: workspace.id,
          plan: SubscriptionPlan.TeamV4,
        }),
      )
      expect(subscription1.id).not.toBe(subscription2.id)
    })
  })
})
