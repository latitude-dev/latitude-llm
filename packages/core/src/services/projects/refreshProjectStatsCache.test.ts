import { describe, expect, it, vi } from 'vitest'
import { ProjectStats, Providers } from '../../browser'
import { Result } from '../../lib/Result'
import * as factories from '../../tests/factories'
import { computeProjectStats } from './computeProjectStats'
import { refreshProjectStatsCache } from './refreshProjectStatsCache'

// Mock the computeProjectStats function
vi.mock('./computeProjectStats', () => ({
  computeProjectStats: vi.fn(),
  MIN_LOGS_FOR_CACHING: 1,
}))

describe('refreshProjectStatsCache', () => {
  it('should return error if project not found', async () => {
    // Arrange
    const nonExistentProjectId = 99999

    // Act
    const result = await refreshProjectStatsCache(nonExistentProjectId)

    // Assert
    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain(
      `Project ${nonExistentProjectId} not found`,
    )
  })

  it('should skip refresh if project has insufficient logs', async () => {
    // Arrange
    const { project } = await factories.createProject()

    // Act
    const result = await refreshProjectStatsCache(project.id)

    // Assert
    expect(result.ok).toBe(true)
    expect(result.value).toEqual({
      skipped: true,
      reason: 'insufficient_logs',
      logs: 0,
    })
    expect(computeProjectStats).not.toHaveBeenCalled()
  })

  it('should refresh project stats cache', async () => {
    // Arrange
    const {
      project,
      commit,
      documents: [document],
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'content',
        }),
      },
    })
    await factories.createDocumentLog({
      commit: commit,
      document: document!,
    })
    const mockProjectStats: ProjectStats = {
      totalRuns: 200,
      totalTokens: 1500,
      totalDocuments: 15,
      runsPerModel: { 'gpt-4': 150, 'gpt-3.5-turbo': 50 },
      costPerModel: { 'gpt-4': 750, 'gpt-3.5-turbo': 100 },
      rollingDocumentLogs: [],
      totalEvaluations: 0,
      totalEvaluationResults: 0,
      costPerEvaluation: {},
    }
    vi.mocked(computeProjectStats).mockResolvedValueOnce(
      Result.ok(mockProjectStats),
    )

    // Act
    const result = await refreshProjectStatsCache(project.id)

    // Assert
    expect(result.ok).toBe(true)
    expect(result.value).toEqual({ success: true, logs: 200 })
    expect(computeProjectStats).toHaveBeenCalled()
  })
})
