import { AgentDispatchAdapters } from "@domain/agent-dispatch"
import { Layer } from "effect"
import { createClaudeRoutineAdapter } from "./adapters/claude-routine-adapter.ts"
import { createCursorAdapter } from "./adapters/cursor-adapter.ts"
import { createLinearAdapter } from "./adapters/linear-adapter.ts"
import { createWebhookAdapter } from "./adapters/webhook-adapter.ts"

export const AgentDispatchAdaptersLive = Layer.succeed(AgentDispatchAdapters, {
  cursor: createCursorAdapter(),
  claude_code: createClaudeRoutineAdapter(),
  linear: createLinearAdapter(),
  webhook: createWebhookAdapter(),
})

export { createClaudeRoutineAdapter } from "./adapters/claude-routine-adapter.ts"
export { createCursorAdapter } from "./adapters/cursor-adapter.ts"
export { createLinearAdapter } from "./adapters/linear-adapter.ts"
export { createWebhookAdapter } from "./adapters/webhook-adapter.ts"
