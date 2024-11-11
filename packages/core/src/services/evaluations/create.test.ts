import { beforeEach, describe, expect, it } from 'vitest'

import {
  EvaluationMetadataLlmAsJudgeAdvanced,
  ProviderApiKey,
  User,
  Workspace,
} from '../../browser'
import {
  EvaluationMetadataType,
  EvaluationResultableType,
  Providers,
} from '../../constants'
import { EvaluationsRepository } from '../../repositories'
import * as factories from '../../tests/factories'
import { createAdvancedEvaluation, createEvaluation } from './create'

describe('createAdvancedEvaluation', () => {
  let workspace: any
  let user: User
  let provider: ProviderApiKey

  beforeEach(async () => {
    const setup = await factories.createWorkspace()
    workspace = setup.workspace
    user = setup.userData
  })

  it('should throw an error when no provider API key is found', async () => {
    const result = await createAdvancedEvaluation({
      workspace: workspace,
      user,
      name: 'Test Evaluation',
      description: 'Test Description',
      resultType: EvaluationResultableType.Number,
      resultConfiguration: {
        minValue: 0,
        maxValue: 100,
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
      const result = await createAdvancedEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        resultType: EvaluationResultableType.Text,
        resultConfiguration: {},
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
      const result = await createAdvancedEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        resultType: EvaluationResultableType.Text,
        resultConfiguration: {},
        metadata: {
          prompt: 'miau',
        },
      })

      expect(result.ok).toBe(true)

      expect(result.value!.resultConfiguration).toBeDefined()
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
      const result = await createAdvancedEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        resultType: EvaluationResultableType.Number,
        resultConfiguration: {
          minValue: 0,
          maxValue: 100,
        },
        metadata: {
          prompt: 'miau',
        },
      })

      expect(result.ok).toBe(true)
      expect(result.value!.resultConfiguration).toMatchObject({
        minValue: 0,
        maxValue: 100,
      })
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
      const result = await createAdvancedEvaluation({
        workspace,
        user,
        name,
        description,
        resultType: EvaluationResultableType.Number,
        resultConfiguration: {
          minValue: 0,
          maxValue: 100,
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
          prompt: `---
provider: ${provider!.name}
model: gpt-4o-mini
---
${metadata.prompt}`.trim(),
        },
        workspaceId: workspace.id,
      })
    })

    it('creates an LLM as Judge evaluation with text configuration', async () => {
      const name = 'Test Evaluation'
      const description = 'Test Description'
      const metadata = { prompt: 'Test prompt' }

      const result = await createAdvancedEvaluation({
        workspace,
        user,
        name,
        description,
        resultType: EvaluationResultableType.Text,
        resultConfiguration: {},

        metadata,
      })

      expect(result.ok).toBe(true)
      const repo = new EvaluationsRepository(workspace.id)
      const evaluation = await repo
        .find(result.value!.id)
        .then((r) => r.unwrap())
      expect(evaluation.resultType).toBe(EvaluationResultableType.Text)
    })

    it('creates an LLM as Judge evaluation with boolean configuration', async () => {
      const name = 'Test Evaluation'
      const description = 'Test Description'
      const metadata = { prompt: 'Test prompt' }

      const result = await createAdvancedEvaluation({
        workspace,
        user,
        name,
        description,
        resultType: EvaluationResultableType.Boolean,
        resultConfiguration: {},
        metadata,
      })

      expect(result.ok).toBe(true)
      const repo = new EvaluationsRepository(workspace.id)
      const evaluation = await repo
        .find(result.value!.id)
        .then((r) => r.unwrap())

      expect(evaluation.resultType).toBe(EvaluationResultableType.Boolean)
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

      const result = await createAdvancedEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        resultType: EvaluationResultableType.Text,
        resultConfiguration: {},
        metadata,
      })

      expect(result.ok).toBe(true)
      const repo = new EvaluationsRepository(workspace.id)
      const evaluation = await repo
        .find(result.value!.id)
        .then((r) => r.unwrap())

      expect(
        (evaluation.metadata as EvaluationMetadataLlmAsJudgeAdvanced)
          .templateId,
      ).toBe(template.id)
    })

    it('does not allow to create a number type evaluation with invalid range', async () => {
      const result = await createAdvancedEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        resultType: EvaluationResultableType.Number,
        resultConfiguration: {
          minValue: 100,
          maxValue: 0,
        },
        metadata: {
          prompt: 'miau',
        },
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        'Invalid range min value has to be less than max value',
      )
    })

    it('should return an error when the range is of length 0', async () => {
      const result = await createAdvancedEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        resultType: EvaluationResultableType.Number,
        resultConfiguration: {
          minValue: 0,
          maxValue: 0,
        },
        metadata: {
          prompt: 'miau',
        },
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        'Invalid range min value has to be less than max value',
      )
    })
  })
})

describe('createEvaluation', () => {
  let workspace: Workspace
  let user: User
  let provider: ProviderApiKey
  let repo: EvaluationsRepository

  beforeEach(async () => {
    const setup = await factories.createWorkspace()
    workspace = setup.workspace
    user = setup.userData

    provider = await factories.createProviderApiKey({
      workspace,
      user,
      name: 'Test Provider',
      type: Providers.OpenAI,
    })

    repo = new EvaluationsRepository(workspace.id)
  })

  describe('create simple evaluations', () => {
    it('creates a simple evaluation with text configuration', async () => {
      const evaluationResult = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
        metadata: {
          providerApiKeyId: provider.id,
          model: 'test-model',
          objective: 'Test Objective',
          additionalInstructions: 'Test Instructions',
        },
        resultType: EvaluationResultableType.Text,
        resultConfiguration: {
          valueDescription: 'Test Value Description',
        },
      })

      expect(evaluationResult.ok).toBe(true)
      const evaluation = await repo
        .find(evaluationResult.value!.id)
        .then((r) => r.unwrap())

      expect(evaluation.metadata).toMatchObject({
        providerApiKeyId: provider.id,
        model: 'test-model',
        objective: 'Test Objective',
        additionalInstructions: 'Test Instructions',
      })

      expect(evaluation.resultConfiguration).toMatchObject({
        valueDescription: 'Test Value Description',
      })
    })

    it('adds the provider api key id and model to the metadata if they are not provided', async () => {
      const evaluationResult = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
        metadata: {
          objective: 'Test Objective',
          additionalInstructions: 'Test Instructions',
        },
        resultType: EvaluationResultableType.Text,
        resultConfiguration: {
          valueDescription: 'Test Value Description',
        },
      })

      expect(evaluationResult.ok).toBe(true)
      const evaluation = await repo
        .find(evaluationResult.value!.id)
        .then((r) => r.unwrap())

      expect(evaluation.metadata).toMatchObject({
        providerApiKeyId: provider.id,
        model: 'gpt-4o-mini',
        objective: 'Test Objective',
        additionalInstructions: 'Test Instructions',
      })

      expect(evaluation.resultConfiguration).toMatchObject({
        valueDescription: 'Test Value Description',
      })
    })

    it('connects the evaluation to the document', async () => {
      const prompt = factories.helpers.createPrompt({
        provider: 'Latitude',
        model: 'gpt-4o',
      })
      const { project, documents } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'Latitude' }],
        documents: {
          foo: prompt,
        },
      })
      const projectId = project.id
      const documentUuid = documents[0]!.documentUuid

      const evaluationResult = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
        metadata: {
          providerApiKeyId: provider.id,
          model: 'test-model',
          objective: 'Test Objective',
          additionalInstructions: 'Test Instructions',
        },
        resultType: EvaluationResultableType.Text,
        resultConfiguration: {
          valueDescription: 'Test Value Description',
        },
        projectId,
        documentUuid,
      })

      expect(evaluationResult.ok).toBe(true)
    })

    it('creates a simple evaluation with numeric configuration', async () => {
      const evaluationResult = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
        metadata: {
          providerApiKeyId: provider.id,
          model: 'test-model',
          objective: 'Test Objective',
          additionalInstructions: 'Test Instructions',
        },
        resultType: EvaluationResultableType.Number,
        resultConfiguration: {
          minValue: 0,
          maxValue: 100,
          minValueDescription: 'Test Min Value Description',
          maxValueDescription: 'Test Max Value Description',
        },
      })

      expect(evaluationResult.ok).toBe(true)
      const evaluation = await repo
        .find(evaluationResult.value!.id)
        .then((r) => r.unwrap())

      expect(evaluation.metadata).toMatchObject({
        providerApiKeyId: provider.id,
        model: 'test-model',
        objective: 'Test Objective',
        additionalInstructions: 'Test Instructions',
      })

      expect(evaluation.resultConfiguration).toMatchObject({
        minValue: 0,
        maxValue: 100,
        minValueDescription: 'Test Min Value Description',
        maxValueDescription: 'Test Max Value Description',
      })
    })

    it('creates a simple evaluation with boolean configuration', async () => {
      const evaluationResult = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
        metadata: {
          providerApiKeyId: provider.id,
          model: 'test-model',
          objective: 'Test Objective',
          additionalInstructions: 'Test Instructions',
        },
        resultType: EvaluationResultableType.Boolean,
        resultConfiguration: {
          trueValueDescription: 'Test True Value Description',
          falseValueDescription: 'Test False Value Description',
        },
      })

      expect(evaluationResult.ok).toBe(true)
      const evaluation = await repo
        .find(evaluationResult.value!.id)
        .then((r) => r.unwrap())

      expect(evaluation.metadata).toMatchObject({
        providerApiKeyId: provider.id,
        model: 'test-model',
        objective: 'Test Objective',
        additionalInstructions: 'Test Instructions',
      })

      expect(evaluation.resultConfiguration).toMatchObject({
        trueValueDescription: 'Test True Value Description',
        falseValueDescription: 'Test False Value Description',
      })
    })
  })

  describe('create advanced evaluations', () => {
    it('creates an advanced evaluation with text configuration', async () => {
      const evaluationResult = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
        metadata: {
          prompt: 'Test Prompt',
          templateId: null,
        },
        resultType: EvaluationResultableType.Text,
        resultConfiguration: {
          valueDescription: 'Test Value Description',
        },
      })

      expect(evaluationResult.ok).toBe(true)
      const evaluation = await repo
        .find(evaluationResult.value!.id)
        .then((r) => r.unwrap())

      expect(evaluation.metadata).toMatchObject({
        prompt: `---
provider: Test Provider
model: gpt-4o-mini
---
Test Prompt`.trim(),
        templateId: null,
      })

      expect(evaluation.resultConfiguration).toMatchObject({
        valueDescription: 'Test Value Description',
      })
    })

    it('creates an advanced evaluation with numeric configuration', async () => {
      const evaluationResult = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
        metadata: {
          prompt: 'Test Prompt',
          templateId: null,
        },
        resultType: EvaluationResultableType.Number,
        resultConfiguration: {
          minValue: 0,
          maxValue: 100,
          minValueDescription: 'Test Min Value Description',
          maxValueDescription: 'Test Max Value Description',
        },
      })

      expect(evaluationResult.ok).toBe(true)
      const evaluation = await repo
        .find(evaluationResult.value!.id)
        .then((r) => r.unwrap())

      expect(evaluation.metadata).toMatchObject({
        prompt: `---
provider: Test Provider
model: gpt-4o-mini
---
Test Prompt`.trim(),
        templateId: null,
      })

      expect(evaluation.resultConfiguration).toMatchObject({
        minValue: 0,
        maxValue: 100,
        minValueDescription: 'Test Min Value Description',
        maxValueDescription: 'Test Max Value Description',
      })
    })

    it('creates an advanced evaluation with boolean configuration', async () => {
      const evaluationResult = await createEvaluation({
        workspace,
        user,
        name: 'Test Evaluation',
        description: 'Test Description',
        metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
        metadata: {
          prompt: 'Test Prompt',
          templateId: null,
        },
        resultType: EvaluationResultableType.Boolean,
        resultConfiguration: {
          trueValueDescription: 'Test True Value Description',
          falseValueDescription: 'Test False Value Description',
        },
      })

      expect(evaluationResult.ok).toBe(true)
      const evaluation = await repo
        .find(evaluationResult.value!.id)
        .then((r) => r.unwrap())

      expect(evaluation.metadata).toMatchObject({
        prompt: `---
provider: Test Provider
model: gpt-4o-mini
---
Test Prompt`.trim(),
        templateId: null,
      })

      expect(evaluation.resultConfiguration).toMatchObject({
        trueValueDescription: 'Test True Value Description',
        falseValueDescription: 'Test False Value Description',
      })
    })
  })
})
