import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  closePostgres: vi.fn(),
  createBoundedReadPostgresClient: vi.fn(),
}))

vi.mock("@platform/db-postgres", () => ({
  closePostgres: mocks.closePostgres,
  createBoundedReadPostgresClient: mocks.createBoundedReadPostgresClient,
  createPostgresClient: vi.fn(),
}))

import { closeJevShadowPostgresClient, getJevShadowPostgresClient } from "./clients.ts"

describe("closeJevShadowPostgresClient", () => {
  it("shares one close operation across overlapping and repeated calls", async () => {
    const client = { pool: {} }
    let resolveClose: (() => void) | undefined
    const closing = new Promise<void>((resolve) => {
      resolveClose = resolve
    })
    mocks.createBoundedReadPostgresClient.mockReturnValue(client)
    mocks.closePostgres.mockReturnValue(closing)

    getJevShadowPostgresClient()
    const firstClose = closeJevShadowPostgresClient()
    const secondClose = closeJevShadowPostgresClient()

    expect(firstClose).toBe(secondClose)
    expect(mocks.closePostgres).toHaveBeenCalledOnce()
    expect(mocks.closePostgres).toHaveBeenCalledWith(client.pool)

    resolveClose?.()
    await Promise.all([firstClose, secondClose])

    await expect(closeJevShadowPostgresClient()).resolves.toBeUndefined()
    expect(mocks.closePostgres).toHaveBeenCalledOnce()
  })
})
