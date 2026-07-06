import { beforeEach, describe, expect, it, vi } from "vitest"

const toastMock = vi.hoisted(() => vi.fn())
vi.mock("@repo/ui", () => ({ toast: toastMock }))

import { handleMutationError, READ_ONLY_PROJECT_ERROR_TAG } from "./handle-mutation-error.ts"

const serverError = (payload: { _tag?: string; message: string; status?: number }) =>
  new Error(JSON.stringify({ status: 500, ...payload }))

describe("handleMutationError", () => {
  beforeEach(() => toastMock.mockClear())

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
})
