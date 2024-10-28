import { beforeEach, describe, expect, it } from 'vitest'

import { ProviderApiKey, User } from '../../browser'
import {
  EvaluationMetadataType,
  EvaluationResultableType,
  Providers,
} from '../../constants'
import { EvaluationsRepository } from '../../repositories'
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

  it('should throw an error when no provider API key is found', async () => {
    const result = await createEvaluation({
      workspace: workspace,
      user,
      name: 'Test Evaluation',
      description: 'Test Description',
      type: EvaluationMetadataType.LlmAsJudgeLegacy,
      configuration: {
        type: EvaluationResultableType.Text,
        detail: {
          range: {
            from: 0,
            to: 100,
          },
        },
      },
      metadata: {
        prompt: 'miau',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain(
      'In order to create an evaluation you need to first create a provider API key',
    )
  })

  describe('with provider from unsupported type', () => {
    beforeEach(async () => {
      provider = await factories.createProviderApiKey({
        workspace,
        user,
        name: 'Test Provider',
        type: Providers.Groq,
      })
    })

    it('should fail because the provider is not supported', async () => {
      const result = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
        configuration: {
          type: EvaluationResultableType.Text,
          detail: {
            range: {
              from: 0,
              to: 100,
            },
          },
        },
        metadata: {
          prompt: 'miau',
        },
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        'In order to create an evaluation you need to first create a provider API key from OpenAI or Anthropic',
      )
    })
  })

  describe('with OpenAI provider', () => {
    beforeEach(async () => {
      provider = await factories.createProviderApiKey({
        workspace,
        user,
        name: 'Test Provider',
        type: Providers.OpenAI,
      })
    })
    it('creates an LLM as Judge evaluation with text configuration', async () => {
      const result = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
        configuration: {
          type: EvaluationResultableType.Text,
          detail: {
            range: {
              from: 0,
              to: 100,
            },
          },
        },
        metadata: {
          prompt: 'miau',
        },
      })

      expect(result.ok).toBe(true)
    })
  })

  describe('with Anthropic provider', () => {
    beforeEach(async () => {
      provider = await factories.createProviderApiKey({
        workspace,
        user,
        name: 'Test Provider',
        type: Providers.Anthropic,
      })
    })

    it('creates an LLM as Judge evaluation with number configuration', async () => {
      const result = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
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
          prompt: 'miau',
        },
      })

      expect(result.ok).toBe(true)
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
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
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
        metadata: {
          ...evaluation.metadata,
          configuration: {
            type: EvaluationResultableType.Number,
            detail: {
              range: {
                from: 0,
                to: 100,
              },
            },
          },
          prompt: `
---
provider: ${provider!.name}
model: gpt-4o-mini
---
${metadata.prompt}
`.trim(),
        },
        workspaceId: workspace.id,
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
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
        metadata,
      })

      expect(result.ok).toBe(true)
      const repo = new EvaluationsRepository(workspace.id)
      const evaluation = await repo
        .find(result.value!.id)
        .then((r) => r.unwrap())
      expect(
        (evaluation.configuration ?? evaluation.metadata.configuration)!.type,
      ).toBe(EvaluationResultableType.Text)
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
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
        configuration: {
          type: EvaluationResultableType.Boolean,
        },
        metadata,
      })

      expect(result.ok).toBe(true)
      const repo = new EvaluationsRepository(workspace.id)
      const evaluation = await repo
        .find(result.value!.id)
        .then((r) => r.unwrap())

      expect(
        (evaluation.configuration ?? evaluation.metadata.configuration)!.type,
      ).toBe(EvaluationResultableType.Boolean)
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
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
        configuration: {
          type: EvaluationResultableType.Text,
        },
        metadata,
      })

      expect(result.ok).toBe(true)
      const repo = new EvaluationsRepository(workspace.id)
      const evaluation = await repo
        .find(result.value!.id)
        .then((r) => r.unwrap())
      expect(evaluation.metadata.templateId).toBe(template.id)
    })

    it('does not allow to create a number type evaluation without proper configuration', async () => {
      const result = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
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
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
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
        type: EvaluationMetadataType.LlmAsJudgeLegacy,
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
})
