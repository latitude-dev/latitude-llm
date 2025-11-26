import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EvaluationType,
  LlmEvaluationMetric,
  Providers,
  SpanType,
} from '@latitude-data/constants'
import * as cacheModule from '../../cache'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { computeProjectStats } from './computeProjectStats'

// Mock the cache module
vi.mock('../../cache', () => ({
  cache: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
  }),
}))

describe('computeProjectStats', () => {
  let project: Project
  let workspace: Workspace
  let document: DocumentVersion
  let commit: Commit
  let mockRedis: any

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks()

    // Setup mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
    }
    vi.mocked(cacheModule.cache).mockResolvedValue(mockRedis)

    const setup = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        'doc1.md': factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    project = setup.project
    workspace = setup.workspace
    document = setup.documents[0]!
    commit = setup.commit
  })

  it('returns zero stats for empty project', async () => {
    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    // Empty project should have zero stats
    expect(stats.totalTokens).toBe(0)
    expect(stats.totalRuns).toBe(0)
    expect(stats.totalDocuments).toBe(0)
    expect(stats.runsPerModel).toEqual({})
    expect(stats.costPerModel).toEqual({})
    expect(stats.rollingDocumentLogs).toEqual([])
    expect(stats.totalEvaluations).toBe(0)
    expect(stats.totalEvaluationResults).toBe(0)
    expect(stats.costPerEvaluation).toEqual({})
  })

  it('computes correct stats for project with documents and logs', async () => {
    const traceId = 'trace-1'
    const tokensCount = 100
    const costInMillicents = 500

    // Create a Prompt span to count as a run
    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId,
      type: SpanType.Prompt,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    // Create a Completion span with model and cost info
    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId,
      type: SpanType.Completion,
      model: 'gpt-4',
      tokensPrompt: tokensCount,
      cost: costInMillicents,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats.totalRuns).toBe(1)
    expect(stats.totalDocuments).toBe(1)
    expect(stats.runsPerModel).toEqual({
      'gpt-4': 1,
    })
    expect(stats.costPerModel['gpt-4']).toBeDefined()
    expect(stats.totalTokens).toBe(tokensCount)
    expect(stats.rollingDocumentLogs).toHaveLength(1)
    expect(stats.totalEvaluations).toBe(0)
    expect(stats.totalEvaluationResults).toBe(0)
    expect(stats.costPerEvaluation).toEqual({})
  })

  it('computes correct stats for project with evaluations and results', async () => {
    const traceId = 'trace-1'
    const tokensCount = 100
    const costInMillicents = 500

    // Create a Prompt span to count as a run
    const promptSpan = await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId,
      type: SpanType.Prompt,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    // Create a Completion span with model and cost info
    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId,
      type: SpanType.Completion,
      model: 'gpt-4',
      tokensPrompt: tokensCount,
      cost: costInMillicents,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    const evaluationV2 = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      name: 'Evaluation V2',
      description: 'A V2 LLM evaluation',
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        provider: 'openai',
        model: 'gpt-4',
        criteria: 'Evaluate the response',
        passDescription: 'Pass',
        failDescription: 'Fail',
      },
      workspace: workspace,
    })

    // Create evaluation result with cost
    await factories.createEvaluationResultV2({
      evaluation: evaluationV2,
      span: promptSpan,
      commit: commit,
      workspace: workspace,
      score: 1,
      normalizedScore: 100,
      hasPassed: true,
    })

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats.totalRuns).toBe(1)
    expect(stats.totalDocuments).toBe(1)
    expect(stats.runsPerModel).toEqual({
      'gpt-4': 1,
    })
    expect(stats.totalTokens).toBe(tokensCount)
    expect(stats.totalEvaluations).toBe(1)
    expect(stats.totalEvaluationResults).toBe(1)
    expect(stats.costPerEvaluation['Evaluation V2']).toBeDefined()
    expect(stats.rollingDocumentLogs).toHaveLength(1)
  })

  // New tests for caching functionality
  it('returns cached stats when available and not forcing refresh', async () => {
    // Setup mock cache to return data
    const cachedStats = {
      totalTokens: 1000,
      totalRuns: 10,
      totalDocuments: 2,
      runsPerModel: { 'gpt-4': 10 },
      costPerModel: { 'gpt-4': 5000 },
      rollingDocumentLogs: [
        { count: 5, date: '2023-01-01' },
        { count: 5, date: '2023-01-02' },
      ],
      totalEvaluations: 3,
      totalEvaluationResults: 15,
      costPerEvaluation: { 'Test Eval': 1000 },
    }

    mockRedis.get.mockResolvedValue(JSON.stringify(cachedStats))

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats).toEqual(cachedStats)

    // Verify cache was checked
    expect(mockRedis.get).toHaveBeenCalledWith(
      `project_stats:${workspace.id}:${project.id}`,
    )
    // Verify no database queries were made (we can't directly verify this, but we can check that set wasn't called)
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it('forces refresh of stats when forceRefresh is true', async () => {
    // Setup mock cache to return data
    const cachedStats = {
      totalTokens: 1000,
      totalRuns: 10,
      totalDocuments: 2,
      runsPerModel: { 'gpt-4': 10 },
      costPerModel: { 'gpt-4': 5000 },
      rollingDocumentLogs: [
        { count: 5, date: '2023-01-01' },
        { count: 5, date: '2023-01-02' },
      ],
      totalEvaluations: 3,
      totalEvaluationResults: 15,
      costPerEvaluation: { 'Test Eval': 1000 },
    }

    mockRedis.get.mockResolvedValue(JSON.stringify(cachedStats))

    // Create some actual data to ensure we're not just returning cached data
    const traceId = 'trace-1'
    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId,
      type: SpanType.Prompt,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId,
      type: SpanType.Completion,
      model: 'gpt-4',
      tokensPrompt: 100,
      cost: 500, // millicents
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
      forceRefresh: true,
    })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    // Should not match cached stats
    expect(stats).not.toEqual(cachedStats)
    // Should match actual data
    expect(stats.totalTokens).toBe(100)
    expect(stats.totalRuns).toBe(1)
    expect(mockRedis.get).not.toHaveBeenCalledWith(
      `project_stats:${workspace.id}:${project.id}`,
    )
  })

  it('handles cache errors gracefully', async () => {
    // Setup mock cache to throw an error
    mockRedis.get.mockRejectedValue(new Error('Cache error'))

    // Create some actual data
    const traceId = 'trace-1'
    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId,
      type: SpanType.Prompt,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId,
      type: SpanType.Completion,
      model: 'gpt-4',
      tokensPrompt: 100,
      cost: 500, // millicents
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    // Should still compute correct stats despite cache error
    expect(stats.totalTokens).toBe(100)
    expect(stats.totalRuns).toBe(1)
  })

  it('does not cache results when project has few logs', async () => {
    // Create fewer logs than STATS_CACHING_THRESHOLD
    const traceId = 'trace-1'
    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId,
      type: SpanType.Prompt,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId,
      type: SpanType.Completion,
      model: 'gpt-4',
      tokensPrompt: 100,
      cost: 500, // millicents
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    // Verify cache was not set (since we only have 1 run, below the threshold)
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it('handles multiple models correctly', async () => {
    // Create logs with different models
    const traceId1 = 'trace-1'
    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId: traceId1,
      type: SpanType.Prompt,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId: traceId1,
      type: SpanType.Completion,
      model: 'gpt-4',
      tokensPrompt: 100,
      cost: 500, // millicents
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    const traceId2 = 'trace-2'
    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId: traceId2,
      type: SpanType.Prompt,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      traceId: traceId2,
      type: SpanType.Completion,
      model: 'gpt-3.5-turbo',
      tokensPrompt: 50,
      cost: 100, // millicents
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats.runsPerModel).toEqual({
      'gpt-4': 1,
      'gpt-3.5-turbo': 1,
    })
    expect(stats.costPerModel['gpt-4']).toBeDefined()
    expect(stats.costPerModel['gpt-3.5-turbo']).toBeDefined()
    expect(stats.totalTokens).toBe(150)
  })
})
