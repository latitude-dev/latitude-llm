import {
  type AdminUnpricedPair,
  type ListUnpricedSpansOutput,
  listUnpricedSpansUseCase,
  UNPRICED_SPANS_WINDOW_DAYS,
  type UnpricedPairState,
} from "@domain/admin"
import { AdminUnpricedSpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { AdminProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getClickhouseClient } from "../../server/clients.ts"

export interface AdminUnpricedProjectRefDto {
  projectId: string
  projectName: string | null
  projectSlug: string | null
  organizationId: string
  organizationName: string | null
  organizationSlug: string | null
  spans: number
  tokens: number
  lastOccurrenceAt: string
}

export interface AdminUnpricedPairDto {
  provider: string
  model: string
  spans: number
  tokens: number
  firstSeenAt: string
  lastOccurrenceAt: string
  cause: "missingPricing" | "ingestGap" | "freePricing"
  state: UnpricedPairState
  /** Present when a recorded decision covers this pair. */
  triage:
    | { decision: "fixed"; fixedAt: string; note: string }
    | { decision: "wontFix"; reason: string; note: string }
    | null
  unpriceableReason: string | null
  projects: AdminUnpricedProjectRefDto[]
}

interface AdminUnpricedSpansPageDto {
  pairs: AdminUnpricedPairDto[]
  staleTriage: { provider: string; model: string; decision: string; note: string }[]
  windowStart: string
  windowEnd: string
  windowDays: number
}

const toPairDto = (pair: AdminUnpricedPair): AdminUnpricedPairDto => ({
  provider: pair.provider,
  model: pair.model,
  spans: pair.spans,
  tokens: pair.tokens,
  firstSeenAt: pair.firstSeenAt.toISOString(),
  lastOccurrenceAt: pair.lastOccurrenceAt.toISOString(),
  cause: pair.cause,
  state: pair.state,
  triage: pair.triage
    ? pair.triage.decision === "fixed"
      ? { decision: "fixed", fixedAt: pair.triage.fixedAt, note: pair.triage.note }
      : { decision: "wontFix", reason: pair.triage.reason, note: pair.triage.note }
    : null,
  unpriceableReason: pair.unpriceableReason,
  projects: pair.projects.map((project) => ({
    projectId: project.projectId,
    projectName: project.projectName,
    projectSlug: project.projectSlug,
    organizationId: project.organizationId,
    organizationName: project.organizationName,
    organizationSlug: project.organizationSlug,
    spans: project.spans,
    tokens: project.tokens,
    lastOccurrenceAt: project.lastOccurrenceAt.toISOString(),
  })),
})

const toPageDto = (output: ListUnpricedSpansOutput, windowDays: number): AdminUnpricedSpansPageDto => ({
  pairs: output.pairs.map(toPairDto),
  staleTriage: output.staleTriage.map(({ entry }) => ({
    provider: entry.provider,
    model: entry.model,
    decision: entry.decision,
    note: entry.note,
  })),
  windowStart: output.windowStart.toISOString(),
  windowEnd: output.windowEnd.toISOString(),
  windowDays,
})

export const adminListUnpricedSpansInputSchema = z.object({
  windowDays: z.number().int().positive().max(90).optional(),
})

/**
 * Backoffice unpriced-spans triage listing: every provider/model pair that arrived with token usage
 * and no price, deduplicated across organisations because one catalog entry or alias fixes all of
 * them at once, with the affected projects named from Postgres.
 *
 * Guard: {@link adminMiddleware}. Postgres runs on the admin client at the `"system"` org scope
 * (RLS bypass); ClickHouse aggregates `spans` cross-tenant via the dedicated admin port — see the
 * security warnings on `AdminUnpricedSpanRepositoryLive` and `AdminProjectRepositoryLive`.
 */
export const adminListUnpricedSpans = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminListUnpricedSpansInputSchema)
  .handler(async ({ data }): Promise<AdminUnpricedSpansPageDto> => {
    const windowDays = data.windowDays ?? UNPRICED_SPANS_WINDOW_DAYS
    const output = await Effect.runPromise(
      listUnpricedSpansUseCase({ windowDays }).pipe(
        withPostgres(AdminProjectRepositoryLive, getAdminPostgresClient()),
        withClickHouse(AdminUnpricedSpanRepositoryLive, getClickhouseClient()),
        withTracing,
      ),
    )

    return toPageDto(output, windowDays)
  })
