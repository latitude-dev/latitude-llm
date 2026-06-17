import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import type { DestinationConfig, DestinationCredentials } from "../entities/destination.ts"
import { NonRetryableDeliveryError, RetryableDeliveryError } from "../errors.ts"
import { DestinationDeliverers } from "../ports/destination-deliverer.ts"
import { createFakeDestinationDeliverer } from "../testing/fake-destination-deliverer.ts"
import { testDestinationConnectionUseCase } from "./test-destination-connection.ts"

const config: DestinationConfig = {
  kind: "posthog",
  host: POSTHOG_US_INGESTION_HOST,
  intervalMs: 300_000,
}
const credentials: DestinationCredentials = { kind: "posthog", apiKey: "phc_test" }

function setup() {
  const fake = createFakeDestinationDeliverer()
  const layer = Layer.succeed(DestinationDeliverers, { posthog: fake.deliverer })
  const run = () =>
    Effect.runPromise(testDestinationConnectionUseCase({ config, credentials }).pipe(Effect.provide(layer)))
  return { fake, run }
}

describe("testDestinationConnectionUseCase", () => {
  it("returns ok when the probe is accepted, without sending any telemetry", async () => {
    const { fake, run } = setup()

    const result = await run()

    expect(result).toEqual({ status: "ok" })
    expect(fake.connectionTests).toBe(1)
    expect(fake.deliveries).toHaveLength(0)
  })

  it("reports a non-retryable failure for an invalid key (401)", async () => {
    const { fake, run } = setup()
    fake.failWith(new NonRetryableDeliveryError({ kind: "posthog", reason: "invalid_api_key", upstreamStatus: 401 }))

    const result = await run()

    expect(result).toEqual({
      status: "failed",
      retryable: false,
      reason: "invalid_api_key",
      upstreamStatus: 401,
    })
  })

  it("reports a retryable failure for a transport error", async () => {
    const { fake, run } = setup()
    fake.failWith(new RetryableDeliveryError({ kind: "posthog", reason: "transport_error" }))

    const result = await run()

    expect(result).toEqual({ status: "failed", retryable: true, reason: "transport_error" })
  })
})
