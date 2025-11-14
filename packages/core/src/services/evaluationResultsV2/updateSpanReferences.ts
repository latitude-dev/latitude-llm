import { and, eq, gte, isNotNull, isNull } from 'drizzle-orm'
import { subDays } from 'date-fns'

import { SpanType } from '../../constants'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { providerLogs } from '../../schema/models/providerLogs'
import { spans } from '../../schema/models/spans'

export async function updateEvaluationResultsSpanReferences(
  workspaceId: number,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    // Only process evaluation results from the last 2 weeks to focus on recent data
    const twoWeeksAgo = subDays(new Date(), 14)

    // Get all evaluation results with evaluatedLogId but missing span references
    const evaluationResults = await tx
      .select({
        id: evaluationResultsV2.id,
        evaluatedLogId: evaluationResultsV2.evaluatedLogId,
        evaluatedSpanId: evaluationResultsV2.evaluatedSpanId,
        evaluatedTraceId: evaluationResultsV2.evaluatedTraceId,
      })
      .from(evaluationResultsV2)
      .where(
        and(
          eq(evaluationResultsV2.workspaceId, workspaceId),
          isNotNull(evaluationResultsV2.evaluatedLogId),
          isNull(evaluationResultsV2.evaluatedSpanId),
          isNull(evaluationResultsV2.evaluatedTraceId),
          gte(evaluationResultsV2.createdAt, twoWeeksAgo),
        ),
      )

    let updatedCount = 0

    for (const result of evaluationResults) {
      // Find the provider log associated with this evaluation result
      const providerLog = await tx
        .select({
          id: providerLogs.id,
          documentLogUuid: providerLogs.documentLogUuid,
        })
        .from(providerLogs)
        .where(
          and(
            eq(providerLogs.id, result.evaluatedLogId!),
            eq(providerLogs.workspaceId, workspaceId),
          ),
        )
        .limit(1)
        .then((r: any[]) => r[0])

      if (!providerLog?.documentLogUuid) {
        continue
      }

      // Find the prompt span associated with this log
      const promptSpan = await tx
        .select({
          id: spans.id,
          traceId: spans.traceId,
        })
        .from(spans)
        .where(
          and(
            eq(spans.workspaceId, workspaceId),
            eq(spans.documentLogUuid, providerLog.documentLogUuid),
            eq(spans.type, SpanType.Prompt),
          ),
        )
        .limit(1)
        .then((r: any[]) => r[0])

      if (!promptSpan) {
        continue
      }

      // Update the evaluation result with the span references
      await tx
        .update(evaluationResultsV2)
        .set({
          evaluatedSpanId: promptSpan.id,
          evaluatedTraceId: promptSpan.traceId,
        })
        .where(eq(evaluationResultsV2.id, result.id))

      updatedCount++
    }

    return Result.ok({
      message: `Successfully updated ${updatedCount} evaluation results with span references`,
      updatedCount,
      workspaceId,
    })
  })
}
