import type { RedactionEntity } from "@domain/shared"

const REDACTION_ENTITY_LABELS: Record<RedactionEntity, string> = {
  email: "EMAIL",
  phone: "PHONE",
  credit_card: "CREDIT_CARD",
  iban: "IBAN",
  us_ssn: "US_SSN",
  ip_address: "IP_ADDRESS",
  secret: "SECRET",
  crypto_wallet: "CRYPTO_WALLET",
}

/** Placeholders are visible in the UI on purpose: users must be able to see why content is missing. */
export const redactionPlaceholder = (entity: RedactionEntity): string => `[REDACTED_${REDACTION_ENTITY_LABELS[entity]}]`

export const OVERSIZED_FIELD_PLACEHOLDER = "[REDACTED_OVERSIZED_FIELD]"

export const REDACTED_IDENTITY_PLACEHOLDER = "[REDACTED_USER]"

/**
 * Fields above this are replaced wholesale rather than scanned. Passing them
 * through unscanned would break the redaction promise and scanning only a prefix
 * would leak the tail, so the only option consistent with "degrade toward more
 * redaction" is to drop the field. The realistic trigger is multi-megabyte file
 * content in coding-agent tool output.
 */
export const REDACTION_MAX_FIELD_BYTES = 1_000_000

export const REDACTION_BATCH_TIMEOUT_MS = 30_000

/**
 * Keys whose values are structural and never worth scanning. This list is an
 * optimization, not a safety mechanism: every detector is high-precision, so
 * scanning a structural value costs CPU but cannot corrupt it. Do not grow this
 * list defensively — if a value needs protecting from a detector, the detector is
 * the bug.
 */
export const REDACTION_SKIP_KEYS: ReadonlySet<string> = new Set([
  "id",
  "type",
  "index",
  "messageIndex",
  "message_index",
  "mimeType",
  "mime_type",
  "tool_call_id",
  "toolCallId",
  "tool_use_id",
  "toolUseId",
  "isError",
  "is_error",
  "isRefusal",
  "is_refusal",
  "originalType",
  "original_type",
])
