import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { database, utils } from '@latitude-data/core/client'
import { publisher } from '@latitude-data/core/events/publisher'
import {
  apiKeys,
  memberships,
  providerApiKeys,
  users,
  workspaceOnboarding,
  workspaces,
} from '@latitude-data/core/schema'
import setupServiceGlobal from './setupService'

const mocks = vi.hoisted(() => ({
  claimReward: vi.fn(),
}))
const publisherSpy = vi.spyOn(publisher, 'publishLater')

vi.mock('@latitude-data/core/services/claimedRewards/claim', () => ({
  claimReward: mocks.claimReward,
}))

describe('setupService', () => {
  beforeAll(async () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_PROVIDER_NAME', 'Latitude')
    vi.stubEnv('DEFAULT_PROVIDER_API_KEY', 'default-provider-api-key')
    vi.resetModules()
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('should create all necessary entities when calling setup service', async () => {
    const mod = await import('./setupService')
    const setupService = mod.default
    const result = await setupService({
      email: 'test@example.com',
      name: 'Test User',
      companyName: 'Test Company',
    })

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(result.value?.user).toBeDefined()
    expect(result.value?.workspace).toBeDefined()

    const { user, workspace } = result.value!

    // Check user creation
    const createdUser = await database.query.users.findFirst({
      where: utils.eq(users.id, user.id),
    })
    expect(createdUser).toBeDefined()
    expect(createdUser?.email).toBe('test@example.com')
    expect(createdUser?.name).toBe('Test User')

    // Check workspace creation
    const createdWorkspace = await database.query.workspaces.findFirst({
      where: utils.eq(workspaces.id, workspace.id),
    })
    expect(createdWorkspace).toBeDefined()
    expect(createdWorkspace?.name).toBe('Test Company')

    // Check membership creation
    const createdMembership = await database.query.memberships.findFirst({
      where: utils.eq(memberships.userId, user.id),
    })
    expect(createdMembership).toBeDefined()
    expect(createdMembership?.workspaceId).toBe(workspace.id)

    // Check API key creation
    const createdApiKey = await database.query.apiKeys.findFirst({
      where: utils.eq(apiKeys.workspaceId, workspace.id),
    })
    expect(createdApiKey).toBeDefined()

    // Check provider API key creation when ENV variables are present
    const createdProviderApiKey =
      await database.query.providerApiKeys.findFirst({
        where: utils.eq(providerApiKeys.workspaceId, workspace.id),
      })
    expect(createdProviderApiKey).toBeDefined()
    expect(createdProviderApiKey?.authorId).toBe(user.id)

    // Check onboarding creation
    // TODO(onboarding): change this once we have a new onboarding and we remove feature flag
    const createdOnboarding =
      await database.query.workspaceOnboarding.findFirst({
        where: utils.eq(workspaceOnboarding.workspaceId, workspace.id),
      })
    expect(createdOnboarding).not.toBeDefined()
  })

  it('publishes userCreated event', async () => {
    const result = await setupServiceGlobal({
      email: 'test@example.com',
      name: 'Test User',
      companyName: 'Test Company',
    })

    const user = result.value?.user!

    expect(publisherSpy).toHaveBeenCalledWith({
      type: 'userCreated',
      data: {
        ...user,
        userEmail: user.email,
        workspaceId: result.value?.workspace.id,
      },
    })
  })
})
