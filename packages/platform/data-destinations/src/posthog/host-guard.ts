import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export type HostLookup = (hostname: string) => Promise<readonly string[]>

export const defaultHostLookup: HostLookup = async (hostname) => {
  const addresses = await lookup(hostname, { all: true })
  return addresses.map((entry) => entry.address)
}

const isPublicUnicastIpv4 = (ip: string): boolean => {
  const [a = -1, b = -1, c = -1] = ip.split(".").map(Number)
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a >= 224) return false
  return true
}

const V4_MAPPED_IPV6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i

const isPublicUnicastIpv6 = (ip: string): boolean => {
  const mapped = V4_MAPPED_IPV6.exec(ip)
  if (mapped?.[1]) return isPublicUnicastIpv4(mapped[1])
  const [firstGroup = "", secondGroup = "0"] = ip.split(":")
  const first = Number.parseInt(firstGroup === "" ? "0" : firstGroup, 16)
  const second = Number.parseInt(secondGroup === "" ? "0" : secondGroup, 16)
  if (Number.isNaN(first) || Number.isNaN(second)) return false
  // Only IPv6 global unicast (2000::/3) is public; 2001:db8::/32 is documentation space.
  if (first < 0x2000 || first > 0x3fff) return false
  if (first === 0x2001 && second === 0xdb8) return false
  return true
}

export const isPublicUnicastIp = (ip: string): boolean => {
  const version = isIP(ip)
  if (version === 4) return isPublicUnicastIpv4(ip)
  if (version === 6) return isPublicUnicastIpv6(ip)
  return false
}
