import { beforeEach, describe, expect, it } from 'vitest'
import { Providers } from '@latitude-data/constants'
import type { Commit } from '../schema/models/types/Commit'
import type { DocumentVersion } from '../schema/models/types/DocumentVersion'
import type { Workspace } from '../schema/models/types/Workspace'
import type { Project } from '../schema/models/types/Project'
import * as factories from '../tests/factories'
import { DeploymentTestsRepository } from './deploymentTestsRepository'
import { database } from '../client'
import { deploymentTests } from '../schema/models/deploymentTests'
import { randomUUID } from 'crypto'

describe('DeploymentTestsRepository', () => {
  let workspace: Workspace
  let project: Project
  let document: DocumentVersion
  let baselineCommit: Commit
  let challengerCommit: Commit
  let repo: DeploymentTestsRepository

  beforeEach(async () => {
    const {
      workspace: createdWorkspace,
      project: createdProject,
      commit: createdCommit,
      documents,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'baseline content',
        }),
      },
    })
    workspace = createdWorkspace
    project = createdProject
    document = documents[0]!
    baselineCommit = createdCommit

    // Create challenger commit
    const { commit: createdChallengerCommit } = await factories.createDraft({
      project,
      user: await factories.createUser(),
    })
    challengerCommit = createdChallengerCommit

    repo = new DeploymentTestsRepository(workspace.id)
  })

  describe('findActiveForDocument', () => {
    it('returns null when no test exists for document', async () => {
      const result = await repo.findActiveForDocument(
        project.id,
        document.documentUuid,
      )

      expect(result).toBeNull()
    })

    it('returns active shadow test for document', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const result = await repo.findActiveForDocument(
        project.id,
        document.documentUuid,
      )

      expect(result).not.toBeNull()
      expect(result?.uuid).toBe(testUuid)
      expect(result?.testType).toBe('shadow')
      expect(result?.status).toBe('running')
    })

    it('returns active A/B test for document', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
        trafficPercentage: 50,
        status: 'running',
      })

      const result = await repo.findActiveForDocument(
        project.id,
        document.documentUuid,
      )

      expect(result).not.toBeNull()
      expect(result?.uuid).toBe(testUuid)
      expect(result?.testType).toBe('ab')
      expect(result?.trafficPercentage).toBe(50)
    })

    it('returns pending test as active', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'pending',
      })

      const result = await repo.findActiveForDocument(
        project.id,
        document.documentUuid,
      )

      expect(result).not.toBeNull()
      expect(result?.status).toBe('pending')
    })

    it('returns paused test as active', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'paused',
      })

      const result = await repo.findActiveForDocument(
        project.id,
        document.documentUuid,
      )

      expect(result).not.toBeNull()
      expect(result?.status).toBe('paused')
    })

    it('does not return completed test', async () => {
      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'completed',
      })

      const result = await repo.findActiveForDocument(
        project.id,
        document.documentUuid,
      )

      expect(result).toBeNull()
    })

    it('does not return cancelled test', async () => {
      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'cancelled',
      })

      const result = await repo.findActiveForDocument(
        project.id,
        document.documentUuid,
      )

      expect(result).toBeNull()
    })

    it('does not return deleted test', async () => {
      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
        deletedAt: new Date(),
      })

      const result = await repo.findActiveForDocument(
        project.id,
        document.documentUuid,
      )

      expect(result).toBeNull()
    })

    it('returns only tests for the specified document', async () => {
      const otherDocumentUuid = randomUUID()

      // Create test for other document
      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: otherDocumentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const result = await repo.findActiveForDocument(
        project.id,
        document.documentUuid,
      )

      expect(result).toBeNull()
    })

    it('respects workspace isolation', async () => {
      const otherWorkspace = await factories.createWorkspace()
      const otherRepo = new DeploymentTestsRepository(
        otherWorkspace.workspace.id,
      )

      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const result = await otherRepo.findActiveForDocument(
        project.id,
        document.documentUuid,
      )

      expect(result).toBeNull()
    })
  })

  describe('findByUuid', () => {
    it('returns test by UUID', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const result = await repo.findByUuid(testUuid)

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value!.uuid).toBe(testUuid)
    })

    it('returns error when test not found', async () => {
      const nonExistentUuid = randomUUID()

      const result = await repo.findByUuid(nonExistentUuid)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error?.message).toContain('not found')
    })

    it('does not return deleted test', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
        deletedAt: new Date(),
      })

      const result = await repo.findByUuid(testUuid)

      expect(result.ok).toBe(false)
    })

    it('respects workspace isolation', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const otherWorkspace = await factories.createWorkspace()
      const otherRepo = new DeploymentTestsRepository(
        otherWorkspace.workspace.id,
      )
      const result = await otherRepo.findByUuid(testUuid)

      expect(result.ok).toBe(false)
    })
  })

  describe('listByProject', () => {
    it('returns empty array when no tests exist', async () => {
      const result = await repo.listByProject(project.id)

      expect(result).toEqual([])
    })

    it('returns all tests for project', async () => {
      const test1Uuid = randomUUID()
      const test2Uuid = randomUUID()

      await database.insert(deploymentTests).values([
        {
          uuid: test1Uuid,
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: document.documentUuid,
          baselineCommitId: baselineCommit.id,
          challengerCommitId: challengerCommit.id,
          testType: 'shadow',
          status: 'running',
        },
        {
          uuid: test2Uuid,
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: document.documentUuid,
          baselineCommitId: baselineCommit.id,
          challengerCommitId: challengerCommit.id,
          testType: 'ab',
          status: 'completed',
        },
      ])

      const result = await repo.listByProject(project.id)

      expect(result).toHaveLength(2)
      expect(result.map((t) => t.uuid)).toContain(test1Uuid)
      expect(result.map((t) => t.uuid)).toContain(test2Uuid)
    })

    it('returns tests in creation order', async () => {
      const test1Uuid = randomUUID()
      const test2Uuid = randomUUID()

      // Insert in specific order
      await database.insert(deploymentTests).values({
        uuid: test1Uuid,
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'completed', // Not active, so no conflict
        createdAt: new Date('2024-01-01'),
      })

      await database.insert(deploymentTests).values({
        uuid: test2Uuid,
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
        status: 'running',
        createdAt: new Date('2024-01-02'),
      })

      const result = await repo.listByProject(project.id)

      expect(result).toHaveLength(2)
      expect(result[0]?.uuid).toBe(test1Uuid)
      expect(result[1]?.uuid).toBe(test2Uuid)
    })

    it('does not return deleted tests', async () => {
      await database.insert(deploymentTests).values([
        {
          uuid: randomUUID(),
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: document.documentUuid,
          baselineCommitId: baselineCommit.id,
          challengerCommitId: challengerCommit.id,
          testType: 'shadow',
          status: 'running',
        },
        {
          uuid: randomUUID(),
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: document.documentUuid,
          baselineCommitId: baselineCommit.id,
          challengerCommitId: challengerCommit.id,
          testType: 'ab',
          status: 'running',
          deletedAt: new Date(),
        },
      ])

      const result = await repo.listByProject(project.id)

      expect(result).toHaveLength(1)
    })

    it('respects workspace isolation', async () => {
      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const otherWorkspace = await factories.createWorkspace()
      const otherRepo = new DeploymentTestsRepository(
        otherWorkspace.workspace.id,
      )
      const result = await otherRepo.listByProject(project.id)

      expect(result).toEqual([])
    })

    it('returns tests with all relevant fields', async () => {
      const testUuid = randomUUID()
      const name = 'Test shadow deployment'
      const description = 'Testing new model'

      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: baselineCommit.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
        name,
        description,
        trafficPercentage: 30,
      })

      const result = await repo.listByProject(project.id)

      expect(result).toHaveLength(1)
      const test = result[0]!
      expect(test.uuid).toBe(testUuid)
      expect(test.name).toBe(name)
      expect(test.description).toBe(description)
      expect(test.trafficPercentage).toBe(30)
      expect(test.baselineCommitId).toBe(baselineCommit.id)
      expect(test.challengerCommitId).toBe(challengerCommit.id)
    })
  })
})
