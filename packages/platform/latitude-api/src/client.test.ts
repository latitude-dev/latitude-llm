import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createLatitudeApiClient, type LatitudeApiFetch } from "./client.ts"
import type { LatitudeApiConfig } from "./config.ts"

const CONFIG: LatitudeApiConfig = {
  apiKey: "lat_test_key",
  projectSlug: "dogfood",
  baseUrl: "https://api.latitude.test",
}

interface RecordedCall {
  readonly url: string
  readonly init: RequestInit
}

const recordedFetch = (response: {
  status: number
  body: unknown
}): { calls: RecordedCall[]; fetch: LatitudeApiFetch } => {
  const calls: RecordedCall[] = []
  const fetchFn: LatitudeApiFetch = async (input, init) => {
    calls.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      init: init ?? {},
    })
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "content-type": "application/json" },
    })
  }
  return { calls, fetch: fetchFn }
}

describe("createLatitudeApiClient", () => {
  it("returns a no-op client when config is undefined (local dev / CI)", async () => {
    const client = createLatitudeApiClient(undefined)

    // Must not throw and must not hit the network. Running the Effect to
    // completion is the whole assertion.
    const exit = await Effect.runPromiseExit(
      client.writeAnnotation({
        upstreamScoreId: "abc",
        passed: true,
        value: 1,
        feedback: "noop",
      }),
    )
    expect(exit._tag).toBe("Success")
  })

  it("POSTs to /v1/organizations/:org/projects/:slug/annotations with the trace filter", async () => {
    const fake = recordedFetch({
      status: 201,
      body: {
        id: "score-1",
        organizationId: "org_test_123",
        projectId: "proj-1",
        passed: true,
        value: 1,
        feedback: "Approved",
        metadata: { rawFeedback: "Approved" },
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z",
        draftedAt: null,
      },
    })

    const client = createLatitudeApiClient(CONFIG, { fetch: fake.fetch })

    await Effect.runPromise(
      client.writeAnnotation({
        upstreamScoreId: "upstream-score-abc",
        passed: true,
        value: 1,
        feedback: "Approved",
      }),
    )

    expect(fake.calls).toHaveLength(1)
    const [call] = fake.calls
    if (!call) throw new Error("no fetch call recorded")

    expect(call.url).toBe(`${CONFIG.baseUrl}/v1/projects/dogfood/annotations`)
    expect(call.init.method).toBe("POST")

    const headers = new Headers(call.init.headers)
    expect(headers.get("authorization")).toBe(`Bearer ${CONFIG.apiKey}`)
    expect(headers.get("content-type")).toBe("application/json")

    const body = JSON.parse(call.init.body as string) as Record<string, unknown>
    expect(body).toEqual({
      trace: {
        by: "filters",
        filters: { "metadata.scoreId": [{ op: "eq", value: "upstream-score-abc" }] },
      },
      draft: false,
      passed: true,
      value: 1,
      feedback: "Approved",
    })
  })

  it("maps 4xx responses to ProductFeedbackRequestError (permanent — worker swallows)", async () => {
    const fake = recordedFetch({
      status: 400,
      body: { error: "Trace filter matched more than one trace in this project." },
    })
    const client = createLatitudeApiClient(CONFIG, { fetch: fake.fetch })

    const exit = await Effect.runPromiseExit(
      client.writeAnnotation({
        upstreamScoreId: "ambiguous",
        passed: false,
        value: 0,
        feedback: "reason",
      }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const serialized = JSON.stringify(exit.cause)
      expect(serialized).toContain("ProductFeedbackRequestError")
      expect(serialized).toContain("400")
      expect(serialized).toContain("Trace filter matched more than one trace")
    }
  })

  it("maps 5xx responses to ProductFeedbackTransportError (transient — BullMQ retries)", async () => {
    const fake = recordedFetch({ status: 503, body: { error: "upstream unavailable" } })
    // maxRetries: 0 keeps this classification test focused on the mapping —
    // without it the SDK would retry 2× with backoff, slowing the suite
    // without changing the exit classification this test asserts on.
    const client = createLatitudeApiClient(CONFIG, { fetch: fake.fetch, maxRetries: 0 })

    const exit = await Effect.runPromiseExit(
      client.writeAnnotation({
        upstreamScoreId: "x",
        passed: true,
        value: 1,
        feedback: "x",
      }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const serialized = JSON.stringify(exit.cause)
      expect(serialized).toContain("ProductFeedbackTransportError")
      // Must not be classified as a permanent-request failure
      expect(serialized).not.toContain("ProductFeedbackRequestError")
    }
  })

  it("maps network errors to ProductFeedbackTransportError", async () => {
    const fetchFn: LatitudeApiFetch = async () => {
      throw new TypeError("fetch failed")
    }
    const client = createLatitudeApiClient(CONFIG, { fetch: fetchFn })

    const exit = await Effect.runPromiseExit(
      client.writeAnnotation({
        upstreamScoreId: "x",
        passed: true,
        value: 1,
        feedback: "x",
      }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const serialized = JSON.stringify(exit.cause)
      expect(serialized).toContain("ProductFeedbackTransportError")
    }
  })

  it.each([
    { status: 408, label: "Request Timeout" },
    { status: 429, label: "Too Many Requests" },
  ])("maps $status $label to ProductFeedbackTransportError (retriable)", async ({ status }) => {
    // 408 and 429 are transient by HTTP semantics; a retry with the same body
    // should eventually succeed once the server-side condition clears. If we
    // misclassified them as ProductFeedbackRequestError the worker would
    // swallow them with a warn and we'd silently drop the dogfood annotation.
    const fake = recordedFetch({ status, body: { error: "slow down" } })
    const client = createLatitudeApiClient(CONFIG, { fetch: fake.fetch, maxRetries: 0 })

    const exit = await Effect.runPromiseExit(
      client.writeAnnotation({ upstreamScoreId: "x", passed: true, value: 1, feedback: "x" }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const serialized = JSON.stringify(exit.cause)
      expect(serialized).toContain("ProductFeedbackTransportError")
      expect(serialized).not.toContain("ProductFeedbackRequestError")
    }
  })

  it("inherits the SDK default retry on 5xx when maxRetries is not passed", async () => {
    // Non-queued callers (e.g. a future web-side use) should leave
    // maxRetries unset so the SDK's default retry absorbs the first blip
    // instead of bubbling it to the user. Fern's default is 2 retries = up
    // to 3 total attempts; asserting `> 1` keeps the test robust to the
    // exact default while still locking in that retries DO happen when the
    // caller doesn't opt out.
    const fake = recordedFetch({ status: 503, body: { error: "boom" } })
    const client = createLatitudeApiClient(CONFIG, { fetch: fake.fetch })

    await Effect.runPromiseExit(client.writeAnnotation({ upstreamScoreId: "x", passed: true, value: 1, feedback: "x" }))

    expect(fake.calls.length).toBeGreaterThan(1)
  }, 20_000)

  it("honours maxRetries=0 on 5xx so the caller owns the retry schedule", async () => {
    // BullMQ-driven callers (apps/workers) pass maxRetries=0 because they
    // own the retry schedule upstream. With the SDK's default (2) each
    // failure would be retried 2× inside one writeAnnotation call BEFORE
    // the worker sees it, multiplying the effective retry budget and making
    // the BullMQ backoff math meaningless. This test locks in that the
    // override is honoured — exactly one outbound call on a 5xx.
    const fake = recordedFetch({ status: 503, body: { error: "boom" } })
    const client = createLatitudeApiClient(CONFIG, { fetch: fake.fetch, maxRetries: 0 })

    await Effect.runPromiseExit(client.writeAnnotation({ upstreamScoreId: "x", passed: true, value: 1, feedback: "x" }))

    expect(fake.calls).toHaveLength(1)
  })
})
