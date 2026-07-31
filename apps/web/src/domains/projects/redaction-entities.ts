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
    description:
      "International numbers with or without separators, such as +44 20 7183 8750, and separated North American forms such as (555) 123-4567.",
    caution: "Three numbers in a row, such as the latencies 250 300 1000, may be falsely redacted as phone numbers.",
  },
  credit_card: {
    label: "Credit card numbers",
    description: "13 to 19 digit numbers that pass a checksum and start with a known issuer prefix.",
    caution:
      "About one in ten 16-digit numeric ids beginning with 4, and one in twenty beginning with 5, pass the checksum and may be falsely redacted.",
  },
  iban: {
    label: "IBANs",
    description: "International bank account numbers that pass the mod-97 checksum.",
  },
  us_ssn: {
    label: "US Social Security numbers",
    description: "Separated NNN-NN-NNNN numbers in a valid range, and ITINs. Bare nine-digit runs are never matched.",
  },
  ip_address: {
    label: "IP addresses",
    description: "IPv4 and IPv6 addresses.",
    caution: "Version numbers such as 1.2.3.4 may be falsely redacted as IP addresses.",
  },
  secret: {
    label: "API keys and secrets",
    description:
      "Recognizable key formats from common providers, private key blocks, connection-string passwords, and values assigned to a credential-shaped key such as DATABASE_PASSWORD.",
  },
  crypto_wallet: {
    label: "Crypto wallet addresses",
    description:
      "Legacy Bitcoin addresses that pass the address checksum, plus bech32 and Ethereum addresses matched on shape.",
    caution: "A 40-character hex string is both an Ethereum address and a commit hash, and may be falsely redacted.",
  },
}

/** Stable display order: defaults first, then the opt-in detectors. */
export const REDACTION_ENTITY_ORDER: readonly RedactionEntity[] = REDACTION_ENTITIES

export const encodeEntities = (entities: Iterable<RedactionEntity>): string => [...new Set(entities)].sort().join(",")

export const decodeEntities = (encoded: string): RedactionEntity[] =>
  encoded === "" ? [] : (encoded.split(",") as RedactionEntity[])
