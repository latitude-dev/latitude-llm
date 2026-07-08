import { defineToolset } from "../core/toolset.ts"
import { operationModules } from "../operations/index.ts"

/**
 * Read-only research surface for the agentic signal generator: tool usage and
 * failures, trace/span lookups, project analytics, existing signals, users, and
 * datasets (list datasets and read their rows).
 * The worker builds an `OperationContext` from its own clients and pins the
 * project, so the agent can only investigate the project it was launched for.
 * Access defaults to read-only, so no mutation reaches the agent by construction.
 */
export const signalAgentToolset = defineToolset(
  { name: "signal-agent", groups: ["tools", "traces", "analytics", "signals", "users", "datasets"] },
  operationModules,
)
