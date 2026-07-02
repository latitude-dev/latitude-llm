/** How long a generated-script result lives in Redis before the poller must re-request. */
export const SCRIPT_GENERATION_RESULT_TTL_SECONDS = 300

/** Org-prefixed key the `signals-generate-script` worker writes and the web poller reads. */
export const buildScriptGenerationResultKey = (organizationId: string, generationId: string): string =>
  `org:${organizationId}:signalScriptGeneration:${generationId}`

/** The transport contract between the generation worker (writer) and the web poller (reader). */
export type ScriptGenerationResult =
  | { readonly status: "pending" }
  | { readonly status: "done"; readonly script: string; readonly reasoning: string }
  | { readonly status: "error"; readonly error: string }
