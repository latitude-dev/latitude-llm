import { Effect } from "effect"
import { ClaudeCodeSpanReader } from "../ports/claude-code-span-reader.ts"

/**
 * Lists `(organizationId, projectId)` pairs that recorded at least one
 * Claude Code span in the given window. Thin wrapper over the port so callers
 * (the weekly cron handler) depend on a use case rather than the port shape
 * directly.
 */
export const listProjectsWithClaudeCodeSpansUseCase = Effect.fn("claude-code-wrapped.listProjectsWithSpans")(
  function* (input: { readonly from: Date; readonly to: Date }) {
    const reader = yield* ClaudeCodeSpanReader
    return yield* reader.listProjectsWithSpansInWindow(input)
  },
)
