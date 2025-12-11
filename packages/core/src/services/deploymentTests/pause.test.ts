import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { BadRequestError } from '@latitude-data/constants/errors'
import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'
import * as factories from '../../tests/factories'
import { createDeploymentTest } from './create'
import { pauseDeploymentTest } from './pause'
import { startDeploymentTest } from './start'

describe('pauseDeploymentTest', () => {
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

  it('pauses a running deployment test', async () => {
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
    const result = await pauseDeploymentTest({ test: runningTest })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value!.status).toBe('paused')
    expect(result.value!.id).toBe(test.id)

    const pausedTest = await database
      .select()
      .from(deploymentTests)
      .where(eq(deploymentTests.id, test.id))
      .then((rows) => rows[0])

    expect(pausedTest?.status).toBe('paused')
  })

  it('pauses a pending deployment test', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'ab',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!

    const result = await pauseDeploymentTest({ test })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value!.status).toBe('paused')
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

    const result = await pauseDeploymentTest({ test })

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

    const result = await pauseDeploymentTest({ test: nonExistentTest })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toContain('not found')
  })

  it('can pause an already paused test', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'ab',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!

    const firstPause = await pauseDeploymentTest({ test })
    expect(firstPause.ok).toBe(true)

    const secondPause = await pauseDeploymentTest({ test })
    expect(secondPause.ok).toBe(true)
    if (!secondPause.ok) return

    expect(secondPause.value!.status).toBe('paused')
  })
})
