import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { CommitsRepository, EvaluationsV2Repository } from '../../repositories'
import * as factories from '../../tests/factories'
import { createOnboardingProject } from './createOnboardingProject'

describe('createOnboardingProject', () => {
  let workspace: Workspace
  let user: User

  beforeEach(async () => {
    const setup = await factories.createProject({
      providers: [],
    })
    workspace = setup.workspace
    user = setup.user
  })

  it('creates an onboarding project with name "Onboarding"', async () => {
    // Create a provider so demo evaluation can be created
    await factories.createProviderApiKey({
      workspace,
      user,
      type: Providers.OpenAI,
      name: 'openai',
    })

    const result = await createOnboardingProject({
      workspace,
      user,
    })

    expect(result.ok).toBe(true)
    const { project, documents, commit } = result.unwrap()

    expect(project.name).toBe('Onboarding')
    expect(project.workspaceId).toBe(workspace.id)

    // creates a document with path "onboarding"
    expect(documents).toHaveLength(1)
    expect(documents[0]!.path).toBe('onboarding')

    // creates a commit associated with the project
    expect(commit.projectId).toBe(project.id)
    expect(commit.title).toBe('Initial version')
    expect(commit.version).toBe(0)

    // creates a demo evaluation associated with the document
    const evaluationsRepo = new EvaluationsV2Repository(workspace.id)
    const evaluations = await evaluationsRepo
      .listAtCommitByDocument({
        commitUuid: commit.uuid,
        documentUuid: documents[0]!.documentUuid,
        projectId: commit.projectId,
      })
      .then((r) => r.unwrap())

    expect(evaluations.length).toBeGreaterThan(0)
    const demoEvaluation = evaluations.find(
      (e) => e.documentUuid === documents[0]!.documentUuid,
    )
    expect(demoEvaluation).toBeDefined()
  })

  describe('error handling', () => {
    it('returns error if createNewDocument fails', async () => {
      // Create a project first so we can mock createNewDocument
      const { project, commit } = await factories.createProject({
        workspace,
        providers: [],
      })

      const createNewDocumentSpy = vi.spyOn(
        await import('../documents/create'),
        'createNewDocument',
      )

      createNewDocumentSpy.mockResolvedValueOnce(
        Result.error(
          new BadRequestError('A document with the same path already exists'),
        ),
      )

      // Mock createProject to return our existing project
      const createProjectSpy = vi.spyOn(
        await import('./create'),
        'createProject',
      )
      createProjectSpy.mockResolvedValueOnce(Result.ok({ project, commit }))

      const result = await createOnboardingProject({
        workspace,
        user,
      })

      expect(result.ok).toBe(false)
      expect(result.error?.message).toBe(
        'A document with the same path already exists',
      )

      createNewDocumentSpy.mockRestore()
      createProjectSpy.mockRestore()
    })
  })

  describe('integration', () => {
    it('creates a complete onboarding project setup', async () => {
      const result = await createOnboardingProject({
        workspace,
        user,
      })

      expect(result.ok).toBe(true)
      const { project, documents, commit } = result.unwrap()

      // Verify project exists and is accessible
      const commitsRepo = new CommitsRepository(workspace.id)
      const retrievedCommit = await commitsRepo
        .getCommitById(commit.id)
        .then((r) => r.unwrap())

      expect(retrievedCommit).toBeDefined()
      expect(retrievedCommit.projectId).toBe(project.id)

      // Verify document exists
      expect(documents[0]!).toBeDefined()
      expect(documents[0]!.path).toBe('onboarding')
      expect(documents[0]!.commitId).toBe(commit.id)
    })
  })
})
