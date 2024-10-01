import { describe, expect, it } from 'vitest'

import { EvaluationResultsRepository } from '.'
import { EvaluationResultableType } from '../../constants'
import { mergeCommit } from '../../services/commits'
import * as factories from '../../tests/factories'

describe('findEvaluationResultsByDocumentUuid', () => {
  it('return evaluation results', async () => {
    const { workspace, project, user, providers } =
      await factories.createProject()
    const evaluation = await factories.createLlmAsJudgeEvaluation({
      user,
      workspace,
      prompt: factories.helpers.createPrompt({ provider: providers[0]! }),
      configuration: {
        type: EvaluationResultableType.Number,
        detail: {
          range: { from: 0, to: 100 },
        },
      },
    })

    const { commit: draft } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({ provider: providers[0]! }),
    })
    const commit = await mergeCommit(draft).then((r) => r.unwrap())

    const { documentLog } = await factories.createDocumentLog({
      document: doc,
      commit,
    })

    const { evaluationResult } = await factories.createEvaluationResult({
      documentLog,
      evaluation,
    })

    const evaluationResultsScope = new EvaluationResultsRepository(workspace.id)
    const result = await evaluationResultsScope
      .findByDocumentUuid(doc.documentUuid)
      .then((r) => r.unwrap())

    expect(result.length).toBe(1)
    expect(result[0]).toEqual(evaluationResult)
  })
})
