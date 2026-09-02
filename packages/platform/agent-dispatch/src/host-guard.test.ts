import { PassThrough } from "node:stream"
import { describe, expect, it } from "vitest"
import {
  httpsRequestHost,
  isPublicUnicastIp,
  resolvePublicWebhookTarget,
  resolvePublicWebhookUrl,
  toPinnedHttpsResponse,
  WEBHOOK_RESPONSE_MAX_BYTES,
} from "./host-guard.ts"

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
})

describe("resolvePublicWebhookTarget", () => {
  it("returns the first public address to pin the connection", async () => {
    await expect(
      resolvePublicWebhookTarget("https://hooks.example.com/run", async () => ["8.8.8.8", "1.1.1.1"]),
    ).resolves.toEqual({
      url: new URL("https://hooks.example.com/run"),
      address: "8.8.8.8",
    })
  })
})

describe("httpsRequestHost", () => {
  it("omits the default https port", () => {
    expect(httpsRequestHost(new URL("https://hooks.example.com/run"))).toBe("hooks.example.com")
    expect(httpsRequestHost(new URL("https://hooks.example.com:443/run"))).toBe("hooks.example.com")
  })

  it("includes a custom port in the Host header", () => {
    expect(httpsRequestHost(new URL("https://hooks.example.com:8443/run"))).toBe("hooks.example.com:8443")
  })
})

describe("toPinnedHttpsResponse", () => {
  const incomingMessage = (status = 200) => {
    const stream = new PassThrough()
    Object.assign(stream, { statusCode: status, headers: {} })
    return stream as PassThrough & { statusCode: number; headers: Record<string, string> }
  }

  it("exposes status before the body ends", async () => {
    const incoming = incomingMessage(202)
    const response = toPinnedHttpsResponse(incoming, () => undefined)
    expect(response.status).toBe(202)
    if (!response.body) throw new Error("expected streamed body")
    const reader = response.body.getReader()
    incoming.write(Buffer.from('{"externalRunId":"run-1"}'))
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe('{"externalRunId":"run-1"}')
    incoming.end()
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined })
  })

  it("aborts the request when the body stream is cancelled", async () => {
    const incoming = incomingMessage()
    let aborted = false
    const response = toPinnedHttpsResponse(incoming, () => {
      aborted = true
    })
    await response.body?.cancel()
    expect(aborted).toBe(true)
  })

  it("caps text() and aborts an oversized body", async () => {
    const incoming = incomingMessage()
    let aborted = false
    const response = toPinnedHttpsResponse(incoming, () => {
      aborted = true
    })
    incoming.write(Buffer.alloc(WEBHOOK_RESPONSE_MAX_BYTES + 8, 0x61))
    incoming.end()
    const text = await response.text()
    expect(text.length).toBeLessThanOrEqual(WEBHOOK_RESPONSE_MAX_BYTES)
    expect(aborted).toBe(true)
  })
})
