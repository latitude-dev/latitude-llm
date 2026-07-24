import { NotFoundError, RepositoryError, UnauthorizedError } from "@domain/shared"
import type { Span } from "@repo/observability"
import { isHttpError } from "@repo/utils"
import { describe, expect, it, vi } from "vitest"
import { STALE_SERVER_FN_ERROR_TAG, STALE_SERVER_FN_USER_MESSAGE } from "../lib/stale-server-fn.ts"
import { asStaleServerFnError, recordRequestError, recordServerFnError } from "./server-fn-error.ts"

const MISSING_SERVER_FN = new Error(
  "Server function info not found for 8ae8498b6e8c600abff6cc7c428fc166b1bb45613094b806f08105bfc6f1344d",
)

const fakeSpan = () => {
  const span = {
    recordException: vi.fn(),
    setStatus: vi.fn(),
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    end: vi.fn(),
  }
  return span as typeof span & Span
}

describe("recordServerFnError", () => {
  it("does NOT report a 401 (UnauthorizedError) to Datadog", () => {
    const span = fakeSpan()
    const info = recordServerFnError(span, new UnauthorizedError({ message: "No user in session" }))

    expect(span.recordException).not.toHaveBeenCalled()
    expect(span.setStatus).not.toHaveBeenCalled()
    expect(info.isClientError).toBe(true)
    expect(info.status).toBe(401)
    expect(info.tag).toBe("UnauthorizedError")
  })

  it("does NOT report other 4xx client errors (e.g. 404) to Datadog", () => {
    const span = fakeSpan()
    const info = recordServerFnError(span, new NotFoundError({ entity: "Sandbox", id: "org-123" }))

    expect(span.recordException).not.toHaveBeenCalled()
    expect(span.setStatus).not.toHaveBeenCalled()
    expect(info.isClientError).toBe(true)
    expect(info.status).toBe(404)
  })

  it("reports 5xx server faults (RepositoryError) to Datadog", () => {
    const span = fakeSpan()
    const info = recordServerFnError(span, new RepositoryError({ cause: new Error("boom"), operation: "findById" }))

    expect(span.recordException).toHaveBeenCalledTimes(1)
    expect(span.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: expect.anything() }))
    expect(info.isClientError).toBe(false)
    expect(info.status).toBe(500)
  })

  it("reports unknown non-HTTP errors as 500", () => {
    const span = fakeSpan()
    const info = recordServerFnError(span, new Error("unexpected"))

    expect(span.recordException).toHaveBeenCalledTimes(1)
    expect(info.isClientError).toBe(false)
    expect(info.status).toBe(500)
  })

  it("re-throwable error carries the serialized payload and original stack", () => {
    const original = new UnauthorizedError({ message: "No user in session" })
    const info = recordServerFnError(fakeSpan(), original)

    expect(JSON.parse(info.error.message)).toEqual({
      _tag: "UnauthorizedError",
      message: "No user in session",
      status: 401,
    })
    expect(info.error.stack).toBe(original.stack)
  })

  it("re-throwable error stays classifiable as an HttpError without leaking status into the JSON message", () => {
    const info = recordServerFnError(fakeSpan(), new UnauthorizedError({ message: "Unauthorized" }))

    // The request middleware relies on this to re-classify the re-thrown error.
    expect(isHttpError(info.error)).toBe(true)
    // ...but the client-bound message must remain just the serialized payload.
    expect(Object.keys(JSON.parse(info.error.message))).toEqual(["_tag", "message", "status"])
    expect(JSON.stringify(info.error)).not.toContain("httpStatus")
  })
})

describe("recordRequestError", () => {
  it("does NOT report the re-thrown 401 that propagates up from a server fn", () => {
    // End-to-end: server fn throws 401 → recordServerFnError shapes it → it
    // bubbles to the request middleware, which must also leave it unrecorded.
    const reThrown = recordServerFnError(fakeSpan(), new UnauthorizedError({ message: "Unauthorized" })).error

    const span = fakeSpan()
    recordRequestError(span, reThrown)

    expect(span.recordException).not.toHaveBeenCalled()
    expect(span.setStatus).not.toHaveBeenCalled()
  })

  it("does NOT report a 4xx HttpError thrown directly at the request layer", () => {
    const span = fakeSpan()
    recordRequestError(span, new NotFoundError({ entity: "Sandbox", id: "org-123" }))

    expect(span.recordException).not.toHaveBeenCalled()
    expect(span.setStatus).not.toHaveBeenCalled()
  })

  it("reports a re-thrown 5xx server fault", () => {
    const reThrown = recordServerFnError(
      fakeSpan(),
      new RepositoryError({ cause: new Error("boom"), operation: "findById" }),
    ).error

    const span = fakeSpan()
    recordRequestError(span, reThrown)

    expect(span.recordException).toHaveBeenCalledTimes(1)
    expect(span.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: expect.anything() }))
  })

  it("reports an unknown non-HTTP error (defaults to 500)", () => {
    const span = fakeSpan()
    recordRequestError(span, new Error("boom"))

    expect(span.recordException).toHaveBeenCalledTimes(1)
  })

  it("does NOT report a raw missing server-fn hash (deploy skew) to Datadog", () => {
    const span = fakeSpan()
    recordRequestError(span, MISSING_SERVER_FN)

    expect(span.recordException).not.toHaveBeenCalled()
    expect(span.setStatus).not.toHaveBeenCalled()
  })

  it("does NOT report the reshaped stale server-fn 404 to Datadog", () => {
    const span = fakeSpan()
    recordRequestError(span, asStaleServerFnError(MISSING_SERVER_FN))

    expect(span.recordException).not.toHaveBeenCalled()
    expect(span.setStatus).not.toHaveBeenCalled()
  })
})

describe("asStaleServerFnError", () => {
  it("shapes a client-bound 404 payload and preserves HttpError classification", () => {
    const shaped = asStaleServerFnError(MISSING_SERVER_FN)

    expect(JSON.parse(shaped.message)).toEqual({
      _tag: STALE_SERVER_FN_ERROR_TAG,
      message: STALE_SERVER_FN_USER_MESSAGE,
      status: 404,
    })
    expect(isHttpError(shaped)).toBe(true)
    expect(shaped.stack).toBe(MISSING_SERVER_FN.stack)
  })
})

describe("recordServerFnError stale server-fn", () => {
  it("maps a missing server-fn hash to StaleServerFnError without recording", () => {
    const span = fakeSpan()
    const info = recordServerFnError(span, MISSING_SERVER_FN)

    expect(span.recordException).not.toHaveBeenCalled()
    expect(info.isClientError).toBe(true)
    expect(info.status).toBe(404)
    expect(info.tag).toBe(STALE_SERVER_FN_ERROR_TAG)
    expect(JSON.parse(info.error.message)).toEqual({
      _tag: STALE_SERVER_FN_ERROR_TAG,
      message: STALE_SERVER_FN_USER_MESSAGE,
      status: 404,
    })
  })
})
