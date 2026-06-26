import type { ScriptConversationMessage, ScriptSessionContext } from "./ports/script-runtime.ts"

const ZERO_COST = { input: 0, output: 0, total: 0 } as const
const ZERO_TOKENS = { input: 0, output: 0, total: 0, cacheRead: 0, cacheCreate: 0, reasoning: 0 } as const

/**
 * A `ScriptSessionContext` carrying only a conversation — zeroed aggregates, no traces. Used where the
 * full session is unavailable or irrelevant: alignment/optimization runs (judge scripts read only
 * `session.conversation`) and tests.
 */
export const minimalScriptSession = (
  conversation: readonly ScriptConversationMessage[] = [],
): ScriptSessionContext => ({
  id: "",
  traceCount: 0,
  spanCount: 0,
  errorCount: 0,
  duration: 0,
  timeToFirstToken: 0,
  cost: ZERO_COST,
  tokens: ZERO_TOKENS,
  startTime: "",
  endTime: "",
  userId: "",
  tags: [],
  metadata: {},
  conversation,
  traces: [],
})
