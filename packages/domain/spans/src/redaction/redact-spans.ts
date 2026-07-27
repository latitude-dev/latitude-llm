import type { OrganizationId, ResolvedRedactionPolicy } from "@domain/shared"
import { hmacSha256Hex } from "@repo/utils"
import { Effect } from "effect"
import type { SpanDetail } from "../entities/span.ts"
import { RedactionError } from "../errors.ts"
import { REDACTION_BATCH_TIMEOUT_MS } from "./labels.ts"
import { emptyScanTally, mergeScanTally } from "./redact-json.ts"
import { collectIdentityValues, type PseudonymLookup, redactSpanDetail } from "./redact-span.ts"
import { mergeRedactionCounts, type RedactionCounts } from "./redact-text.ts"

interface SpanRedactionSummary {
  readonly counts: RedactionCounts
  readonly enforceSpans: number
  readonly dryRunSpans: number
  readonly leavesScanned: number
  readonly charsScanned: number
  readonly droppedAttributeKeys: number
  readonly oversizedFields: number
  readonly pseudonymizedIdentities: number
  /**
   * True when a project asked for pseudonymized identities but no secret was
   * configured, so identities were fully redacted instead. Surfaced so the worker
   * can log it: the fallback is safe but silently changes what is stored.
   */
  readonly identityFallback: boolean
}

const EMPTY_SUMMARY: SpanRedactionSummary = {
  counts: {},
  enforceSpans: 0,
  dryRunSpans: 0,
  leavesScanned: 0,
  charsScanned: 0,
  droppedAttributeKeys: 0,
  oversizedFields: 0,
  pseudonymizedIdentities: 0,
  identityFallback: false,
}

interface RedactSpansInput {
  readonly spans: readonly SpanDetail[]
  readonly organizationId: OrganizationId
  /** Projects resolving to `off` are absent, so an empty map means redact nothing. */
  readonly policyByProjectId: ReadonlyMap<string, ResolvedRedactionPolicy>
  readonly pseudonymSecret: string | undefined
  readonly timeoutMs?: number
}

/**
 * Redact a decoded batch before it is persisted.
 *
 * Fails closed. Any error, including a timeout, fails the effect so the ingest job
 * retries rather than inserting content a project asked us to strip. Because
 * redaction is non-retroactive and there is no delete path, a fail-open write here
 * would be permanent.
 */
export const redactSpans = (
  input: RedactSpansInput,
): Effect.Effect<{ spans: readonly SpanDetail[]; summary: SpanRedactionSummary }, RedactionError> =>
  Effect.gen(function* () {
    if (input.policyByProjectId.size === 0 || input.spans.length === 0) {
      return { spans: input.spans, summary: EMPTY_SUMMARY }
    }

    const budgetMs = input.timeoutMs ?? REDACTION_BATCH_TIMEOUT_MS
    const deadline = performance.now() + budgetMs

    const policyFor = (span: SpanDetail): ResolvedRedactionPolicy | undefined => {
      const policy = input.policyByProjectId.get(span.projectId as string)

      return policy?.mode === "off" ? undefined : policy
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
      try: () => applyRedaction(input.spans, policyFor, pseudonyms, identityFallback, deadline),
      catch: (cause) =>
        cause instanceof RedactionError ? cause : new RedactionError({ reason: "redaction pass failed", cause }),
    })
  }).pipe(Effect.withSpan("spans.redactSpans"))

function applyRedaction(
  spans: readonly SpanDetail[],
  policyFor: (span: SpanDetail) => ResolvedRedactionPolicy | undefined,
  pseudonyms: PseudonymLookup,
  identityFallback: boolean,
  deadline: number,
): { spans: readonly SpanDetail[]; summary: SpanRedactionSummary } {
  const counts: RedactionCounts = {}
  const scan = emptyScanTally()
  let enforceSpans = 0
  let dryRunSpans = 0
  let droppedAttributeKeys = 0
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
    droppedAttributeKeys += result.stats.droppedAttributeKeys
    pseudonymizedIdentities += result.stats.pseudonymizedIdentities
    if (policy.mode === "enforce") enforceSpans += 1
    else dryRunSpans += 1

    return result.span
  })

  return {
    spans: redacted,
    summary: {
      counts,
      enforceSpans,
      dryRunSpans,
      leavesScanned: scan.leaves,
      charsScanned: scan.chars,
      droppedAttributeKeys,
      oversizedFields: scan.oversized,
      pseudonymizedIdentities,
      identityFallback,
    },
  }
}

/**
 * One HMAC per distinct identity value in the batch, not per span.
 *
 * A missing secret degrades to full redaction rather than failing the job or
 * passing plaintext through: degrade toward more privacy, and never block a
 * self-hoster's ingestion on an unset variable.
 */
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
