import { defineToolset } from "../core/toolset.ts"
import { operationModules } from "../operations/index.ts"

/**
 * Every read-only, execute-form operation across the registry — the safe
 * default surface for in-process agents that only need to research a project,
 * never mutate it. Grows automatically as more operations convert to
 * execute-form; write/destructive operations are filtered out by construction.
 */
export const readOnlyToolset = defineToolset({ name: "read-only", access: "read-only" }, operationModules)
