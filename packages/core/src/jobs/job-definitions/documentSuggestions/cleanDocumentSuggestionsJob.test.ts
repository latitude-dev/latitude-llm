import { subDays } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DOCUMENT_SUGGESTION_EXPIRATION_DAYS,
  DocumentSuggestion,
  EvaluationMetadataType,
  EvaluationResultableType,
  LogSources,
} from '../../../browser'
import { database } from '../../../client'
import { documentSuggestions } from '../../../schema'
import * as factories from '../../../tests/factories'
import { cleanDocumentSuggestionsJob } from './cleanDocumentSuggestionsJob'

describe('cleanDocumentSuggestionsJob', () => {
  let suggestions: DocumentSuggestion[]

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()

    const { workspace, providers, project, user } =
      await factories.createProject()
    const provider = providers[0]!

    const commit = await factories.createCommit({
      projectId: project.id,
      user: user,
    })

    const { documentVersion: document } = await factories.createDocumentVersion(
      {
        workspace: workspace,
        user: user,
        commit: commit,
        path: 'prompt',
        content: factories.helpers.createPrompt({ provider }),
      },
    )

    const evaluations = []
    for (let i = 0; i < 3; i++) {
      const evaluation = await factories.createEvaluation({
        workspace: workspace,
        user: user,
        metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
        resultType: EvaluationResultableType.Number,
        resultConfiguration: { minValue: 0, maxValue: 100 },
      })

      await factories.createConnectedEvaluation({
        workspace: workspace,
        user: user,
        evaluationUuid: evaluation.uuid,
        documentUuid: document.documentUuid,
        live: true,
      })

      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
        source: LogSources.Playground,
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
        result: i.toString(),
      })

      evaluations.push(evaluation)
    }

    suggestions = [
      await factories.createDocumentSuggestion({
        document: document,
        evaluation: evaluations[0]!,
        workspace: workspace,
        createdAt: new Date(),
      }),
      await factories.createDocumentSuggestion({
        document: document,
        evaluation: evaluations[0]!,
        workspace: workspace,
        createdAt: subDays(new Date(), DOCUMENT_SUGGESTION_EXPIRATION_DAYS + 1),
      }),
      await factories.createDocumentSuggestion({
        document: document,
        evaluation: evaluations[1]!,
        workspace: workspace,
        createdAt: subDays(new Date(), DOCUMENT_SUGGESTION_EXPIRATION_DAYS + 9),
      }),
      await factories.createDocumentSuggestion({
        document: document,
        evaluation: evaluations[2]!,
        workspace: workspace,
        createdAt: subDays(new Date(), 3),
      }),
    ]
  })

  it('deletes expired suggestions', async () => {
    expect(await database.select().from(documentSuggestions)).toEqual([
      suggestions[0]!,
      suggestions[1]!,
      suggestions[2]!,
      suggestions[3]!,
    ])

    await cleanDocumentSuggestionsJob({} as any)

    expect(await database.select().from(documentSuggestions)).toEqual([
      suggestions[0]!,
      suggestions[3]!,
    ])
  })
})
