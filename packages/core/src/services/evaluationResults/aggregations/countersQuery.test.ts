import { beforeEach, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentVersion,
  Project,
  ProviderApiKey,
  User,
  Workspace,
} from '../../../browser'
import { database } from '../../../client'
import { EvaluationResultableType } from '../../../constants'
import { mergeCommit } from '../../../services/commits'
import * as factories from '../../../tests/factories'
import { getEvaluationTotalsQuery } from './countersQuery'
import { getEvaluationMeanValueQuery } from './meanValueQuery'
import { getEvaluationModalValueQuery } from './modalValueQuery'

let workspace: Workspace
let user: User
let project: Project
let provider: ProviderApiKey
let evaluation: Awaited<ReturnType<typeof factories.createLlmAsJudgeEvaluation>>
let commit: Commit
let documentVersion: DocumentVersion

describe('evaluation results aggregations', () => {
  beforeEach(async () => {
    const basic = await factories.createProject()
    workspace = basic.workspace
    user = basic.user
    project = basic.project
    provider = basic.providers[0]!
    documentVersion = basic.documents[0]!

    const { commit: draft } = await factories.createDraft({ project, user })
    const doc = await factories.createDocumentVersion({
      commit: draft,
      path: 'folder1/doc1',
      content: factories.helpers.createPrompt({ provider }),
    })
    documentVersion = doc.documentVersion

    commit = await mergeCommit(draft).then((r) => r.unwrap())
  })

  describe('numeric evaluations', () => {
    beforeEach(async () => {
      evaluation = await factories.createLlmAsJudgeEvaluation({
        workspace,
        prompt: factories.helpers.createPrompt({ provider }),
        configuration: {
          type: EvaluationResultableType.Number,
          detail: {
            range: { from: 0, to: 100 },
          },
        },
      })
      const { documentLog: log1 } = await factories.createDocumentLog({
        document: documentVersion,
        commit,
      })
      await factories.createEvaluationResult({
        documentLog: log1,
        evaluation,
        stepCosts: [
          {
            costInMillicents: 5,
            promptTokens: 3,
            completionTokens: 2,
          },
        ],
      })
      const { documentLog: log2 } = await factories.createDocumentLog({
        document: documentVersion,
        commit,
      })
      await factories.createEvaluationResult({
        documentLog: log2,
        evaluation,
        stepCosts: [
          {
            costInMillicents: 6,
            promptTokens: 4,
            completionTokens: 4,
          },
        ],
      })
    })

    it('aggregate counters for evaluation', async () => {
      const result = await getEvaluationTotalsQuery({
        workspaceId: workspace.id,
        documentUuid: documentVersion.documentUuid,
        evaluation,
        commit,
      })

      expect(result).toEqual({
        costInMillicents: 11,
        tokens: 13,
        totalCount: 2,
      })
    })

    it('mean aggregation', async () => {
      const evalResults =
        await database.query.evaluationResultableNumbers.findMany({
          columns: { result: true },
        })
      const result = await getEvaluationMeanValueQuery({
        workspaceId: workspace.id,
        documentUuid: documentVersion.documentUuid,
        evaluation,
        commit,
      })

      const expectedMean =
        evalResults.reduce((acc, result) => {
          return acc + Number(result.result)
        }, 0) / evalResults.length
      expect(result).toEqual({
        maxValue: 100,
        meanValue: expectedMean,
        minValue: 0,
      })
    })
  })

  describe('text evaluations', () => {
    beforeEach(async () => {
      evaluation = await factories.createLlmAsJudgeEvaluation({
        workspace,
        prompt: factories.helpers.createPrompt({ provider }),
        configuration: {
          type: EvaluationResultableType.Text,
        },
      })
    })

    it('modal aggregation', async () => {
      const result = await getEvaluationModalValueQuery({
        workspaceId: workspace.id,
        documentUuid: documentVersion.documentUuid,
        evaluation,
        commit,
      })
      expect(result).toEqual({
        mostCommon: '-',
        percentage: 0,
      })
    })

    describe('with results', () => {
      beforeEach(async () => {
        const { documentLog: log1 } = await factories.createDocumentLog({
          document: documentVersion,
          commit,
        })
        await factories.createEvaluationResult({
          result: 'apple',
          documentLog: log1,
          evaluation,
        })
        const { documentLog: log2 } = await factories.createDocumentLog({
          document: documentVersion,
          commit,
        })
        await factories.createEvaluationResult({
          result: 'apple',
          documentLog: log2,
          evaluation,
        })

        const { documentLog: log3 } = await factories.createDocumentLog({
          document: documentVersion,
          commit,
        })
        await factories.createEvaluationResult({
          result: 'orange',
          documentLog: log3,
          evaluation,
        })
      })

      it('modal aggregation', async () => {
        const result = await getEvaluationModalValueQuery({
          workspaceId: workspace.id,
          documentUuid: documentVersion.documentUuid,
          evaluation,
          commit,
        })
        expect(result.mostCommon).toBe('apple')
        // Funcky test because of floating point math issues
        // in Mac OS and CI Linux
        expect(result.percentage).toBeGreaterThan(65)
        expect(result.percentage).toBeLessThan(67)
      })
    })
  })
})
