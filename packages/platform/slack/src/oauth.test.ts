import { Cause, Effect, Exit } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SlackAuthError, SlackOAuthError } from "./errors.ts"

const { accessMock } = vi.hoisted(() => ({ accessMock: vi.fn() }))

vi.mock("@slack/web-api", async (importActual) => {
  const actual = await importActual<typeof import("@slack/web-api")>()
  return {
    ...actual,
    WebClient: class MockWebClient {
      oauth = { v2: { access: accessMock } }
    },
  }
})

const { buildSlackAuthorizeUrl, exchangeOAuthCode, refreshBotToken } = await import("./oauth.ts")

const failure = async (effect: Effect.Effect<unknown, SlackOAuthError>): Promise<SlackOAuthError> => {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) throw new Error("Expected failure")
  const failReason = exit.cause.reasons.find(Cause.isFailReason)
  if (!failReason) throw new Error("Expected typed failure")
  return failReason.error as SlackOAuthError
}

const successResponse = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  access_token: "xoxb-test",
  bot_user_id: "U01TESTBOT",
  app_id: "A01TESTAPP",
  scope: "chat:write,chat:write.public,channels:read,groups:read,team:read,app_mentions:read",
  team: { id: "T01TEST", name: "Test Workspace" },
  authed_user: { id: "U01INSTALLER" },
  ...overrides,
})

describe("buildSlackAuthorizeUrl", () => {
  it("delegates to @slack/oauth and returns an authorize URL with the v1 bot scope set + state", async () => {
    const url = await Effect.runPromise(
      buildSlackAuthorizeUrl({
        clientId: "cid-123",
        clientSecret: "csec-123",
        redirectUri: "http://localhost:3000/integrations/slack/oauth/callback",
        state: "state-abc",
      }),
    )

    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe("https://slack.com/oauth/v2/authorize")
    expect(parsed.searchParams.get("client_id")).toBe("cid-123")
    expect(parsed.searchParams.get("state")).toBe("state-abc")
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3000/integrations/slack/oauth/callback")
    expect(parsed.searchParams.get("scope")).toBe(
      "chat:write,chat:write.public,channels:read,groups:read,team:read,app_mentions:read",
    )
  })
})

describe("exchangeOAuthCode", () => {
  beforeEach(() => {
    accessMock.mockReset()
  })

  afterEach(() => {
    accessMock.mockReset()
  })

  const baseInput = {
    code: "code-abc",
    redirectUri: "http://localhost:3000/integrations/slack/oauth/callback",
    clientId: "cid",
    clientSecret: "csec",
  } as const

  it("parses a complete successful response", async () => {
    accessMock.mockResolvedValue(successResponse())

    const result = await Effect.runPromise(exchangeOAuthCode(baseInput))

    expect(result).toEqual({
      teamId: "T01TEST",
      teamName: "Test Workspace",
      appId: "A01TESTAPP",
      botUserId: "U01TESTBOT",
      botAccessToken: "xoxb-test",
      botTokenScopes: "chat:write,chat:write.public,channels:read,groups:read,team:read,app_mentions:read",
      authedUserId: "U01INSTALLER",
      refreshToken: undefined,
      expiresIn: undefined,
    })
    expect(accessMock).toHaveBeenCalledWith({
      client_id: "cid",
      client_secret: "csec",
      code: "code-abc",
      redirect_uri: "http://localhost:3000/integrations/slack/oauth/callback",
    })
  })

  it("captures refresh_token + expires_in when token rotation is enabled", async () => {
    accessMock.mockResolvedValue(successResponse({ refresh_token: "xoxe-1-refresh", expires_in: 43200 }))

    const result = await Effect.runPromise(exchangeOAuthCode(baseInput))
    expect(result.refreshToken).toBe("xoxe-1-refresh")
    expect(result.expiresIn).toBe(43200)
  })

  it("maps Slack's `ok: false` error to SlackOAuthError with the Slack error code", async () => {
    // WebClient's behaviour: on `ok: false` from Slack, it throws an
    // error with `data: { error: "..." }` attached.
    const slackError = Object.assign(new Error("slack api failed"), {
      data: { ok: false, error: "invalid_code" },
    })
    accessMock.mockRejectedValue(slackError)

    const err = await failure(exchangeOAuthCode(baseInput))
    expect(err.slackError).toBe("invalid_code")
  })

  it("treats a partial response (no team) as incomplete", async () => {
    accessMock.mockResolvedValue({ ok: true, access_token: "xoxb-only" })

    const err = await failure(exchangeOAuthCode(baseInput))
    expect(err.slackError).toBe("incomplete_response")
  })

  it("wraps transport-level failures (network)", async () => {
    accessMock.mockRejectedValue(new Error("ECONNREFUSED"))

    const err = await failure(exchangeOAuthCode(baseInput))
    expect(err.slackError).toBeUndefined()
    expect(err.cause).toBeInstanceOf(Error)
  })
})

describe("refreshBotToken", () => {
  beforeEach(() => {
    accessMock.mockReset()
  })

  afterEach(() => {
    accessMock.mockReset()
  })

  const baseInput = { clientId: "cid", clientSecret: "csec", refreshToken: "xoxe-1-refresh" } as const

  it("calls oauth.v2.access with grant_type=refresh_token and projects the rotated triple", async () => {
    accessMock.mockResolvedValue({
      ok: true,
      access_token: "xoxe-2-access",
      refresh_token: "xoxe-2-refresh",
      expires_in: 43200,
    })

    const result = await Effect.runPromise(refreshBotToken(baseInput))

    expect(result).toEqual({
      botAccessToken: "xoxe-2-access",
      refreshToken: "xoxe-2-refresh",
      expiresIn: 43200,
    })
    expect(accessMock).toHaveBeenCalledWith({
      client_id: "cid",
      client_secret: "csec",
      grant_type: "refresh_token",
      refresh_token: "xoxe-1-refresh",
    })
  })

  it("maps invalid_refresh_token to SlackAuthError (token_revoked)", async () => {
    const slackError = Object.assign(new Error("slack api failed"), {
      data: { ok: false, error: "invalid_refresh_token" },
    })
    accessMock.mockRejectedValue(slackError)

    const exit = await Effect.runPromiseExit(refreshBotToken(baseInput))
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) return
    const failReason = exit.cause.reasons.find(Cause.isFailReason)
    const error = failReason?.error as SlackAuthError
    expect(error._tag).toBe("SlackAuthError")
    expect(error.reason).toBe("token_revoked")
  })

  it("maps other Slack errors to SlackOAuthError", async () => {
    const slackError = Object.assign(new Error("slack api failed"), {
      data: { ok: false, error: "invalid_client_id" },
    })
    accessMock.mockRejectedValue(slackError)

    const exit = await Effect.runPromiseExit(refreshBotToken(baseInput))
    if (!Exit.isFailure(exit)) throw new Error("Expected failure")
    const failReason = exit.cause.reasons.find(Cause.isFailReason)
    expect((failReason?.error as SlackOAuthError).slackError).toBe("invalid_client_id")
  })

  it("treats a response missing token fields as incomplete", async () => {
    accessMock.mockResolvedValue({ ok: true, access_token: "xoxe-only" })

    const exit = await Effect.runPromiseExit(refreshBotToken(baseInput))
    if (!Exit.isFailure(exit)) throw new Error("Expected failure")
    const failReason = exit.cause.reasons.find(Cause.isFailReason)
    expect((failReason?.error as SlackOAuthError).slackError).toBe("incomplete_refresh_response")
  })
})
