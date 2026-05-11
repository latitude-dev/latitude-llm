import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  type OrganizationId as OrganizationIdT,
  type ProjectId as ProjectIdT,
  OrganizationId as toOrganizationId,
  ProjectId as toProjectId,
  toRepositoryError,
} from "@domain/shared"
import { ClaudeCodeSpanReader, type ClaudeCodeSpanReaderShape } from "@domain/spans"
import { Effect, Layer } from "effect"

// Spans from `@latitude-data/telemetry-claude-code` always carry the Claude
// Code version under this metadata key. Using `ifNull(metadata[k], '') != ''`
// works against ClickHouse's `Map(String, String)` storage and lets us scan
// without a separate column.
const CLAUDE_CODE_VERSION_KEY = "claude_code.version"

// ClickHouse DateTime64(9, 'UTC') rejects trailing 'Z'; strip it. (Mirrors the
// helper used in span-repository.ts.)
const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")

interface ProjectsRow {
  readonly organization_id: string
  readonly project_id: string
}

interface SessionCountRow {
  readonly sessions: number | string
}

export const ClaudeCodeSpanReaderLive = Layer.effect(
  ClaudeCodeSpanReader,
  Effect.gen(function* () {
    const listProjectsWithSpansInWindow: ClaudeCodeSpanReaderShape["listProjectsWithSpansInWindow"] = ({ from, to }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT DISTINCT organization_id, project_id
                    FROM spans
                    WHERE start_time >= {from:DateTime64(9, 'UTC')}
                      AND start_time <= {to:DateTime64(9, 'UTC')}
                      AND ifNull(metadata[{metadataKey:String}], '') != ''`,
              query_params: {
                from: toClickhouseDateTime(from),
                to: toClickhouseDateTime(to),
                metadataKey: CLAUDE_CODE_VERSION_KEY,
              },
              format: "JSONEachRow",
            })
            return result.json<ProjectsRow>()
          })
          .pipe(
            Effect.map((rows) =>
              rows.map((row): { readonly organizationId: OrganizationIdT; readonly projectId: ProjectIdT } => ({
                organizationId: toOrganizationId(row.organization_id),
                projectId: toProjectId(row.project_id),
              })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "listProjectsWithSpansInWindow")),
          )
      })

    const countSessionsForProjectInWindow: ClaudeCodeSpanReaderShape["countSessionsForProjectInWindow"] = ({
      organizationId,
      projectId,
      from,
      to,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT count(DISTINCT session_id) AS sessions
                    FROM spans
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      AND start_time >= {from:DateTime64(9, 'UTC')}
                      AND start_time <= {to:DateTime64(9, 'UTC')}
                      AND ifNull(metadata[{metadataKey:String}], '') != ''
                      AND session_id != ''`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                from: toClickhouseDateTime(from),
                to: toClickhouseDateTime(to),
                metadataKey: CLAUDE_CODE_VERSION_KEY,
              },
              format: "JSONEachRow",
            })
            const [row] = await result.json<SessionCountRow>()
            return row ? Number(row.sessions) : 0
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "countSessionsForProjectInWindow")))
      })

    return {
      listProjectsWithSpansInWindow,
      countSessionsForProjectInWindow,
    }
  }),
)
