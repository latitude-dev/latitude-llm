import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { BadRequestError } from '@latitude-data/constants/errors'
import { database } from '../../client'
import { deploymentTests } from '../../schema/models/deploymentTests'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'
import * as factories from '../../tests/factories'
import { createDeploymentTest } from './create'
import { destroyDeploymentTest } from './destroy'

describe('destroyDeploymentTest', () => {
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

  it('soft deletes a deployment test', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!

    const result = await destroyDeploymentTest({ test })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value!.deletedAt).toBeInstanceOf(Date)
    expect(result.value!.id).toBe(test.id)

    const deletedTest = await database
      .select()
      .from(deploymentTests)
      .where(eq(deploymentTests.id, test.id))
      .then((rows) => rows[0])

    expect(deletedTest?.deletedAt).toBeInstanceOf(Date)
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

    const result = await destroyDeploymentTest({ test })

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

    const result = await destroyDeploymentTest({ test: nonExistentTest })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toContain('not found')
  })

  it('can delete a test that is already deleted', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!

    const firstDelete = await destroyDeploymentTest({ test })
    expect(firstDelete.ok).toBe(true)

    const secondDelete = await destroyDeploymentTest({ test })
    expect(secondDelete.ok).toBe(true)
    if (!secondDelete.ok) return

    expect(secondDelete.value!.deletedAt).toBeInstanceOf(Date)
  })
})
