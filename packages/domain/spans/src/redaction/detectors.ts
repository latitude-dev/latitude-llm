import type { RedactionEntity } from "@domain/shared"

/** Breaks a tie at the same offset before extent does: a DSN password is also a valid email local part. */
const SPECIFIC = 1

interface Detector {
  readonly entity: RedactionEntity
  readonly pattern: RegExp
  readonly validate?: (value: string) => boolean
  readonly rank?: number
  /** Redact this group, not the whole match, for a pattern needing context it must not remove. Needs the `d` flag. */
  readonly group?: number
}

// No nested quantifiers: span content is attacker controlled, so exponential backtracking here is a DoS vector.
// Structural checks that would need nesting live in `validate` instead.

/**
 * Excludes RFC-legal `/`, `=`, `?` and `&`: they precede addresses in URLs, so the match runs left
 * through the whole path. The leading character may be `+` but not `'`, which keeps
 * `+14155552671@example.com` one email match and starts `'user@host.com'` after the quote.
 *
 * The `{0,63}` and `{1,253}` bounds are load-bearing, not documentation: `-` is in both classes, so an
 * unbounded run over a line of dashes backtracks a character at a time from every offset, quadratically.
 */
const EMAIL_LOCAL_PART = String.raw`[\p{L}\p{N}_+-][\p{L}\p{N}._+'-]{0,63}`
const EMAIL_DOMAIN = String.raw`[\p{L}\p{N}.-]{1,253}\.[A-Za-z]{2,24}`
const EMAIL_PATTERN = new RegExp(String.raw`${EMAIL_LOCAL_PART}@${EMAIL_DOMAIN}`, "gu")

/** A reset link carries the address percent-encoded, which is how agent tool output usually holds one. */
const PERCENT_ENCODED_EMAIL_PATTERN = new RegExp(String.raw`${EMAIL_LOCAL_PART}%40${EMAIL_DOMAIN}`, "giu")

/**
 * Asset names satisfy every structural rule an address does. Two-label domains only: `mail@example.com.txt`
 * is a real address followed by an extension.
 *
 * Nothing in here may be a live TLD, or real addresses at it stop being redacted. `md`, `py`, `sh` and `zip`
 * were all in this set and cost Moldova, Paraguay, Saint Helena and every `.zip` domain their coverage.
 */
const FILE_EXTENSION_TLDS: ReadonlySet<string> = new Set([
  "bak",
  "csv",
  "css",
  "gif",
  "gz",
  "html",
  "ini",
  "jpeg",
  "jpg",
  "js",
  "json",
  "jsx",
  "lock",
  "log",
  "pdf",
  "png",
  "sql",
  "svg",
  "tar",
  "toml",
  "ts",
  "tsx",
  "txt",
  "webp",
  "xml",
  "yaml",
  "yml",
])

// Requires a letter in the label before the TLD, which is what rejects the email-shaped `package@1.2.beta`.
const isEmail = (value: string): boolean => {
  const normalized = value.replace(/%40/gi, "@")
  const at = normalized.lastIndexOf("@")
  const local = normalized.slice(0, at)
  const domain = normalized.slice(at + 1)

  if (local === "" || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false
  if (domain.startsWith(".") || domain.startsWith("-") || domain.includes("..")) return false

  const labels = domain.split(".")
  const labelBeforeTld = labels.at(-2)
  if (labelBeforeTld === undefined || !/[A-Za-z]/.test(labelBeforeTld)) return false

  const tld = labels.at(-1)?.toLowerCase()

  return !(labels.length === 2 && tld !== undefined && FILE_EXTENSION_TLDS.has(tld))
}

const E164_PHONE_PATTERN = /(?<![\w+])\+[1-9]\d{7,14}(?!\d)/g

/**
 * One pattern per separator so a match cannot bridge two numbers formatted differently, as with cards.
 * No country calling code starts with zero. Four groups is the minimum that covers `+46 70 123 45 67`
 * whole; fewer leaves its last group in the span.
 */
const INTL_PHONE_SPACED_PATTERN = /(?<![\w+])\+[1-9]\d{0,2}(?: \d{1,5}){1,4}(?!\d)/g
const INTL_PHONE_DASHED_PATTERN = /(?<![\w+])\+[1-9]\d{0,2}(?:-\d{1,5}){1,4}(?!\d)/g
const INTL_PHONE_DOTTED_PATTERN = /(?<![\w+])\+[1-9]\d{0,2}(?:\.\d{1,5}){1,4}(?!\d)/g

/**
 * 20, not E.164's 15, on purpose. The group repetition is greedy, so a number followed by a numeric list
 * overruns its own end; a validator cannot shorten a committed match, so rejecting at 16 would discard the
 * phone number entirely rather than over-redact the digits beside it.
 */
const isSeparatedInternationalPhone = (value: string): boolean => {
  const digits = digitsOf(value).length

  return digits >= 8 && digits <= 20
}

/**
 * Separated forms only: a bare ten-digit run is indistinguishable from the numeric ids in tool output.
 * Area and exchange codes both being `[2-9]\d\d` is what separates this shape from three ordinary
 * numbers. The optional leading `1` is the trunk code, so `1-415-555-2671` matches whole.
 */
const NANP_PHONE_PATTERN =
  /(?<![\w.-])(?:1[-. ])?(?:\([2-9]\d{2}\) ?|[2-9]\d{2}[-. ])[2-9]\d{2}[-. ]\d{4}(?!\d)(?![.-]\d)/g

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
 *
 * The trailing guard rejects a dot only when a digit follows. The shorter `(?![\d.])` looks
 * equivalent and is not: it drops every card written at the end of a sentence, and backtracking
 * cannot recover one because each shorter run of digits is then followed by a digit.
 */
const CREDIT_CARD_COMPACT_PATTERN = /(?<![\d.])\d{13,19}(?!\d)(?!\.\d)/g
/** 4-4-4-N covers 13 to 16 digits: Visa, Mastercard, Discover, JCB. */
const CREDIT_CARD_GROUPED_PATTERN = /(?<![\d.])\d{4}([ \-/])\d{4}\1\d{4}\1\d{1,4}(?!\d)(?!\.\d)/g
/** 4-4-4-4-3 is the 19-digit Visa and Discover form. */
const CREDIT_CARD_GROUPED_19_PATTERN = /(?<![\d.])\d{4}([ \-/])\d{4}\1\d{4}\1\d{4}\1\d{3}(?!\d)(?!\.\d)/g
/** 4-6-5 is Amex, 4-6-4 is Diners Club. Disjoint by trailing length plus the lookahead. */
const CREDIT_CARD_AMEX_GROUPED_PATTERN = /(?<![\d.])\d{4}([ \-/])\d{6}\1\d{5}(?!\d)(?!\.\d)/g
const CREDIT_CARD_DINERS_GROUPED_PATTERN = /(?<![\d.])\d{4}([ \-/])\d{6}\1\d{4}(?!\d)(?!\.\d)/g

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
  // Maestro. Its 12-digit form is shorter than the compact pattern accepts and stays out of reach.
  if (prefix2 === 50 || (prefix2 >= 56 && prefix2 <= 58)) return length >= 13 && length <= 19
  if (prefix4 === 6304 || (prefix4 >= 6759 && prefix4 <= 6763)) return length >= 13 && length <= 19
  if (prefix2 === 62 || prefix2 === 81) return length >= 16 && length <= 19

  return false
}

const isCreditCard = (value: string): boolean => {
  const digits = digitsOf(value)
  if (digits.length < 13 || digits.length > 19) return false

  return hasKnownIssuerPrefix(digits) && passesLuhn(digits)
}

/**
 * One pattern per separator: a permissive one matches greedily past a space and, because the checksum runs
 * after matching, the failed long match discards the real IBAN instead of backtracking. Case-insensitive is
 * only affordable because mod-97 rejects 96 of every 97 candidates.
 */
const IBAN_COMPACT_PATTERN = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}[A-Z0-9]{11,30}(?![A-Za-z0-9])/gi
const IBAN_GROUPED_PATTERN = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?: [A-Z0-9]{4}){2,7}(?: [A-Z0-9]{1,4})?(?![A-Za-z0-9])/gi
/** Printed on invoices in the same grouping as the spaced form. */
const IBAN_DASH_GROUPED_PATTERN =
  /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?:-[A-Z0-9]{4}){2,7}(?:-[A-Z0-9]{1,4})?(?![A-Za-z0-9])/gi

/** ISO 13616 mod-97, computed in chunks so it needs no big-integer arithmetic. */
const isIban = (value: string): boolean => {
  const compact = value.replace(/[ -]/g, "").toUpperCase()
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

// The 3-2-4 shape plus the reserved-range exclusions are what keep the dot separator away from dotted
// quads. The boundary guards reject a digit, or a separator then a digit, so `1234-56-7890` still cannot match.
const US_SSN_PATTERN = /(?<!\d)(?<![.-]\d)(?!000|666)\d{3}[-. ](?!00)\d{2}[-. ](?!0000)\d{4}(?!\d)(?![.-]\d)/g

// No SSN has a 9xx area but every ITIN does, so the group is checked against the IRS-assigned ranges.
const isUsTaxId = (value: string): boolean => {
  const digits = digitsOf(value)
  if (digits[0] !== "9") return true

  const group = Number.parseInt(digits.slice(3, 5), 10)

  return (group >= 70 && group <= 88) || (group >= 90 && group <= 92) || (group >= 94 && group <= 99)
}

const IPV4_PATTERN =
  /(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\w)(?!\.\d)/g
const IPV6_PATTERN = /(?<![\w:.])(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}(?![\w:.])/g
const IPV6_COMPRESSED_PATTERN =
  /(?<![\w:.])(?:[A-Fa-f0-9]{1,4}:){1,6}:(?:[A-Fa-f0-9]{1,4}:){0,5}[A-Fa-f0-9]{1,4}(?![\w:.])/g
/** `::1` and `::ffff:…` compress from the left, so there is no group before the `::` to anchor on. */
const IPV6_LEADING_COMPRESSED_PATTERN = /(?<![\w:.])::(?:[A-Fa-f0-9]{1,4}:){0,6}[A-Fa-f0-9]{1,4}(?![\w:.])/g

// Length and character mix, because `sk-` CSS class names and slugs are common.
const looksLikeLongToken = (value: string): boolean => {
  const tail = value.slice(value.indexOf("-") + 1)
  if (tail.length < 32 || !/\d/.test(tail)) return false

  // A hyphenated all-lowercase tail is a slug: real keys are base62 and mix case, or carry no hyphens.
  return /[A-Z]/.test(tail) || !tail.includes("-")
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

// One alternation rather than a detector each: every detector is another pass over every string leaf.
const VENDOR_TOKEN_PATTERN =
  /\b(?:hf_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{24,}|ya29\.[A-Za-z0-9_-]{20,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})/g

// The path segments are the credential: anyone holding the URL can post to the channel.
const SLACK_WEBHOOK_PATTERN = /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+/g

// Matched on its own so the host and database stay readable. A well-formed URL percent-encodes an `@` in
// its password, which is why the value may not contain one.
const DSN_CREDENTIAL_PATTERN = /(?<=[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@/]{1,64}:)[^\s@/]{3,128}(?=@)/g
const PEM_PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g

/**
 * Two omissions are deliberate and must stay out: a bare `key`, because `idempotency_key`, `cache_key` and
 * `sort_key` fill tool output, and plural `tokens`, because `max_tokens` and `total_tokens` are in nearly
 * every LLM span. The separator is `[ \t]*` rather than `\s*` so a match cannot cross a newline and take
 * the next line of a YAML block as its value.
 */
const CREDENTIAL_KEY =
  /(?:passwords?|passwd|pwd|secret[_-]?access[_-]?key|client[_-]?secret|secrets?|(?:api|private|access|auth|client|encryption|signing)[_-]?keys?|apikey|(?:access|auth|refresh|bearer|id)[_-]?token|token|credentials?)/
const CREDENTIAL_ASSIGNMENT_PATTERN = new RegExp(
  `${CREDENTIAL_KEY.source}["']?[ \\t]*[:=][ \\t]*["']?([^\\s"',;)}\\]([]{6,200})`,
  "gdi",
)
const CREDENTIAL_FLAG_PATTERN = /--(?:token|password|secret|api-?key)[= ]([^\s"']{6,200})/dgi
// Case-insensitive: RFC 7235 auth scheme names are, so `bearer` and `BEARER` are both valid on the wire.
const BEARER_TOKEN_PATTERN = /\b(?:Bearer|Token) ([A-Za-z0-9._~+/=-]{16,})/dgi

// A placeholder or a variable reference. `[` also covers our own output, keeping redaction idempotent.
const CREDENTIAL_PLACEHOLDER =
  /^(?:[$<{%[(*]|null$|undefined$|none$|nil$|true$|false$|\*+$|x+$|changeme$|redacted$|required$)/i
const CODE_IDENTIFIER = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/

const isCredentialValue = (value: string): boolean => {
  if (CREDENTIAL_PLACEHOLDER.test(value)) return false
  // `max_tokens=1048576` clears the length gate, and no credential is a bare number.
  if (/^[\d.,_-]+$/.test(value)) return false

  // `options.apiKey` and `process.env.OPENAI_API_KEY` are references; a real credential is not spellable.
  return !(CODE_IDENTIFIER.test(value) && !/\d/.test(value))
}

export const BUILT_IN_DETECTORS: readonly Detector[] = [
  { entity: "email", pattern: EMAIL_PATTERN, validate: isEmail },
  { entity: "email", pattern: PERCENT_ENCODED_EMAIL_PATTERN, validate: isEmail },
  { entity: "phone", pattern: E164_PHONE_PATTERN },
  { entity: "phone", pattern: INTL_PHONE_SPACED_PATTERN, validate: isSeparatedInternationalPhone },
  { entity: "phone", pattern: INTL_PHONE_DASHED_PATTERN, validate: isSeparatedInternationalPhone },
  { entity: "phone", pattern: INTL_PHONE_DOTTED_PATTERN, validate: isSeparatedInternationalPhone },
  { entity: "phone", pattern: NANP_PHONE_PATTERN },
  { entity: "credit_card", pattern: CREDIT_CARD_COMPACT_PATTERN, validate: isCreditCard },
  { entity: "credit_card", pattern: CREDIT_CARD_GROUPED_PATTERN, validate: isCreditCard },
  { entity: "credit_card", pattern: CREDIT_CARD_GROUPED_19_PATTERN, validate: isCreditCard },
  { entity: "credit_card", pattern: CREDIT_CARD_AMEX_GROUPED_PATTERN, validate: isCreditCard },
  { entity: "credit_card", pattern: CREDIT_CARD_DINERS_GROUPED_PATTERN, validate: isCreditCard },
  { entity: "iban", pattern: IBAN_COMPACT_PATTERN, validate: isIban },
  { entity: "iban", pattern: IBAN_GROUPED_PATTERN, validate: isIban },
  { entity: "iban", pattern: IBAN_DASH_GROUPED_PATTERN, validate: isIban },
  { entity: "us_ssn", pattern: US_SSN_PATTERN, validate: isUsTaxId },
  { entity: "ip_address", pattern: IPV4_PATTERN },
  { entity: "ip_address", pattern: IPV6_PATTERN },
  { entity: "ip_address", pattern: IPV6_COMPRESSED_PATTERN },
  { entity: "ip_address", pattern: IPV6_LEADING_COMPRESSED_PATTERN },
  { entity: "secret", pattern: OPENAI_KEY_PATTERN, validate: looksLikeLongToken },
  // Ranked: a token in a `https://token@github.com` remote is also a valid email local part.
  { entity: "secret", pattern: GITHUB_TOKEN_PATTERN, validate: hasDigit, rank: SPECIFIC },
  { entity: "secret", pattern: GITHUB_PAT_PATTERN, validate: hasDigit },
  { entity: "secret", pattern: AWS_ACCESS_KEY_PATTERN },
  { entity: "secret", pattern: SLACK_TOKEN_PATTERN, validate: hasDigit },
  { entity: "secret", pattern: GOOGLE_API_KEY_PATTERN },
  { entity: "secret", pattern: STRIPE_KEY_PATTERN, validate: hasDigit },
  { entity: "secret", pattern: JWT_PATTERN },
  { entity: "secret", pattern: VENDOR_TOKEN_PATTERN, validate: hasDigit },
  { entity: "secret", pattern: SLACK_WEBHOOK_PATTERN },
  { entity: "secret", pattern: DSN_CREDENTIAL_PATTERN, rank: SPECIFIC },
  { entity: "secret", pattern: PEM_PRIVATE_KEY_PATTERN },
  { entity: "secret", pattern: CREDENTIAL_ASSIGNMENT_PATTERN, validate: isCredentialValue, group: 1 },
  { entity: "secret", pattern: CREDENTIAL_FLAG_PATTERN, validate: isCredentialValue, group: 1 },
  { entity: "secret", pattern: BEARER_TOKEN_PATTERN, validate: isCredentialValue, group: 1 },
]
