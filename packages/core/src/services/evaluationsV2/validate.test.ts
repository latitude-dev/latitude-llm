import {
  CompositeEvaluationMetric,
  HumanEvaluationMetric,
  LlmEvaluationMetric,
  Providers,
} from '@latitude-data/constants'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { database } from '../../client'
import {
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  LAST_INTERACTION_DEBOUNCE_MAX_SECONDS,
  LAST_INTERACTION_DEBOUNCE_MIN_SECONDS,
  RuleEvaluationMetric,
} from '../../constants'
import { BadRequestError } from '../../lib/errors'
import { issues } from '../../schema/models/issues'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
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
  let settingsLLMasJudgeBinary: EvaluationSettings<
    EvaluationType.Llm,
    LlmEvaluationMetric.Binary
  >

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
    }

    settingsLLMasJudgeBinary = {
      name: 'name',
      description: 'description',
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        provider: 'openai',
        model: 'gpt-4o',
        criteria: 'criteria',
        passDescription: 'pass',
        failDescription: 'fail',
      },
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
        issue: null,
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
        issue: null,
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
        issue: null,
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
        issue: null,
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
        issue: null,
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
        issue: null,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Field accessor is not supported for this format'),
    )
  })

  it('fails when expected output configuration is required but not set', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: {
          ...settings,
          configuration: {
            ...settings.configuration,
            expectedOutput: undefined,
          },
        },
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
        issue: null,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(
        'Expected output configuration is required for this metric',
      ),
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
        issue: null,
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
        issue: null,
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
        issue: null,
      }).then((r) => r.unwrap()),
    ).rejects.toMatchObject({
      issues: [
        {
          code: 'custom',
          path: ['name'],
          message:
            'An evaluation with this name already exists for this document',
        },
      ],
    })
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
        issue: null,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('This metric does not support live evaluation'),
    )
  })

  it('fails when lastInteractionDebounce is below minimum', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: {
          ...settings,
          configuration: {
            ...settings.configuration,
            trigger: {
              target: 'every',
              lastInteractionDebounce:
                LAST_INTERACTION_DEBOUNCE_MIN_SECONDS - 1,
            },
          },
        },
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
        issue: null,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(expect.any(ZodError))
  })

  it('fails when lastInteractionDebounce is above maximum', async () => {
    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: {
          ...settings,
          configuration: {
            ...settings.configuration,
            trigger: {
              target: 'every',
              lastInteractionDebounce:
                LAST_INTERACTION_DEBOUNCE_MAX_SECONDS + 1,
            },
          },
        },
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
        issue: null,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(expect.any(ZodError))
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
        issue: null,
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
        issue: null,
      }).then((r) => r.unwrap())

    expect(validatedSettings).toEqual(settings)
    expect(validatedOptions).toEqual(options)
  })

  it('fails when linking issue to composite evaluation', async () => {
    const { issue } = await factories.createIssue({
      document: document,
      workspace: workspace,
    })

    const compositeSettings = {
      name: 'name',
      description: 'description',
      type: EvaluationType.Composite,
      metric: CompositeEvaluationMetric.Average,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        evaluationUuids: [
          (
            await factories.createEvaluationV2({
              document: document,
              commit: commit,
              workspace: workspace,
              type: EvaluationType.Rule,
              metric: RuleEvaluationMetric.LengthCount,
              configuration: {
                reverseScale: false,
                actualOutput: {
                  messageSelection: 'last',
                  parsingFormat: 'string',
                },
                expectedOutput: {
                  parsingFormat: 'string',
                },
                algorithm: 'word',
                maxLength: 20,
              },
            })
          ).uuid,
        ],
        minThreshold: 75,
      },
    } as EvaluationSettings<
      EvaluationType.Composite,
      CompositeEvaluationMetric.Average
    >

    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: compositeSettings,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
        issue: issue,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Cannot link an issue to a composite evaluation'),
    )
  })

  it('fails when linking issue to an evaluation that requires expected output', async () => {
    const { issue } = await factories.createIssue({
      document: document,
      workspace: workspace,
    })

    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: settings,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
        issue: issue,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(
        'Cannot link an issue to an evaluation that requires expected output',
      ),
    )
  })

  it('fails when linking issue to an evaluation that does not support live evaluation', async () => {
    const { issue } = await factories.createIssue({
      document: document,
      workspace: workspace,
    })

    // Human rating does not support live evaluation but has no expected output
    const humanRatingSettings = {
      name: 'name',
      description: 'description',
      type: EvaluationType.Human,
      metric: HumanEvaluationMetric.Rating,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'all',
          parsingFormat: 'string',
        },
        minRating: 0,
        maxRating: 100,
        minThreshold: 0,
        maxThreshold: 100,
      },
    } as EvaluationSettings<EvaluationType.Human, HumanEvaluationMetric.Rating>

    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: humanRatingSettings,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
        issue: issue,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(
        `Cannot link an issue to an evaluation that doesn't support live evaluation`,
      ),
    )
  })

  it('fails when linking issue to an evaluation that has been merged', async () => {
    const { issue } = await factories.createIssue({
      document: document,
      workspace: workspace,
    })

    await database
      .update(issues)
      .set({ mergedAt: new Date() })
      .where(eq(issues.id, issue.id))

    const updatedIssue = await database
      .select()
      .from(issues)
      .where(eq(issues.id, issue.id))
      .then((r) => r[0]!)

    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: settingsLLMasJudgeBinary,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
        issue: updatedIssue,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Cannot link an issue that has been merged'),
    )
  })

  it('fails when linking issue to an evaluation that has been resolved', async () => {
    const { issue } = await factories.createIssue({
      document: document,
      workspace: workspace,
    })

    await database
      .update(issues)
      .set({ resolvedAt: new Date() })
      .where(eq(issues.id, issue.id))

    const updatedIssue = await database
      .select()
      .from(issues)
      .where(eq(issues.id, issue.id))
      .then((r) => r[0]!)

    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: settingsLLMasJudgeBinary,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
        issue: updatedIssue,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Cannot link an issue that has been resolved'),
    )
  })

  it('fails when linking issue to an evaluation that has been ignored', async () => {
    const { issue } = await factories.createIssue({
      document: document,
      workspace: workspace,
    })

    await database
      .update(issues)
      .set({ ignoredAt: new Date() })
      .where(eq(issues.id, issue.id))

    const updatedIssue = await database
      .select()
      .from(issues)
      .where(eq(issues.id, issue.id))
      .then((r) => r[0]!)

    await expect(
      validateEvaluationV2({
        mode: 'create',
        settings: settingsLLMasJudgeBinary,
        options: options,
        document: document,
        commit: commit,
        workspace: workspace,
        issue: updatedIssue,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Cannot link an issue that has been ignored'),
    )
  })
})
