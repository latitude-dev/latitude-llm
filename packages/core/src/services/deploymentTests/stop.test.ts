import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { BadRequestError } from '@latitude-data/constants/errors'
import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'
import * as factories from '../../tests/factories'
import { createDeploymentTest } from './create'
import { stopDeploymentTest } from './stop'
import { startDeploymentTest } from './start'

describe('stopDeploymentTest', () => {
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
  })

  it('stops a running deployment test', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!

    const startResult = await startDeploymentTest({ test })
    expect(startResult.ok).toBe(true)
    if (!startResult.ok) return

    const runningTest = startResult.value!
    const result = await stopDeploymentTest({ test: runningTest })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value!.status).toBe('completed')
    expect(result.value!.endedAt).toBeInstanceOf(Date)
    expect(result.value!.id).toBe(test.id)

    const stoppedTest = await database
      .select()
      .from(deploymentTests)
      .where(eq(deploymentTests.id, test.id))
      .then((rows) => rows[0])

    expect(stoppedTest?.status).toBe('completed')
    expect(stoppedTest?.endedAt).toBeInstanceOf(Date)
  })

  it('stops a paused deployment test', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'ab',
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

    const result = await stopDeploymentTest({ test: pausedTest })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value!.status).toBe('completed')
    expect(result.value!.endedAt).toBeInstanceOf(Date)
  })

  it('stops a pending deployment test', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!

    const result = await stopDeploymentTest({ test })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value!.status).toBe('completed')
    expect(result.value!.endedAt).toBeInstanceOf(Date)
  })

  it('updates updatedAt timestamp', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'ab',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!
    const originalUpdatedAt = test.updatedAt

    await new Promise((resolve) => setTimeout(resolve, 10))

    const result = await stopDeploymentTest({ test })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value!.updatedAt.getTime()).toBeGreaterThan(
      originalUpdatedAt.getTime(),
    )
  })

  it('returns error if test does not exist', async () => {
    const nonExistentTest = {
      id: 999999,
    } as DeploymentTest

    const result = await stopDeploymentTest({ test: nonExistentTest })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toContain('not found')
  })

  it('can stop an already completed test', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!
    const firstStop = await stopDeploymentTest({ test })
    expect(firstStop.ok).toBe(true)

    const secondStop = await stopDeploymentTest({ test })
    expect(secondStop.ok).toBe(true)
    if (!secondStop.ok) return

    expect(secondStop.value!.status).toBe('completed')
    expect(secondStop.value!.endedAt).toBeInstanceOf(Date)
  })
})
