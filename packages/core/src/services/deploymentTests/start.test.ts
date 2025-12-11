import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { BadRequestError } from '@latitude-data/constants/errors'
import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'
import * as factories from '../../tests/factories'
import { createDeploymentTest } from './create'
import { startDeploymentTest } from './start'

vi.mock('./checkActiveAbTest')

describe('startDeploymentTest', () => {
  let workspace: Awaited<
    ReturnType<typeof factories.createWorkspace>
  >['workspace']
  let user: Awaited<ReturnType<typeof factories.createWorkspace>>['userData']
  let project: Awaited<ReturnType<typeof factories.createProject>>['project']
  let challengerCommit: Awaited<ReturnType<typeof factories.createCommit>>

  beforeEach(async () => {
    const workspaceData = await factories.createWorkspace()
    workspace = workspaceData.workspace
    user = workspaceData.userData

    const projectData = await factories.createProject({ workspace })
    project = projectData.project

    challengerCommit = await factories.createCommit({
      projectId: project.id,
      user,
    })

    vi.clearAllMocks()
  })

  describe('successful start', () => {
    it('starts a pending shadow test', async () => {
      const createResult = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
      })
      expect(createResult.ok).toBe(true)
      if (!createResult.ok) return

      const test = createResult.value!

      const result = await startDeploymentTest({ test })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value!.status).toBe('running')
      expect(result.value!.startedAt).toBeInstanceOf(Date)
      expect(result.value!.id).toBe(test.id)

      const startedTest = await database
        .select()
        .from(deploymentTests)
        .where(eq(deploymentTests.id, test.id))
        .then((rows) => rows[0])

      expect(startedTest?.status).toBe('running')
      expect(startedTest?.startedAt).toBeInstanceOf(Date)
    })

    it('starts a paused shadow test', async () => {
      const createResult = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
      })
      expect(createResult.ok).toBe(true)
      if (!createResult.ok) return

      const test = createResult.value!

      const pauseResult = await import('./pause').then((m) =>
        m.pauseDeploymentTest({ test }),
      )
      expect(pauseResult.ok).toBe(true)
      if (!pauseResult.ok) return

      const pausedTest = pauseResult.value!

      const result = await startDeploymentTest({ test: pausedTest })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value!.status).toBe('running')
      expect(result.value!.startedAt).toBeInstanceOf(Date)
    })

    it('updates updatedAt timestamp', async () => {
      const createResult = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
      })
      expect(createResult.ok).toBe(true)
      if (!createResult.ok) return

      const test = createResult.value!
      const originalUpdatedAt = test.updatedAt

      await new Promise((resolve) => setTimeout(resolve, 10))

      const result = await startDeploymentTest({ test })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value!.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      )
    })
  })

  describe('A/B test validation', () => {
    it('does not check for active tests when starting shadow test', async () => {
      const createResult = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
      })
      expect(createResult.ok).toBe(true)
      if (!createResult.ok) return

      const test = createResult.value!

      const result = await startDeploymentTest({ test })

      expect(result.ok).toBe(true)
      expect(result.value!.status).toBe('running')
    })
  })

  describe('error handling', () => {
    it('returns error if test does not exist', async () => {
      const nonExistentTest = {
        id: 999999,
        testType: 'shadow',
        projectId: project.id,
      } as DeploymentTest

      const result = await startDeploymentTest({ test: nonExistentTest })

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error!.message).toContain('not found')
    })
  })
})
