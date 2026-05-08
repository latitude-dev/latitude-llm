import type { DBAdapter } from "@better-auth/core/db/adapter"
import { describe, expect, it, vi } from "vitest"
import {
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_PREFIX,
  wrapAdapterForOAuthTokenPrefix,
} from "./oauth-token-prefix.ts"

// Builds a stub adapter where `create` is a spy that records the params it
// receives and echoes the data back so callers can read the post-wrap shape.
const makeStubAdapter = () => {
  const create = vi.fn(async (params: { model: string; data: Record<string, unknown> }) => params.data)
  // Other methods are stubs — the wrap doesn't call them, so they only have to
  // satisfy the type.
  return {
    adapter: {
      id: "stub",
      create,
      findOne: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      transaction: vi.fn(),
      createSchema: vi.fn(),
      options: {},
    } as unknown as DBAdapter,
    create,
  }
}

describe("wrapAdapterForOAuthTokenPrefix", () => {
  it("prepends `loa_` to `accessToken` when creating an oauthAccessToken", async () => {
    const { adapter, create } = makeStubAdapter()
    const wrapped = wrapAdapterForOAuthTokenPrefix(adapter)

    await wrapped.create({
      model: "oauthAccessToken",
      data: { accessToken: "xyz123", refreshToken: "abc456" },
    })

    expect(create).toHaveBeenCalledTimes(1)
    const passed = create.mock.calls[0]?.[0]
    expect(passed?.data.accessToken).toBe(`${OAUTH_ACCESS_TOKEN_PREFIX}xyz123`)
  })

  it("prepends `lor_` to `refreshToken` when creating an oauthAccessToken", async () => {
    const { adapter, create } = makeStubAdapter()
    const wrapped = wrapAdapterForOAuthTokenPrefix(adapter)

    await wrapped.create({
      model: "oauthAccessToken",
      data: { accessToken: "xyz123", refreshToken: "abc456" },
    })

    const passed = create.mock.calls[0]?.[0]
    expect(passed?.data.refreshToken).toBe(`${OAUTH_REFRESH_TOKEN_PREFIX}abc456`)
  })

  it("does not double-prefix tokens that are already prefixed", async () => {
    const { adapter, create } = makeStubAdapter()
    const wrapped = wrapAdapterForOAuthTokenPrefix(adapter)

    await wrapped.create({
      model: "oauthAccessToken",
      data: {
        accessToken: `${OAUTH_ACCESS_TOKEN_PREFIX}already-prefixed`,
        refreshToken: `${OAUTH_REFRESH_TOKEN_PREFIX}already-prefixed`,
      },
    })

    const passed = create.mock.calls[0]?.[0]
    expect(passed?.data.accessToken).toBe(`${OAUTH_ACCESS_TOKEN_PREFIX}already-prefixed`)
    expect(passed?.data.refreshToken).toBe(`${OAUTH_REFRESH_TOKEN_PREFIX}already-prefixed`)
  })

  it("leaves other models untouched", async () => {
    const { adapter, create } = makeStubAdapter()
    const wrapped = wrapAdapterForOAuthTokenPrefix(adapter)

    await wrapped.create({
      model: "users",
      data: { email: "test@example.com" },
    })

    const passed = create.mock.calls[0]?.[0]
    expect(passed?.data).toEqual({ email: "test@example.com" })
  })

  it("forwards non-token fields on the oauthAccessToken model unchanged", async () => {
    const { adapter, create } = makeStubAdapter()
    const wrapped = wrapAdapterForOAuthTokenPrefix(adapter)

    const expiresAt = new Date()
    await wrapped.create({
      model: "oauthAccessToken",
      data: {
        accessToken: "x",
        refreshToken: "y",
        clientId: "client-1",
        userId: "user-1",
        scopes: "openid",
        accessTokenExpiresAt: expiresAt,
      },
    })

    const passed = create.mock.calls[0]?.[0]
    expect(passed?.data).toEqual({
      accessToken: `${OAUTH_ACCESS_TOKEN_PREFIX}x`,
      refreshToken: `${OAUTH_REFRESH_TOKEN_PREFIX}y`,
      clientId: "client-1",
      userId: "user-1",
      scopes: "openid",
      accessTokenExpiresAt: expiresAt,
    })
  })

  it("handles a missing refreshToken gracefully (auth-code grant only writes one)", async () => {
    const { adapter, create } = makeStubAdapter()
    const wrapped = wrapAdapterForOAuthTokenPrefix(adapter)

    await wrapped.create({
      model: "oauthAccessToken",
      data: { accessToken: "x" },
    })

    const passed = create.mock.calls[0]?.[0]
    expect(passed?.data.accessToken).toBe(`${OAUTH_ACCESS_TOKEN_PREFIX}x`)
    expect(passed?.data.refreshToken).toBeUndefined()
  })

  it("does not mutate the caller's data object", async () => {
    const { adapter } = makeStubAdapter()
    const wrapped = wrapAdapterForOAuthTokenPrefix(adapter)

    const data = { accessToken: "x", refreshToken: "y" }
    await wrapped.create({ model: "oauthAccessToken", data })

    expect(data.accessToken).toBe("x")
    expect(data.refreshToken).toBe("y")
  })

  it("preserves non-create methods on the inner adapter", async () => {
    const { adapter } = makeStubAdapter()
    const wrapped = wrapAdapterForOAuthTokenPrefix(adapter)

    expect(wrapped.findOne).toBe(adapter.findOne)
    expect(wrapped.findMany).toBe(adapter.findMany)
    expect(wrapped.update).toBe(adapter.update)
    expect(wrapped.delete).toBe(adapter.delete)
  })
})
