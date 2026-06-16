import { OrganizationId, ProjectId, UserId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  DESTINATION_INTERVAL_MS_DEFAULT,
  DESTINATION_INTERVAL_MS_MAX,
  DESTINATION_INTERVAL_MS_MIN,
  DESTINATION_MAX_SPANS_PER_RUN_DEFAULT,
  DESTINATION_MAX_SPANS_PER_RUN_MAX,
  DESTINATION_MAX_SPANS_PER_RUN_MIN,
  POSTHOG_EU_INGESTION_HOST,
  POSTHOG_US_INGESTION_HOST,
} from "../constants.ts"
import { createDestination, destinationConfigSchema, destinationHostSchema } from "./destination.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const validConfig = {
  kind: "posthog" as const,
  host: POSTHOG_US_INGESTION_HOST,
  excludePayloads: false,
  intervalMs: DESTINATION_INTERVAL_MS_DEFAULT,
  maxSpansPerRun: DESTINATION_MAX_SPANS_PER_RUN_DEFAULT,
}

describe("destinationHostSchema", () => {
  it("accepts the official ingestion hosts and custom https hosts, unchanged", () => {
    expect(destinationHostSchema.parse(POSTHOG_US_INGESTION_HOST)).toBe(POSTHOG_US_INGESTION_HOST)
    expect(destinationHostSchema.parse(POSTHOG_EU_INGESTION_HOST)).toBe(POSTHOG_EU_INGESTION_HOST)
    expect(destinationHostSchema.parse("https://posthog.acme.com")).toBe("https://posthog.acme.com")
  })

  it("rejects non-https, credentialed, query-bearing, and dotless hosts", () => {
    expect(destinationHostSchema.safeParse("http://us.i.posthog.com").success).toBe(false)
    expect(destinationHostSchema.safeParse("https://user:pass@posthog.acme.com").success).toBe(false)
    expect(destinationHostSchema.safeParse("https://posthog.acme.com?x=1").success).toBe(false)
    expect(destinationHostSchema.safeParse("https://localhost").success).toBe(false)
    expect(destinationHostSchema.safeParse("not a url").success).toBe(false)
  })

  it("rejects IP-literal hosts", () => {
    expect(destinationHostSchema.safeParse("https://127.0.0.1").success).toBe(false)
    expect(destinationHostSchema.safeParse("https://192.168.0.10:8000").success).toBe(false)
    expect(destinationHostSchema.safeParse("https://8.8.8.8").success).toBe(false)
    expect(destinationHostSchema.safeParse("https://[::1]").success).toBe(false)
    expect(destinationHostSchema.safeParse("https://[::ffff:10.0.0.1]").success).toBe(false)
  })
})

describe("destinationConfigSchema", () => {
  it("applies defaults for excludePayloads, intervalMs, and maxSpansPerRun", () => {
    const parsed = destinationConfigSchema.parse({ kind: "posthog", host: POSTHOG_US_INGESTION_HOST })
    expect(parsed.excludePayloads).toBe(false)
    expect(parsed.intervalMs).toBe(DESTINATION_INTERVAL_MS_DEFAULT)
    expect(parsed.maxSpansPerRun).toBe(DESTINATION_MAX_SPANS_PER_RUN_DEFAULT)
  })

  it("bounds intervalMs to 1–60 minutes", () => {
    expect(
      destinationConfigSchema.safeParse({ ...validConfig, intervalMs: DESTINATION_INTERVAL_MS_MIN - 1 }).success,
    ).toBe(false)
    expect(
      destinationConfigSchema.safeParse({ ...validConfig, intervalMs: DESTINATION_INTERVAL_MS_MAX + 1 }).success,
    ).toBe(false)
    expect(destinationConfigSchema.safeParse({ ...validConfig, intervalMs: DESTINATION_INTERVAL_MS_MIN }).success).toBe(
      true,
    )
  })

  it("bounds maxSpansPerRun to 1k–50k", () => {
    expect(
      destinationConfigSchema.safeParse({ ...validConfig, maxSpansPerRun: DESTINATION_MAX_SPANS_PER_RUN_MIN - 1 })
        .success,
    ).toBe(false)
    expect(
      destinationConfigSchema.safeParse({ ...validConfig, maxSpansPerRun: DESTINATION_MAX_SPANS_PER_RUN_MAX + 1 })
        .success,
    ).toBe(false)
  })
})

describe("createDestination", () => {
  it("creates an active destination with no failure state", () => {
    const createdAt = new Date("2026-06-12T10:00:00Z")
    const destination = createDestination({
      organizationId: OrganizationId(cuid("o")),
      projectId: ProjectId(cuid("p")),
      name: "Acme PostHog",
      config: validConfig,
      credentials: { kind: "posthog", apiKey: "phc_test" },
      createdByUserId: UserId(cuid("u")),
      createdAt,
    })

    expect(destination.kind).toBe("posthog")
    expect(destination.status).toBe("active")
    expect(destination.consecutiveFailures).toBe(0)
    expect(destination.lastFailureMessage).toBeNull()
    expect(destination.createdAt).toEqual(createdAt)
  })

  it("rejects empty credentials", () => {
    expect(() =>
      createDestination({
        organizationId: OrganizationId(cuid("o")),
        projectId: ProjectId(cuid("p")),
        name: "Acme PostHog",
        config: validConfig,
        credentials: { kind: "posthog", apiKey: "" },
        createdByUserId: UserId(cuid("u")),
      }),
    ).toThrow()
  })
})
