import { defineToolset } from "../core/toolset.ts"
import { operationModules } from "../operations/index.ts"

/**
 * Full operation surface for the in-product command-palette agent: every
 * execute-form operation across the whole registry, up to the destructive
 * ceiling. The agent acts as the signed-in user org-wide (no project pinning),
 * so tool schemas keep their project params. Authorization is delegated to each
 * operation (RLS and any per-operation checks); the worker gates every
 * write/destructive call behind an explicit user confirmation.
 */
export const commandPaletteAgentToolset = defineToolset(
  { name: "command-palette-agent", access: "destructive" },
  operationModules,
)
