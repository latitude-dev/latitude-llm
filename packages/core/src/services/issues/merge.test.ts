import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { env } from '@latitude-data/env'

import { database } from '../../client'
import { SpanType } from '../../constants'
import { createEvaluationResultV2 } from '../../tests/factories/evaluationResultsV2'
import { createEvaluationV2 } from '../../tests/factories/evaluationsV2'
import { createProject } from '../../tests/factories/projects'
import { createSpan } from '../../tests/factories/spans'
import { createWorkspace } from '../../tests/factories/workspaces'
import { createIssue } from '../../tests/factories/issues'
import { mergeIssues } from './merge'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { issues } from '../../schema/models/issues'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { IssuesRepository } from '../../repositories'
import { addIssueEvaluationResult } from '../issueEvaluationResults/add'
import * as weaviate from '../../weaviate'

describe('mergeIssues', () => {
  const originalCloud = env.LATITUDE_CLOUD
  const originalWeaviateKey = env.WEAVIATE_API_KEY

  beforeAll(() => {
    ;(env as any).LATITUDE_CLOUD = true
    ;(env as any).WEAVIATE_API_KEY = 'test-key'
  })

  afterAll(() => {
    ;(env as any).LATITUDE_CLOUD = originalCloud
    ;(env as any).WEAVIATE_API_KEY = originalWeaviateKey
  })

  it('merges similar issues and updates all related records', async () => {
    const { workspace } = await createWorkspace({ features: ['issues'] })
    const projectResult = await createProject({
      workspace,
      documents: {
        'test-prompt': 'This is a test prompt',
      },
    })
    const { project, commit, documents } = projectResult
    const document = documents[0]!

    const anchorResult = await createIssue({
      workspace,
      project,
      document,
    })
    const anchor = anchorResult.issue

    const otherResult = await createIssue({
      workspace,
      project,
      document,
    })
    const other = otherResult.issue

    // Spy on Weaviate and configure mocks with actual issue UUIDs
    const mockNearVector = vi.fn().mockResolvedValue({
      objects: [
        {
          uuid: anchor.uuid,
          vectors: { default: [1, 0] },
        },
        {
          uuid: other.uuid,
          vectors: { default: [0.9, 0.1] },
        },
      ],
    })
    const mockExists = vi.fn().mockResolvedValue(true)
    const mockDeleteById = vi.fn().mockResolvedValue(undefined)
    const mockUpdate = vi.fn().mockResolvedValue(undefined)
    const mockLength = vi.fn().mockResolvedValue(1)
    const mockRemoveTenant = vi.fn().mockResolvedValue(undefined)

    const mockCollection = {
      query: { nearVector: mockNearVector },
      data: {
        exists: mockExists,
        deleteById: mockDeleteById,
        update: mockUpdate,
      },
      length: mockLength,
      tenants: { remove: mockRemoveTenant },
    }

    vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
      mockCollection as any,
    )

    // Add histograms manually using the SQL insert
    await database.insert(issueHistograms).values({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      issueId: anchor.id,
      commitId: commit.id,
      date: '2024-01-01',
      occurredAt: new Date('2024-01-01'),
      count: 5,
    })

    await database.insert(issueHistograms).values({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      issueId: other.id,
      commitId: commit.id,
      date: '2024-01-01',
      occurredAt: new Date('2024-01-01'),
      count: 2,
    })

    const now = new Date('2024-02-01')
    await database
      .update(issues)
      .set({
        centroid: { base: [1, 0], weight: 1 },
        updatedAt: now,
      })
      .where(eq(issues.id, anchor.id))
    await database
      .update(issues)
      .set({
        centroid: { base: [0.9, 0.1], weight: 1 },
        updatedAt: now,
      })
      .where(eq(issues.id, other.id))

    // Fetch the updated issues with centroids
    const anchorWithCentroid = await database
      .select()
      .from(issues)
      .where(eq(issues.id, anchor.id))
      .then((r) => r[0]!)
    expect(anchorWithCentroid.centroid.base).toEqual([1, 0])

    const evaluation = await createEvaluationV2({
      document,
      commit,
      workspace,
    })
    const span = await createSpan({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
    })
    const result = await createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
      hasPassed: false,
    })

    await addIssueEvaluationResult({
      issue: other,
      evaluationResult: result,
      workspaceId: workspace.id,
    })
    await database
      .update(evaluationVersions)
      .set({ issueId: other.id, evaluateLiveLogs: true })
      .where(eq(evaluationVersions.id, evaluation.versionId))

    // Use the issue with centroid for merging
    const merging = await mergeIssues({
      workspace,
      issue: anchorWithCentroid,
    })
    expect(merging.error).toBeFalsy()
    const { winner, mergedIssues } = merging.unwrap()

    // Verify the Weaviate collection was requested
    expect(weaviate.getIssuesCollection).toHaveBeenCalled()

    // Verify the Weaviate mock was called with correct params
    expect(mockNearVector).toHaveBeenCalledWith(
      [1, 0],
      expect.objectContaining({
        limit: 100,
        includeVector: true,
      }),
    )

    // Verify winner is the anchor with most occurrences
    expect(winner.id).toBe(anchor.id)
    expect(mergedIssues.map((i) => i.id)).toContain(other.id)

    // Verify centroid was merged correctly
    const winnerIssue = await database
      .select()
      .from(issues)
      .where(eq(issues.id, winner.id))
      .then((r) => r[0]!)
    expect(winnerIssue.centroid.base).toBeDefined()
    expect(winnerIssue.centroid.base.length).toBeGreaterThan(0)
    expect(winnerIssue.updatedAt.getTime()).toBeGreaterThan(now.getTime())

    // Verify merged issue is marked as merged and points to winner
    const issuesRepository = new IssuesRepository(workspace.id)
    const mergedIssue = await issuesRepository
      .find(other.id)
      .then((r) => r.unwrap())
    expect(mergedIssue.mergedAt).not.toBeNull()
    expect(mergedIssue.mergedToIssueId).toBe(winner.id)

    // Verify histograms are merged
    const histogramTotals = await database
      .select({
        total: sql<number>`SUM(${issueHistograms.count})`.as('total'),
      })
      .from(issueHistograms)
      .where(eq(issueHistograms.issueId, winner.id))
      .then((r) => r[0]!.total)
    expect(Number(histogramTotals)).toBe(7)

    // Verify evaluation results are assigned to winner via issueEvaluationResults table
    const association = await database
      .select()
      .from(issueEvaluationResults)
      .where(eq(issueEvaluationResults.issueId, winner.id))
    expect(association.length).toBeGreaterThan(0)
    expect(association[0]!.evaluationResultId).toBe(result.id)

    // Verify evaluation is ignored (evaluateLiveLogs = false, ignoredAt set)
    const updatedEvaluation = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, evaluation.versionId))
      .then((r) => r[0]!)
    expect(updatedEvaluation.issueId).toBe(other.id) // Still linked to merged issue
    expect(updatedEvaluation.evaluateLiveLogs).toBe(false) // Disabled
    expect(updatedEvaluation.ignoredAt).not.toBeNull() // Marked as ignored
  })

  it('aggregates histogram counts when merging issues with overlapping histograms', async () => {
    // Set up Weaviate mock before any operations
    const mockNearVector = vi.fn()
    const mockExists = vi.fn()
    const mockDeleteById = vi.fn()
    const mockUpdate = vi.fn()
    const mockLength = vi.fn()
    const mockRemoveTenant = vi.fn()

    const mockCollection = {
      query: { nearVector: mockNearVector },
      data: {
        exists: mockExists,
        deleteById: mockDeleteById,
        update: mockUpdate,
      },
      length: mockLength,
      tenants: { remove: mockRemoveTenant },
    }

    vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
      mockCollection as any,
    )

    const { workspace } = await createWorkspace({ features: ['issues'] })
    const projectResult = await createProject({
      workspace,
      documents: {
        'test-prompt': 'This is a test prompt',
      },
    })
    const { project, commit, documents } = projectResult
    const document = documents[0]!

    const anchorResult = await createIssue({
      workspace,
      project,
      document,
    })
    const anchor = anchorResult.issue

    const otherResult = await createIssue({
      workspace,
      project,
      document,
    })
    const other = otherResult.issue

    // Add overlapping histograms - both issues have the same (commitId, date)
    // This tests the onConflictDoUpdate behavior
    await database.insert(issueHistograms).values({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      issueId: anchor.id,
      commitId: commit.id,
      date: '2024-01-01',
      occurredAt: new Date('2024-01-01T10:00:00'),
      count: 5,
    })

    await database.insert(issueHistograms).values({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      issueId: other.id,
      commitId: commit.id,
      date: '2024-01-01',
      occurredAt: new Date('2024-01-01T14:00:00'),
      count: 3,
    })

    // Set centroids for both issues
    await database
      .update(issues)
      .set({
        centroid: { base: [1, 0], weight: 1 },
        updatedAt: new Date('2024-02-01'),
      })
      .where(eq(issues.id, anchor.id))

    await database
      .update(issues)
      .set({
        centroid: { base: [0.9, 0.1], weight: 1 },
        updatedAt: new Date('2024-02-01'),
      })
      .where(eq(issues.id, other.id))

    // Configure Weaviate mock to return both issues as similar
    mockNearVector.mockResolvedValue({
      objects: [
        {
          uuid: anchor.uuid,
          vectors: { default: [1, 0] },
        },
        {
          uuid: other.uuid,
          vectors: { default: [0.9, 0.1] },
        },
      ],
    })
    mockExists.mockResolvedValue(true)
    mockDeleteById.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(undefined)
    mockLength.mockResolvedValue(1)
    mockRemoveTenant.mockResolvedValue(undefined)

    // Fetch the updated anchor issue with centroid
    const anchorWithCentroid = await database
      .select()
      .from(issues)
      .where(eq(issues.id, anchor.id))
      .then((r) => r[0]!)

    // Perform the merge
    const merging = await mergeIssues({
      workspace,
      issue: anchorWithCentroid,
    })
    expect(merging.error).toBeFalsy()
    const { winner, mergedIssues } = merging.unwrap()

    expect(winner.id).toBe(anchor.id)
    expect(mergedIssues.map((i) => i.id)).toContain(other.id)

    // Verify histogram aggregation with onConflictDoUpdate:
    // - Counts should be summed: 5 + 3 = 8
    // - occurredAt should be the latest: 2024-01-01T14:00:00
    const aggregatedHistogram = await database
      .select()
      .from(issueHistograms)
      .where(
        and(
          eq(issueHistograms.issueId, winner.id),
          eq(issueHistograms.commitId, commit.id),
          eq(issueHistograms.date, '2024-01-01'),
        ),
      )
      .then((r) => r[0]!)

    expect(aggregatedHistogram.count).toBe(8)
    expect(aggregatedHistogram.occurredAt).toEqual(
      new Date('2024-01-01T14:00:00'),
    )
  })
})
