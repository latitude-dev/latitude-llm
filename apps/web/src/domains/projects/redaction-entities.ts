import { REDACTION_ENTITIES, type RedactionEntity } from "@domain/shared"

interface RedactionEntityMeta {
  readonly label: string
  readonly description: string
  /** Rendered as a warning next to the checkbox; set only where false positives are likely. */
  readonly caution?: string
}

export const REDACTION_ENTITY_META: Record<RedactionEntity, RedactionEntityMeta> = {
  email: {
    label: "Email addresses",
    description: "Addresses with a domain and a two-or-more character suffix, such as ada@example.com.",
  },
  phone: {
    label: "Phone numbers",
    description: "International +NNNNNNNNN numbers and separated North American forms such as (555) 123-4567.",
    caution: "Numeric ids such as 402-118-2260 may be falsely redacted as phone numbers.",
  },
  credit_card: {
    label: "Credit card numbers",
    description: "13 to 19 digit numbers that pass a checksum and start with a known issuer prefix.",
  },
  iban: {
    label: "IBANs",
    description: "International bank account numbers that pass the mod-97 checksum.",
  },
  us_ssn: {
    label: "US Social Security numbers",
    description: "Separated NNN-NN-NNNN numbers in a valid range. Bare nine-digit runs are never matched.",
  },
  ip_address: {
    label: "IP addresses",
    description: "IPv4 and IPv6 addresses.",
    caution: "Version numbers such as 1.2.3.4 may be falsely redacted as IP addresses.",
  },
  secret: {
    label: "API keys and secrets",
    description: "Recognisable key formats from common providers, plus private key blocks.",
  },
  crypto_wallet: {
    label: "Crypto wallet addresses",
    description: "Bitcoin and Ethereum address formats.",
    caution: "Long alphanumeric ids may be falsely redacted as wallet addresses.",
  },
}

/** Stable display order: defaults first, then the opt-in detectors. */
export const REDACTION_ENTITY_ORDER: readonly RedactionEntity[] = REDACTION_ENTITIES

export const encodeEntities = (entities: Iterable<RedactionEntity>): string => [...new Set(entities)].sort().join(",")

export const decodeEntities = (encoded: string): RedactionEntity[] =>
  encoded === "" ? [] : (encoded.split(",") as RedactionEntity[])
