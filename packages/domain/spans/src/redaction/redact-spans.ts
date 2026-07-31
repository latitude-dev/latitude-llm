import type { OrganizationId, RedactionPolicy } from "@domain/shared"
import { hmacSha256Hex } from "@repo/utils"
import { Effect } from "effect"
import type { SpanDetail } from "../entities/span.ts"
import { RedactionError } from "../errors.ts"
import { REDACTION_BATCH_TIMEOUT_MS } from "./labels.ts"
import { emptyScanTally, mergeScanTally } from "./redact-json.ts"
import { collectIdentityValues, type PseudonymLookup, redactSpanDetail } from "./redact-span.ts"
import { mergeRedactionCounts, type RedactionCounts } from "./redact-text.ts"
import { type CompiledPolicy, compilePolicy } from "./rules.ts"

export interface SpanRedactionSummary {
  readonly counts: RedactionCounts
  readonly redactedSpans: number
  readonly leavesScanned: number
  readonly charsScanned: number
  /** Numeric attributes moved into `attrString` as a placeholder because a detector matched. */
  readonly relocatedNumericAttributes: number
  readonly oversizedFields: number
  readonly pseudonymizedIdentities: number
  /** A project asked for pseudonyms but no secret was configured, so identities were redacted instead. */
  readonly identityFallback: boolean
}

const EMPTY_SUMMARY: SpanRedactionSummary = {
  counts: {},
  redactedSpans: 0,
  leavesScanned: 0,
  charsScanned: 0,
  relocatedNumericAttributes: 0,
  oversizedFields: 0,
  pseudonymizedIdentities: 0,
  identityFallback: false,
}

interface RedactSpansInput {
  readonly spans: readonly SpanDetail[]
  readonly organizationId: OrganizationId
  /** Projects resolving to `off` are absent, so an empty map means redact nothing. */
  readonly policyByProjectId: ReadonlyMap<string, RedactionPolicy>
  readonly pseudonymSecret: string | undefined
  readonly timeoutMs?: number
}

/** Fails closed: any error fails the effect so the job retries rather than inserting content a project asked us to strip. */
export const redactSpans = (
  input: RedactSpansInput,
): Effect.Effect<{ spans: readonly SpanDetail[]; summary: SpanRedactionSummary }, RedactionError> =>
  Effect.gen(function* () {
    if (input.policyByProjectId.size === 0 || input.spans.length === 0) {
      return { spans: input.spans, summary: EMPTY_SUMMARY }
    }

    const budgetMs = input.timeoutMs ?? REDACTION_BATCH_TIMEOUT_MS
    const deadline = performance.now() + budgetMs

    // A policy exists only for a project that redacts, so presence is the decision.
    const policyFor = (span: SpanDetail): RedactionPolicy | undefined =>
      input.policyByProjectId.get(span.projectId as string)

    // Compiled once per distinct policy rather than per span: building the pattern list is the
    // only part of the pass that does not depend on the span in front of it.
    const compiled = new Map<RedactionPolicy, CompiledPolicy>()
    const compiledPolicyFor = (span: SpanDetail): CompiledPolicy | undefined => {
      const policy = policyFor(span)
      if (!policy) return undefined

      const existing = compiled.get(policy)
      if (existing) return existing

      const next = compilePolicy(policy)
      compiled.set(policy, next)

      return next
    }

    const identityValues = collectIdentityValues(input.spans, policyFor)
    const { pseudonyms, identityFallback } = yield* buildPseudonyms({
      values: identityValues,
      organizationId: input.organizationId,
      secret: input.pseudonymSecret,
    }).pipe(
      Effect.timeoutOrElse({
        duration: budgetMs,
        orElse: () => Effect.fail(new RedactionError({ reason: "pseudonym derivation timed out" })),
      }),
    )

    return yield* Effect.try({
      try: () => applyRedaction(input.spans, compiledPolicyFor, pseudonyms, identityFallback, deadline),
      catch: (cause) =>
        cause instanceof RedactionError ? cause : new RedactionError({ reason: "redaction pass failed", cause }),
    })
  }).pipe(Effect.withSpan("spans.redactSpans"))

function applyRedaction(
  spans: readonly SpanDetail[],
  policyFor: (span: SpanDetail) => CompiledPolicy | undefined,
  pseudonyms: PseudonymLookup,
  identityFallback: boolean,
  deadline: number,
): { spans: readonly SpanDetail[]; summary: SpanRedactionSummary } {
  const counts: RedactionCounts = {}
  const scan = emptyScanTally()
  let redactedSpans = 0
  let relocatedNumericAttributes = 0
  let pseudonymizedIdentities = 0

  const redacted = spans.map((span) => {
    const policy = policyFor(span)
    if (!policy) return span

    // The walk is synchronous, so an Effect timeout around it could not fire until it already finished.
    if (performance.now() >= deadline) {
      throw new RedactionError({ reason: "redaction pass exceeded its deadline" })
    }

    const result = redactSpanDetail(span, policy, pseudonyms)
    mergeRedactionCounts(counts, result.stats.counts)
    mergeScanTally(scan, result.stats.scan)
    relocatedNumericAttributes += result.stats.relocatedNumericAttributes
    pseudonymizedIdentities += result.stats.pseudonymizedIdentities
    redactedSpans += 1

    return result.span
  })

  return {
    spans: redacted,
    summary: {
      counts,
      redactedSpans,
      leavesScanned: scan.leaves,
      charsScanned: scan.chars,
      relocatedNumericAttributes,
      oversizedFields: scan.oversized,
      pseudonymizedIdentities,
      identityFallback,
    },
  }
}

/** A missing secret degrades to full redaction rather than blocking ingestion or passing plaintext through. */
const buildPseudonyms = (input: {
  readonly values: ReadonlySet<string>
  readonly organizationId: OrganizationId
  readonly secret: string | undefined
}): Effect.Effect<{ pseudonyms: PseudonymLookup; identityFallback: boolean }, never> =>
  Effect.gen(function* () {
    if (input.values.size === 0) return { pseudonyms: new Map<string, string>(), identityFallback: false }
    if (input.secret === undefined || input.secret === "") {
      return { pseudonyms: new Map<string, string>(), identityFallback: true }
    }

    const pseudonyms = new Map<string, string>()
    for (const value of input.values) {
      // Org-scoped so the same address in two organizations cannot be correlated.
      const digest = yield* hmacSha256Hex(input.secret, `${input.organizationId}:${value}`)
      pseudonyms.set(value, `anon_${digest.slice(0, 16)}`)
    }

    return { pseudonyms, identityFallback: false }
  })
