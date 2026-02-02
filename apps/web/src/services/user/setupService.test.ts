import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { database, utils } from '@latitude-data/core/client'
import { publisher } from '@latitude-data/core/events/publisher'
import { apiKeys } from '@latitude-data/core/schema/models/apiKeys'
import { memberships } from '@latitude-data/core/schema/models/memberships'
import { providerApiKeys } from '@latitude-data/core/schema/models/providerApiKeys'
import { users } from '@latitude-data/core/schema/models/users'
import { workspaceOnboarding } from '@latitude-data/core/schema/models/workspaceOnboarding'
import { workspaces } from '@latitude-data/core/schema/models/workspaces'
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
    const createdUser = await database
      .select()
      .from(users)
      .where(utils.eq(users.id, user.id))
      .then((rows) => rows[0])
    expect(createdUser).toBeDefined()
    expect(createdUser?.email).toBe('test@example.com')
    expect(createdUser?.name).toBe('Test User')

    // Check workspace creation
    const createdWorkspace = await database
      .select()
      .from(workspaces)
      .where(utils.eq(workspaces.id, workspace.id))
      .then((r) => r[0])
    expect(createdWorkspace).toBeDefined()
    expect(createdWorkspace?.name).toBe('Test Company')

    // Check membership creation
    const createdMembership = await database
      .select()
      .from(memberships)
      .where(utils.eq(memberships.userId, user.id))
      .then((r) => r[0])
    expect(createdMembership).toBeDefined()
    expect(createdMembership?.workspaceId).toBe(workspace.id)

    // Check API key creation
    const createdApiKey = await database
      .select()
      .from(apiKeys)
      .where(utils.eq(apiKeys.workspaceId, workspace.id))
      .then((r) => r[0])
    expect(createdApiKey).toBeDefined()

    // Check provider API key creation when ENV variables are present
    const createdProviderApiKey = await database
      .select()
      .from(providerApiKeys)
      .where(utils.eq(providerApiKeys.workspaceId, workspace.id))
      .then((r) => r[0])
    expect(createdProviderApiKey).toBeDefined()
    expect(createdProviderApiKey?.authorId).toBe(user.id)

    // Check onboarding creation
    const createdOnboarding = await database
      .select()
      .from(workspaceOnboarding)
      .where(utils.eq(workspaceOnboarding.workspaceId, workspace.id))
      .then((r) => r[0])
    expect(createdOnboarding).toBeDefined()
    expect(createdOnboarding?.completedAt).toBeNull()
  })

  it('publishes userCreated event', async () => {
    const result = await setupServiceGlobal({
      email: 'test@example.com',
      name: 'Test User',
      companyName: 'Test Company',
    })

    const user = result.value?.user

    if (user) {
      expect(publisherSpy).toHaveBeenCalledWith({
        type: 'userCreated',
        data: {
          ...user,
          userEmail: user.email,
          workspaceId: result.value?.workspace.id,
        },
      })
    } else {
      throw new Error('User was not created')
    }
  })
})
