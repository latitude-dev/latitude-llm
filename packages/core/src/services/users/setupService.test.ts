import { beforeEach, describe, expect, it, vi } from 'vitest'

import setupService, { NEW_SIGNUPS_DISABLED_MESSAGE } from './setupService'
import { SubscriptionPlan } from '../../plans'
import { unsafelyFindUserByEmail } from '../../queries/users/findByEmail'
import * as envModule from '@latitude-data/env'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('setupService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    vi.spyOn(envModule, 'env', 'get').mockReturnValue({
      ...envModule.env,
      LATITUDE_ENTERPRISE_MODE: false,
    } as typeof envModule.env)
  })

  it('creates a user with the correct data', async () => {
    const result = await setupService({
      email: 'test@example.com',
      name: 'Test User',
      companyName: 'Test Company',
      defaultProviderName: 'OpenAI',
      defaultProviderApiKey: 'test-api-key',
    })

    expect(result.ok).toBe(true)
    const { user, workspace } = result.unwrap()

    expect(user.email).toBe('test@example.com')
    expect(user.name).toBe('Test User')
    expect(workspace.name).toBe('Test Company')
  })

  it('creates workspace with subscription', async () => {
    const result = await setupService({
      email: 'test2@example.com',
      name: 'Test User 2',
      companyName: 'Test Company 2',
      defaultProviderName: 'OpenAI',
      defaultProviderApiKey: 'test-api-key',
    })

    expect(result.ok).toBe(true)
    const { workspace } = result.unwrap()

    expect(workspace.currentSubscription).toBeDefined()
    expect(workspace.currentSubscription.plan).toBeDefined()
  })

  describe('when LATITUDE_CLOUD is true', () => {
    it('does not create a user and returns an error', async () => {
      vi.spyOn(envModule, 'env', 'get').mockReturnValue({
        ...envModule.env,
        LATITUDE_CLOUD: true,
      } as typeof envModule.env)

      const result = await setupService({
        email: 'cloud-blocked@example.com',
        name: 'Blocked User',
        companyName: 'Blocked Company',
        defaultProviderName: 'OpenAI',
        defaultProviderApiKey: 'test-api-key',
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toBe(NEW_SIGNUPS_DISABLED_MESSAGE)

      const user = await unsafelyFindUserByEmail({
        email: 'cloud-blocked@example.com',
      })
      expect(user).toBeNull()
    })
  })

  describe('when LATITUDE_ENTERPRISE_MODE is false', () => {
    it('creates user with admin=false and hobby plan', async () => {
      vi.spyOn(envModule, 'env', 'get').mockReturnValue({
        ...envModule.env,
        LATITUDE_ENTERPRISE_MODE: false,
      } as typeof envModule.env)

      const result = await setupService({
        email: 'test3@example.com',
        name: 'Test User 3',
        companyName: 'Test Company 3',
        defaultProviderName: 'OpenAI',
        defaultProviderApiKey: 'test-api-key',
      })

      expect(result.ok).toBe(true)
      const { user, workspace } = result.unwrap()

      expect(user.admin).toBe(false)
      expect(workspace.currentSubscription.plan).toBe(SubscriptionPlan.HobbyV3)
    })
  })

  describe('when LATITUDE_ENTERPRISE_MODE is true', () => {
    beforeEach(() => {
      vi.spyOn(envModule, 'env', 'get').mockReturnValue({
        ...envModule.env,
        LATITUDE_ENTERPRISE_MODE: true,
      } as typeof envModule.env)
    })

    it('creates the first user with admin=true and enterprise plan', async () => {
      const result = await setupService({
        email: 'enterprise@example.com',
        name: 'Enterprise User',
        companyName: 'Enterprise Company',
        defaultProviderName: 'OpenAI',
        defaultProviderApiKey: 'test-api-key',
      })

      expect(result.ok).toBe(true)
      const { user, workspace } = result.unwrap()

      expect(user.admin).toBe(true)
      expect(workspace.currentSubscription.plan).toBe(
        SubscriptionPlan.EnterpriseV1,
      )
    })

    it('does not make subsequent users admin', async () => {
      const first = await setupService({
        email: 'first-enterprise@example.com',
        name: 'First Enterprise User',
        companyName: 'First Enterprise Company',
        defaultProviderName: 'OpenAI',
        defaultProviderApiKey: 'test-api-key',
      }).then((r) => r.unwrap())

      const second = await setupService({
        email: 'second-enterprise@example.com',
        name: 'Second Enterprise User',
        companyName: 'Second Enterprise Company',
        defaultProviderName: 'OpenAI',
        defaultProviderApiKey: 'test-api-key',
      }).then((r) => r.unwrap())

      expect(first.user.admin).toBe(true)
      expect(second.user.admin).toBe(false)
    })
  })
})
