import { Cause, Effect, Exit } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SlackOAuthError } from "./errors.ts"
import { buildSlackAuthorizeUrl, exchangeOAuthCode } from "./oauth.ts"

const failure = async (effect: Effect.Effect<unknown, SlackOAuthError>): Promise<SlackOAuthError> => {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) throw new Error("Expected failure")
  const failReason = exit.cause.reasons.find(Cause.isFailReason)
  if (!failReason) throw new Error("Expected typed failure")
  return failReason.error as SlackOAuthError
}

const mockOk = (body: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  json: async () => body,
})

const mockSlackOk = (body: Record<string, unknown>) =>
  mockOk({
    ok: true,
    access_token: "xoxb-test",
    bot_user_id: "U01TESTBOT",
    app_id: "A01TESTAPP",
    scope: "chat:write,chat:write.public,channels:read,groups:read,team:read,app_mentions:read",
    team: { id: "T01TEST", name: "Test Workspace" },
    authed_user: { id: "U01INSTALLER" },
    ...body,
  })

describe("buildSlackAuthorizeUrl", () => {
  it("encodes the v1 bot scope set into the URL query string", () => {
    const url = buildSlackAuthorizeUrl({
      clientId: "cid-123",
      redirectUri: "http://localhost:3000/integrations/slack/oauth/callback",
      state: "state-abc",
    })

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
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const baseInput = {
    code: "code-abc",
    redirectUri: "http://localhost:3000/integrations/slack/oauth/callback",
    clientId: "cid",
    clientSecret: "csec",
  } as const

  it("parses a complete successful response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockSlackOk({}) as unknown as Response)

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
  })

  it("captures refresh_token + expires_in when token rotation is enabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockSlackOk({ refresh_token: "xoxe-1-refresh", expires_in: 43200 }) as unknown as Response,
    )

    const result = await Effect.runPromise(exchangeOAuthCode(baseInput))
    expect(result.refreshToken).toBe("xoxe-1-refresh")
    expect(result.expiresIn).toBe(43200)
  })

  it("maps Slack's `ok: false` body to SlackOAuthError with the Slack error code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockOk({ ok: false, error: "invalid_code" }) as unknown as Response,
    )

    const err = await failure(exchangeOAuthCode(baseInput))
    expect(err.slackError).toBe("invalid_code")
  })

  it("treats a partial response (no team) as incomplete", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockOk({ ok: true, access_token: "xoxb-only" }) as unknown as Response,
    )

    const err = await failure(exchangeOAuthCode(baseInput))
    expect(err.slackError).toBe("incomplete_response")
  })

  it("wraps transport-level failures (network)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"))

    const err = await failure(exchangeOAuthCode(baseInput))
    expect(err.slackError).toBeUndefined()
    expect(err.cause).toBeInstanceOf(Error)
  })
})
