import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Commit,
  EvaluationType,
  EvaluationV2,
  RuleEvaluationMetric,
  Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import * as factories from '../../tests/factories'
import { toggleLiveModeV2 } from './toggleLiveMode'

// @ts-expect-error - Mock
vi.spyOn(publisher, 'publishLater').mockImplementation(() => {})

describe('toggleLiveModeV2', () => {
  let workspace: Workspace
  let commit: Commit
  let evaluation: EvaluationV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >

  beforeEach(async () => {
    const {
      workspace: w,
      documents,
      commit: c,
    } = await factories.createProject({
      documents: {
        'test.md': 'test content',
      },
    })

    workspace = w
    commit = c
    const document = documents[0]
    if (!document) {
      throw new Error('Document was not created')
    }

    evaluation = await factories.createEvaluationV2({
      document,
      commit,
      workspace,
      evaluateLiveLogs: false,
    })
  })

  it('toggles live mode from false to true', async () => {
    const result = await toggleLiveModeV2({
      evaluation,
      commit,
      live: true,
      workspace,
    })

    expect(result.ok).toBeTruthy()
    const updatedEvaluation = result.unwrap().evaluation
    expect(updatedEvaluation.evaluateLiveLogs).toBe(true)
    expect(updatedEvaluation.uuid).toBe(evaluation.uuid)
    expect(updatedEvaluation.versionId).toBeDefined()
  })

  it('toggles live mode from true to false', async () => {
    // First set live mode to true
    await toggleLiveModeV2({
      evaluation,
      commit,
      live: true,
      workspace,
    })

    // Then toggle it back to false
    const result = await toggleLiveModeV2({
      evaluation,
      commit,
      live: false,
      workspace,
    })

    expect(result.ok).toBeTruthy()
    const updatedEvaluation = result.unwrap().evaluation
    expect(updatedEvaluation.evaluateLiveLogs).toBe(false)
    expect(updatedEvaluation.uuid).toBe(evaluation.uuid)
    expect(updatedEvaluation.versionId).toBeDefined()
  })

  it('publishes evaluation updated event', async () => {
    const result = await toggleLiveModeV2({
      evaluation,
      commit,
      live: true,
      workspace,
    })

    expect(result.ok).toBeTruthy()
    expect(publisher.publishLater).toHaveBeenCalledWith({
      type: 'evaluationV2Updated',
      data: {
        evaluation: result.unwrap().evaluation,
        workspaceId: workspace.id,
      },
    })
  })

  it('maintains other evaluation properties when toggling live mode', async () => {
    const result = await toggleLiveModeV2({
      evaluation,
      commit,
      live: true,
      workspace,
    })

    expect(result.ok).toBeTruthy()
    const updatedEvaluation = result.unwrap().evaluation
    expect(updatedEvaluation.name).toBe(evaluation.name)
    expect(updatedEvaluation.description).toBe(evaluation.description)
    expect(updatedEvaluation.type).toBe(evaluation.type)
    expect(updatedEvaluation.metric).toBe(evaluation.metric)
    expect(updatedEvaluation.configuration).toEqual(evaluation.configuration)
  })
})
