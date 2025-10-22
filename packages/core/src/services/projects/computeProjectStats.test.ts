import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EvaluationType,
  LlmEvaluationMetric,
  Providers,
} from '@latitude-data/constants'
import * as cacheModule from '../../cache'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
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
  let provider: ProviderApiKey
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
    provider = setup.providers[0]!
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
    expect(stats).toEqual({
      totalTokens: 0,
      totalRuns: 0,
      totalDocuments: 1,
      runsPerModel: {},
      costPerModel: {},
      rollingDocumentLogs: [],
      totalEvaluations: 0,
      totalEvaluationResults: 0,
      costPerEvaluation: {},
    })
  })

  it('computes correct stats for project with documents and logs', async () => {
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
      skipProviderLogs: true,
    })

    const providerLog = await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
    })

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats).toEqual({
      totalTokens: providerLog.tokens,
      totalRuns: 1,
      totalDocuments: 1,
      runsPerModel: {
        'gpt-4': 1,
      },
      costPerModel: {
        'gpt-4': 500,
      },
      rollingDocumentLogs: [
        {
          count: 1,
          date: documentLog.createdAt.toISOString().split('T')[0],
        },
      ],
      totalEvaluations: 0,
      totalEvaluationResults: 0,
      costPerEvaluation: {},
    })
    expect(stats.rollingDocumentLogs).toHaveLength(1)
  })

  it('computes correct stats for project with evaluations and results', async () => {
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
      skipProviderLogs: true,
    })

    const providerLog = await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
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

    const evaluationLogV2 = await factories.createProviderLog({
      workspace,
      documentLogUuid: 'eb649bc2-237f-4b33-b759-bde4974ac7b2',
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
      duration: 1000,
    })

    await factories.createEvaluationResultV2({
      evaluation: evaluationV2,
      providerLog: providerLog,
      commit: commit,
      workspace: workspace,
      score: 1,
      normalizedScore: 100,
      metadata: {
        configuration: evaluationV2.configuration,
        actualOutput: 'actual output',
        evaluationLogId: evaluationLogV2.id,
        reason: 'reason',
        tokens: 100,
        cost: 500,
        duration: 1000,
      },
      hasPassed: true,
    })

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    expect(stats).toEqual({
      totalTokens: providerLog.tokens,
      totalRuns: 1,
      totalDocuments: 1,
      runsPerModel: {
        'gpt-4': 1,
      },
      costPerModel: {
        'gpt-4': 500,
      },
      rollingDocumentLogs: [
        {
          count: 1,
          date: documentLog.createdAt.toISOString().split('T')[0],
        },
      ],
      totalEvaluations: 1,
      totalEvaluationResults: 1,
      costPerEvaluation: {
        'Evaluation V2': 500,
      },
    })
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
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
      skipProviderLogs: true,
    })

    const providerLog = await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
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
    expect(stats.totalTokens).toBe(providerLog.tokens)
    expect(stats.totalRuns).toBe(1)
    expect(mockRedis.get).not.toHaveBeenCalledWith(
      `project_stats:${workspace.id}:${project.id}`,
    )
  })

  it('handles cache errors gracefully', async () => {
    // Setup mock cache to throw an error
    mockRedis.get.mockRejectedValue(new Error('Cache error'))

    // Create some actual data
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
      skipProviderLogs: true,
    })

    const providerLog = await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
    })

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    const stats = result.unwrap()
    // Should still compute correct stats despite cache error
    expect(stats.totalTokens).toBe(providerLog.tokens)
    expect(stats.totalRuns).toBe(1)
  })

  it('does not cache results when project has few logs', async () => {
    // Create fewer logs than STATS_CACHING_THRESHOLD
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
      skipProviderLogs: true,
    })

    await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
    })

    const result = await computeProjectStats({
      workspaceId: project.workspaceId,
      projectId: project.id,
    })
    expect(result.ok).toBe(true)

    // Verify cache was not set
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it('handles multiple models correctly', async () => {
    // Create logs with different models
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
      skipProviderLogs: true,
    })

    await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-4',
      tokens: 100,
      costInMillicents: 500,
    })

    await factories.createProviderLog({
      workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: 'gpt-3.5-turbo',
      tokens: 50,
      costInMillicents: 100,
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
    expect(stats.costPerModel).toEqual({
      'gpt-4': 500,
      'gpt-3.5-turbo': 100,
    })
    expect(stats.totalTokens).toBe(150)
  })
})
