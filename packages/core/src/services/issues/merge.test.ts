import { env } from '@latitude-data/env'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { database } from '../../client'
import { SpanType } from '../../constants'
import { IssuesRepository } from '../../repositories'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { issues } from '../../schema/models/issues'
import { createEvaluationResultV2 } from '../../tests/factories/evaluationResultsV2'
import { createEvaluationV2 } from '../../tests/factories/evaluationsV2'
import { createIssue } from '../../tests/factories/issues'
import { createProject } from '../../tests/factories/projects'
import { createSpan } from '../../tests/factories/spans'
import { createWorkspace } from '../../tests/factories/workspaces'
import * as weaviate from '../../weaviate'
import { addIssueEvaluationResult } from '../issueEvaluationResults/add'
import { mergeIssues } from './merge'

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

  it('handles merging multiple issues with duplicate histogram keys without conflict errors', async () => {
    // This test reproduces the bug: when multiple merged issues have histograms
    // with the same (commitId, date) combination, the old code would insert
    // duplicate conflict keys causing "ON CONFLICT DO UPDATE command cannot affect row a second time"
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

    // Create 3 issues to merge into anchor
    const anchorResult = await createIssue({
      workspace,
      project,
      document,
    })
    const anchor = anchorResult.issue

    const issue1Result = await createIssue({
      workspace,
      project,
      document,
    })
    const issue1 = issue1Result.issue

    const issue2Result = await createIssue({
      workspace,
      project,
      document,
    })
    const issue2 = issue2Result.issue

    const issue3Result = await createIssue({
      workspace,
      project,
      document,
    })
    const issue3 = issue3Result.issue

    // Add histograms to issue1 and issue2 with the SAME (commitId, date)
    // This is the scenario that triggered the bug
    await database.insert(issueHistograms).values({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      issueId: issue1.id,
      commitId: commit.id,
      date: '2024-01-01',
      occurredAt: new Date('2024-01-01T10:00:00'),
      count: 5,
    })

    await database.insert(issueHistograms).values({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      issueId: issue2.id,
      commitId: commit.id,
      date: '2024-01-01',
      occurredAt: new Date('2024-01-01T15:00:00'),
      count: 3,
    })

    // issue3 has a different date, should not cause conflicts
    await database.insert(issueHistograms).values({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      issueId: issue3.id,
      commitId: commit.id,
      date: '2024-01-02',
      occurredAt: new Date('2024-01-02T10:00:00'),
      count: 2,
    })

    // Add multiple histograms for same issue with same date but different commits
    const commit2 = await database
      .select()
      .from(issueHistograms)
      .limit(1)
      .then((r) => r[0]?.commitId)

    if (commit2) {
      await database.insert(issueHistograms).values({
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        issueId: issue1.id,
        commitId: commit.id,
        date: '2024-01-02',
        occurredAt: new Date('2024-01-02T08:00:00'),
        count: 1,
      })
    }

    // Set centroids
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
        centroid: { base: [0.95, 0.05], weight: 1 },
        updatedAt: new Date('2024-02-01'),
      })
      .where(eq(issues.id, issue1.id))

    await database
      .update(issues)
      .set({
        centroid: { base: [0.9, 0.1], weight: 1 },
        updatedAt: new Date('2024-02-01'),
      })
      .where(eq(issues.id, issue2.id))

    await database
      .update(issues)
      .set({
        centroid: { base: [0.85, 0.15], weight: 1 },
        updatedAt: new Date('2024-02-01'),
      })
      .where(eq(issues.id, issue3.id))

    // Configure Weaviate mock to return all issues as similar
    mockNearVector.mockResolvedValue({
      objects: [
        {
          uuid: anchor.uuid,
          vectors: { default: [1, 0] },
        },
        {
          uuid: issue1.uuid,
          vectors: { default: [0.95, 0.05] },
        },
        {
          uuid: issue2.uuid,
          vectors: { default: [0.9, 0.1] },
        },
        {
          uuid: issue3.uuid,
          vectors: { default: [0.85, 0.15] },
        },
      ],
    })
    mockExists.mockResolvedValue(true)
    mockDeleteById.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(undefined)
    mockLength.mockResolvedValue(1)
    mockRemoveTenant.mockResolvedValue(undefined)

    // Fetch anchor with centroid
    const anchorWithCentroid = await database
      .select()
      .from(issues)
      .where(eq(issues.id, anchor.id))
      .then((r) => r[0]!)

    // This should NOT throw "ON CONFLICT DO UPDATE command cannot affect row a second time"
    const merging = await mergeIssues({
      workspace,
      issue: anchorWithCentroid,
    })
    expect(merging.error).toBeFalsy()
    const { winner, mergedIssues } = merging.unwrap()

    // Verify that a merge happened
    expect(winner).toBeDefined()
    expect(mergedIssues.length).toBeGreaterThan(0)

    // Verify that histograms exist for the winner
    // The key assertion is that no "ON CONFLICT DO UPDATE" error was thrown
    const allHistograms = await database
      .select()
      .from(issueHistograms)
      .where(eq(issueHistograms.issueId, winner.id))

    expect(allHistograms.length).toBeGreaterThan(0)

    // Verify that at least one histogram was aggregated
    // (issue1 and issue2 both had date 2024-01-01, so they should be aggregated)
    const histogram20240101 = allHistograms.find(
      (h) => h.commitId === commit.id && h.date === '2024-01-01',
    )

    if (histogram20240101) {
      // If aggregated, count should be at least 8 (5 + 3)
      expect(histogram20240101.count).toBeGreaterThanOrEqual(8)
    }
  })

  it('does not merge issues that have evaluations linked to them', async () => {
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

    const evaluation = await createEvaluationV2({
      document,
      commit,
      workspace,
    })

    await database
      .update(evaluationVersions)
      .set({ issueId: other.id })
      .where(eq(evaluationVersions.id, evaluation.versionId))

    const anchorWithCentroid = await database
      .select()
      .from(issues)
      .where(eq(issues.id, anchor.id))
      .then((r) => r[0]!)

    const merging = await mergeIssues({
      workspace,
      issue: anchorWithCentroid,
    })
    expect(merging.error).toBeFalsy()
    const { winner, mergedIssues } = merging.unwrap()

    expect(winner.id).toBe(anchor.id)
    expect(mergedIssues).toHaveLength(0)

    const issuesRepository = new IssuesRepository(workspace.id)
    const otherIssue = await issuesRepository
      .find(other.id)
      .then((r) => r.unwrap())
    expect(otherIssue.mergedAt).toBeNull()
    expect(otherIssue.mergedToIssueId).toBeNull()
  })

  it('does not merge anchor issue when it has evaluations linked', async () => {
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

    const evaluation = await createEvaluationV2({
      document,
      commit,
      workspace,
    })

    await database
      .update(evaluationVersions)
      .set({ issueId: anchor.id })
      .where(eq(evaluationVersions.id, evaluation.versionId))

    const anchorWithCentroid = await database
      .select()
      .from(issues)
      .where(eq(issues.id, anchor.id))
      .then((r) => r[0]!)

    const merging = await mergeIssues({
      workspace,
      issue: anchorWithCentroid,
    })
    expect(merging.error).toBeFalsy()
    const { winner, mergedIssues } = merging.unwrap()

    expect(winner.id).toBe(anchor.id)
    expect(mergedIssues).toHaveLength(0)

    const issuesRepository = new IssuesRepository(workspace.id)
    const otherIssue = await issuesRepository
      .find(other.id)
      .then((r) => r.unwrap())
    expect(otherIssue.mergedAt).toBeNull()
    expect(otherIssue.mergedToIssueId).toBeNull()
  })

  describe('Weaviate tenant name operations', () => {
    it('calls getIssuesCollection with correct tenant name built from workspaceId, projectId, and documentUuid', async () => {
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

      const getIssuesCollectionSpy = vi
        .spyOn(weaviate, 'getIssuesCollection')
        .mockResolvedValue(mockCollection as any)

      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, documents } = projectResult
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

      await database
        .update(issues)
        .set({
          centroid: { base: [1, 0], weight: 1 },
          updatedAt: new Date('2024-02-01'),
        })
        .where(eq(issues.id, anchor.id))

      const anchorWithCentroid = await database
        .select()
        .from(issues)
        .where(eq(issues.id, anchor.id))
        .then((r) => r[0]!)

      await mergeIssues({
        workspace,
        issue: anchorWithCentroid,
      })

      const expectedTenantName = weaviate.ISSUES_COLLECTION_TENANT_NAME(
        anchor.workspaceId,
        anchor.projectId,
        anchor.documentUuid,
      )
      expect(getIssuesCollectionSpy).toHaveBeenCalledWith({
        tenantName: expectedTenantName,
      })
    })

    it('builds tenant name correctly using ISSUES_COLLECTION_TENANT_NAME format', async () => {
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

      const getIssuesCollectionSpy = vi
        .spyOn(weaviate, 'getIssuesCollection')
        .mockResolvedValue(mockCollection as any)

      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, documents } = projectResult
      const document = documents[0]!

      const anchorResult = await createIssue({
        workspace,
        project,
        document,
      })
      const anchor = anchorResult.issue

      mockNearVector.mockResolvedValue({
        objects: [
          {
            uuid: anchor.uuid,
            vectors: { default: [1, 0] },
          },
        ],
      })
      mockExists.mockResolvedValue(true)
      mockDeleteById.mockResolvedValue(undefined)
      mockUpdate.mockResolvedValue(undefined)
      mockLength.mockResolvedValue(1)
      mockRemoveTenant.mockResolvedValue(undefined)

      await database
        .update(issues)
        .set({
          centroid: { base: [1, 0], weight: 1 },
          updatedAt: new Date('2024-02-01'),
        })
        .where(eq(issues.id, anchor.id))

      const anchorWithCentroid = await database
        .select()
        .from(issues)
        .where(eq(issues.id, anchor.id))
        .then((r) => r[0]!)

      await mergeIssues({
        workspace,
        issue: anchorWithCentroid,
      })

      const expectedTenantName = `${anchor.workspaceId}_${anchor.projectId}_${anchor.documentUuid}`
      expect(getIssuesCollectionSpy).toHaveBeenCalledWith({
        tenantName: expectedTenantName,
      })
    })

    it('uses nearVector search on the issues collection with anchor embedding', async () => {
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
      const { project, documents } = projectResult
      const document = documents[0]!

      const anchorResult = await createIssue({
        workspace,
        project,
        document,
      })
      const anchor = anchorResult.issue

      mockNearVector.mockResolvedValue({
        objects: [
          {
            uuid: anchor.uuid,
            vectors: { default: [1, 0] },
          },
        ],
      })
      mockExists.mockResolvedValue(true)
      mockDeleteById.mockResolvedValue(undefined)
      mockUpdate.mockResolvedValue(undefined)
      mockLength.mockResolvedValue(1)
      mockRemoveTenant.mockResolvedValue(undefined)

      await database
        .update(issues)
        .set({
          centroid: { base: [1, 0], weight: 1 },
          updatedAt: new Date('2024-02-01'),
        })
        .where(eq(issues.id, anchor.id))

      const anchorWithCentroid = await database
        .select()
        .from(issues)
        .where(eq(issues.id, anchor.id))
        .then((r) => r[0]!)

      await mergeIssues({
        workspace,
        issue: anchorWithCentroid,
      })

      expect(mockNearVector).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          limit: 100,
          includeVector: true,
          returnMetadata: ['distance'],
        }),
      )
    })
  })
})
