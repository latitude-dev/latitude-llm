/**
 * Per-result search match for a session in a search-active list page.
 *
 * The match is **per result, not per session** — it is a property of the
 * session's appearance in a particular search response, not of the session
 * entity itself. That is why this lives outside `session.ts` and is surfaced
 * as a parallel `searchMatches` map on `SessionListPage` (keyed by
 * `sessionId`) rather than embedded into `SessionRecord`. The separation
 * mirrors how `score-analytics` keeps derived-on-read shapes out of its
 * base entities.
 *
 * Fields:
 *  - `bestScore` — the score assigned to this matching session.
 *  - `matchedFirstMessageIndex` / `matchedLastMessageIndex` — optional
 *    session-conversation message range for the best semantic moment. Lexical
 *    matches do not need a stored range because the drawer can recompute
 *    literal/token highlights from the selected session's conversation.
 */
export interface SessionSearchMatch {
  readonly bestScore: number
  readonly matchedFirstMessageIndex?: number | undefined
  readonly matchedLastMessageIndex?: number | undefined
}
