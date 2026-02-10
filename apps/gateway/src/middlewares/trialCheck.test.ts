import { describe, expect, it, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { SubscriptionPlan } from '@latitude-data/core/plans'
import { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'

import {
  createTrialCheckMiddleware,
  skipTrialCheckFor,
  resetTrialCheckSkips,
} from './trialCheck'
import errorHandlerMiddleware from './errorHandler'

const DAY_MS = 24 * 60 * 60 * 1000

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS)
}

function createMockWorkspace(
  overrides: Partial<{
    plan: SubscriptionPlan
    trialEndsAt: Date | null
  }> = {},
): WorkspaceDto {
  return {
    id: 1,
    uuid: 'test-workspace-uuid',
    name: 'Test Workspace',
    creatorId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    currentSubscriptionId: 1,
    defaultProviderId: null,
    stripeCustomerId: null,
    isBigAccount: false,
    hasBillingPortal: false,
    currentSubscription: {
      id: 1,
      workspaceId: 1,
      plan: overrides.plan ?? SubscriptionPlan.HobbyV3,
      trialEndsAt: overrides.trialEndsAt ?? null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }
}

function createTestApp(workspace: WorkspaceDto) {
  const app = new OpenAPIHono()

  app.use(async (c, next) => {
    c.set('workspace', workspace)
    await next()
  })

  app.use(createTrialCheckMiddleware(app))
  app.get('/test', (c) => c.json({ ok: true }))
  app.onError(errorHandlerMiddleware)

  return app
}

describe('trialCheckMiddleware', () => {
  beforeEach(() => {
    resetTrialCheckSkips()
  })

  describe('trial subscription', () => {
    it('allows request when trial has not expired', async () => {
      const workspace = createMockWorkspace({
        plan: SubscriptionPlan.HobbyV3,
        trialEndsAt: daysFromNow(10),
      })
      const app = createTestApp(workspace)

      const res = await app.request('/test')

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ ok: true })
    })

    it('returns 402 when trial has expired', async () => {
      const workspace = createMockWorkspace({
        plan: SubscriptionPlan.HobbyV3,
        trialEndsAt: daysFromNow(-1),
      })
      const app = createTestApp(workspace)

      const res = await app.request('/test')

      expect(res.status).toBe(402)
      await expect(res.json()).resolves.toMatchObject({
        name: 'PaymentRequiredError',
        message:
          'Your trial has ended. Please upgrade to continue using Latitude.',
      })
    })
  })

  describe('paying subscription', () => {
    it('allows request for paying plan (TeamV4)', async () => {
      const workspace = createMockWorkspace({
        plan: SubscriptionPlan.TeamV4,
        trialEndsAt: null,
      })
      const app = createTestApp(workspace)

      const res = await app.request('/test')

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ ok: true })
    })

    it('allows request for enterprise plan', async () => {
      const workspace = createMockWorkspace({
        plan: SubscriptionPlan.EnterpriseV1,
        trialEndsAt: null,
      })
      const app = createTestApp(workspace)

      const res = await app.request('/test')

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ ok: true })
    })
  })

  describe('skipTrialCheckFor', () => {
    it('skips trial check for a specific path', async () => {
      const workspace = createMockWorkspace({
        plan: SubscriptionPlan.HobbyV3,
        trialEndsAt: daysFromNow(-1),
      })

      skipTrialCheckFor(['/api/v3/skipped'])

      const app = new OpenAPIHono()
      app.use(async (c, next) => {
        c.set('workspace', workspace)
        await next()
      })

      app.use(createTrialCheckMiddleware(app))

      app.get('/api/v3/skipped', (c) => c.json({ ok: true }))
      app.get('/api/v3/protected', (c) => c.json({ ok: true }))
      app.onError(errorHandlerMiddleware)

      const skippedRes = await app.request('/api/v3/skipped')
      expect(skippedRes.status).toBe(200)
      await expect(skippedRes.json()).resolves.toEqual({ ok: true })

      const protectedRes = await app.request('/api/v3/protected')
      expect(protectedRes.status).toBe(402)
    })

    it('skips trial check for multiple paths', async () => {
      const workspace = createMockWorkspace({
        plan: SubscriptionPlan.HobbyV3,
        trialEndsAt: daysFromNow(-1),
      })

      skipTrialCheckFor(['/api/v3/public/route1', '/api/v3/public/route2'])

      const app = new OpenAPIHono()
      app.use(async (c, next) => {
        c.set('workspace', workspace)
        await next()
      })

      app.use(createTrialCheckMiddleware(app))

      app.get('/api/v3/public/route1', (c) => c.json({ route: 1 }))
      app.get('/api/v3/public/route2', (c) => c.json({ route: 2 }))
      app.get('/api/v3/protected', (c) => c.json({ ok: true }))
      app.onError(errorHandlerMiddleware)

      const route1Res = await app.request('/api/v3/public/route1')
      expect(route1Res.status).toBe(200)
      await expect(route1Res.json()).resolves.toEqual({ route: 1 })

      const route2Res = await app.request('/api/v3/public/route2')
      expect(route2Res.status).toBe(200)
      await expect(route2Res.json()).resolves.toEqual({ route: 2 })

      const protectedRes = await app.request('/api/v3/protected')
      expect(protectedRes.status).toBe(402)
    })
  })
})
