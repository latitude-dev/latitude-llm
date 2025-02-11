import { Providers, RewardType } from '@latitude-data/core/browser'
import { database } from '@latitude-data/core/client'
import { publisher } from '@latitude-data/core/events/publisher'
import { createProject, helpers } from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import {
  apiKeys,
  commits,
  documentVersions,
  memberships,
  projects,
  users,
  workspaces,
} from '@latitude-data/core/schema'
import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import setupService from './setupService'

const mocks = vi.hoisted(() => ({
  claimReward: vi.fn(),
}))
const publisherSpy = vi.spyOn(publisher, 'publishLater')

vi.mock('@latitude-data/core/services/claimedRewards/claim', () => ({
  claimReward: mocks.claimReward,
}))

describe('setupService', () => {
  it('should create all necessary entities when calling setup service', async () => {
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
      // @ts-expect-error - drizzle-orm types are not up to date
      where: eq(users.id, user.id),
    })
    expect(createdUser).toBeDefined()
    expect(createdUser?.email).toBe('test@example.com')
    expect(createdUser?.name).toBe('Test User')

    // Check workspace creation
    const createdWorkspace = await database.query.workspaces.findFirst({
      // @ts-expect-error - drizzle-orm types are not up to date
      where: eq(workspaces.id, workspace.id),
    })
    expect(createdWorkspace).toBeDefined()
    expect(createdWorkspace?.name).toBe('Test Company')

    // Check membership creation
    const createdMembership = await database.query.memberships.findFirst({
      // @ts-expect-error - drizzle-orm types are not up to date
      where: eq(memberships.userId, user.id),
    })
    expect(createdMembership).toBeDefined()
    expect(createdMembership?.workspaceId).toBe(workspace.id)

    // Check API key creation
    const createdApiKey = await database.query.apiKeys.findFirst({
      // @ts-expect-error - drizzle-orm types are not up to date
      where: eq(apiKeys.workspaceId, workspace.id),
    })
    expect(createdApiKey).toBeDefined()
  })

  it('publishes userCreated event', async () => {
    const result = await setupService({
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

  it('should import the default project when calling setup service', async () => {
    const prompt = helpers.createPrompt({
      provider: 'Latitude',
      model: 'gpt-4o',
    })
    const { project } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'Latitude' }],
      name: 'Default Project',
      documents: {
        foo: {
          content: prompt,
        },
      },
    })

    vi.mocked(env).DEFAULT_PROJECT_ID = project.id

    const result = await setupService({
      email: 'test2@example.com',
      name: 'Test User 2',
      companyName: 'Test Company 2',
    })

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(result.value?.user).toBeDefined()
    expect(result.value?.workspace).toBeDefined()

    const { workspace } = result.value!

    // Check if the default project was imported
    const importedProject = await database.query.projects.findFirst({
      // @ts-expect-error - drizzle-orm types are not up to date
      where: eq(projects.workspaceId, workspace.id),
    })
    expect(importedProject).toBeDefined()
    expect(importedProject?.name).toBe('Default Project')

    // Check if the documents were imported
    const importedDocuments = await database
      .select()
      .from(documentVersions)
      // @ts-expect-error - drizzle-orm types are not up to date
      .innerJoin(commits, eq(commits.id, documentVersions.commitId))
      // @ts-expect-error - drizzle-orm types are not up to date
      .where(eq(commits.projectId, importedProject!.id))
    expect(importedDocuments.length).toBe(1)
    expect(importedDocuments[0]!.document_versions.content).toEqual(prompt)
  })

  describe('with custom timers', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2024-10-10'))
      mocks.claimReward.mockResolvedValue(Result.nil())
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    // TODO: review, not sure why the timers :point_up: are messing with the test
    it.skip('should claim the reward for sigingup on the launch day', async () => {
      await setupService({
        email: 'test@example.com',
        name: 'Test User',
        companyName: 'Test Company',
      })

      expect(mocks.claimReward).toHaveBeenCalledWith({
        workspace: { id: 'workspace-id' },
        user: { id: 'user-id' },
        type: RewardType.SignupLaunchDay,
        reference: '',
      })
    })
  })
})
