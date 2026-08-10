import { describe, expect, it } from "vitest"
import { isPublicUnicastIp, resolvePublicWebhookUrl } from "./host-guard.ts"

describe("isPublicUnicastIp", () => {
  it.each(["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"])("accepts public address %s", (ip) => {
    expect(isPublicUnicastIp(ip)).toBe(true)
  })

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "169.254.0.1",
    "::1",
  ])("rejects private or local address %s", (ip) => {
    expect(isPublicUnicastIp(ip)).toBe(false)
  })
})

describe("resolvePublicWebhookUrl", () => {
  it("rejects non-https webhook URLs", async () => {
    await expect(resolvePublicWebhookUrl("http://hooks.example.com/run")).rejects.toThrow("webhook_url_not_https")
  })

  it("rejects hosts that resolve to private IPs", async () => {
    await expect(resolvePublicWebhookUrl("https://hooks.example.com/run", async () => ["127.0.0.1"])).rejects.toThrow(
      "webhook_host_resolved_to_non_public_ip",
    )
  })

  it("rejects malformed webhook URLs", async () => {
    await expect(resolvePublicWebhookUrl("not-a-url")).rejects.toThrow("invalid_webhook_url")
  })

  it("rejects hosts that fail DNS resolution", async () => {
    await expect(resolvePublicWebhookUrl("https://hooks.example.com/run", async () => [])).rejects.toThrow(
      "dns_resolution_failed",
    )
  })
})
