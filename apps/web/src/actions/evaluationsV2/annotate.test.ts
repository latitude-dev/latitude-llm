import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@latitude-data/constants'
import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
} from '@latitude-data/core/constants'
import {
  createEvaluationV2,
  createProject,
  createPromptWithCompletion,
  createTestMessages,
  helpers,
} from '@latitude-data/core/factories'
import { publisher } from '@latitude-data/core/events/publisher'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { findEvaluationResultByUuid } from '@latitude-data/core/queries/clickhouse/evaluationResultsV2/findByUuid'
import { Result } from '@latitude-data/core/lib/Result'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { writeEvaluationResultV2CreatedToClickhouse } from '@latitude-data/core/events/handlers/writeEvaluationResultV2ToClickhouse'
import * as workspaceFeaturesService from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import * as datadogCapture from '@latitude-data/core/utils/datadogCapture'
import { annotateEvaluationV2Action } from './annotate'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('annotateEvaluationV2Action', () => {
  let workspace: Workspace
  let user: User
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2
  let spanId: string
  let traceId: string

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const setup = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })

    workspace = setup.workspace
    user = setup.user
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!

    evaluation = await createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Human,
      metric: HumanEvaluationMetric.Rating,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        criteria: 'criteria',
        minRating: 1,
        minRatingDescription: 'min description',
        maxRating: 5,
        maxRatingDescription: 'max description',
        minThreshold: 3,
      },
    })

    const { input, output } = createTestMessages()
    const prompt = await createPromptWithCompletion({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
      input,
      output,
      model: 'gpt-4o',
      provider: 'openai',
    })
    spanId = prompt.promptSpan.id
    traceId = prompt.traceId

    mocks.getSession.mockResolvedValue({
      user,
      session: { userId: user.id, currentWorkspaceId: workspace.id },
    })

    vi.spyOn(
      workspaceFeaturesService,
      'isFeatureEnabledByName',
    ).mockResolvedValue(Result.ok(true))

    vi.spyOn(datadogCapture, 'captureException').mockImplementation((error) => {
      throw error
    })

    vi.spyOn(publisher, 'publishLater').mockResolvedValue()
  })

  it('writes results to postgres and clickhouse when enabled', async () => {
    const { data, serverError } = await annotateEvaluationV2Action({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      evaluationUuid: evaluation.uuid,
      resultScore: 4,
      spanId,
      traceId,
    })

    expect(serverError).toBeUndefined()
    expect(data?.uuid).toBeDefined()
    expect(publisher.publishLater).toHaveBeenCalled()

    const createdEvent = vi
      .mocked(publisher.publishLater)
      .mock.calls.map(([event]) => event)
      .find((event) => event.type === 'evaluationResultV2Created')
    expect(createdEvent?.type).toBe('evaluationResultV2Created')

    await writeEvaluationResultV2CreatedToClickhouse({
      data: createdEvent!,
    })

    const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
    const postgresResult = await resultsRepository.findByUuid(data!.uuid)
    expect(postgresResult.ok).toBe(true)

    const clickhouseRow = await findEvaluationResultByUuid({
      workspaceId: workspace.id,
      uuid: data!.uuid,
    })
    expect(clickhouseRow?.uuid).toBe(data!.uuid)
  })
})
