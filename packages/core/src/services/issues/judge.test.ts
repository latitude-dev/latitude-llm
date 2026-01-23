import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as env from '@latitude-data/env'
import { Result } from '../../lib/Result'
import { Issue } from '../../schema/models/types/Issue'
import { judgeMergeCandidates } from './judge'
import * as copilotModule from '../copilot'

vi.mock('../copilot', () => ({
  runCopilot: vi.fn(),
}))

describe('judgeMergeCandidates', () => {
  const mockRunCopilot = vi.mocked(copilotModule.runCopilot)

  const createMockIssue = (overrides: Partial<Issue> = {}): Issue => ({
    id: 1,
    uuid: 'test-uuid',
    workspaceId: 1,
    projectId: 1,
    documentUuid: 'doc-uuid',
    title: 'Test Issue',
    description: 'Test description',
    centroid: { base: [], weight: 0 },
    resolvedAt: null,
    ignoredAt: null,
    mergedAt: null,
    mergedToIssueId: null,
    escalatingAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()
  })

  describe('when COPILOT_PROMPT_ISSUE_MERGE_JUDGE_PATH is not set', () => {
    beforeEach(() => {
      vi.spyOn(env, 'env', 'get').mockReturnValue({
        ...env.env,
        COPILOT_PROMPT_ISSUE_MERGE_JUDGE_PATH: undefined,
      } as typeof env.env)
    })

    it('returns all candidates without calling copilot', async () => {
      const anchor = createMockIssue({ id: 1, title: 'Anchor Issue' })
      const candidates = [
        createMockIssue({ id: 2, title: 'Candidate 1' }),
        createMockIssue({ id: 3, title: 'Candidate 2' }),
      ]

      const result = await judgeMergeCandidates({ anchor, candidates })

      expect(result).toEqual(candidates)
      expect(mockRunCopilot).not.toHaveBeenCalled()
    })
  })

  describe('when COPILOT_PROMPT_ISSUE_MERGE_JUDGE_PATH is set', () => {
    beforeEach(() => {
      vi.spyOn(env, 'env', 'get').mockReturnValue({
        ...env.env,
        COPILOT_PROMPT_ISSUE_MERGE_JUDGE_PATH: '/copilot/issue/merge-judge',
      } as typeof env.env)
    })

    it('returns empty array when no candidates provided', async () => {
      const anchor = createMockIssue({ id: 1 })

      const result = await judgeMergeCandidates({ anchor, candidates: [] })

      expect(result).toEqual([])
      expect(mockRunCopilot).not.toHaveBeenCalled()
    })

    it('filters candidates based on LLM judgment', async () => {
      const anchor = createMockIssue({
        id: 1,
        title: 'Memory leak in API handler',
        description:
          'The API handler is leaking memory when processing large requests',
      })
      const candidate1 = createMockIssue({
        id: 2,
        title: 'Memory issue in request processing',
        description: 'Large requests cause memory issues',
      })
      const candidate2 = createMockIssue({
        id: 3,
        title: 'Slow database queries',
        description: 'Database queries are taking too long',
      })

      mockRunCopilot.mockResolvedValue(
        Result.ok({
          decisions: [
            { candidateId: 2, shouldMerge: true, reason: 'Same memory issue' },
            {
              candidateId: 3,
              shouldMerge: false,
              reason: 'Different issue type',
            },
          ],
        }),
      )

      const result = await judgeMergeCandidates({
        anchor,
        candidates: [candidate1, candidate2],
      })

      expect(result).toEqual([candidate1])
      expect(mockRunCopilot).toHaveBeenCalledWith({
        path: '/copilot/issue/merge-judge',
        parameters: {
          anchor: {
            id: 1,
            title: 'Memory leak in API handler',
            description:
              'The API handler is leaking memory when processing large requests',
          },
          candidates: [
            {
              id: 2,
              title: 'Memory issue in request processing',
              description: 'Large requests cause memory issues',
            },
            {
              id: 3,
              title: 'Slow database queries',
              description: 'Database queries are taking too long',
            },
          ],
        },
        schema: expect.any(Object),
      })
    })

    it('returns all candidates when copilot approves all', async () => {
      const anchor = createMockIssue({ id: 1, title: 'Issue A' })
      const candidates = [
        createMockIssue({ id: 2, title: 'Issue B' }),
        createMockIssue({ id: 3, title: 'Issue C' }),
      ]

      mockRunCopilot.mockResolvedValue(
        Result.ok({
          decisions: [
            { candidateId: 2, shouldMerge: true, reason: 'Same issue' },
            { candidateId: 3, shouldMerge: true, reason: 'Same issue' },
          ],
        }),
      )

      const result = await judgeMergeCandidates({ anchor, candidates })

      expect(result).toEqual(candidates)
    })

    it('returns empty array when copilot rejects all candidates', async () => {
      const anchor = createMockIssue({ id: 1, title: 'Issue A' })
      const candidates = [
        createMockIssue({ id: 2, title: 'Issue B' }),
        createMockIssue({ id: 3, title: 'Issue C' }),
      ]

      mockRunCopilot.mockResolvedValue(
        Result.ok({
          decisions: [
            { candidateId: 2, shouldMerge: false, reason: 'Different issue' },
            { candidateId: 3, shouldMerge: false, reason: 'Different issue' },
          ],
        }),
      )

      const result = await judgeMergeCandidates({ anchor, candidates })

      expect(result).toEqual([])
    })

    it('returns all candidates when copilot call fails', async () => {
      const anchor = createMockIssue({ id: 1, title: 'Issue A' })
      const candidates = [
        createMockIssue({ id: 2, title: 'Issue B' }),
        createMockIssue({ id: 3, title: 'Issue C' }),
      ]

      mockRunCopilot.mockResolvedValue(
        Result.error(new Error('Copilot service unavailable')) as any,
      )

      const result = await judgeMergeCandidates({ anchor, candidates })

      expect(result).toEqual(candidates)
    })

    it('handles partial LLM responses (missing decisions for some candidates)', async () => {
      const anchor = createMockIssue({ id: 1, title: 'Issue A' })
      const candidates = [
        createMockIssue({ id: 2, title: 'Issue B' }),
        createMockIssue({ id: 3, title: 'Issue C' }),
        createMockIssue({ id: 4, title: 'Issue D' }),
      ]

      // LLM only returns decisions for 2 out of 3 candidates
      mockRunCopilot.mockResolvedValue(
        Result.ok({
          decisions: [
            { candidateId: 2, shouldMerge: true, reason: 'Same issue' },
            { candidateId: 3, shouldMerge: false, reason: 'Different issue' },
            // Missing decision for candidate 4 - should be implicitly rejected
          ],
        }),
      )

      const result = await judgeMergeCandidates({ anchor, candidates })

      // Only candidate 2 should be approved, 3 and 4 are rejected
      expect(result).toEqual([candidates[0]])
    })

    it('handles malformed LLM responses with wrong candidate IDs', async () => {
      const anchor = createMockIssue({ id: 1, title: 'Issue A' })
      const candidates = [
        createMockIssue({ id: 2, title: 'Issue B' }),
        createMockIssue({ id: 3, title: 'Issue C' }),
      ]

      // LLM returns decisions for IDs that don't exist in candidates
      mockRunCopilot.mockResolvedValue(
        Result.ok({
          decisions: [
            { candidateId: 2, shouldMerge: true, reason: 'Same issue' },
            { candidateId: 999, shouldMerge: true, reason: 'Phantom issue' }, // Wrong ID
            { candidateId: 888, shouldMerge: false, reason: 'Another phantom' }, // Wrong ID
          ],
        }),
      )

      const result = await judgeMergeCandidates({ anchor, candidates })

      // Only candidate 2 should be approved (3 has no decision, 999 and 888 don't exist)
      expect(result).toEqual([candidates[0]])
    })

    it('handles empty decisions array from LLM', async () => {
      const anchor = createMockIssue({ id: 1, title: 'Issue A' })
      const candidates = [
        createMockIssue({ id: 2, title: 'Issue B' }),
        createMockIssue({ id: 3, title: 'Issue C' }),
      ]

      mockRunCopilot.mockResolvedValue(
        Result.ok({
          decisions: [],
        }),
      )

      const result = await judgeMergeCandidates({ anchor, candidates })

      // All candidates implicitly rejected (no decisions = no approvals)
      expect(result).toEqual([])
    })
  })
})
