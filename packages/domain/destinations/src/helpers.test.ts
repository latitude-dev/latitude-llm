import { describe, expect, it } from "vitest"
import { DESTINATION_EVENT_UUID_NAMESPACE } from "./constants.ts"
import { uuidV5 } from "./helpers.ts"

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"

describe("uuidV5", () => {
  it("derives the destination event namespace from the DNS namespace", async () => {
    const uuid = await uuidV5({ namespace: DNS_NAMESPACE, name: "destinations.latitude.so" })

    expect(uuid).toBe(DESTINATION_EVENT_UUID_NAMESPACE)
  })

  it("matches the RFC 9562 reference vector for the DNS namespace", async () => {
    const uuid = await uuidV5({ namespace: DNS_NAMESPACE, name: "www.example.com" })

    expect(uuid).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2")
  })

  it("is deterministic for the same namespace and name", async () => {
    const first = await uuidV5({ namespace: DNS_NAMESPACE, name: "destination:span:$ai_generation" })
    const second = await uuidV5({ namespace: DNS_NAMESPACE, name: "destination:span:$ai_generation" })

    expect(first).toBe(second)
  })

  it("yields a different UUID for a different name", async () => {
    const generation = await uuidV5({ namespace: DNS_NAMESPACE, name: "destination:span:$ai_generation" })
    const trace = await uuidV5({ namespace: DNS_NAMESPACE, name: "destination:span:$ai_trace" })

    expect(generation).not.toBe(trace)
  })

  it("sets the version and variant bits", async () => {
    const uuid = await uuidV5({ namespace: DNS_NAMESPACE, name: "anything" })

    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
