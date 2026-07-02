import { and, eq, inArray, sql } from 'drizzle-orm'

import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { documentLogs } from '../../schema/legacyModels/documentLogs'
import { evaluationResults } from '../../schema/legacyModels/evaluationResults'
import { evaluations } from '../../schema/legacyModels/evaluations'
import { providerLogs } from '../../schema/legacyModels/providerLogs'
import { apiKeys } from '../../schema/models/apiKeys'
import { claimedRewards } from '../../schema/models/claimedRewards'
import { commits } from '../../schema/models/commits'
import { datasetRows } from '../../schema/models/datasetRows'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { events } from '../../schema/models/events'
import { integrations } from '../../schema/models/integrations'
import { projects } from '../../schema/models/projects'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { spans } from '../../schema/models/spans'
import { subscriptions } from '../../schema/models/subscriptions'
import { workspaces } from '../../schema/models/workspaces'
import type { Workspace } from '../../schema/models/types/Workspace'

const DELETE_BATCH_SIZE = 5_000

/**
 * Permanently destroys a workspace and all associated data.
 * This is a destructive operation that cannot be undone.
 *
 * The deletion runs in two phases and is therefore NOT atomic: it is designed
 * to be retried until it completes, and every step is idempotent.
 *
 * Phase 1 drains the unbounded-growth tables (logs, spans, results, events,
 * dataset rows) in batches of `batchSize` rows, each batch in its own implicit
 * transaction. A single-statement `DELETE ... WHERE workspace_id = ?` on these
 * tables exceeds the pool's 30s `statement_timeout` for any sizable workspace
 * (see `POOL_CONFIG` in `client/index.ts`), which is exactly how workspace
 * deletion silently failed in production before this existed.
 *
 * Phase 2 removes the remaining bounded tables and the workspace row inside a
 * single transaction, re-sweeping the phase 1 tables to catch rows written
 * while phase 1 was running. The delete order is forced by the foreign key
 * graph and must not be reordered casually:
 *
 * - `spans` and `provider_logs` reference `apiKeys`/`providerApiKeys` with
 *   `onDelete: 'restrict'`, so they must be deleted before those keys.
 * - `evaluation_results` (legacy v1) references `provider_logs` and
 *   `document_logs` without a cascade and has no `workspaceId` of its own, so
 *   it must be deleted (scoped through its `evaluations`) before them.
 * - `provider_logs` and `document_logs` have a nullable `workspaceId`, so
 *   legacy rows are additionally purged through their `providerApiKeys` and
 *   `commits` references, which otherwise block those deletes with
 *   `onDelete: 'restrict'`.
 * - `apiKeys`, `providerApiKeys`, `claimedRewards`, `integrations` and `events`
 *   reference `workspaces` without a cascade, so they must be deleted before
 *   the workspace row.
 * - `workspaces.currentSubscriptionId` references `subscriptions`, so the
 *   workspace must be deleted before its subscriptions.
 *
 * All other related tables (projects, memberships, evaluations, etc.) are
 * removed by database cascade delete constraints when the workspace row is
 * deleted. The phase 2 transaction raises its `statement_timeout` because that
 * cascade is a single statement that can legitimately outlive the pool's 30s
 * default.
 */
export async function destroyWorkspace(
  workspace: Workspace,
  transaction = new Transaction(),
  batchSize = DELETE_BATCH_SIZE,
) {
  const workspaceId = workspace.id

  const workspaceEvaluations = database
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(eq(evaluations.workspaceId, workspaceId))

  await purgeInBatches(() =>
    database
      .delete(evaluationResults)
      .where(
        inArray(
          evaluationResults.id,
          database
            .select({ id: evaluationResults.id })
            .from(evaluationResults)
            .where(
              inArray(evaluationResults.evaluationId, workspaceEvaluations),
            )
            .limit(batchSize),
        ),
      ),
  )

  await purgeInBatches(() =>
    database
      .delete(evaluationResultsV2)
      .where(
        inArray(
          evaluationResultsV2.id,
          database
            .select({ id: evaluationResultsV2.id })
            .from(evaluationResultsV2)
            .where(eq(evaluationResultsV2.workspaceId, workspaceId))
            .limit(batchSize),
        ),
      ),
  )

  await purgeInBatches(() =>
    database
      .delete(spans)
      .where(
        and(
          eq(spans.workspaceId, workspaceId),
          inArray(
            spans.traceId,
            database
              .select({ traceId: spans.traceId })
              .from(spans)
              .where(eq(spans.workspaceId, workspaceId))
              .limit(batchSize),
          ),
        ),
      ),
  )

  await purgeInBatches(() =>
    database
      .delete(providerLogs)
      .where(
        inArray(
          providerLogs.id,
          database
            .select({ id: providerLogs.id })
            .from(providerLogs)
            .where(eq(providerLogs.workspaceId, workspaceId))
            .limit(batchSize),
        ),
      ),
  )

  const workspaceProviderApiKeys = database
    .select({ id: providerApiKeys.id })
    .from(providerApiKeys)
    .where(eq(providerApiKeys.workspaceId, workspaceId))

  await purgeInBatches(() =>
    database
      .delete(providerLogs)
      .where(
        inArray(
          providerLogs.id,
          database
            .select({ id: providerLogs.id })
            .from(providerLogs)
            .where(inArray(providerLogs.providerId, workspaceProviderApiKeys))
            .limit(batchSize),
        ),
      ),
  )

  await purgeInBatches(() =>
    database
      .delete(documentLogs)
      .where(
        inArray(
          documentLogs.id,
          database
            .select({ id: documentLogs.id })
            .from(documentLogs)
            .where(eq(documentLogs.workspaceId, workspaceId))
            .limit(batchSize),
        ),
      ),
  )

  const workspaceCommits = database
    .select({ id: commits.id })
    .from(commits)
    .where(
      inArray(
        commits.projectId,
        database
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.workspaceId, workspaceId)),
      ),
    )

  await purgeInBatches(() =>
    database
      .delete(documentLogs)
      .where(
        inArray(
          documentLogs.id,
          database
            .select({ id: documentLogs.id })
            .from(documentLogs)
            .where(inArray(documentLogs.commitId, workspaceCommits))
            .limit(batchSize),
        ),
      ),
  )

  await purgeInBatches(() =>
    database
      .delete(datasetRows)
      .where(
        inArray(
          datasetRows.id,
          database
            .select({ id: datasetRows.id })
            .from(datasetRows)
            .where(eq(datasetRows.workspaceId, workspaceId))
            .limit(batchSize),
        ),
      ),
  )

  await purgeInBatches(() =>
    database
      .delete(events)
      .where(
        inArray(
          events.id,
          database
            .select({ id: events.id })
            .from(events)
            .where(eq(events.workspaceId, workspaceId))
            .limit(batchSize),
        ),
      ),
  )

  return transaction.call(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5min'`)

    await tx
      .delete(evaluationResults)
      .where(
        inArray(
          evaluationResults.evaluationId,
          tx
            .select({ id: evaluations.id })
            .from(evaluations)
            .where(eq(evaluations.workspaceId, workspaceId)),
        ),
      )

    await tx.delete(spans).where(eq(spans.workspaceId, workspaceId))

    await tx
      .delete(providerLogs)
      .where(eq(providerLogs.workspaceId, workspaceId))

    await tx
      .delete(providerApiKeys)
      .where(eq(providerApiKeys.workspaceId, workspaceId))

    await tx.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId))

    await tx
      .delete(claimedRewards)
      .where(eq(claimedRewards.workspaceId, workspaceId))

    await tx
      .delete(integrations)
      .where(eq(integrations.workspaceId, workspaceId))

    await tx.delete(events).where(eq(events.workspaceId, workspaceId))

    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId))

    await tx
      .delete(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))

    return Result.ok(workspace)
  })
}

async function purgeInBatches(
  runBatch: () => Promise<{ rowCount: number | null }>,
) {
  let deleted = 0
  do {
    const result = await runBatch()
    deleted = result.rowCount ?? 0
  } while (deleted > 0)
}
