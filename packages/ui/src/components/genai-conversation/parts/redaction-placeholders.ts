/** Open by design: the SDKs emit this grammar too, and no per-span flag records who redacted what. */
export const REDACTION_PLACEHOLDER_PATTERN = /\[REDACTED_([A-Z][A-Z0-9_]*)\]/g

/**
 * Articles are written out rather than derived: "IP" and "SSN" read with "an" despite
 * starting with a consonant letter, so spelling is the wrong thing to branch on.
 * Bare `[REDACTED]` carries no label and is left as plain text.
 */
const REDACTED_VALUE_SUBJECTS: Record<string, string> = {
  EMAIL: "An email address",
  PHONE: "A phone number",
  CREDIT_CARD: "A credit card number",
  IBAN: "A bank account number",
  US_SSN: "A US Social Security number",
  IP_ADDRESS: "An IP address",
  SECRET: "An API key or secret",
}

const OVERSIZED_FIELD_EXPLANATION =
  "This field was too large to scan, so it was removed whole rather than stored unchecked. Nothing in it was identified as personal data."

const USER_EXPLANATION =
  "The user identifier was replaced before this span was stored. Where identifiers are pseudonymized rather than removed, the replacement is stable, so grouping by user still works."

/** What the chip shows: the label, underscores opened up so it reads as words. */
export const redactionChipLabel = (label: string): string => label.replace(/_/g, " ")

export const redactionChipExplanation = (label: string): string => {
  if (label === "OVERSIZED_FIELD") return OVERSIZED_FIELD_EXPLANATION
  if (label === "USER") return USER_EXPLANATION

  const subject = REDACTED_VALUE_SUBJECTS[label] ?? "A value"
  return `${subject} was removed by PII redaction before this span was stored. Redacted content cannot be recovered.`
}
