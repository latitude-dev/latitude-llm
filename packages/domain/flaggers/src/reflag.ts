import { AI_GENERATE_TELEMETRY_TAGS } from "@domain/ai"

/**
 * Reflag policy — bounds flagger-on-flagger recursion to a single level.
 *
 * The "latitude" project collects the telemetry emitted by Latitude's own
 * production flaggers (every `flagger.classify` / `flagger.draft` LLM call). We
 * want to run flaggers *on* that project to catch issues in those production
 * flaggers — but those meta-flaggers emit flagger traces too, which would be
 * flagged again, and so on without end.
 *
 * The break: a meta-flagger run (one whose input trace is itself flagger-generated)
 * stamps its own LLM output with {@link AI_GENERATE_TELEMETRY_TAGS.flaggerNoReflag}.
 * Flagging then skips any trace carrying that marker. The result is exactly one
 * level of meta-flagging — production flagger traces still get flagged, their
 * meta-flagging output does not.
 */

// Tags that identify a trace as the product of a flagger's own LLM calls.
const FLAGGER_PROVENANCE_TAGS: readonly string[] = [
  ...AI_GENERATE_TELEMETRY_TAGS.flaggerClassify,
  ...AI_GENERATE_TELEMETRY_TAGS.flaggerDraft,
]

const FLAGGER_NO_REFLAG_TAG: string = AI_GENERATE_TELEMETRY_TAGS.flaggerNoReflag[0]

/**
 * True when the trace was produced by a flagger's own LLM call (classify/draft).
 * A flagger running on such a trace must stamp its output with the no-reflag tag.
 */
export const isFlaggerGeneratedTrace = (tags: readonly string[]): boolean =>
  tags.some((tag) => FLAGGER_PROVENANCE_TAGS.includes(tag))

/**
 * True when the trace is explicitly marked "do not flag again" — emitted by a
 * flagger that ran on a flagger-generated trace. Flagging must skip these.
 */
export const isReflagSuppressed = (tags: readonly string[]): boolean => tags.includes(FLAGGER_NO_REFLAG_TAG)

/**
 * The extra telemetry tag a flagger run appends to its LLM call when the trace it
 * is flagging is itself flagger-generated. Empty otherwise. Spread into the
 * `telemetry.tags` tuple alongside the base flagger tag.
 */
export const reflagSuppressionTags = (inputTraceTags: readonly string[]): readonly string[] =>
  isFlaggerGeneratedTrace(inputTraceTags) ? AI_GENERATE_TELEMETRY_TAGS.flaggerNoReflag : []
