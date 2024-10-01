import { describe, expect, it } from 'vitest'

import { Providers } from '../../browser'
import {
  createDocumentLog,
  createEvaluationResult,
  createLlmAsJudgeEvaluation,
  createProject,
  createProviderLog,
  helpers,
} from '../../tests/factories'
import { EvaluationResultsRepository } from './index'

describe('EvaluationResultsRepository', () => {
  describe('findAll', () => {
    it('should return only results from the specified workspace', async () => {
      // Create projects for each workspace
      const {
        workspace: workspace1,
        documents: [document1],
        commit: commit1,
        providers: [provider1],
        user: user1,
      } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          foo: helpers.createPrompt({
            provider: 'openai',
          }),
        },
      })
      const {
        workspace: workspace2,
        user: user2,
        documents: [document2],
        commit: commit2,
        providers: [provider2],
      } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          bar: helpers.createPrompt({
            provider: 'openai',
          }),
        },
      })

      // Create evaluations for each workspace
      const evaluation1 = await createLlmAsJudgeEvaluation({
        user: user1,
        workspace: workspace1,
      })
      const evaluation2 = await createLlmAsJudgeEvaluation({
        user: user2,
        workspace: workspace2,
      })

      // Create document logs for each project
      const documentLog1 = await createDocumentLog({
        document: document1!,
        commit: commit1,
      })
      const documentLog2 = await createDocumentLog({
        document: document2!,
        commit: commit2,
      })

      await createProviderLog({
        documentLogUuid: documentLog1.documentLog.uuid,
        providerId: provider1!.id,
        providerType: Providers.OpenAI,
      })
      await createProviderLog({
        documentLogUuid: documentLog2.documentLog.uuid,
        providerId: provider2!.id,
        providerType: Providers.OpenAI,
      })

      // Create evaluation results for each workspace
      await createEvaluationResult({
        documentLog: documentLog1.documentLog,
        evaluation: evaluation1,
        result: 'Result 1',
      })
      await createEvaluationResult({
        documentLog: documentLog2.documentLog,
        evaluation: evaluation2,
        result: 'Result 2',
      })

      // Initialize repositories for each workspace
      const repo1 = new EvaluationResultsRepository(workspace1.id)
      const repo2 = new EvaluationResultsRepository(workspace2.id)

      // Fetch results for each workspace
      const results1 = await repo1.findAll()
      const results2 = await repo2.findAll()

      // Assert that each repository only returns results for its workspace
      expect(results1.ok).toBe(true)
      expect(results2.ok).toBe(true)

      const data1 = results1.unwrap()
      const data2 = results2.unwrap()

      expect(data1.length).toBe(1)
      expect(data2.length).toBe(1)

      expect(data1[0]?.result).toBe('Result 1')
      expect(data2[0]?.result).toBe('Result 2')
    })
  })
})
