import { beforeEach, describe, expect, it } from 'vitest'

import {
  EvaluationMetadataType,
  EvaluationResultableType,
} from '../../constants'
import * as factories from '../../tests/factories'
import { createEvaluation } from './create'

describe('createEvaluation', () => {
  let workspace: any

  beforeEach(async () => {
    const setup = await factories.createWorkspace()
    workspace = setup.workspace
  })

  it('creates an LLM as Judge evaluation with number configuration', async () => {
    const name = 'Test Evaluation'
    const description = 'Test Description'
    const metadata = { prompt: 'Test prompt' }

    const result = await createEvaluation({
      workspace,
      name,
      description,
      type: EvaluationMetadataType.LlmAsJudge,
      configuration: {
        type: EvaluationResultableType.Number,
      },
      metadata,
    })

    expect(result.ok).toBe(true)

    if (result.ok) {
      const evaluation = result.value!
      expect(evaluation.name).toBe(name)
      expect(evaluation.description).toBe(description)
      expect(evaluation.configuration.type).toBe(
        EvaluationResultableType.Number,
      )
      expect(evaluation.metadataType).toBe(EvaluationMetadataType.LlmAsJudge)
      expect(evaluation.workspaceId).toBe(workspace.id)
    }
  })

  it('creates an LLM as Judge evaluation with text configuration', async () => {
    const name = 'Test Evaluation'
    const description = 'Test Description'
    const metadata = { prompt: 'Test prompt' }

    const result = await createEvaluation({
      workspace,
      name,
      description,
      configuration: {
        type: EvaluationResultableType.Text,
      },
      type: EvaluationMetadataType.LlmAsJudge,
      metadata,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const evaluation = result.value!
      expect(evaluation.configuration.type).toBe(EvaluationResultableType.Text)
    }
  })

  it('creates an LLM as Judge evaluation with boolean configuration', async () => {
    const name = 'Test Evaluation'
    const description = 'Test Description'
    const metadata = { prompt: 'Test prompt' }

    const result = await createEvaluation({
      workspace,
      name,
      description,
      type: EvaluationMetadataType.LlmAsJudge,
      configuration: {
        type: EvaluationResultableType.Boolean,
      },
      metadata,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const evaluation = result.value!
      expect(evaluation.configuration.type).toBe(
        EvaluationResultableType.Boolean,
      )
    }
  })

  it('returns an error for invalid evaluation type', async () => {
    const result = await createEvaluation({
      workspace,
      name: 'Test Evaluation',
      description: 'Test Description',
      type: 'InvalidType' as EvaluationMetadataType,
      configuration: {
        type: EvaluationResultableType.Text,
      },
      metadata: {},
    })

    expect(result.ok).toBe(false)
    if (result.error) {
      expect(result.error.message).toContain('Invalid evaluation type')
    }
  })

  it('creates an evaluation with a template', async () => {
    const template = await factories.createEvaluationTemplate({
      name: 'Test Template',
      description: 'Test Description',
      prompt: 'Test prompt',
      categoryId: 1,
      categoryName: 'Test Category',
    })
    const metadata = { prompt: 'Test prompt', templateId: template.id }

    const result = await createEvaluation({
      workspace,
      name: 'Test Evaluation',
      description: 'Test Description',
      type: EvaluationMetadataType.LlmAsJudge,
      configuration: {
        type: EvaluationResultableType.Text,
      },
      metadata,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const evaluation = result.value!
      expect(evaluation.metadata.templateId).toBe(template.id)
    }
  })
})
