import { and, eq, SQL, sql } from 'drizzle-orm'
import { database } from '../../../../client'
import { Result } from '../../../../lib/Result'
import { spans } from '../../../../schema/models/spans'
import { TracesAggregations } from '../../../../schema/models/types/Span'
import { DatabaseError } from 'pg'
import { SpanType } from '@latitude-data/constants'
import { isFeatureEnabledByName } from '../../../workspaceFeatures/isFeatureEnabledByName'
import { computeDocumentTracesAggregations as chComputeDocumentTracesAggregations } from '../../../../queries/clickhouse/spans/computeDocumentTracesAggregations'

const CLICKHOUSE_SPANS_READ_FLAG = 'clickhouse-spans-read'

export async function computeDocumentTracesAggregations(
  {
    workspaceId,
    documentUuid,
    commitUuid,
  }: {
    workspaceId: number
    documentUuid: string
    commitUuid?: string
  },
  db = database,
) {
  const clickhouseEnabledResult = await isFeatureEnabledByName(
    workspaceId,
    CLICKHOUSE_SPANS_READ_FLAG,
    db,
  )
  const shouldUseClickHouse =
    clickhouseEnabledResult.ok && clickhouseEnabledResult.value

  if (shouldUseClickHouse) {
    const result = await chComputeDocumentTracesAggregations({
      workspaceId,
      documentUuid,
      commitUuid,
    })
    return Result.ok(result)
  }
  try {
    const countConditions = [
      eq(spans.documentUuid, documentUuid),
      commitUuid ? eq(spans.commitUuid, commitUuid) : undefined,
    ].filter(Boolean) as SQL<unknown>[]
    const conditions = [
      eq(spans.documentUuid, documentUuid),
      eq(spans.type, SpanType.Completion),
      commitUuid ? eq(spans.commitUuid, commitUuid) : undefined,
    ].filter(Boolean) as SQL<unknown>[]
    const totalCountPromise = db
      .select({
        totalCount: sql<number>`count(DISTINCT ${spans.traceId})`.mapWith(
          Number,
        ),
      })
      .from(spans)
      .where(and(...countConditions))
      .then((r) => r[0] ?? { totalCount: 0 })
    const spanAggregations = db
      .select({
        totalTokens: sql<number>`
          coalesce(
            sum(
              coalesce(${spans.tokensPrompt}, 0) +
              coalesce(${spans.tokensCached}, 0) +
              coalesce(${spans.tokensReasoning}, 0) +
              coalesce(${spans.tokensCompletion}, 0)
            ),
            0
          )
        `.mapWith(Number),
        totalCostInMillicents:
          sql<number>`coalesce(sum(${spans.cost}), 0)`.mapWith(Number),
        averageTokens: sql<number>`
          coalesce(
            avg(
              coalesce(${spans.tokensPrompt}, 0) +
              coalesce(${spans.tokensCached}, 0) +
              coalesce(${spans.tokensReasoning}, 0) +
              coalesce(${spans.tokensCompletion}, 0)
            ),
            0
          )
        `.mapWith(Number),
        averageCostInMillicents:
          sql<number>`coalesce(avg(${spans.cost}), 0)`.mapWith(Number),
        medianCostInMillicents: sql<number>`
          COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${spans.cost}), 0)
        `.mapWith(Number),
        averageDuration:
          sql<number>`coalesce(avg(${spans.duration}), 0)`.mapWith(Number),
        medianDuration: sql<number>`
          COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${spans.duration}), 0)
        `.mapWith(Number),
      })
      .from(spans)
      .where(and(...conditions))
      .then(
        (r) =>
          r[0] ?? {
            totalTokens: 0,
            totalCostInMillicents: 0,
            averageTokens: 0,
            averageCostInMillicents: 0,
            medianCostInMillicents: 0,
            averageDuration: 0,
            medianDuration: 0,
          },
      )

    const [
      {
        totalTokens,
        totalCostInMillicents,
        averageTokens,
        averageCostInMillicents,
        medianCostInMillicents,
        averageDuration,
        medianDuration,
      },
      { totalCount },
    ] = await Promise.all([spanAggregations, totalCountPromise])

    return Result.ok<TracesAggregations>({
      totalCount,
      totalTokens,
      totalCostInMillicents,
      averageTokens,
      averageCostInMillicents,
      medianCostInMillicents,
      averageDuration,
      medianDuration,
    })
  } catch (e) {
    if (e && 'cause' in (e as DatabaseError) && (e as DatabaseError).cause) {
      return Result.error((e as DatabaseError).cause as Error)
    } else {
      return Result.error(e as Error)
    }
  }
}
