import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { Providers } from '@latitude-data/core/browser'
import { database, dbUtils } from '@latitude-data/core/client'
import { publisher } from '@latitude-data/core/events/publisher'
import * as factories from '@latitude-data/core/factories'
import {
  apiKeys,
  commits,
  documentVersions,
  evaluations,
  memberships,
  projects,
  providerApiKeys,
  users,
  workspaces,
} from '@latitude-data/core/schema'
import { env } from '@latitude-data/env'
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
    const { project: defaultProject } = await factories.createProject()

    vi.stubEnv('DEFAULT_PROJECT_ID', defaultProject.id.toString())
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
      importDefaultProject: false,
    })

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(result.value?.user).toBeDefined()
    expect(result.value?.workspace).toBeDefined()

    const { user, workspace } = result.value!

    // Check user creation
    const createdUser = await database.query.users.findFirst({
      where: dbUtils.eq(users.id, user.id),
    })
    expect(createdUser).toBeDefined()
    expect(createdUser?.email).toBe('test@example.com')
    expect(createdUser?.name).toBe('Test User')

    // Check workspace creation
    const createdWorkspace = await database.query.workspaces.findFirst({
      where: dbUtils.eq(workspaces.id, workspace.id),
    })
    expect(createdWorkspace).toBeDefined()
    expect(createdWorkspace?.name).toBe('Test Company')

    // Check membership creation
    const createdMembership = await database.query.memberships.findFirst({
      where: dbUtils.eq(memberships.userId, user.id),
    })
    expect(createdMembership).toBeDefined()
    expect(createdMembership?.workspaceId).toBe(workspace.id)

    // Check API key creation
    const createdApiKey = await database.query.apiKeys.findFirst({
      where: dbUtils.eq(apiKeys.workspaceId, workspace.id),
    })
    expect(createdApiKey).toBeDefined()

    // Check provider API key creation when ENV variables are present
    const createdProviderApiKey =
      await database.query.providerApiKeys.findFirst({
        where: dbUtils.eq(providerApiKeys.workspaceId, workspace.id),
      })
    expect(createdProviderApiKey).toBeDefined()
    expect(createdProviderApiKey?.authorId).toBe(user.id)

    // Check if onboarding evaluation was created
    const createdEvaluation = await database.query.evaluationVersions.findFirst(
      {
        where: dbUtils.eq(evaluations.workspaceId, workspace.id),
      },
    )
    expect(createdEvaluation).toBeDefined()
  })

  it('publishes userCreated event', async () => {
    const result = await setupServiceGlobal({
      email: 'test@example.com',
      name: 'Test User',
      companyName: 'Test Company',
      importDefaultProject: false,
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
    const prompt = factories.helpers.createPrompt({
      provider: 'Latitude',
      model: 'gpt-4o',
    })
    const { project } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'Latitude' }],
      name: 'Default Project',
      documents: {
        onboarding: prompt,
      },
    })

    vi.mocked(env).DEFAULT_PROJECT_ID = project.id

    const result = await setupServiceGlobal({
      email: 'test2@example.com',
      name: 'Test User 2',
      companyName: 'Test Company 2',
      importDefaultProject: true,
    })

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(result.value?.user).toBeDefined()
    expect(result.value?.workspace).toBeDefined()

    const { workspace } = result.value!

    // Check if the default project was imported
    const importedProject = await database.query.projects.findFirst({
      where: dbUtils.eq(projects.workspaceId, workspace.id),
    })
    expect(importedProject).toBeDefined()
    expect(importedProject?.name).toBe('Default Project')

    // Check if the documents were imported
    const importedDocuments = await database
      .select()
      .from(documentVersions)
      .innerJoin(commits, dbUtils.eq(commits.id, documentVersions.commitId))
      .where(dbUtils.eq(commits.projectId, importedProject!.id))
    expect(importedDocuments.length).toBe(1)
    expect(importedDocuments[0]!.document_versions.content).toEqual(prompt)

    // Check if onboarding evaluation was created
    const createdEvaluation = await database.query.evaluationVersions.findFirst(
      {
        where: dbUtils.eq(evaluations.workspaceId, workspace.id),
      },
    )
    expect(createdEvaluation).toBeDefined()
  })
})
