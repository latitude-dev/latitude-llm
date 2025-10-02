import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { Commit, DocumentVersion, Workspace } from '../../schema/types'
import { EvaluationOptions, EvaluationSettings } from '../../constants'
import {
  EvaluationType,
  Providers,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { BadRequestError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import { RuleEvaluationExactMatchSpecification } from './rule/exactMatch'
import { validateEvaluationV2 } from './validate'

describe('validateEvaluationV2', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let settings: EvaluationSettings<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >
  let options: EvaluationOptions

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      documents,
      commit: c,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })

    workspace = w
    commit = c
    document = documents[0]!

    settings = {
      name: 'name',
      description: 'description',
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.ExactMatch,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        caseInsensitive: false,
      },
    }
    options = {
      evaluateLiveLogs: false,
      enableSuggestions: true,
      autoApplySuggestions: true,
    }
  })

  it('fails when evaluation is not provided when updating', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'update',
        settings: settings,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Evaluation is required to update from'),
    )
  })

  it('fails when name is not provided', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: {
          ...settings,
          name: '',
        },
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Name is required'))
  })

  it('fails when type is not valid', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: {
          ...settings,
          type: 'invalid' as any,
        },
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Invalid type'))
  })

  it('fails when metric is not valid', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: {
          ...settings,
          metric: 'invalid' as any,
        },
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Invalid metric'))
  })

  it('fails when configuration is not valid', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: {
          ...settings,
          configuration: {} as any,
        },
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(expect.any(ZodError))
  })

  it('fails when actual output validation fails', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: {
          ...settings,
          configuration: {
            ...settings.configuration,
            actualOutput: {
              ...settings.configuration.actualOutput!,
              fieldAccessor: 'field',
            },
          },
        },
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Field accessor is not supported for this format'),
    )
  })

  it('fails when expected output validation fails', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: {
          ...settings,
          configuration: {
            ...settings.configuration,
            expectedOutput: {
              ...settings.configuration.expectedOutput!,
              parsingFormat: 'json',
              fieldAccessor: Array(100).fill('field').join('.'),
            },
          },
        },
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Field accessor is too complex'))
  })

  it('fails when type and metric validation fails', async () => {
    vi.spyOn(
      RuleEvaluationExactMatchSpecification,
      'validate',
    ).mockRejectedValue(new Error('metric validation error'))

    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: settings,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new Error('metric validation error'))
  })

  it('fails when another evaluation with the same name already exists', async () => {
    await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
      name: settings.name,
    })

    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: settings,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(
        'An evaluation with this name already exists for this document',
      ),
    )
  })

  it('fails when evaluate live logs option is not valid', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: settings,
        options: {
          ...options,
          evaluateLiveLogs: true,
        },
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('This metric does not support live evaluation'),
    )
  })

  it('succeeds when validating an evaluation from create', async () => {
    const { settings: validatedSettings, options: validatedOptions } =
      await validateEvaluationV2({
        mode: 'create',
        settings: settings,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap())

    expect(validatedSettings).toEqual(settings)
    expect(validatedOptions).toEqual(options)
  })

  it('succeeds when validating an evaluation from update', async () => {
    const evaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
      ...settings,
      name: 'old name',
      ...options,
    })

    const { settings: validatedSettings, options: validatedOptions } =
      await validateEvaluationV2({
        mode: 'update',
        evaluation: evaluation,
        settings: settings,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap())

    expect(validatedSettings).toEqual(settings)
    expect(validatedOptions).toEqual(options)
  })
})
