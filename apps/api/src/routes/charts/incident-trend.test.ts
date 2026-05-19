import { generateId } from "@domain/shared"
import { notifications } from "@platform/db-postgres/schema/notifications"
import { createSignedNotificationChartToken } from "@platform/storage-object"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, setupTestApi } from "../../test-utils/create-test-app.ts"

// The chart route is unauthenticated; the URL's HMAC signature is the
// credential. Both the route handler and the test sign with the same
// secret; we install one into `process.env` if the test runner hasn't
// already so `parseEnv("LAT_NOTIFICATION_CHART_SECRET", ...)` resolves
// deterministically inside the route.
if (!process.env.LAT_NOTIFICATION_CHART_SECRET) {
  process.env.LAT_NOTIFICATION_CHART_SECRET = "test-chart-secret-do-not-use-in-prod"
}
const TEST_SECRET = process.env.LAT_NOTIFICATION_CHART_SECRET

const buildTrend = () => ({
  bucketDurationMs: 10 * 60 * 1000,
  points: [
    { t: "2026-05-07T07:00:00.000Z", count: 1, threshold: 5 },
    { t: "2026-05-07T07:10:00.000Z", count: 4, threshold: null },
    { t: "2026-05-07T07:20:00.000Z", count: 9, threshold: 6.2 },
  ],
})

describe("GET /charts/incident-trend", () => {
  setupTestApi()

  it<ApiTestContext>("returns 401 when the token query param is missing", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/charts/incident-trend"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("returns 401 when the signature doesn't verify", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/charts/incident-trend?token=not-a-real-token"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("renders a PNG with cache headers for a valid token + opened notification", async ({
    app,
    database,
  }) => {
    const orgId = generateId()
    const userId = generateId()
    const projectId = generateId()
    const notificationId = generateId()
    const payload = {
      alertIncidentId: generateId(),
      sourceType: "issue" as const,
      sourceId: generateId(),
      incidentKind: "issue.escalating" as const,
      severity: "high" as const,
      trend: buildTrend(),
      breach: { triggerRate: 12, baselineRate: 4, threshold: 7 },
    }

    await database.db.insert(notifications).values({
      id: notificationId,
      organizationId: orgId,
      userId,
      kind: "incident.opened",
      idempotencyKey: `incident.opened:${payload.alertIncidentId}`,
      projectId,
      payload,
      createdAt: new Date(),
      seenAt: null,
      emailedAt: null,
    })

    const token = await createSignedNotificationChartToken(notificationId, TEST_SECRET)
    const res = await app.fetch(
      new Request(`http://localhost/charts/incident-trend?token=${encodeURIComponent(token)}`),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("cache-control")).toContain("immutable")
    const body = await res.arrayBuffer()
    expect(body.byteLength).toBeGreaterThan(100)
    // PNG magic header
    const bytes = new Uint8Array(body)
    expect(bytes[0]).toBe(0x89)
    expect(bytes[1]).toBe(0x50) // 'P'
    expect(bytes[2]).toBe(0x4e) // 'N'
    expect(bytes[3]).toBe(0x47) // 'G'
  }, 30_000)

  it<ApiTestContext>("returns the 1×1 transparent PNG when the notification row is gone", async ({ app }) => {
    const token = await createSignedNotificationChartToken(generateId(), TEST_SECRET)
    const res = await app.fetch(
      new Request(`http://localhost/charts/incident-trend?token=${encodeURIComponent(token)}`),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    const body = await res.arrayBuffer()
    // The 1×1 PNG fallback is well under 100 bytes; a real render is far larger.
    expect(body.byteLength).toBeLessThan(200)
  })

  it<ApiTestContext>("returns the transparent fallback when the notification kind has no trend", async ({
    app,
    database,
  }) => {
    const orgId = generateId()
    const userId = generateId()
    const notificationId = generateId()
    const payload = {
      alertIncidentId: generateId(),
      sourceType: "issue" as const,
      sourceId: generateId(),
      incidentKind: "issue.new" as const,
      severity: "medium" as const,
    }

    await database.db.insert(notifications).values({
      id: notificationId,
      organizationId: orgId,
      userId,
      kind: "incident.event",
      idempotencyKey: `incident.event:${payload.alertIncidentId}`,
      projectId: null,
      payload,
      createdAt: new Date(),
      seenAt: null,
      emailedAt: null,
    })

    const token = await createSignedNotificationChartToken(notificationId, TEST_SECRET)
    const res = await app.fetch(
      new Request(`http://localhost/charts/incident-trend?token=${encodeURIComponent(token)}`),
    )

    expect(res.status).toBe(200)
    const body = await res.arrayBuffer()
    expect(body.byteLength).toBeLessThan(200)
  })
})
