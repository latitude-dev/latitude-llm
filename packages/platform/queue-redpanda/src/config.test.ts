import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { KafkaSaslWithoutTlsError, loadKafkaConfig } from "./config.ts"

const ENV_KEYS = [
  "LAT_KAFKA_BROKERS",
  "LAT_KAFKA_CLIENT_ID",
  "LAT_KAFKA_CONSUMER_GROUP_ID",
  "LAT_KAFKA_SSL",
  "LAT_KAFKA_SASL_USERNAME",
  "LAT_KAFKA_SASL_PASSWORD",
]

const BASE_ENV: Record<string, string> = {
  LAT_KAFKA_BROKERS: "localhost:9092,localhost:9093",
  LAT_KAFKA_CLIENT_ID: "test-client",
  LAT_KAFKA_CONSUMER_GROUP_ID: "test-group",
}

let originalNodeEnv: string | undefined

function setEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v
  }
}

function clearEnv() {
  for (const k of ENV_KEYS) {
    delete process.env[k]
  }
}

describe("loadKafkaConfig", () => {
  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
  })

  afterEach(() => {
    clearEnv()
    process.env.NODE_ENV = originalNodeEnv
  })

  it("loads valid config and splits broker list", async () => {
    setEnv(BASE_ENV)
    const config = await Effect.runPromise(loadKafkaConfig())

    expect(config.brokers).toEqual(["localhost:9092", "localhost:9093"])
    expect(config.clientId).toBe("test-client")
    expect(config.groupId).toBe("test-group")
    expect(config.ssl).toBeUndefined()
    expect(config.sasl).toBeUndefined()
  })

  it("fails in production when SASL enabled without TLS", async () => {
    process.env.NODE_ENV = "production"
    setEnv({ ...BASE_ENV, LAT_KAFKA_SSL: "false", LAT_KAFKA_SASL_USERNAME: "user", LAT_KAFKA_SASL_PASSWORD: "pass" })

    await expect(Effect.runPromise(loadKafkaConfig())).rejects.toBeInstanceOf(KafkaSaslWithoutTlsError)
  })

  it("allows SASL with TLS in production", async () => {
    process.env.NODE_ENV = "production"
    setEnv({ ...BASE_ENV, LAT_KAFKA_SSL: "true", LAT_KAFKA_SASL_USERNAME: "user", LAT_KAFKA_SASL_PASSWORD: "pass" })

    const config = await Effect.runPromise(loadKafkaConfig())

    expect(config.ssl).toBe(true)
    expect(config.sasl).toEqual({ mechanism: "plain", username: "user", password: "pass" })
  })

  it("allows SASL without TLS in non-production", async () => {
    process.env.NODE_ENV = "development"
    setEnv({ ...BASE_ENV, LAT_KAFKA_SASL_USERNAME: "user", LAT_KAFKA_SASL_PASSWORD: "pass" })

    const config = await Effect.runPromise(loadKafkaConfig())

    expect(config.sasl).toBeDefined()
  })
})
