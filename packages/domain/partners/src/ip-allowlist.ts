/**
 * Exact IP / CIDR matching for partner allowlists.
 *
 * Hand-rolled rather than pulled from a library: this is the one place in the
 * repo that needs precise CIDR semantics (`geoip.ts` deliberately uses a
 * leading-octet heuristic instead), and an allowlist is a security control
 * where a new runtime dependency would need its own license audit.
 *
 * Addresses are compared as bigints over their bits, so IPv4 and IPv6 share one
 * code path.
 */

const IPV4_BITS = 32
const IPV6_BITS = 128
/** IPv4-mapped IPv6 addresses are `::ffff:a.b.c.d` — the low 32 bits are the IPv4 address. */
const IPV4_MAPPED_PREFIX_BITS = 96

interface Cidr {
  readonly bits: number
  readonly network: bigint
  readonly prefixLength: number
}

const parseIpv4 = (value: string): bigint | null => {
  const parts = value.split(".")
  if (parts.length !== 4) return null

  let result = 0n
  for (const part of parts) {
    // Reject "01", "+1", " 1" and everything else Number() would happily accept.
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith("0"))) return null
    const octet = Number(part)
    if (octet > 255) return null
    result = (result << 8n) | BigInt(octet)
  }
  return result
}

const parseIpv6 = (value: string): bigint | null => {
  const zoneStripped = value.split("%")[0] ?? ""
  const halves = zoneStripped.split("::")
  if (halves.length > 2) return null

  const toGroups = (segment: string | undefined): string[] | null => {
    if (!segment) return []
    const groups: string[] = []
    for (const group of segment.split(":")) {
      if (group === "") return null
      // A trailing dotted quad ("::ffff:1.2.3.4") expands to the two groups it encodes.
      if (group.includes(".")) {
        const embedded = parseIpv4(group)
        if (embedded === null) return null
        groups.push((embedded >> 16n).toString(16), (embedded & 0xffffn).toString(16))
        continue
      }
      if (!/^[0-9a-f]{1,4}$/i.test(group)) return null
      groups.push(group)
    }
    return groups
  }

  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : null
  if (!head || (halves.length === 2 && !tail)) return null

  const groups =
    halves.length === 2 && tail
      ? // `::` must stand for at least one zero group, so the halves can total 7 at most.
        head.length + tail.length > 7
        ? null
        : [...head, ...Array<string>(8 - head.length - tail.length).fill("0"), ...tail]
      : head

  if (!groups || groups.length !== 8) return null

  let result = 0n
  for (const group of groups) {
    result = (result << 16n) | BigInt(Number.parseInt(group, 16))
  }
  return result
}

const parseAddress = (value: string): Cidr | null => {
  const trimmed = value.trim()
  if (trimmed === "") return null

  if (trimmed.includes(":")) {
    const value6 = parseIpv6(trimmed)
    return value6 === null ? null : { bits: IPV6_BITS, network: value6, prefixLength: IPV6_BITS }
  }
  const value4 = parseIpv4(trimmed)
  return value4 === null ? null : { bits: IPV4_BITS, network: value4, prefixLength: IPV4_BITS }
}

/**
 * Folds an IPv4-mapped IPv6 range down to its IPv4 equivalent so that a load
 * balancer reporting `::ffff:1.2.3.4` still matches a plain `1.2.3.4` rule.
 * Ranges wider than the mapped block (prefix < /96) are left alone — they cover
 * real IPv6 space too.
 */
const normalize = (cidr: Cidr): Cidr => {
  if (cidr.bits !== IPV6_BITS || cidr.prefixLength < IPV4_MAPPED_PREFIX_BITS) return cidr
  if (cidr.network >> 32n !== 0xffffn) return cidr
  return {
    bits: IPV4_BITS,
    network: cidr.network & 0xffffffffn,
    prefixLength: cidr.prefixLength - IPV4_MAPPED_PREFIX_BITS,
  }
}

const maskToPrefix = (cidr: Cidr): Cidr => {
  const hostBits = BigInt(cidr.bits - cidr.prefixLength)
  return { ...cidr, network: (cidr.network >> hostBits) << hostBits }
}

/** Parses a single IP or an `address/prefixLength` block. Returns `null` for anything malformed. */
export const parseAllowlistEntry = (entry: string): Cidr | null => {
  const trimmed = entry.trim()
  if (trimmed === "") return null

  const [addressPart, prefixPart, ...rest] = trimmed.split("/")
  if (rest.length > 0 || addressPart === undefined) return null

  const address = parseAddress(addressPart)
  if (!address) return null
  if (prefixPart === undefined) return address

  if (!/^\d{1,3}$/.test(prefixPart)) return null
  const prefixLength = Number(prefixPart)
  if (prefixLength > address.bits) return null

  return maskToPrefix({ ...address, prefixLength })
}

export const isValidAllowlistEntry = (entry: string): boolean => parseAllowlistEntry(entry) !== null

/**
 * Whether `ip` falls inside any allowlist entry.
 *
 * An **empty list means unrestricted** — that is what keeps the allowlist
 * opt-in per partner. A missing or unparseable `ip` never matches a non-empty
 * list, so a caller the load balancer could not identify is refused rather than
 * waved through.
 */
export const ipMatchesAllowlist = (ip: string | undefined, entries: readonly string[]): boolean => {
  if (entries.length === 0) return true
  if (!ip) return false

  const parsed = parseAddress(ip)
  if (!parsed) return false
  const address = normalize(parsed)

  return entries.some((entry) => {
    const rule = parseAllowlistEntry(entry)
    if (!rule) return false

    const normalized = normalize(rule)
    if (normalized.bits !== address.bits) return false

    const hostBits = BigInt(normalized.bits - normalized.prefixLength)
    return address.network >> hostBits === normalized.network >> hostBits
  })
}
