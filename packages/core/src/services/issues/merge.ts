import { env } from '@latitude-data/env'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { database } from '../../client'
import { ISSUE_DISCOVERY_MIN_SIMILARITY, IssueCentroid } from '../../constants'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { UnprocessableEntityError } from '../../lib/errors'
import { IssuesRepository } from '../../repositories'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import { captureException } from '../../utils/datadogCapture'
import {
  getIssuesCollection,
  ISSUES_COLLECTION_TENANT_NAME,
} from '../../weaviate'
import { bulkLinkIssueEvaluationResults } from '../issueEvaluationResults/addBulk'
import { embedCentroid, mergeCentroids } from './shared'
import { updateIssue } from './update'

type MergeResult = { winner: Issue; mergedIssues: Issue[] }

/**
 * Merge issues that share a high centroid similarity, keeping the largest issue as the anchor.
 *
 * @param workspace Workspace owning the issues
 * @param issue Anchor issue to compare against
 */
export async function mergeIssues(
  {
    workspace,
    issue,
  }: {
    workspace: Workspace
    issue: Issue
  },
  transaction = new Transaction(),
) {
  if (!env.LATITUDE_CLOUD)
    return Result.ok<MergeResult>({ winner: issue, mergedIssues: [] })
  if (issue.mergedAt) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot merge an issue that is already merged',
      ),
    )
  }

  const similar = await findSimilarIssues({ anchorIssue: issue })
  if (similar.length <= 1) {
    return Result.ok<MergeResult>({ winner: issue, mergedIssues: [] })
  }

  const totals = await getHistogramTotals({
    workspaceId: workspace.id,
    issueIds: similar.map(({ issue }) => issue.id),
  })
  const { winner, mergedIssues } = pickWinner({
    anchorIssue: issue,
    candidates: similar.map(({ issue }) => issue),
    totals,
  })

  if (mergedIssues.length === 0) {
    return Result.ok<MergeResult>({ winner, mergedIssues: [] })
  }

  return await transaction.call(
    async (tx) => {
      const issuesRepository = new IssuesRepository(workspace.id, tx)
      const idsToLock = [winner.id, ...mergedIssues.map((item) => item.id)]
      for (const id of idsToLock) {
        const locking = await issuesRepository.lock({ id })
        if (!Result.isOk(locking)) return locking
      }

      const refreshing = await issuesRepository.find(winner.id)
      if (!Result.isOk(refreshing)) return refreshing
      const refreshedWinner = refreshing.value
      if (refreshedWinner.mergedAt) {
        return Result.error(
          new UnprocessableEntityError('Winning issue already merged'),
        )
      }

      const refreshedMergedIssues: Issue[] = []
      for (const merged of mergedIssues) {
        const refreshed = await issuesRepository.find(merged.id)
        if (!Result.isOk(refreshed)) return refreshed

        if (refreshed.value.mergedAt) {
          return Result.error(
            new UnprocessableEntityError('Issue already merged'),
          )
        }

        refreshedMergedIssues.push(refreshed.value)
      }

      const timestamp = new Date()
      const mergedCentroid = mergeIssueCentroids({
        winner: refreshedWinner,
        mergedIssues: refreshedMergedIssues,
        timestamp,
      })

      let updatedWinner = refreshedWinner
      if (mergedCentroid) {
        const updating = await updateIssue(
          { centroid: mergedCentroid, issue: refreshedWinner },
          transaction,
        )
        if (!Result.isOk(updating)) return updating
        updatedWinner = updating.value.issue
      }

      const mergedIds = refreshedMergedIssues.map((item) => item.id)

      await linkEvaluationResults({
        workspaceId: workspace.id,
        winnerId: updatedWinner.id,
        issueIds: mergedIds,
        timestamp,
        transaction,
      }).then((r) => r.unwrap())

      await ignoreEvaluations({
        workspaceId: workspace.id,
        issueIds: mergedIds,
        timestamp,
        transaction,
      }).then((r) => r.unwrap())

      await mergeHistograms({
        winner: updatedWinner,
        mergedIssues: refreshedMergedIssues,
        timestamp,
        transaction,
      }).then((r) => r.unwrap())

      await markMerged({
        workspaceId: workspace.id,
        winnerId: updatedWinner.id,
        issueIds: mergedIds,
        timestamp,
        transaction,
      }).then((r) => r.unwrap())

      return Result.ok<MergeResult>({
        winner: updatedWinner,
        mergedIssues: refreshedMergedIssues,
      })
    },
    async ({ winner, mergedIssues }) => {
      await publisher.publishLater({
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: winner.id,
          mergedIds: mergedIssues.map((item) => item.id),
        },
      })
    },
  )
}

async function findSimilarIssues({
  anchorIssue,
}: {
  anchorIssue: Issue
}): Promise<Array<{ issue: Issue; embedding: number[] }>> {
  if (!env.WEAVIATE_API_KEY) return []

  const anchorEmbedding = embedCentroid(anchorIssue.centroid)
  if (anchorEmbedding.length === 0) return []

  try {
    const tenantName = ISSUES_COLLECTION_TENANT_NAME(anchorIssue.workspaceId, anchorIssue.projectId, anchorIssue.documentUuid) // prettier-ignore
    const collection = await getIssuesCollection({ tenantName })

    const { objects } = await collection.query.nearVector(anchorEmbedding, {
      limit: 100,
      distance: 1 - ISSUE_DISCOVERY_MIN_SIMILARITY,
      returnMetadata: ['distance'],
      includeVector: true,
    })

    // Map Weaviate results back to issues with embeddings
    const issueUuids = objects.map((obj) => obj.uuid.toString())
    if (issueUuids.length === 0) return []

    const candidateIssues = await database
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.workspaceId, anchorIssue.workspaceId),
          eq(issues.projectId, anchorIssue.projectId),
          eq(issues.documentUuid, anchorIssue.documentUuid),
          isNull(issues.mergedAt),
          inArray(issues.uuid, issueUuids),
        ),
      )

    // Create a map for quick lookup of embeddings by uuid
    const embeddingMap = new Map(
      objects.map((obj) => [obj.uuid.toString(), obj.vectors.default]),
    )

    return candidateIssues
      .map((issue) => {
        const embedding = embeddingMap.get(issue.uuid)
        if (!embedding) return null
        return { issue, embedding }
      })
      .filter(Boolean) as Array<{ issue: Issue; embedding: number[] }>
  } catch (error) {
    captureException(error as Error)

    return []
  }
}

async function getHistogramTotals({
  workspaceId,
  issueIds,
}: {
  workspaceId: number
  issueIds: number[]
}) {
  const totals = new Map<number, number>()
  if (issueIds.length === 0) return totals

  const rows = await database
    .select({
      issueId: issueHistograms.issueId,
      total: sql<number>`SUM(${issueHistograms.count})`,
    })
    .from(issueHistograms)
    .where(
      and(
        eq(issueHistograms.workspaceId, workspaceId),
        inArray(issueHistograms.issueId, issueIds),
      ),
    )
    .groupBy(issueHistograms.issueId)

  rows.forEach((row) => totals.set(row.issueId, row.total ?? 0))

  return totals
}

function pickWinner({
  anchorIssue,
  candidates,
  totals,
}: {
  anchorIssue: Issue
  candidates: Issue[]
  totals: Map<number, number>
}) {
  const winner = candidates.reduce((current, issue) => {
    const currentTotal = totals.get(current.id) ?? 0
    const nextTotal = totals.get(issue.id) ?? 0

    if (nextTotal > currentTotal) return issue
    if (nextTotal < currentTotal) return current

    if (issue.id === anchorIssue.id) return issue
    if (current.id === anchorIssue.id) return current

    return issue.id < current.id ? issue : current
  }, candidates[0]!)

  const mergedIssues = candidates.filter((issue) => issue.id !== winner.id)

  return { winner, mergedIssues }
}

function mergeIssueCentroids({
  winner,
  mergedIssues,
  timestamp,
}: {
  winner: Issue
  mergedIssues: Issue[]
  timestamp: Date
}): IssueCentroid | undefined {
  const centroids = [winner, ...mergedIssues]
    .filter((issue) => issue.centroid.base.length > 0)
    .map((issue) => ({ ...issue.centroid, updatedAt: issue.updatedAt }))

  if (centroids.length === 0) return undefined
  if (centroids.length === 1) {
    return { base: centroids[0]!.base, weight: centroids[0]!.weight }
  }

  return mergeCentroids(centroids, timestamp)
}

async function linkEvaluationResults({
  workspaceId,
  winnerId,
  issueIds,
  timestamp,
  transaction,
}: {
  workspaceId: number
  winnerId: number
  issueIds: number[]
  timestamp: Date
  transaction: Transaction
}) {
  if (issueIds.length === 0) return Result.nil()

  return await transaction.call(async (tx) => {
    const associations = await tx
      .select({
        evaluationResultId: issueEvaluationResults.evaluationResultId,
      })
      .from(issueEvaluationResults)
      .where(
        and(
          eq(issueEvaluationResults.workspaceId, workspaceId),
          inArray(issueEvaluationResults.issueId, issueIds),
        ),
      )

    if (associations.length === 0) return Result.nil()

    const evaluationResultIds = associations.map(
      ({ evaluationResultId }) => evaluationResultId,
    )

    return await bulkLinkIssueEvaluationResults(
      {
        workspaceId,
        issueId: winnerId,
        evaluationResultIds,
        timestamp,
      },
      transaction,
    )
  })
}

async function ignoreEvaluations({
  workspaceId,
  issueIds,
  timestamp,
  transaction,
}: {
  workspaceId: number
  issueIds: number[]
  timestamp: Date
  transaction: Transaction
}) {
  if (issueIds.length === 0) return Result.nil()

  return await transaction.call(async (tx) => {
    await tx
      .update(evaluationVersions)
      .set({
        evaluateLiveLogs: false,
        ignoredAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(evaluationVersions.workspaceId, workspaceId),
          inArray(evaluationVersions.issueId, issueIds),
        ),
      )

    return Result.nil()
  })
}

async function mergeHistograms({
  winner,
  mergedIssues,
  timestamp,
  transaction,
}: {
  winner: Issue
  mergedIssues: Issue[]
  timestamp: Date
  transaction: Transaction
}) {
  const issueIds = mergedIssues.map((issue) => issue.id)
  if (issueIds.length === 0) return Result.nil()

  return await transaction.call(async (tx) => {
    const histograms = await tx
      .select({
        commitId: issueHistograms.commitId,
        date: issueHistograms.date,
        occurredAt: issueHistograms.occurredAt,
        count: issueHistograms.count,
      })
      .from(issueHistograms)
      .where(
        and(
          eq(issueHistograms.workspaceId, winner.workspaceId),
          inArray(issueHistograms.issueId, issueIds),
        ),
      )

    if (histograms.length === 0) return Result.nil()

    // Aggregate histograms by (commitId, date) to avoid duplicate conflict keys
    const aggregatedHistograms = Array.from(
      histograms
        .reduce((map, histogram) => {
          const key = `${histogram.commitId}:${histogram.date}`
          const existing = map.get(key)
          if (existing) {
            existing.count += histogram.count
            existing.occurredAt = new Date(
              Math.max(
                existing.occurredAt.getTime(),
                histogram.occurredAt.getTime(),
              ),
            )
          } else {
            map.set(key, { ...histogram })
          }
          return map
        }, new Map<string, (typeof histograms)[0]>())
        .values(),
    )

    await tx
      .insert(issueHistograms)
      .values(
        aggregatedHistograms.map((histogram) => ({
          workspaceId: winner.workspaceId,
          projectId: winner.projectId,
          documentUuid: winner.documentUuid,
          issueId: winner.id,
          commitId: histogram.commitId,
          date: histogram.date,
          occurredAt: histogram.occurredAt,
          count: histogram.count,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      )
      .onConflictDoUpdate({
        target: [
          issueHistograms.issueId,
          issueHistograms.commitId,
          issueHistograms.date,
        ],
        // If a histogram for this (issueId, commitId, date) already exists,
        // aggregate the counts and keep the latest occurrence time
        set: {
          count: sql<number>`${issueHistograms.count} + excluded.count`,
          occurredAt: sql<Date>`GREATEST(${issueHistograms.occurredAt}, excluded.occurred_at)`,
          updatedAt: timestamp,
        },
      })

    return Result.nil()
  })
}

async function markMerged({
  workspaceId,
  winnerId,
  issueIds,
  timestamp,
  transaction,
}: {
  workspaceId: number
  winnerId: number
  issueIds: number[]
  timestamp: Date
  transaction: Transaction
}) {
  if (issueIds.length === 0) return Result.nil()

  return await transaction.call(async (tx) => {
    await tx
      .update(issues)
      .set({
        mergedAt: timestamp,
        mergedToIssueId: winnerId,
        updatedAt: timestamp,
      })
      .where(
        and(eq(issues.workspaceId, workspaceId), inArray(issues.id, issueIds)),
      )

    return Result.nil()
  })
}
