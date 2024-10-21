import { describe, expect, it } from 'vitest'

import { Providers } from '../../constants'
import { EvaluationsRepository } from '../../repositories'
import * as factories from '../../tests/factories'
import { connectEvaluations } from './connect'
import { destroyEvaluation } from './destroy'

describe('destroyEvaluation', () => {
  it('removes an evaluation, even if its connected and has results', async () => {
    const { workspace, user, documents, commit, evaluations } =
      await factories.createProject({
        providers: [{ name: 'openai', type: Providers.OpenAI }],
        documents: {
          doc1: factories.helpers.createPrompt({ provider: 'openai' }),
        },
        evaluations: [
          {
            prompt: factories.helpers.createPrompt({ provider: 'openai' }),
          },
        ],
      })

    const document = documents[0]!
    const evaluation = evaluations[0]!

    await connectEvaluations({
      workspace,
      documentUuid: document.documentUuid,
      evaluationUuids: [evaluation.uuid],
      user,
    })

    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
    })

    await factories.createEvaluationResult({
      documentLog,
      evaluation,
    })

    const evaluationRepository = new EvaluationsRepository(workspace.id)
    const allEvaluations = await evaluationRepository
      .findAll()
      .then((r) => r.unwrap())

    expect(allEvaluations.map((e) => e.id)).toEqual([evaluation.id])

    const result = await destroyEvaluation({ evaluation })
    expect(result.ok).toBe(true)

    const allEvaluationsAfter = await evaluationRepository
      .findAll()
      .then((r) => r.unwrap())
    expect(allEvaluationsAfter).toEqual([])
  })
})
