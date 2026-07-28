import type { RedactionEntity } from "@domain/shared"

export interface RedactionMatch {
  readonly start: number
  readonly end: number
  readonly entity: RedactionEntity
}

interface Detector {
  readonly entity: RedactionEntity
  readonly pattern: RegExp
  readonly validate?: (value: string) => boolean
}

// No nested quantifiers: span content is attacker controlled, so exponential backtracking here is a DoS vector.
// Structural checks that would need nesting live in `validate` instead.

// The local part excludes RFC-legal `/`, `=`, `?` and `&`: they precede addresses in URLs, so allowing them
// runs the match left through the whole path.
const EMAIL_PATTERN = /[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g

// Requires a letter in the label before the TLD, which is what rejects the email-shaped `package@1.2.beta`.
const isEmail = (value: string): boolean => {
  const at = value.lastIndexOf("@")
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)

  if (local === "" || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false
  if (domain.startsWith(".") || domain.startsWith("-") || domain.includes("..")) return false

  const labels = domain.split(".")
  const labelBeforeTld = labels.at(-2)

  return labelBeforeTld !== undefined && /[A-Za-z]/.test(labelBeforeTld)
}

const E164_PHONE_PATTERN = /(?<![\w+])\+[1-9]\d{7,14}(?!\d)/g

// Separated NANP forms only: a bare ten-digit run is indistinguishable from the numeric ids in tool output.
const NANP_PHONE_PATTERN = /(?<![\w.-])(?:\(\d{3}\) ?|\d{3}[-. ])\d{3}[-. ]\d{4}(?![\d.-])/g

/**
 * Compact and grouped forms are separate patterns, and each grouped one backreferences
 * its separator, for the same reason the IBAN detector does: a single pattern allowing
 * an optional separator between any two digits bridges two adjacent numbers, consumes
 * both greedily, fails the checksum, and never reconsiders the real card inside. A
 * sixteen-digit card followed by a three-digit number was lost that way: the bridged
 * nineteen-digit run is a length Visa issues, so it matched and then failed Luhn.
 *
 * The grouped shapes are enumerated rather than expressed as "groups of 4 to 6" because
 * an open-ended repetition reintroduces the same bridging: it would swallow a trailing
 * group, overrun 19 digits, and fail the length gate with the card inside it.
 */
const CREDIT_CARD_COMPACT_PATTERN = /(?<![\d.])\d{13,19}(?![\d.])/g
/** 4-4-4-N covers 13 to 16 digits: Visa, Mastercard, Discover, JCB. */
const CREDIT_CARD_GROUPED_PATTERN = /(?<![\d.])\d{4}([ -])\d{4}\1\d{4}\1\d{1,4}(?![\d.])/g
/** 4-4-4-4-3 is the 19-digit Visa and Discover form. */
const CREDIT_CARD_GROUPED_19_PATTERN = /(?<![\d.])\d{4}([ -])\d{4}\1\d{4}\1\d{4}\1\d{3}(?![\d.])/g
/** 4-6-5 is Amex, 4-6-4 is Diners Club. Disjoint by trailing length plus the lookahead. */
const CREDIT_CARD_AMEX_GROUPED_PATTERN = /(?<![\d.])\d{4}([ -])\d{6}\1\d{5}(?![\d.])/g
const CREDIT_CARD_DINERS_GROUPED_PATTERN = /(?<![\d.])\d{4}([ -])\d{6}\1\d{4}(?![\d.])/g

const digitsOf = (value: string): string => value.replace(/[^\d]/g, "")

const passesLuhn = (digits: string): boolean => {
  let sum = 0
  let double = false

  for (let index = digits.length - 1; index >= 0; index--) {
    let digit = digits.charCodeAt(index) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }

  return sum % 10 === 0
}

// Luhn alone accepts about one in ten random digit runs of card length, so a real issuer prefix is also required.
const hasKnownIssuerPrefix = (digits: string): boolean => {
  const length = digits.length
  const prefix2 = Number.parseInt(digits.slice(0, 2), 10)
  const prefix3 = Number.parseInt(digits.slice(0, 3), 10)
  const prefix4 = Number.parseInt(digits.slice(0, 4), 10)

  if (digits.startsWith("4")) return length === 13 || length === 16 || length === 19
  if (prefix2 >= 51 && prefix2 <= 55) return length === 16
  if (prefix4 >= 2221 && prefix4 <= 2720) return length === 16
  if (prefix2 === 34 || prefix2 === 37) return length === 15
  if (prefix4 === 6011 || prefix2 === 65 || (prefix3 >= 644 && prefix3 <= 649)) return length === 16 || length === 19
  if (prefix4 >= 3528 && prefix4 <= 3589) return length >= 16 && length <= 19
  if (prefix2 === 36 || prefix2 === 38 || prefix2 === 39 || (prefix3 >= 300 && prefix3 <= 305)) {
    return length >= 14 && length <= 19
  }

  return false
}

const isCreditCard = (value: string): boolean => {
  const digits = digitsOf(value)
  if (digits.length < 13 || digits.length > 19) return false

  return hasKnownIssuerPrefix(digits) && passesLuhn(digits)
}

// Two patterns, not one with optional spaces: a permissive pattern matches greedily past a space and, because
// the checksum runs after matching, the failed long match discards the real IBAN instead of backtracking.
const IBAN_COMPACT_PATTERN = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}[A-Z0-9]{11,30}(?![A-Za-z0-9])/g
const IBAN_GROUPED_PATTERN = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?: [A-Z0-9]{4}){2,7}(?: [A-Z0-9]{1,4})?(?![A-Za-z0-9])/g

/** ISO 13616 mod-97, computed in chunks so it needs no big-integer arithmetic. */
const isIban = (value: string): boolean => {
  const compact = value.replace(/ /g, "")
  if (compact.length < 15 || compact.length > 34) return false

  const rearranged = compact.slice(4) + compact.slice(0, 4)
  let remainder = 0

  for (const character of rearranged) {
    const code = character.charCodeAt(0)
    const mapped = code >= 65 && code <= 90 ? String(code - 55) : character
    for (const digit of mapped) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97
    }
  }

  return remainder === 1
}

const US_SSN_PATTERN = /(?<![\d-])(?!000|666|9\d\d)\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}(?![\d-])/g

const IPV4_PATTERN =
  /(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\w.])/g
const IPV6_PATTERN = /(?<![\w:.])(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}(?![\w:.])/g
const IPV6_COMPRESSED_PATTERN =
  /(?<![\w:.])(?:[A-Fa-f0-9]{1,4}:){1,6}:(?:[A-Fa-f0-9]{1,4}:){0,5}[A-Fa-f0-9]{1,4}(?![\w:.])/g

// Variable-length token forms also require credential length and character mix, because `sk-` CSS class names are common.
const looksLikeLongToken = (value: string): boolean => {
  const tail = value.slice(value.indexOf("-") + 1)

  return tail.length >= 32 && /\d/.test(tail)
}

const hasDigit = (value: string): boolean => /\d/.test(value)

const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{20,}/g
const GITHUB_TOKEN_PATTERN = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g
const GITHUB_PAT_PATTERN = /\bgithub_pat_[A-Za-z0-9_]{22,}/g
const AWS_ACCESS_KEY_PATTERN = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g
const SLACK_TOKEN_PATTERN = /\bxox[abposr]-[A-Za-z0-9-]{10,}/g
const GOOGLE_API_KEY_PATTERN = /\bAIza[0-9A-Za-z_-]{35}\b/g
const STRIPE_KEY_PATTERN = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g
const PEM_PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g

const BITCOIN_BECH32_PATTERN = /\bbc1[a-z0-9]{25,62}\b/g
const BITCOIN_BASE58_PATTERN = /(?<![A-Za-z0-9])[13][a-km-zA-HJ-NP-Z1-9]{25,34}(?![A-Za-z0-9])/g
const ETHEREUM_PATTERN = /\b0x[a-fA-F0-9]{40}\b/g

const DETECTORS: readonly Detector[] = [
  { entity: "email", pattern: EMAIL_PATTERN, validate: isEmail },
  { entity: "phone", pattern: E164_PHONE_PATTERN },
  { entity: "phone", pattern: NANP_PHONE_PATTERN },
  { entity: "credit_card", pattern: CREDIT_CARD_COMPACT_PATTERN, validate: isCreditCard },
  { entity: "credit_card", pattern: CREDIT_CARD_GROUPED_PATTERN, validate: isCreditCard },
  { entity: "credit_card", pattern: CREDIT_CARD_GROUPED_19_PATTERN, validate: isCreditCard },
  { entity: "credit_card", pattern: CREDIT_CARD_AMEX_GROUPED_PATTERN, validate: isCreditCard },
  { entity: "credit_card", pattern: CREDIT_CARD_DINERS_GROUPED_PATTERN, validate: isCreditCard },
  { entity: "iban", pattern: IBAN_COMPACT_PATTERN, validate: isIban },
  { entity: "iban", pattern: IBAN_GROUPED_PATTERN, validate: isIban },
  { entity: "us_ssn", pattern: US_SSN_PATTERN },
  { entity: "ip_address", pattern: IPV4_PATTERN },
  { entity: "ip_address", pattern: IPV6_PATTERN },
  { entity: "ip_address", pattern: IPV6_COMPRESSED_PATTERN },
  { entity: "secret", pattern: OPENAI_KEY_PATTERN, validate: looksLikeLongToken },
  { entity: "secret", pattern: GITHUB_TOKEN_PATTERN, validate: hasDigit },
  { entity: "secret", pattern: GITHUB_PAT_PATTERN, validate: hasDigit },
  { entity: "secret", pattern: AWS_ACCESS_KEY_PATTERN },
  { entity: "secret", pattern: SLACK_TOKEN_PATTERN, validate: hasDigit },
  { entity: "secret", pattern: GOOGLE_API_KEY_PATTERN },
  { entity: "secret", pattern: STRIPE_KEY_PATTERN, validate: hasDigit },
  { entity: "secret", pattern: JWT_PATTERN },
  { entity: "secret", pattern: PEM_PRIVATE_KEY_PATTERN },
  { entity: "crypto_wallet", pattern: BITCOIN_BECH32_PATTERN },
  { entity: "crypto_wallet", pattern: BITCOIN_BASE58_PATTERN },
  { entity: "crypto_wallet", pattern: ETHEREUM_PATTERN },
]

/** Unsorted and possibly overlapping; the caller resolves overlaps so counting and replacement share one accepted set. */
export function findRedactionMatches(text: string, entities: ReadonlySet<RedactionEntity>): RedactionMatch[] {
  const matches: RedactionMatch[] = []

  for (const detector of DETECTORS) {
    if (!entities.has(detector.entity)) continue

    for (const match of text.matchAll(detector.pattern)) {
      const value = match[0]
      if (match.index === undefined || value === "") continue
      if (detector.validate && !detector.validate(value)) continue

      matches.push({ start: match.index, end: match.index + value.length, entity: detector.entity })
    }
  }

  return matches
}
