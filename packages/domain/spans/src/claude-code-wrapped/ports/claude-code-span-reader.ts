import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * Read port for the Claude Code Wrapped feature.
 *
 * A focused port (rather than reusing the broad `SpanRepository`) keeps the
 * Wrapped feature decoupled from the rest of the spans domain — future data
 * points get added as new methods here without touching the main repository.
 */
export interface ClaudeCodeSpanReaderShape {
  /**
   * Distinct `(organizationId, projectId)` pairs that received at least one
   * Claude Code span in the window. Used by the weekly cron to fan out only
   * to projects with actual activity.
   */
  listProjectsWithSpansInWindow(params: {
    readonly from: Date
    readonly to: Date
  }): Effect.Effect<
    readonly { readonly organizationId: OrganizationId; readonly projectId: ProjectId }[],
    RepositoryError,
    ChSqlClient
  >

  /**
   * Number of distinct Claude Code sessions for a project in the window.
   * Doubles as the cheap "did anything happen?" gate inside the per-project
   * run — zero ⇒ skip without loading recipients or rendering email.
   */
  countSessionsForProjectInWindow(params: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly from: Date
    readonly to: Date
  }): Effect.Effect<number, RepositoryError, ChSqlClient>
}

export class ClaudeCodeSpanReader extends Context.Service<ClaudeCodeSpanReader, ClaudeCodeSpanReaderShape>()(
  "@domain/spans/ClaudeCodeSpanReader",
) {}
