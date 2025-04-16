import { subDays } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Commit,
  DOCUMENT_SUGGESTION_EXPIRATION_DAYS,
  DocumentVersion,
  EVALUATION_RESULT_RECENCY_DAYS,
  EvaluationDto,
  EvaluationMetadataType,
  EvaluationResultableType,
  LogSources,
  ProviderApiKey,
  User,
  Workspace,
} from '../../../browser'
import { mergeCommit } from '../../../services/commits'
import * as factories from '../../../tests/factories'
import { requestDocumentSuggestionsJob } from './requestDocumentSuggestionsJob'
import { documentSuggestionsQueue } from '../../queues'

describe('requestDocumentSuggestionsJob', () => {
  const mocks = vi.hoisted(() => ({
    documentSuggestionsQueue: vi.fn(),
  }))

  let candidate1: Awaited<ReturnType<typeof prepareCandidate>>[]
  let candidate2: Awaited<ReturnType<typeof prepareCandidate>>[]
  let candidate3: Awaited<ReturnType<typeof prepareCandidate>>[]

  async function prepareCandidate({
    workspace,
    user,
    evaluation,
    document,
    commit,
    provider,
    asLive,
    withResults,
    resultsUpdatedAt,
    withSuggestion,
    suggestionCreatedAt,
  }: {
    workspace: Workspace
    user: User
    evaluation: EvaluationDto
    document: DocumentVersion
    commit: Commit
    provider: ProviderApiKey
    asLive: boolean
    withResults: boolean
    resultsUpdatedAt?: Date
    withSuggestion: boolean
    suggestionCreatedAt?: Date
  }) {
    await factories.createConnectedEvaluation({
      workspace: workspace,
      user: user,
      evaluationUuid: evaluation.uuid,
      documentUuid: document.documentUuid,
      live: asLive,
    })

    if (withResults) {
      const { documentLog } = await factories.createDocumentLog({
        document: document,
        commit: commit,
        source: LogSources.API,
      })

      const providerLog = await factories.createProviderLog({
        workspace: workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
      })

      await factories.createEvaluationResult({
        evaluation: evaluation,
        documentLog: documentLog,
        evaluatedProviderLog: providerLog,
        result: '31',
        evaluationResultCreatedAt: resultsUpdatedAt,
        evaluationResultUpdatedAt: resultsUpdatedAt,
      })
    }

    if (withSuggestion) {
      await factories.createDocumentSuggestion({
        commit: commit,
        document: document,
        evaluation: { ...evaluation, version: 'v1' },
        workspace: workspace,
        createdAt: suggestionCreatedAt,
      })
    }

    return {
      workspaceId: workspace.id,
      commitId: document.commitId,
      documentUuid: document.documentUuid,
      evaluationId: evaluation.id,
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: workspace1,
      providers: providers1,
      project: project1,
      user: user1,
    } = await factories.createProject()
    const {
      workspace: workspace2,
      providers: providers2,
      project: project2,
      user: user2,
    } = await factories.createProject()
    const workspaces = [workspace1, workspace2]
    const projects = [project1, project2]
    const users = [user1, user2]
    const providers = [providers1[0]!, providers2[0]!]

    const commit1 = await factories.createCommit({
      projectId: projects[0]!.id,
      user: users[0]!,
    })
    const commit2 = await factories.createCommit({
      projectId: projects[0]!.id,
      user: users[0]!,
    })
    const commit3 = await factories.createCommit({
      projectId: projects[1]!.id,
      user: users[1]!,
    })
    const commits = [commit1, commit2, commit3]

    const { documentVersion: document1 } =
      await factories.createDocumentVersion({
        workspace: workspaces[0]!,
        user: users[0]!,
        commit: commits[0]!,
        path: 'candidate_1',
        content: factories.helpers.createPrompt({ provider: providers[0]! }),
      })
    const { documentVersion: document2 } =
      await factories.createDocumentVersion({
        workspace: workspaces[0]!,
        user: users[0]!,
        commit: commits[0]!,
        path: 'candidate_2',
        content: factories.helpers.createPrompt({ provider: providers[0]! }),
      })
    const { documentVersion: document3 } =
      await factories.createDocumentVersion({
        workspace: workspaces[0]!,
        user: users[0]!,
        commit: commits[0]!,
        path: 'no_candidate',
        content: factories.helpers.createPrompt({ provider: providers[0]! }),
      })
    const { documentVersion: document4 } =
      await factories.createDocumentVersion({
        workspace: workspaces[0]!,
        user: users[0]!,
        commit: commits[1]!,
        path: 'candidate_not_merged',
        content: factories.helpers.createPrompt({ provider: providers[0]! }),
      })
    const { documentVersion: document5 } =
      await factories.createDocumentVersion({
        workspace: workspaces[1]!,
        user: users[1]!,
        commit: commits[2]!,
        path: 'candidate_3',
        content: factories.helpers.createPrompt({ provider: providers[1]! }),
      })
    const documents = [document1, document2, document3, document4, document5]

    commits[0] = await mergeCommit(commits[0]!).then((r) => r.unwrap())
    commits[2] = await mergeCommit(commits[2]!).then((r) => r.unwrap())

    const evaluation1 = await factories.createEvaluation({
      workspace: workspaces[0]!,
      user: users[0]!,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })
    const evaluation2 = await factories.createEvaluation({
      workspace: workspaces[0]!,
      user: users[0]!,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })
    const evaluation3 = await factories.createEvaluation({
      workspace: workspaces[0]!,
      user: users[0]!,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })
    const evaluation4 = await factories.createEvaluation({
      workspace: workspaces[0]!,
      user: users[0]!,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })
    const evaluation5 = await factories.createEvaluation({
      workspace: workspaces[0]!,
      user: users[0]!,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })
    const evaluation6 = await factories.createEvaluation({
      workspace: workspaces[0]!,
      user: users[0]!,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })
    const evaluation7 = await factories.createEvaluation({
      workspace: workspaces[1]!,
      user: users[1]!,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })
    const evaluations = [
      evaluation1,
      evaluation2,
      evaluation3,
      evaluation4,
      evaluation5,
      evaluation6,
      evaluation7,
    ]

    candidate1 = [
      await prepareCandidate({
        workspace: workspaces[0]!,
        user: users[0]!,
        evaluation: evaluations[0]!,
        document: documents[0]!,
        commit: commits[0]!,
        provider: providers[0]!,
        asLive: true,
        withResults: true,
        resultsUpdatedAt: new Date(),
        withSuggestion: false,
      }),
      await prepareCandidate({
        workspace: workspaces[0]!,
        user: users[0]!,
        evaluation: evaluations[1]!,
        document: documents[0]!,
        commit: commits[0]!,
        provider: providers[0]!,
        asLive: true,
        withResults: true,
        resultsUpdatedAt: new Date(),
        withSuggestion: false,
      }),
      await prepareCandidate({
        workspace: workspaces[0]!,
        user: users[0]!,
        evaluation: evaluations[2]!,
        document: documents[0]!,
        commit: commits[0]!,
        provider: providers[0]!,
        asLive: false,
        withResults: true,
        resultsUpdatedAt: new Date(),
        withSuggestion: false,
      }),
    ]

    candidate2 = [
      await prepareCandidate({
        workspace: workspaces[0]!,
        user: users[0]!,
        evaluation: evaluations[0]!,
        document: documents[1]!,
        commit: commits[0]!,
        provider: providers[0]!,
        asLive: true,
        withResults: true,
        resultsUpdatedAt: new Date(),
        withSuggestion: true,
        suggestionCreatedAt: subDays(
          new Date(),
          DOCUMENT_SUGGESTION_EXPIRATION_DAYS + 1,
        ),
      }),
    ]

    // No candidate
    await prepareCandidate({
      workspace: workspaces[0]!,
      user: users[0]!,
      evaluation: evaluations[3]!,
      document: documents[2]!,
      commit: commits[0]!,
      provider: providers[0]!,
      asLive: true,
      withResults: false,
      withSuggestion: false,
    })
    await prepareCandidate({
      workspace: workspaces[0]!,
      user: users[0]!,
      evaluation: evaluations[4]!,
      document: documents[2]!,
      commit: commits[0]!,
      provider: providers[0]!,
      asLive: true,
      withResults: true,
      resultsUpdatedAt: new Date(),
      withSuggestion: true,
      suggestionCreatedAt: new Date(),
    })
    await prepareCandidate({
      workspace: workspaces[0]!,
      user: users[0]!,
      evaluation: evaluations[5]!,
      document: documents[2]!,
      commit: commits[0]!,
      provider: providers[0]!,
      asLive: true,
      withResults: true,
      resultsUpdatedAt: subDays(new Date(), EVALUATION_RESULT_RECENCY_DAYS + 1),
      withSuggestion: false,
    })

    // Candidate not merged
    await prepareCandidate({
      workspace: workspaces[0]!,
      user: users[0]!,
      evaluation: evaluations[0]!,
      document: documents[3]!,
      commit: commits[1]!,
      provider: providers[0]!,
      asLive: true,
      withResults: true,
      resultsUpdatedAt: new Date(),
      withSuggestion: false,
    })

    candidate3 = [
      await prepareCandidate({
        workspace: workspaces[1]!,
        user: users[1]!,
        evaluation: evaluations[6]!,
        document: documents[4]!,
        commit: commits[2]!,
        provider: providers[1]!,
        asLive: true,
        withResults: true,
        resultsUpdatedAt: new Date(),
        withSuggestion: false,
      }),
    ]

    vi.spyOn(documentSuggestionsQueue, 'add').mockImplementation(
      mocks.documentSuggestionsQueue,
    )
  })

  it('requests suggestions for candidate documents', async () => {
    await requestDocumentSuggestionsJob({} as any)

    const options = { attempts: 1, deduplication: { id: expect.any(String) } }
    const expectedCalls = [
      ['generateDocumentSuggestionJob', candidate1[0]!, options],
      ['generateDocumentSuggestionJob', candidate1[1]!, options],
      ['generateDocumentSuggestionJob', candidate2[0]!, options],
      ['generateDocumentSuggestionJob', candidate3[0]!, options],
    ]

    const actualCalls = mocks.documentSuggestionsQueue.mock.calls
    expect(actualCalls).toHaveLength(expectedCalls.length)
    expect(actualCalls).toEqual(expect.arrayContaining(expectedCalls))
  })
})
