import type { RedactionPolicy } from "@domain/shared"
import type { SpanDetail } from "../entities/span.ts"
import { isContentAttributeKey } from "../otlp/content/index.ts"
import { REDACTED_IDENTITY_PLACEHOLDER } from "./labels.ts"
import {
  emptyScanTally,
  mergeScanTally,
  redactJsonString,
  redactJsonValue,
  redactStringMap,
  type ScanTally,
} from "./redact-json.ts"
import { mergeRedactionCounts, type RedactionCounts, redactLeaf } from "./redact-text.ts"

interface SpanRedactionStats {
  readonly counts: RedactionCounts
  readonly scan: ScanTally
  readonly droppedAttributeKeys: number
  readonly pseudonymizedIdentities: number
}

/** Resolved before the synchronous walk, because deriving a pseudonym needs an async HMAC. */
export type PseudonymLookup = ReadonlyMap<string, string>

export function redactSpanDetail(
  span: SpanDetail,
  policy: RedactionPolicy,
  pseudonyms: PseudonymLookup,
): { span: SpanDetail; stats: SpanRedactionStats } {
  const entities = policy.entities
  const counts: RedactionCounts = {}
  const scan = emptyScanTally()
  let droppedAttributeKeys = 0
  let pseudonymizedIdentities = 0

  const take = <T>(result: { value: T; counts: RedactionCounts; scan: ScanTally }): T => {
    mergeRedactionCounts(counts, result.counts)
    mergeScanTally(scan, result.scan)
    return result.value
  }

  const inputMessages = take(redactJsonValue(span.inputMessages, entities))
  const outputMessages = take(redactJsonValue(span.outputMessages, entities))
  const systemInstructions = take(redactJsonValue(span.systemInstructions, entities))
  const toolDefinitions = take(redactJsonValue(span.toolDefinitions, entities))
  const toolInput = take(redactJsonString(span.toolInput, entities))
  const toolOutput = take(redactJsonString(span.toolOutput, entities))
  const eventsJson = take(redactJsonString(span.eventsJson, entities))

  const statusMessageOutcome = redactLeaf(span.statusMessage, entities)
  mergeRedactionCounts(counts, statusMessageOutcome.counts)
  scan.leaves += 1
  scan.chars += statusMessageOutcome.scannedChars
  if (statusMessageOutcome.oversized) scan.oversized += 1

  // Dropping is not redundant with the value pass behind it: it also removes the prose no detector matches.
  const contentKeys = Object.keys(span.attrString).filter(isContentAttributeKey)
  droppedAttributeKeys = contentKeys.length
  const attrStringSource =
    contentKeys.length > 0
      ? Object.fromEntries(Object.entries(span.attrString).filter(([key]) => !isContentAttributeKey(key)))
      : span.attrString
  const attrString = take(redactStringMap(attrStringSource, entities))
  const resourceString = take(redactStringMap(span.resourceString, entities))

  const metadata = policy.redactMetadata ? take(redactStringMap(span.metadata, entities)) : span.metadata
  const tags = policy.redactMetadata
    ? span.tags.map((tag) => {
        const outcome = redactLeaf(tag, entities)
        mergeRedactionCounts(counts, outcome.counts)
        scan.leaves += 1
        scan.chars += outcome.scannedChars
        return outcome.text
      })
    : span.tags

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
      resourceString,
      inputMessages,
      outputMessages,
      systemInstructions,
      toolDefinitions,
      toolInput,
      toolOutput,
    },
    stats: { counts, scan, droppedAttributeKeys, pseudonymizedIdentities },
  }
}

/** Empty identities stay empty: pseudonymizing `""` would invent a user that never existed. */
const replaceIdentity = (value: string, pseudonyms: PseudonymLookup): string => {
  if (value === "") return value

  return pseudonyms.get(value) ?? REDACTED_IDENTITY_PLACEHOLDER
}

export function collectIdentityValues(
  spans: readonly SpanDetail[],
  policyFor: (span: SpanDetail) => RedactionPolicy | undefined,
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
