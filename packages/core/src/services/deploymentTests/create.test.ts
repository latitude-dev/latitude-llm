import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BadRequestError } from '@latitude-data/constants/errors'
import * as factories from '../../tests/factories'
import { createDeploymentTest } from './create'
import { checkActiveAbTest } from './checkActiveAbTest'
import { checkActiveShadowTest } from './checkActiveShadowTest'

vi.mock('./checkActiveAbTest')
vi.mock('./checkActiveShadowTest')

describe('createDeploymentTest', () => {
  let workspace: Awaited<
    ReturnType<typeof factories.createWorkspace>
  >['workspace']
  let user: Awaited<ReturnType<typeof factories.createWorkspace>>['userData']
  let project: Awaited<ReturnType<typeof factories.createProject>>['project']
  let headCommit: Awaited<ReturnType<typeof factories.createProject>>['commit']
  let challengerCommit: Awaited<ReturnType<typeof factories.createCommit>>

  beforeEach(async () => {
    const workspaceData = await factories.createWorkspace()
    workspace = workspaceData.workspace
    user = workspaceData.userData

    const projectData = await factories.createProject({ workspace })
    project = projectData.project
    headCommit = projectData.commit

    challengerCommit = await factories.createCommit({
      projectId: project.id,
      user,
    })
  })

  describe('successful creation', () => {
    it('creates a shadow test with default 100% traffic', async () => {
      // @ts-expect-error - mock
      vi.mocked(checkActiveShadowTest).mockResolvedValue({
        ok: true,
        value: undefined,
      })

      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const test = result.value!
      expect(test.testType).toBe('shadow')
      expect(test.trafficPercentage).toBe(100)
      expect(test.status).toBe('pending')
      expect(test.workspaceId).toBe(workspace.id)
      expect(test.projectId).toBe(project.id)
      expect(test.challengerCommitId).toBe(challengerCommit.id)
    })

    it('creates an A/B test with default 50% traffic', async () => {
      // @ts-expect-error - mock
      vi.mocked(checkActiveAbTest).mockResolvedValue({
        ok: true,
        value: undefined,
      })

      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const test = result.value!
      expect(test.testType).toBe('ab')
      expect(test.trafficPercentage).toBe(50)
      expect(test.status).toBe('pending')
    })

    it('creates a test with custom traffic percentage', async () => {
      // @ts-expect-error - mock
      vi.mocked(checkActiveAbTest).mockResolvedValue({
        ok: true,
        value: undefined,
      })

      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
        trafficPercentage: 75,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value!.trafficPercentage).toBe(75)
    })

    it('creates a test with createdByUserId', async () => {
      // @ts-expect-error - mock
      vi.mocked(checkActiveAbTest).mockResolvedValue({
        ok: true,
        value: undefined,
      })

      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
        createdByUserId: user.id,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value!.createdByUserId).toBe(user.id)
    })
  })

  describe('baseline commit validation', () => {
    it('fails if challenger commit is the same as head commit', async () => {
      // @ts-expect-error - mock
      vi.mocked(checkActiveShadowTest).mockResolvedValue({
        ok: true,
        value: undefined,
      })

      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: headCommit.id,
        testType: 'shadow',
      })

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error!.message).toContain(
        'Challenger commit must be different from the head commit',
      )
    })
  })

  describe('A/B test validation', () => {
    it('fails if traffic percentage is negative', async () => {
      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
        trafficPercentage: -1,
      })

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error!.message).toContain(
        'Traffic percentage must be between 0 and 100',
      )
    })

    it('fails if traffic percentage is greater than 100', async () => {
      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
        trafficPercentage: 101,
      })

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error!.message).toContain(
        'Traffic percentage must be between 0 and 100',
      )
    })

    it('fails if there is already an active A/B test', async () => {
      // @ts-expect-error - mock
      vi.mocked(checkActiveAbTest).mockResolvedValue({
        ok: false,
        error: new BadRequestError(
          'Only one active A/B test is allowed per project',
        ),
      })

      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
      })

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error!.message).toContain(
        'Only one active A/B test is allowed',
      )
    })
  })

  describe('shadow test validation', () => {
    it('fails if traffic percentage is negative', async () => {
      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        trafficPercentage: -1,
      })

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error!.message).toContain(
        'Traffic percentage must be between 0 and 100',
      )
    })

    it('fails if traffic percentage is greater than 100', async () => {
      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
        trafficPercentage: 101,
      })

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error!.message).toContain(
        'Traffic percentage must be between 0 and 100',
      )
    })

    it('fails if there is already an active shadow test', async () => {
      // @ts-expect-error - mock
      vi.mocked(checkActiveShadowTest).mockResolvedValue({
        ok: false,
        error: new BadRequestError(
          'Only one active shadow test is allowed per project',
        ),
      })

      const result = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
      })

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error!.message).toContain(
        'Only one active shadow test is allowed',
      )
    })
  })
})
