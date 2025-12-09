import { describe, it, expect, beforeEach } from 'vitest'
import { Providers } from '@latitude-data/constants'
import type { Commit } from '../schema/models/types/Commit'
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
  let baselineCommit: Commit
  let challengerCommit: Commit
  let otherCommit: Commit
  let repo: DeploymentTestsRepository

  beforeEach(async () => {
    const {
      workspace: createdWorkspace,
      project: createdProject,
      commit: createdCommit,
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
    baselineCommit = createdCommit

    // Create challenger commit
    const { commit: createdChallengerCommit } = await factories.createDraft({
      project,
      user: await factories.createUser(),
    })
    challengerCommit = createdChallengerCommit

    // Create another commit
    const { commit: createdOtherCommit } = await factories.createDraft({
      project,
      user: await factories.createUser(),
    })
    otherCommit = createdOtherCommit

    repo = new DeploymentTestsRepository(workspace.id)
  })

  describe('findActiveForCommit', () => {
    it('returns null when no test exists for commit', async () => {
      const result = await repo.findActiveForCommit(
        project.id,
        baselineCommit.id,
      )
      expect(result).toBeNull()
    })

    it('returns active shadow test when commit is baseline', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const result = await repo.findActiveForCommit(
        project.id,
        baselineCommit.id,
      )

      expect(result).not.toBeNull()
      expect(result?.uuid).toBe(testUuid)
      expect(result?.testType).toBe('shadow')
      expect(result?.status).toBe('running')
    })

    it('returns active shadow test when commit is challenger', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const result = await repo.findActiveForCommit(
        project.id,
        challengerCommit.id,
      )

      expect(result).not.toBeNull()
      expect(result?.uuid).toBe(testUuid)
      expect(result?.testType).toBe('shadow')
    })

    it('returns active A/B test when commit is baseline', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
        status: 'running',
        trafficPercentage: 50,
      })

      const result = await repo.findActiveForCommit(
        project.id,
        baselineCommit.id,
      )

      expect(result).not.toBeNull()
      expect(result?.uuid).toBe(testUuid)
      expect(result?.testType).toBe('ab')
    })

    it('returns null for paused test', async () => {
      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'paused',
      })

      const result = await repo.findActiveForCommit(
        project.id,
        baselineCommit.id,
      )
      expect(result).toBeNull()
    })

    it('returns null for completed test', async () => {
      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'completed',
      })

      const result = await repo.findActiveForCommit(
        project.id,
        baselineCommit.id,
      )
      expect(result).toBeNull()
    })

    it('returns null for cancelled test', async () => {
      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'cancelled',
      })

      const result = await repo.findActiveForCommit(
        project.id,
        baselineCommit.id,
      )
      expect(result).toBeNull()
    })

    it('returns null when commit is not part of any test', async () => {
      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const result = await repo.findActiveForCommit(project.id, otherCommit.id)
      expect(result).toBeNull()
    })

    it('returns null for different project', async () => {
      const { project: otherProject } = await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          doc1: factories.helpers.createPrompt({
            provider: 'openai',
            content: 'content',
          }),
        },
      })

      await database.insert(deploymentTests).values({
        uuid: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const result = await repo.findActiveForCommit(
        otherProject.id,
        baselineCommit.id,
      )
      expect(result).toBeNull()
    })
  })

  describe('listByProject', () => {
    it('returns all tests for project', async () => {
      const testUuid1 = randomUUID()
      const testUuid2 = randomUUID()

      await database.insert(deploymentTests).values([
        {
          uuid: testUuid1,
          workspaceId: workspace.id,
          projectId: project.id,
          challengerCommitId: challengerCommit.id,
          testType: 'shadow',
          status: 'running',
        },
        {
          uuid: testUuid2,
          workspaceId: workspace.id,
          projectId: project.id,
          challengerCommitId: challengerCommit.id,
          testType: 'ab',
          status: 'completed',
          trafficPercentage: 50,
        },
      ])

      const result = await repo.listByProject(project.id)

      expect(result).toHaveLength(2)
      expect(result.map((t) => t.uuid)).toContain(testUuid1)
      expect(result.map((t) => t.uuid)).toContain(testUuid2)
    })
  })

  describe('findByUuid', () => {
    it('finds test by uuid', async () => {
      const testUuid = randomUUID()
      await database.insert(deploymentTests).values({
        uuid: testUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        status: 'running',
      })

      const result = await repo.findByUuid(testUuid)

      expect(result.ok).toBe(true)
      expect(result.unwrap().uuid).toBe(testUuid)
    })

    it('returns error when not found', async () => {
      const result = await repo.findByUuid(randomUUID())
      expect(result.ok).toBe(false)
    })
  })
})
