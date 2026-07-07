import { describe, expect, it } from "vitest"
import { agentDispatchContextSchema } from "../entities/agent-dispatch-context.ts"
import { buildDispatchIdempotencyKey, buildManualDispatchIdempotencyKey } from "./idempotency-key.ts"

describe("buildDispatchIdempotencyKey", () => {
  it("keeps the vendor as the first segment", () => {
    const key = buildDispatchIdempotencyKey({
      vendor: "cursor",
      configId: "cfg_1",
      trigger: "signal.discovered",
      sourceId: "sig_1",
      dispatchWindow: "2026-07-04",
    })
    expect(key).toBe("cursor:cfg_1:signal.discovered:sig_1:2026-07-04")
  })
})

describe("buildManualDispatchIdempotencyKey", () => {
  it("builds vendor:config:manual:source:sendId", () => {
    const key = buildManualDispatchIdempotencyKey({
      vendor: "linear",
      configId: "cfg_1",
      sourceId: "sig_1",
      sendId: "send_abc",
    })
    expect(key).toBe("linear:cfg_1:manual:sig_1:send_abc")
  })

  it("mints a distinct key per sendId for the same signal and config", () => {
    const base = { vendor: "webhook" as const, configId: "cfg_1", sourceId: "sig_1" }
    expect(buildManualDispatchIdempotencyKey({ ...base, sendId: "a" })).not.toBe(
      buildManualDispatchIdempotencyKey({ ...base, sendId: "b" }),
    )
  })
})

describe("agentDispatchContextSchema", () => {
  it("accepts the manual trigger", () => {
    const parsed = agentDispatchContextSchema.safeParse({
      trigger: "manual",
      organizationName: "Acme",
      projectName: "App",
      projectSlug: "app",
      deepLinkUrl: "https://console.latitude.so/projects/app",
    })
    expect(parsed.success).toBe(true)
  })
})
