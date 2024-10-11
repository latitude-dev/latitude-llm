import { beforeEach, describe, expect, it } from 'vitest'

import { ProviderApiKey, User } from '../../browser'
import {
  EvaluationMetadataType,
  EvaluationResultableType,
} from '../../constants'
import * as factories from '../../tests/factories'
import { createEvaluation } from './create'

describe('createEvaluation', () => {
  let workspace: any
  let user: User
  let provider: ProviderApiKey

  beforeEach(async () => {
    const setup = await factories.createWorkspace()
    workspace = setup.workspace
    user = setup.userData
  })

  describe('without existing provider', () => {
    it('creates the evaluation without the frontmatter if no provider is found', async () => {
      const name = 'Test Evaluation'
      const description = 'Test Description'
      const metadata = { prompt: 'Test prompt' }
      const result = await createEvaluation({
        user,
        workspace,
        name,
        description,
        type: EvaluationMetadataType.LlmAsJudge,
        configuration: {
          type: EvaluationResultableType.Number,
          detail: {
            range: {
              from: 0,
              to: 100,
            },
          },
        },
        metadata,
      })

      expect(result.ok).toBe(true)
      expect(result.unwrap().metadata.prompt).toBe(metadata.prompt)
    })
  })

  describe('with existing provider', () => {
    beforeEach(async () => {
      provider = await factories.createProviderApiKey({
        workspace,
        user,
        ...factories.defaultProviderFakeData(),
      })
    })

    it('creates an LLM as Judge evaluation with number configuration', async () => {
      const name = 'Test Evaluation'
      const description = 'Test Description'
      const metadata = { prompt: 'Test prompt' }
      const result = await createEvaluation({
        workspace,
        user,
        name,
        description,
        type: EvaluationMetadataType.LlmAsJudge,
        configuration: {
          type: EvaluationResultableType.Number,
          detail: {
            range: {
              from: 0,
              to: 100,
            },
          },
        },
        metadata,
      })

      const evaluation = result.unwrap()
      expect(evaluation).toEqual({
        ...evaluation,
        name,
        description,
        configuration: {
          type: EvaluationResultableType.Number,
          detail: {
            range: {
              from: 0,
              to: 100,
            },
          },
        },
        metadata: {
          ...evaluation.metadata,
          prompt: `
---
provider: ${provider!.name}
model: gpt-4o-mini
---
${metadata.prompt}
`.trim(),
        },
        workspaceId: workspace.id,
        metadataType: EvaluationMetadataType.LlmAsJudge,
      })
    })

    it('creates an LLM as Judge evaluation with text configuration', async () => {
      const name = 'Test Evaluation'
      const description = 'Test Description'
      const metadata = { prompt: 'Test prompt' }

      const result = await createEvaluation({
        workspace,
        user,
        name,
        description,
        configuration: {
          type: EvaluationResultableType.Text,
        },
        type: EvaluationMetadataType.LlmAsJudge,
        metadata,
      })

      expect(result.ok).toBe(true)
      const evaluation = result.value!
      expect(evaluation.configuration.type).toBe(EvaluationResultableType.Text)
    })

    it('creates an LLM as Judge evaluation with boolean configuration', async () => {
      const name = 'Test Evaluation'
      const description = 'Test Description'
      const metadata = { prompt: 'Test prompt' }

      const result = await createEvaluation({
        workspace,
        user,
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
        user,
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
        user,
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

  it('does not allow to create a number type evaluation without proper configuration', async () => {
    const result = await createEvaluation({
      workspace,
      user,
      name: 'Test Evaluation',
      description: 'Test Description',
      type: EvaluationMetadataType.LlmAsJudge,
      configuration: {
        type: EvaluationResultableType.Number,
      },
      metadata: {
        prompt: 'miau',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain(
      'Range is required for number evaluations',
    )
  })

  it('does not allow to create a number type evaluation with invalid range', async () => {
    const result = await createEvaluation({
      workspace,
      user,
      name: 'Test Evaluation',
      description: 'Test Description',
      type: EvaluationMetadataType.LlmAsJudge,
      configuration: {
        type: EvaluationResultableType.Number,
        detail: {
          range: {
            from: 100,
            to: 0,
          },
        },
      },
      metadata: {
        prompt: 'miau',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain(
      'Invalid range to has to be greater than from',
    )
  })

  it('should return an error when the range is of length 0', async () => {
    const result = await createEvaluation({
      workspace,
      user,
      name: 'Test Evaluation',
      description: 'Test Description',
      type: EvaluationMetadataType.LlmAsJudge,
      configuration: {
        type: EvaluationResultableType.Number,
        detail: {
          range: {
            from: 0,
            to: 0,
          },
        },
      },
      metadata: {
        prompt: 'miau',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain(
      'Invalid range to has to be greater than from',
    )
  })
})
