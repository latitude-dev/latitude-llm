import { beforeAll, describe, expect, it } from 'vitest'
import { BadRequestError } from './errors'
import { Result } from './Result'
import { assertCanEditCommit } from './assertCanEditCommit'
import * as factories from '../tests/factories'
import { createDeploymentTest } from '../services/deploymentTests/create'
import { startDeploymentTest } from '../services/deploymentTests/start'
import { mergeCommit } from '../services/commits/merge'
import { createDraft } from '../tests/factories/commits'
import { createDocumentVersion } from '../tests/factories/documents'

describe('assertCanEditCommit', () => {
  let workspace: Awaited<
    ReturnType<typeof factories.createWorkspace>
  >['workspace']
  let user: Awaited<ReturnType<typeof factories.createWorkspace>>['userData']
  let project: Awaited<ReturnType<typeof factories.createProject>>['project']

  beforeAll(async () => {
    const workspaceData = await factories.createWorkspace()
    workspace = workspaceData.workspace
    user = workspaceData.userData

    const projectData = await factories.createProject({ workspace })
    project = projectData.project
  })

  it('should return success when commit is draft and not in active A/B test', async () => {
    const draftCommit = await factories.createCommit({
      projectId: project.id,
      user,
    })

    const result = await assertCanEditCommit(draftCommit)

    expect(Result.isOk(result)).toBe(true)
  })

  it('should return error when commit is merged', async () => {
    const { commit: draftCommit } = await createDraft({ project, user })
    await createDocumentVersion({
      workspace,
      user,
      commit: draftCommit,
      path: 'test-doc',
      content: 'test content',
    })

    const mergeResult = await mergeCommit(draftCommit)
    expect(mergeResult.ok).toBe(true)
    if (!mergeResult.ok) return

    const mergedCommit = mergeResult.value!

    const result = await assertCanEditCommit(mergedCommit)

    expect(Result.isOk(result)).toBe(false)
    if (result.error) {
      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error.message).toBe('Cannot modify a merged commit')
    }
  })

  it('should return error when commit is challenger in active A/B test', async () => {
    const challengerCommit = await factories.createCommit({
      projectId: project.id,
      user,
    })

    const createTestResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'ab',
    })
    expect(createTestResult.ok).toBe(true)
    if (!createTestResult.ok) return

    const test = createTestResult.value!

    const startResult = await startDeploymentTest({ test })
    expect(startResult.ok).toBe(true)

    const result = await assertCanEditCommit(challengerCommit)
    expect(Result.isOk(result)).toBe(false)
    if (result.error) {
      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error.message).toBe(
        'Cannot modify a commit in an active test',
      )
    }
  })

  it('should return error when commit is baseline/head in active A/B test', async () => {
    // Create baseline commit with documents and merge it so it becomes the head
    const { commit: baselineDraft } = await createDraft({ project, user })
    await createDocumentVersion({
      workspace,
      user,
      commit: baselineDraft,
      path: 'baseline-doc',
      content: 'baseline content',
    })
    const baselineMergeResult = await mergeCommit(baselineDraft)
    expect(baselineMergeResult.ok).toBe(true)
    if (!baselineMergeResult.ok) return
    const baselineCommit = baselineMergeResult.value!

    // Create challenger commit
    const challengerCommit = await factories.createCommit({
      projectId: project.id,
      user,
    })

    const createTestResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'ab',
    })
    expect(createTestResult.ok).toBe(true)
    if (!createTestResult.ok) return

    const test = createTestResult.value!

    const startResult = await startDeploymentTest({ test })
    expect(startResult.ok).toBe(true)

    const result = await assertCanEditCommit(baselineCommit)

    expect(Result.isOk(result)).toBe(false)
    if (result.error) {
      expect(result.error).toBeInstanceOf(BadRequestError)
      // Baseline commits are merged, so they fail the merged check first
      // before checking A/B test status
      expect(result.error.message).toBe('Cannot modify a merged commit')
    }
  })

  it('should return success when commit is in completed A/B test', async () => {
    const challengerCommit = await factories.createCommit({
      projectId: project.id,
      user,
    })

    const createTestResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'ab',
    })
    expect(createTestResult.ok).toBe(true)
    if (!createTestResult.ok) return

    const test = createTestResult.value!

    const startResult = await startDeploymentTest({ test })
    expect(startResult.ok).toBe(true)
    if (!startResult.ok) return

    const runningTest = startResult.value!

    const { stopDeploymentTest } = await import(
      '../services/deploymentTests/stop'
    )
    const stopResult = await stopDeploymentTest({ test: runningTest })
    expect(stopResult.ok).toBe(true)

    const result = await assertCanEditCommit(challengerCommit)

    expect(Result.isOk(result)).toBe(true)
  })

  it('should return error when commit is in pending A/B test', async () => {
    const challengerCommit = await factories.createCommit({
      projectId: project.id,
      user,
    })

    const createTestResult = await createDeploymentTest({
      workspaceId: workspace.id,
      projectId: project.id,
      challengerCommitId: challengerCommit.id,
      testType: 'ab',
    })
    expect(createTestResult.ok).toBe(true)
    if (!createTestResult.ok) return

    const test = createTestResult.value!

    expect(test.status).toBe('pending')

    const result = await assertCanEditCommit(challengerCommit)

    expect(Result.isOk(result)).toBe(false)
    if (result.error) {
      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error.message).toBe(
        'Cannot modify a commit in an active test',
      )
    }
  })
})
