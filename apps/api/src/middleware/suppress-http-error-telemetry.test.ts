import { NotFoundError, RepositoryError } from "@domain/shared"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { suppressHttpErrorTelemetry } from "./suppress-http-error-telemetry.ts"

const buildApp = (thrown: unknown) => {
  let observedError: Error | undefined
  const app = new Hono()
  app.use(async (c, next) => {
    await next()
    observedError = c.error
  })
  app.use(suppressHttpErrorTelemetry)
  app.get("/throws", () => {
    throw thrown as Error
  })
  app.onError((err, c) => c.json({ error: err.message }, 500))
  return { app, getObservedError: () => observedError }
}

describe("suppressHttpErrorTelemetry", () => {
  it("clears c.error for 4xx HttpErrors so @hono/otel skips recordException", async () => {
    const { app, getObservedError } = buildApp(new NotFoundError({ entity: "Project", id: "missing" }))

    await app.request("/throws")

    expect(getObservedError()).toBeUndefined()
  })

  it("leaves c.error in place for 5xx HttpErrors", async () => {
    const { app, getObservedError } = buildApp(new RepositoryError({ operation: "findById", cause: "boom" }))

    await app.request("/throws")

    expect(getObservedError()).toBeInstanceOf(RepositoryError)
  })

  it("leaves c.error in place for non-HttpErrors", async () => {
    const plain = new Error("kaboom")
    const { app, getObservedError } = buildApp(plain)

    await app.request("/throws")

    expect(getObservedError()).toBe(plain)
  })
})
