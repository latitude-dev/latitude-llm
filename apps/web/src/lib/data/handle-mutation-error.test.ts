import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { STALE_SERVER_FN_ERROR_TAG, STALE_SERVER_FN_USER_MESSAGE } from "../stale-server-fn.ts"

const toastMock = vi.hoisted(() => vi.fn())
vi.mock("@repo/ui", () => ({ toast: toastMock }))

import { handleMutationError, READ_ONLY_PROJECT_ERROR_TAG } from "./handle-mutation-error.ts"

const serverError = (payload: { _tag?: string; message: string; status?: number }) =>
  new Error(JSON.stringify({ status: 500, ...payload }))

describe("handleMutationError", () => {
  const reload = vi.fn()

  beforeEach(() => {
    toastMock.mockClear()
    reload.mockClear()
    vi.stubGlobal("window", { location: { reload } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("toasts the decoded message for a generic server error", () => {
    handleMutationError(serverError({ message: "Something broke" }))

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", description: "Something broke" })
  })

  it("toasts the raw message for a plain (non-JSON) error", () => {
    handleMutationError(new Error("plain failure"))

    expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", description: "plain failure" })
  })

  it("does not toast when generic toasting is opted out (useMutation path default)", () => {
    handleMutationError(serverError({ message: "handled elsewhere" }), { toastGenericError: false })

    expect(toastMock).not.toHaveBeenCalled()
  })

  it("stays dormant for a ReadOnlyProjectError — no toast today", () => {
    handleMutationError(serverError({ _tag: READ_ONLY_PROJECT_ERROR_TAG, message: "read only", status: 403 }))

    expect(toastMock).not.toHaveBeenCalled()
  })

  it("keeps the ReadOnlyProjectError branch dormant even when generic toasting is requested", () => {
    handleMutationError(serverError({ _tag: READ_ONLY_PROJECT_ERROR_TAG, message: "read only", status: 403 }), {
      toastGenericError: true,
    })

    expect(toastMock).not.toHaveBeenCalled()
  })

  it("reloads the page for a stale server-fn error instead of toasting", () => {
    handleMutationError(
      serverError({ _tag: STALE_SERVER_FN_ERROR_TAG, message: STALE_SERVER_FN_USER_MESSAGE, status: 404 }),
    )

    expect(toastMock).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("reloads when the client still sees TanStack's raw missing-hash message", () => {
    handleMutationError(
      new Error("Server function info not found for 8ae8498b6e8c600abff6cc7c428fc166b1bb45613094b806f08105bfc6f1344d"),
    )

    expect(toastMock).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
