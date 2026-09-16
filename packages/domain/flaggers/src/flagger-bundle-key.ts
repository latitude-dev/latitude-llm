import type { FlaggerFinding } from "./entities/flagger-finding.ts"
import { UNSPECIFIED_TOOL_ERROR_CLASS } from "./helpers.ts"

/**
 * Bound on a stored key, enforced here rather than at the column so an over-long
 * tool name truncates into a stable key instead of failing the write.
 */
export const FLAGGER_BUNDLE_KEY_MAX_LENGTH = 200

const SEGMENT_MAX_LENGTH = 64

const segment = (value: string | undefined, fallback: string): string => {
  const trimmed = (value ?? "").trim()
  if (trimmed === "") return fallback
  return trimmed.length > SEGMENT_MAX_LENGTH ? trimmed.slice(0, SEGMENT_MAX_LENGTH) : trimmed
}

/**
 * The bucket a deterministic finding belongs to, project-wide and across sessions.
 *
 * A deterministic detector names the failure class outright, so its occurrences do
 * not need to be re-derived from an embedding of the feedback prose — the prose
 * carries volatile detail (an id, a retry count, a path) that fragments one real
 * failure into several issues. Discovery treats this key as authoritative: every
 * occurrence sharing it lands on one issue however the message is worded.
 *
 * Recovery state is deliberately absent. Whether the agent worked past a failing
 * tool varies run to run; the broken integration does not.
 *
 * Returns null for findings a model authored — those keep clustering by meaning,
 * which is the only thing that groups differently-worded judgements.
 */
export const flaggerBundleKey = (finding: FlaggerFinding): string | null => {
  const key = buildBundleKey(finding)
  return key === null || key.length <= FLAGGER_BUNDLE_KEY_MAX_LENGTH ? key : key.slice(0, FLAGGER_BUNDLE_KEY_MAX_LENGTH)
}

const buildBundleKey = (finding: FlaggerFinding): string | null => {
  switch (finding.flaggerSlug) {
    case "tool-call-errors":
      return `${finding.flaggerSlug}:${finding.findingKind}:${toolCallErrorDiscriminator(finding)}`
    case "output-schema-validation":
      return `${finding.flaggerSlug}:${finding.findingKind}:${finding.generationPosition}`
    case "empty-response":
    case "trashing":
    case "low-cache-hit-rate":
      return `${finding.flaggerSlug}:${finding.findingKind}`
    default:
      return null
  }
}

const toolCallErrorDiscriminator = (
  finding: Extract<FlaggerFinding, { readonly flaggerSlug: "tool-call-errors" }>,
): string => {
  if (finding.findingKind === "unknown-id") return "any-tool"
  const toolName = segment("toolName" in finding ? finding.toolName : undefined, "unknown-tool")
  if (finding.findingKind !== "error") return toolName
  return `${toolName}:${segment(finding.errorClass, UNSPECIFIED_TOOL_ERROR_CLASS)}`
}
