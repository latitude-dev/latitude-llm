import type { SpanDetail } from "../entities/span.ts"
import { REDACTED_IDENTITY_PLACEHOLDER } from "./labels.ts"
import {
  emptyScanTally,
  maskKeyedValues,
  mergeScanTally,
  type NumberMapRedactionResult,
  redactJsonString,
  redactJsonValue,
  redactNumberMap,
  redactStringMap,
  type ScanTally,
} from "./redact-json.ts"
import { mergeRedactionCounts, type RedactionCounts, redactLeaf } from "./redact-text.ts"
import type { CompiledPolicy } from "./rules.ts"

interface SpanRedactionStats {
  readonly counts: RedactionCounts
  readonly scan: ScanTally
  readonly relocatedNumericAttributes: number
  readonly pseudonymizedIdentities: number
}

/** Pseudonym collection runs before compilation, so it is stated as the field it needs rather than a whole policy. */
type IdentityHandling = Pick<CompiledPolicy, "identities">

/** Resolved before the synchronous walk, because deriving a pseudonym needs an async HMAC. */
export type PseudonymLookup = ReadonlyMap<string, string>

export function redactSpanDetail(
  span: SpanDetail,
  policy: CompiledPolicy,
  pseudonyms: PseudonymLookup,
): { span: SpanDetail; stats: SpanRedactionStats } {
  const ruleSet = policy.ruleSet
  const counts: RedactionCounts = {}
  const scan = emptyScanTally()
  const relocated: Record<string, string> = {}
  let relocatedNumericAttributes = 0
  let pseudonymizedIdentities = 0

  const take = <T>(result: { value: T; counts: RedactionCounts; scan: ScanTally }): T => {
    mergeRedactionCounts(counts, result.counts)
    mergeScanTally(scan, result.scan)
    return result.value
  }

  const takeNumbers = <T extends number>(result: NumberMapRedactionResult<T>): Record<string, T> => {
    mergeRedactionCounts(counts, result.counts)
    mergeScanTally(scan, result.scan)
    for (const [key, placeholder] of Object.entries(result.relocated)) {
      relocated[key] = placeholder
      relocatedNumericAttributes += 1
    }
    return result.kept
  }

  const inputMessages = take(redactJsonValue(span.inputMessages, ruleSet))
  const outputMessages = take(redactJsonValue(span.outputMessages, ruleSet))
  const systemInstructions = take(redactJsonValue(span.systemInstructions, ruleSet))
  const toolDefinitions = take(redactJsonValue(span.toolDefinitions, ruleSet))
  const toolInput = take(redactJsonString(span.toolInput, ruleSet))
  const toolOutput = take(redactJsonString(span.toolOutput, ruleSet))
  const eventsJson = take(redactJsonString(span.eventsJson, ruleSet))

  const statusMessageOutcome = redactLeaf(span.statusMessage, ruleSet)
  mergeRedactionCounts(counts, statusMessageOutcome.counts)
  scan.leaves += 1
  scan.chars += statusMessageOutcome.scannedChars
  if (statusMessageOutcome.oversized) scan.oversized += 1

  // Not redundant with the identity columns below: those are resolved copies, and these maps hold the originals.
  const identities = identityReplacements(span, policy, pseudonyms)
  const substitute = (map: Readonly<Record<string, string>>): Readonly<Record<string, string>> => {
    const outcome = substituteIdentities(map, identities)
    pseudonymizedIdentities += outcome.replaced
    return outcome.value
  }

  // A key rule masks the whole value wherever the key appears. Unlike the value pass it is not
  // gated on the metadata scope: a key named explicitly is meant everywhere, and masking one
  // cannot produce a false positive.
  const maskedAttrString = take(maskKeyedValues(substitute(span.attrString), ruleSet))
  const maskedResourceString = take(maskKeyedValues(substitute(span.resourceString), ruleSet))
  const redactedAttrString = take(redactStringMap(maskedAttrString, ruleSet))
  const resourceString = take(redactStringMap(maskedResourceString, ruleSet))

  // `attrBool` is not scanned: no detector can match "true" or "false".
  const attrInt = takeNumbers(redactNumberMap(span.attrInt, ruleSet))
  const attrFloat = takeNumbers(redactNumberMap(span.attrFloat, ruleSet))
  const attrString = { ...relocated, ...redactedAttrString }

  // Identity handling is its own control, so it applies to metadata and tags whether or not the metadata scope is on.
  const metadataSource = take(maskKeyedValues(substitute(span.metadata), ruleSet))
  const metadata = policy.redactMetadata ? take(redactStringMap(metadataSource, ruleSet)) : metadataSource
  const tagsSource =
    identities.size === 0
      ? span.tags
      : span.tags.map((tag) => {
          const replacement = identities.get(tag)
          if (replacement === undefined) return tag
          pseudonymizedIdentities += 1
          return replacement
        })
  const tags = policy.redactMetadata
    ? tagsSource.map((tag) => {
        const outcome = redactLeaf(tag, ruleSet)
        mergeRedactionCounts(counts, outcome.counts)
        scan.leaves += 1
        scan.chars += outcome.scannedChars
        return outcome.text
      })
    : tagsSource

  let userId = span.userId
  let userEmail = span.userEmail
  if (policy.identities === "pseudonymize") {
    const nextUserId = replaceIdentity(span.userId, pseudonyms)
    const nextUserEmail = replaceIdentity(span.userEmail, pseudonyms)
    if (nextUserId !== span.userId) pseudonymizedIdentities += 1
    if (nextUserEmail !== span.userEmail) pseudonymizedIdentities += 1
    userId = nextUserId as typeof span.userId
    userEmail = nextUserEmail
  }

  return {
    span: {
      ...span,
      userId,
      userEmail,
      statusMessage: statusMessageOutcome.text,
      tags,
      metadata,
      eventsJson,
      attrString,
      attrInt,
      attrFloat,
      resourceString,
      inputMessages,
      outputMessages,
      systemInstructions,
      toolDefinitions,
      toolInput,
      toolOutput,
    },
    stats: { counts, scan, relocatedNumericAttributes, pseudonymizedIdentities },
  }
}


/** Empty identities stay empty: pseudonymizing `""` would invent a user that never existed. */
const replaceIdentity = (value: string, pseudonyms: PseudonymLookup): string => {
  if (value === "") return value

  return pseudonyms.get(value) ?? REDACTED_IDENTITY_PLACEHOLDER
}

const NO_IDENTITIES: ReadonlyMap<string, string> = new Map()

/** Keyed by the raw value rather than the attribute key, so every vendor spelling of `user.id` is covered at once. */
function identityReplacements(
  span: SpanDetail,
  policy: IdentityHandling,
  pseudonyms: PseudonymLookup,
): ReadonlyMap<string, string> {
  if (policy.identities !== "pseudonymize") return NO_IDENTITIES

  const replacements = new Map<string, string>()
  for (const value of [span.userId as string, span.userEmail]) {
    if (value !== "") replacements.set(value, replaceIdentity(value, pseudonyms))
  }

  return replacements
}

/** Whole-value matches only: a substring pass would rewrite `gpt-4` for a project whose user ids are short numbers. */
function substituteIdentities(
  map: Readonly<Record<string, string>>,
  identities: ReadonlyMap<string, string>,
): { value: Readonly<Record<string, string>>; replaced: number } {
  if (identities.size === 0) return { value: map, replaced: 0 }

  let replaced = 0
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(map)) {
    const replacement = identities.get(value)
    if (replacement === undefined) {
      next[key] = value
      continue
    }
    next[key] = replacement
    replaced += 1
  }

  return replaced === 0 ? { value: map, replaced: 0 } : { value: next, replaced }
}

export function collectIdentityValues(
  spans: readonly SpanDetail[],
  policyFor: (span: SpanDetail) => IdentityHandling | undefined,
): Set<string> {
  const values = new Set<string>()

  for (const span of spans) {
    const policy = policyFor(span)
    if (policy?.identities !== "pseudonymize") continue
    if (span.userId !== "") values.add(span.userId)
    if (span.userEmail !== "") values.add(span.userEmail)
  }

  return values
}
