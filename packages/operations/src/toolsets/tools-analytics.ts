import { defineToolset } from "../core/toolset.ts"
import { operationModules } from "../operations/index.ts"

/**
 * Read-only tool-usage analytics for in-process agents (e.g. the signal
 * creation agent researching which tools a project's agents call and how
 * often they fail).
 */
export const toolsAnalyticsToolset = defineToolset({ name: "tools-analytics", groups: ["tools"] }, operationModules)
