import { describe, expect, it } from "vitest"
import { isPublicUnicastIp } from "./host-guard.ts"

describe("isPublicUnicastIp", () => {
  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "1.1.1.1",
    "100.63.0.1",
    "100.128.0.1",
    "172.32.0.1",
    "2606:4700:4700::1111",
    "2a00:1450:4003:80a::200e",
    "::ffff:8.8.8.8",
  ])("accepts public address %s", (ip) => {
    expect(isPublicUnicastIp(ip)).toBe(true)
  })

  it.each([
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:10.0.0.1",
    "::ffff:192.168.1.1",
    "not-an-ip",
    "example.com",
  ])("rejects non-public or invalid address %s", (ip) => {
    expect(isPublicUnicastIp(ip)).toBe(false)
  })
})
