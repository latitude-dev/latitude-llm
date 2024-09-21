import { Providers } from '@latitude-data/core/browser'
import { database } from '@latitude-data/core/client'
import { createProject, helpers } from '@latitude-data/core/factories'
import {
  apiKeys,
  commits,
  documentVersions,
  memberships,
  projects,
  providerApiKeys,
  users,
  workspaces,
} from '@latitude-data/core/schema'
import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import setupService from './setupService'

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

    // Check provider API key creation
    const createdProviderApiKey =
      await database.query.providerApiKeys.findFirst({
        // @ts-expect-error - drizzle-orm types are not up to date
        where: eq(providerApiKeys.workspaceId, workspace.id),
      })
    expect(createdProviderApiKey).toBeDefined()
    expect(createdProviderApiKey?.authorId).toBe(user.id)
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
})
