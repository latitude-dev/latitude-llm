import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../lib/Result'
import {
  refreshProjectStatsCache,
  refreshWorkspaceProjectStatsCache,
} from '../../../services/projects/refreshProjectStatsCache'
import { computeProjectStats } from '../../../services/projects/computeProjectStats'
import * as factories from '../../factories'
import { ProjectStats } from '../../../constants'

// Mock the computeProjectStats function
vi.mock('../../../services/projects/computeProjectStats', () => ({
  computeProjectStats: vi.fn(),
  MIN_LOGS_FOR_CACHING: 50,
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
      logCount: 0,
    })
    expect(computeProjectStats).not.toHaveBeenCalled()
  })
})

describe('refreshWorkspaceProjectStatsCache', () => {
  it('should refresh all projects in a workspace', async () => {
    // Arrange
    const { workspace } = await factories.createWorkspace()
    await factories.createProject({ workspace })
    await factories.createProject({ workspace })

    // Mock computeProjectStats to return success
    const mockProjectStats1: ProjectStats = {
      totalRuns: 150,
      totalTokens: 1000,
      totalDocuments: 10,
      runsPerModel: { 'gpt-4': 100, 'gpt-3.5-turbo': 50 },
      costPerModel: { 'gpt-4': 500, 'gpt-3.5-turbo': 100 },
      rollingDocumentLogs: [],
      totalEvaluations: 0,
      totalEvaluationResults: 0,
      costPerEvaluation: {},
    }

    const mockProjectStats2: ProjectStats = {
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
      Result.ok(mockProjectStats1),
    )
    vi.mocked(computeProjectStats).mockResolvedValueOnce(
      Result.ok(mockProjectStats2),
    )

    // Act
    const result = await refreshWorkspaceProjectStatsCache(workspace.id)

    // Assert
    expect(result.ok).toBe(true)
    expect(result.value).toBe(true)
  })
})
