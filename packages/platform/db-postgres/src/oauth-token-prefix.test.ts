import { describe, expect, it } from "vitest"
import {
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_PREFIX,
  stripOAuthAccessTokenPrefix,
  stripOAuthRefreshTokenPrefix,
} from "./oauth-token-prefix.ts"

describe("stripOAuthAccessTokenPrefix", () => {
  it("strips the `loa_` prefix when present", () => {
    expect(stripOAuthAccessTokenPrefix(`${OAUTH_ACCESS_TOKEN_PREFIX}xyz123`)).toBe("xyz123")
  })

  it("returns the input unchanged when the prefix is missing", () => {
    expect(stripOAuthAccessTokenPrefix("xyz123")).toBe("xyz123")
  })

  it("only strips the prefix once", () => {
    // Defense against an off-by-one bug where the strip recurses into prefixed
    // payloads. `loa_loa_xxx` should become `loa_xxx`, not `xxx`.
    expect(stripOAuthAccessTokenPrefix(`${OAUTH_ACCESS_TOKEN_PREFIX}${OAUTH_ACCESS_TOKEN_PREFIX}xxx`)).toBe(
      `${OAUTH_ACCESS_TOKEN_PREFIX}xxx`,
    )
  })

  it("does not strip the refresh-token prefix", () => {
    const refreshShape = `${OAUTH_REFRESH_TOKEN_PREFIX}xyz`
    expect(stripOAuthAccessTokenPrefix(refreshShape)).toBe(refreshShape)
  })

  it("handles the empty string", () => {
    expect(stripOAuthAccessTokenPrefix("")).toBe("")
  })
})

describe("stripOAuthRefreshTokenPrefix", () => {
  it("strips the `lor_` prefix when present", () => {
    expect(stripOAuthRefreshTokenPrefix(`${OAUTH_REFRESH_TOKEN_PREFIX}abc456`)).toBe("abc456")
  })

  it("returns the input unchanged when the prefix is missing", () => {
    expect(stripOAuthRefreshTokenPrefix("abc456")).toBe("abc456")
  })

  it("does not strip the access-token prefix", () => {
    const accessShape = `${OAUTH_ACCESS_TOKEN_PREFIX}xyz`
    expect(stripOAuthRefreshTokenPrefix(accessShape)).toBe(accessShape)
  })
})
