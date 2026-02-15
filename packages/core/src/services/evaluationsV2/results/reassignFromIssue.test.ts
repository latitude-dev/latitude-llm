import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers, SpanType } from '@latitude-data/constants'
import {
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
  RuleEvaluationMetric,
} from '../../../constants'
import type { Commit } from '../../../schema/models/types/Commit'
import type { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import type { Workspace } from '../../../schema/models/types/Workspace'
import type { Project } from '../../../schema/models/types/Project'
import type { Issue } from '../../../schema/models/types/Issue'
import * as factories from '../../../tests/factories'
import { reassignResultFromIssue } from './reassignFromIssue'
import { Result } from '../../../lib/Result'
import { NotFoundError } from '../../../lib/errors'
import * as addModule from '../../issues/results/add'
import * as removeModule from '../../issues/results/remove'

describe('reassignResultFromIssue', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >
  let evaluationResult: EvaluationResultV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >
  let currentIssue: Issue
  let targetIssue: Issue

  beforeEach(async () => {
    vi.clearAllMocks()

    const {
      workspace: w,
      project: p,
      documents,
      commit: c,
      apiKeys,
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
    project = p
    commit = c
    document = documents[0]!

    evaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
    })

    const span = await factories.createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      apiKeyId: apiKeys[0]!.id,
    })

    // Create a failed evaluation result (required for issues)
    evaluationResult = await factories.createEvaluationResultV2({
      workspace,
      evaluation,
      commit,
      span: {
        ...span,
        type: SpanType.Prompt,
      } as any,
      score: 0,
      normalizedScore: 0,
      hasPassed: false,
    })

    // Create current and target issues
    currentIssue = (
      await factories.createIssue({
        workspace,
        project,
        document,
      })
    ).issue

    targetIssue = (
      await factories.createIssue({
        workspace,
        project,
        document,
      })
    ).issue
  })

  describe('when result is not assigned to any issue', () => {
    it('only calls addResultToIssue with correct parameters', async () => {
      const mockAdd = vi.spyOn(addModule, 'addResultToIssue').mockResolvedValue(
        Result.ok({
          result: evaluationResult,
          issue: targetIssue,
          histogram: {} as any,
        }),
      )

      const mockRemove = vi.spyOn(removeModule, 'removeResultFromIssue')

      const result = await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      expect(result.ok).toBe(true)
      expect(mockRemove).not.toHaveBeenCalled()
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace,
          issue: targetIssue,
          result: expect.objectContaining({
            result: evaluationResult,
            evaluation,
            embedding: undefined,
          }),
        }),
        expect.anything(),
      )

      mockAdd.mockRestore()
      mockRemove.mockRestore()
    })

    it('passes embedding parameter to addResultToIssue when provided', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      const resultWithEmbedding = {
        ...evaluationResult,
        embedding: mockEmbedding,
      }

      const mockAdd = vi.spyOn(addModule, 'addResultToIssue').mockResolvedValue(
        Result.ok({
          result: evaluationResult,
          issue: targetIssue,
          histogram: {} as any,
        }),
      )

      const mockRemove = vi.spyOn(removeModule, 'removeResultFromIssue')

      await reassignResultFromIssue({
        workspace,
        result: resultWithEmbedding,
        evaluation,
        targetIssue,
      })

      expect(mockRemove).not.toHaveBeenCalled()
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace,
          issue: targetIssue,
          result: expect.objectContaining({
            result: resultWithEmbedding,
            evaluation,
            embedding: mockEmbedding,
          }),
        }),
        expect.anything(),
      )

      mockAdd.mockRestore()
      mockRemove.mockRestore()
    })

    it('returns error when addResultToIssue fails', async () => {
      const mockError = new Error('Failed to add result')
      const mockAdd = vi
        .spyOn(addModule, 'addResultToIssue')
        .mockResolvedValue(Result.error(mockError))

      const result = await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBe(mockError)

      mockAdd.mockRestore()
    })
  })

  describe('when result is already assigned to an issue', () => {
    beforeEach(async () => {
      // Assign the result to the current issue via the intermediate table
      await factories.createIssueEvaluationResult({
        workspace,
        issue: currentIssue,
        evaluationResult,
      })
    })

    it('calls removeResultFromIssue and then addResultToIssue with correct parameters', async () => {
      const updatedResult = {
        ...evaluationResult,
        updatedAt: new Date(),
      }

      const mockRemove = vi
        .spyOn(removeModule, 'removeResultFromIssue')
        .mockResolvedValue(
          Result.ok({
            result: updatedResult,
            issue: currentIssue,
            histogram: {} as any,
          }),
        )

      const mockAdd = vi.spyOn(addModule, 'addResultToIssue').mockResolvedValue(
        Result.ok({
          result: updatedResult,
          issue: targetIssue,
          histogram: {} as any,
        }),
      )

      const result = await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      expect(result.ok).toBe(true)

      // Verify removeResultFromIssue was called first with current issue
      expect(mockRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace,
          issue: currentIssue,
          result: expect.objectContaining({
            result: evaluationResult,
            evaluation,
            embedding: undefined,
          }),
        }),
        expect.anything(),
      )

      // Verify addResultToIssue was called with target issue and updated result
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace,
          issue: targetIssue,
          result: expect.objectContaining({
            result: updatedResult,
            evaluation,
            embedding: undefined,
          }),
        }),
        expect.anything(),
      )

      // Verify order: remove should be called before add
      expect(mockRemove.mock.invocationCallOrder[0]).toBeLessThan(
        mockAdd.mock.invocationCallOrder[0]!,
      )

      mockRemove.mockRestore()
      mockAdd.mockRestore()
    })

    it('passes embedding from original result to removeResultFromIssue', async () => {
      const mockEmbedding = [0.4, 0.5, 0.6]
      const resultWithEmbedding = {
        ...evaluationResult,
        embedding: mockEmbedding,
      }

      const mockRemove = vi
        .spyOn(removeModule, 'removeResultFromIssue')
        .mockResolvedValue(
          Result.ok({
            result: evaluationResult,
            issue: currentIssue,
            histogram: {} as any,
          }),
        )

      const mockAdd = vi.spyOn(addModule, 'addResultToIssue').mockResolvedValue(
        Result.ok({
          result: evaluationResult,
          issue: targetIssue,
          histogram: {} as any,
        }),
      )

      await reassignResultFromIssue({
        workspace,
        result: resultWithEmbedding,
        evaluation,
        targetIssue,
      })

      expect(mockRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace,
          issue: currentIssue,
          result: expect.objectContaining({
            result: resultWithEmbedding,
            evaluation,
            embedding: mockEmbedding,
          }),
        }),
        expect.anything(),
      )

      mockRemove.mockRestore()
      mockAdd.mockRestore()
    })

    it('uses updated result from removeResultFromIssue in addResultToIssue call', async () => {
      const updatedResult = {
        ...evaluationResult,
        id: 999,
        updatedAt: new Date('2025-01-01'),
      }

      const mockRemove = vi
        .spyOn(removeModule, 'removeResultFromIssue')
        .mockResolvedValue(
          Result.ok({
            result: updatedResult,
            issue: currentIssue,
            histogram: {} as any,
          }),
        )

      const mockAdd = vi.spyOn(addModule, 'addResultToIssue').mockResolvedValue(
        Result.ok({
          result: updatedResult,
          issue: targetIssue,
          histogram: {} as any,
        }),
      )

      await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      // Verify that addResultToIssue received the updated result from removeResultFromIssue
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.objectContaining({
            result: updatedResult,
          }),
        }),
        expect.anything(),
      )

      mockRemove.mockRestore()
      mockAdd.mockRestore()
    })

    it('handles errors from findIssue when fetching current issue', async () => {
      // Association already created in beforeEach
      // Mock findIssue to fail
      const findIssueModule = await import('../../../queries/issues/findById')
      const findSpy = vi
        .spyOn(findIssueModule, 'findIssue')
        .mockRejectedValue(new NotFoundError('Issue not found'))

      const result = await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      expect(result.ok).toBe(false)
      expect(result.error?.message).toBe('Issue not found')

      findSpy.mockRestore()
    })

    it('returns error when removeResultFromIssue fails', async () => {
      const mockError = new Error('Failed to remove result')
      const mockRemove = vi
        .spyOn(removeModule, 'removeResultFromIssue')
        .mockResolvedValue(Result.error(mockError))

      const mockAdd = vi.spyOn(addModule, 'addResultToIssue')

      const result = await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBe(mockError)
      expect(mockAdd).not.toHaveBeenCalled()

      mockRemove.mockRestore()
      mockAdd.mockRestore()
    })

    it('returns error when addResultToIssue fails after successful removal', async () => {
      const mockRemove = vi
        .spyOn(removeModule, 'removeResultFromIssue')
        .mockResolvedValue(
          Result.ok({
            result: evaluationResult,
            issue: currentIssue,
            histogram: {} as any,
          }),
        )

      const mockError = new Error('Failed to add result')
      const mockAdd = vi
        .spyOn(addModule, 'addResultToIssue')
        .mockResolvedValue(Result.error(mockError))

      const result = await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBe(mockError)
      expect(mockRemove).toHaveBeenCalled()

      mockRemove.mockRestore()
      mockAdd.mockRestore()
    })
  })

  describe('existingAssociation logic', () => {
    it('correctly identifies result not assigned to any issue', async () => {
      const mockAdd = vi.spyOn(addModule, 'addResultToIssue').mockResolvedValue(
        Result.ok({
          result: evaluationResult,
          issue: targetIssue,
          histogram: {} as any,
        }),
      )

      const mockRemove = vi.spyOn(removeModule, 'removeResultFromIssue')

      await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      // No association exists, so removeResultFromIssue should not be called
      expect(mockRemove).not.toHaveBeenCalled()
      expect(mockAdd).toHaveBeenCalled()

      mockAdd.mockRestore()
      mockRemove.mockRestore()
    })

    it('correctly identifies result assigned to an active (non-merged) issue', async () => {
      // Create an association with an active issue
      await factories.createIssueEvaluationResult({
        workspace,
        issue: currentIssue,
        evaluationResult,
      })

      const mockRemove = vi
        .spyOn(removeModule, 'removeResultFromIssue')
        .mockResolvedValue(
          Result.ok({
            result: evaluationResult,
            issue: currentIssue,
            histogram: {} as any,
          }),
        )

      const mockAdd = vi.spyOn(addModule, 'addResultToIssue').mockResolvedValue(
        Result.ok({
          result: evaluationResult,
          issue: targetIssue,
          histogram: {} as any,
        }),
      )

      await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      // Association exists, so both remove and add should be called
      expect(mockRemove).toHaveBeenCalled()
      expect(mockAdd).toHaveBeenCalled()

      mockRemove.mockRestore()
      mockAdd.mockRestore()
    })

    it('ignores merged issues and only processes active issue associations', async () => {
      // Create a merged issue
      const mergedIssueResult = await factories.createIssue({
        workspace,
        project,
        document,
      })

      // Mark the issue as merged by updating it directly in the database
      const { database } = await import('../../../client')
      const { issues } = await import('../../../schema/models/issues')
      const { eq } = await import('drizzle-orm')
      await database
        .update(issues)
        .set({ mergedAt: new Date() })
        .where(eq(issues.id, mergedIssueResult.issue.id))

      const mergedIssue = {
        ...mergedIssueResult.issue,
        mergedAt: new Date(),
      }

      // Create associations with both merged and active issues
      await factories.createIssueEvaluationResult({
        workspace,
        issue: mergedIssue,
        evaluationResult,
      })

      await factories.createIssueEvaluationResult({
        workspace,
        issue: currentIssue,
        evaluationResult,
      })

      const mockRemove = vi
        .spyOn(removeModule, 'removeResultFromIssue')
        .mockResolvedValue(
          Result.ok({
            result: evaluationResult,
            issue: currentIssue,
            histogram: {} as any,
          }),
        )

      const mockAdd = vi.spyOn(addModule, 'addResultToIssue').mockResolvedValue(
        Result.ok({
          result: evaluationResult,
          issue: targetIssue,
          histogram: {} as any,
        }),
      )

      await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      // Should remove from active issue (currentIssue), not merged issue
      expect(mockRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          issue: currentIssue,
        }),
        expect.anything(),
      )

      expect(mockRemove).not.toHaveBeenCalledWith(
        expect.objectContaining({
          issue: mergedIssue,
        }),
        expect.anything(),
      )

      mockRemove.mockRestore()
      mockAdd.mockRestore()
    })

    it('selects most recent active association when multiple exist', async () => {
      // Create older association
      const olderIssue = (
        await factories.createIssue({
          workspace,
          project,
          document,
        })
      ).issue

      const olderDate = new Date(Date.now() - 10000)
      await factories.createIssueEvaluationResult({
        workspace,
        issue: olderIssue,
        evaluationResult,
        createdAt: olderDate,
      })

      // Create newer association
      await factories.createIssueEvaluationResult({
        workspace,
        issue: currentIssue,
        evaluationResult,
      })

      const mockRemove = vi
        .spyOn(removeModule, 'removeResultFromIssue')
        .mockResolvedValue(
          Result.ok({
            result: evaluationResult,
            issue: currentIssue,
            histogram: {} as any,
          }),
        )

      const mockAdd = vi.spyOn(addModule, 'addResultToIssue').mockResolvedValue(
        Result.ok({
          result: evaluationResult,
          issue: targetIssue,
          histogram: {} as any,
        }),
      )

      await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      // Should remove from most recent issue (currentIssue)
      expect(mockRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          issue: currentIssue,
        }),
        expect.anything(),
      )

      mockRemove.mockRestore()
      mockAdd.mockRestore()
    })
  })

  describe('transaction handling', () => {
    it('returns successful result from addResultToIssue', async () => {
      const expectedOutput = {
        result: evaluationResult,
        issue: targetIssue,
        histogram: { id: 123 } as any,
      }

      const mockAdd = vi
        .spyOn(addModule, 'addResultToIssue')
        .mockResolvedValue(Result.ok(expectedOutput))

      const result = await reassignResultFromIssue({
        workspace,
        result: evaluationResult,
        evaluation,
        targetIssue,
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual(expectedOutput)
      }

      mockAdd.mockRestore()
    })
  })
})
