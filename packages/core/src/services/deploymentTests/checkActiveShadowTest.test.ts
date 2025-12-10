import { beforeEach, describe, expect, it } from 'vitest'
import { BadRequestError } from '@latitude-data/constants/errors'
import * as factories from '../../tests/factories'
import { createDeploymentTest } from './create'
import { checkActiveShadowTest } from './checkActiveShadowTest'
import { startDeploymentTest } from './start'
import { stopDeploymentTest } from './stop'

describe('checkActiveShadowTest', () => {
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

  it('returns ok when no active shadow test exists', async () => {
    const result = await checkActiveShadowTest({
      projectId: project.id,
    })

    expect(result.ok).toBe(true)
    expect(result.value).toBeUndefined()
  })

  it('returns error when a pending shadow test exists', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const result = await checkActiveShadowTest({
      projectId: project.id,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toContain(
      'Only one active shadow test is allowed per project',
    )
  })

  it('returns error when a running shadow test exists', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!
    await startDeploymentTest({ test })

    const result = await checkActiveShadowTest({
      projectId: project.id,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toContain(
      'Only one active shadow test is allowed per project',
    )
  })

  it('returns error when a paused shadow test exists', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!
    await startDeploymentTest({ test })
    await import('./pause').then((m) => m.pauseDeploymentTest({ test }))

    const result = await checkActiveShadowTest({
      projectId: project.id,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toContain(
      'Only one active shadow test is allowed per project',
    )
  })

  it('ignores completed shadow tests', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!
    await stopDeploymentTest({ test })

    const result = await checkActiveShadowTest({
      projectId: project.id,
    })

    expect(result.ok).toBe(true)
  })

  it('ignores cancelled shadow tests', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!
    await stopDeploymentTest({ test })

    const result = await checkActiveShadowTest({
      projectId: project.id,
    })

    expect(result.ok).toBe(true)
  })

  it('ignores deleted shadow tests', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!
    await import('./destroy').then((m) => m.destroyDeploymentTest({ test }))

    const result = await checkActiveShadowTest({
      projectId: project.id,
    })

    expect(result.ok).toBe(true)
  })

  it('excludes the specified testId from the check', async () => {
    const createResult1 = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'shadow',
    })
    expect(createResult1.ok).toBe(true)
    if (!createResult1.ok) return

    const test1 = createResult1.value!

    const resultWithoutExclusion = await checkActiveShadowTest({
      projectId: project.id,
    })

    expect(resultWithoutExclusion.ok).toBe(false)
    if (resultWithoutExclusion.ok) return
    expect(resultWithoutExclusion.error!.message).toContain(
      'Only one active shadow test is allowed',
    )

    const resultWithExclusion = await checkActiveShadowTest({
      projectId: project.id,
      testId: test1.id,
    })

    expect(resultWithExclusion.ok).toBe(true)
  })

  it('ignores A/B tests', async () => {
    const createResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'ab',
    })
    expect(createResult.ok).toBe(true)
    if (!createResult.ok) return

    const test = createResult.value!
    await startDeploymentTest({ test })

    const result = await checkActiveShadowTest({
      projectId: project.id,
    })

    expect(result.ok).toBe(true)
  })
})
