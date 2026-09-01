import { describe, expect, it } from "vitest"
import { ipMatchesAllowlist, isValidAllowlistEntry, parseAllowlistEntry } from "./ip-allowlist.ts"

describe("ipMatchesAllowlist", () => {
  it("treats an empty list as unrestricted", () => {
    expect(ipMatchesAllowlist("203.0.113.7", [])).toBe(true)
    expect(ipMatchesAllowlist(undefined, [])).toBe(true)
    expect(ipMatchesAllowlist("nonsense", [])).toBe(true)
  })

  it("matches a single IPv4 address exactly", () => {
    expect(ipMatchesAllowlist("203.0.113.7", ["203.0.113.7"])).toBe(true)
    expect(ipMatchesAllowlist("203.0.113.8", ["203.0.113.7"])).toBe(false)
  })

  it("matches inside an IPv4 CIDR block and rejects just outside it", () => {
    expect(ipMatchesAllowlist("203.0.113.0", ["203.0.113.0/24"])).toBe(true)
    expect(ipMatchesAllowlist("203.0.113.255", ["203.0.113.0/24"])).toBe(true)
    expect(ipMatchesAllowlist("203.0.114.0", ["203.0.113.0/24"])).toBe(false)
    expect(ipMatchesAllowlist("203.0.112.255", ["203.0.113.0/24"])).toBe(false)
  })

  it("handles the boundary prefixes", () => {
    expect(ipMatchesAllowlist("1.2.3.4", ["0.0.0.0/0"])).toBe(true)
    expect(ipMatchesAllowlist("255.255.255.255", ["0.0.0.0/0"])).toBe(true)
    expect(ipMatchesAllowlist("1.2.3.4", ["1.2.3.4/32"])).toBe(true)
    expect(ipMatchesAllowlist("1.2.3.5", ["1.2.3.4/32"])).toBe(false)
  })

  it("ignores host bits set inside a CIDR entry", () => {
    // 203.0.113.7/24 means the 203.0.113.0/24 network, as every CIDR tool treats it.
    expect(ipMatchesAllowlist("203.0.113.99", ["203.0.113.7/24"])).toBe(true)
  })

  it("matches any entry in the list", () => {
    const entries = ["198.51.100.4", "203.0.113.0/24", "2001:db8::/32"]
    expect(ipMatchesAllowlist("198.51.100.4", entries)).toBe(true)
    expect(ipMatchesAllowlist("203.0.113.55", entries)).toBe(true)
    expect(ipMatchesAllowlist("2001:db8:1234::1", entries)).toBe(true)
    expect(ipMatchesAllowlist("192.0.2.1", entries)).toBe(false)
  })

  it("matches IPv6 addresses and blocks", () => {
    expect(ipMatchesAllowlist("2001:db8::1", ["2001:db8::1"])).toBe(true)
    expect(ipMatchesAllowlist("2001:db8::2", ["2001:db8::1"])).toBe(false)
    expect(ipMatchesAllowlist("2001:db8:0:0:0:0:0:1", ["2001:db8::1"])).toBe(true)
    expect(ipMatchesAllowlist("2001:db8:abcd::9", ["2001:db8::/32"])).toBe(true)
    expect(ipMatchesAllowlist("2001:db9::9", ["2001:db8::/32"])).toBe(false)
    expect(ipMatchesAllowlist("::1", ["::1/128"])).toBe(true)
  })

  it("folds IPv4-mapped IPv6 callers onto IPv4 rules", () => {
    expect(ipMatchesAllowlist("::ffff:203.0.113.7", ["203.0.113.7"])).toBe(true)
    expect(ipMatchesAllowlist("::ffff:203.0.113.7", ["203.0.113.0/24"])).toBe(true)
    expect(ipMatchesAllowlist("::ffff:cb00:7107", ["203.0.113.7"])).toBe(true)
    expect(ipMatchesAllowlist("::ffff:203.0.114.7", ["203.0.113.0/24"])).toBe(false)
    // ...and the mirror image: a mapped rule covering a plain IPv4 caller.
    expect(ipMatchesAllowlist("203.0.113.7", ["::ffff:203.0.113.7"])).toBe(true)
    expect(ipMatchesAllowlist("203.0.113.7", ["::ffff:203.0.113.0/120"])).toBe(true)
  })

  it("keeps IPv4 and IPv6 rules from matching each other otherwise", () => {
    expect(ipMatchesAllowlist("2001:db8::1", ["0.0.0.0/0"])).toBe(false)
    expect(ipMatchesAllowlist("1.2.3.4", ["::/0"])).toBe(false)
  })

  it("refuses a caller with no or an unparseable IP when the list is non-empty", () => {
    expect(ipMatchesAllowlist(undefined, ["203.0.113.7"])).toBe(false)
    expect(ipMatchesAllowlist("", ["203.0.113.7"])).toBe(false)
    expect(ipMatchesAllowlist("not-an-ip", ["203.0.113.7"])).toBe(false)
    expect(ipMatchesAllowlist("203.0.113.7, 10.0.0.1", ["203.0.113.7"])).toBe(false)
  })

  it("ignores malformed entries instead of letting them match everything", () => {
    expect(ipMatchesAllowlist("203.0.113.7", ["not-an-ip"])).toBe(false)
    expect(ipMatchesAllowlist("203.0.113.7", ["203.0.113.7/99"])).toBe(false)
    expect(ipMatchesAllowlist("203.0.113.7", ["garbage", "203.0.113.7"])).toBe(true)
  })

  it("tolerates surrounding whitespace on both sides", () => {
    expect(ipMatchesAllowlist(" 203.0.113.7 ", [" 203.0.113.0/24 "])).toBe(true)
  })

  it("ignores an IPv6 zone index on the caller", () => {
    expect(ipMatchesAllowlist("fe80::1%eth0", ["fe80::/10"])).toBe(true)
  })
})

describe("parseAllowlistEntry", () => {
  it("accepts plain addresses and CIDR blocks", () => {
    expect(isValidAllowlistEntry("203.0.113.7")).toBe(true)
    expect(isValidAllowlistEntry("203.0.113.0/24")).toBe(true)
    expect(isValidAllowlistEntry("2001:db8::1")).toBe(true)
    expect(isValidAllowlistEntry("2001:db8::/32")).toBe(true)
    expect(isValidAllowlistEntry("::1")).toBe(true)
    expect(isValidAllowlistEntry("::")).toBe(true)
    expect(isValidAllowlistEntry("::ffff:1.2.3.4")).toBe(true)
  })

  it("rejects malformed input", () => {
    for (const entry of [
      "",
      "   ",
      "not-an-ip",
      "203.0.113",
      "203.0.113.7.8",
      "256.0.0.1",
      "203.0.113.07",
      "203.0.113.7/",
      "203.0.113.7/33",
      "203.0.113.7/24/8",
      "203.0.113.7/-1",
      "2001:db8::1/129",
      "2001:db8:::1",
      "2001:db8::gggg",
      "12345::1",
    ]) {
      expect(isValidAllowlistEntry(entry), entry).toBe(false)
    }
  })

  it("normalizes a block to its network address", () => {
    expect(parseAllowlistEntry("203.0.113.200/24")?.network).toBe(parseAllowlistEntry("203.0.113.0/24")?.network)
  })
})
