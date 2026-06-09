import { describe, expect, it } from "vitest"
import { type BetterAuthConfig, createBetterAuth } from "./create-better-auth.ts"

const createAuthForTest = (overrides: Partial<BetterAuthConfig> = {}) =>
  createBetterAuth({
    client: { db: {} } as never,
    baseUrl: "http://localhost:3000",
    secret: "test-secret-with-at-least-32-characters",
    googleClientId: "google-client-id",
    googleClientSecret: "google-client-secret",
    githubClientId: "github-client-id",
    githubClientSecret: "github-client-secret",
    sendMagicLink: async () => {},
    sendInvitationEmail: async () => {},
    ...overrides,
  })

describe("createBetterAuth", () => {
  it("hardens OAuth account linking and state validation", async () => {
    const auth = createAuthForTest()

    expect(auth.options.account).toMatchObject({
      storeStateStrategy: "database",
      skipStateCookieCheck: false,
      accountLinking: {
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        updateUserInfoOnLink: false,
      },
    })
  })

  it("does not let OAuth sign-in overwrite local user profile fields", async () => {
    const auth = createAuthForTest()

    const googleProvider = auth.options.socialProviders.google
    if (!googleProvider) throw new Error("Google provider should be configured")

    const google = await googleProvider()

    expect(google).not.toHaveProperty("overrideUserInfoOnSignIn")
    expect(auth.options.socialProviders.github).not.toHaveProperty("overrideUserInfoOnSignIn")
  })

  it("blocks the SSO provider mutation endpoints at the HTTP router", () => {
    const auth = createAuthForTest()

    // `disabledPaths` only 404s the router — `auth.api.*` calls still work,
    // which is what the web SSO server fns rely on.
    expect(auth.options.disabledPaths).toEqual(
      expect.arrayContaining([
        "/sso/register",
        "/sso/update-provider",
        "/sso/delete-provider",
        "/sso/request-domain-verification",
        "/sso/verify-domain",
      ]),
    )
    expect(typeof auth.api.registerSSOProvider).toBe("function")
  })

  describe("SSO enforcement (session.create.before hook)", () => {
    const ENFORCED_EMAIL = "jane@enforced.com"

    const runHook = async (params: {
      path: string
      isSsoEnforcedForEmail?: (email: string) => Promise<boolean>
      email?: string
    }) => {
      const auth = createAuthForTest(
        params.isSsoEnforcedForEmail ? { isSsoEnforcedForEmail: params.isSsoEnforcedForEmail } : {},
      )
      const hook = auth.options.databaseHooks?.session?.create?.before
      if (!hook) throw new Error("session.create.before hook should be configured")

      const session = { userId: "user-1" } as never
      const ctx = {
        path: params.path,
        context: {
          internalAdapter: {
            findUserById: async () => ({ email: params.email ?? ENFORCED_EMAIL }),
          },
        },
      } as never

      return await hook(session, ctx)
    }

    const enforced = async (email: string) => email === ENFORCED_EMAIL

    it("rejects social OAuth callback sessions for enforced domains", async () => {
      await expect(runHook({ path: "/callback/google", isSsoEnforcedForEmail: enforced })).rejects.toThrow(
        "Your organization requires SSO sign-in",
      )
    })

    it("rejects magic-link verification sessions for enforced domains", async () => {
      await expect(runHook({ path: "/magic-link/verify", isSsoEnforcedForEmail: enforced })).rejects.toThrow(
        "Your organization requires SSO sign-in",
      )
    })

    it("lets SSO callback sessions through untouched", async () => {
      await expect(
        runHook({ path: "/sso/saml2/callback/enforced-com", isSsoEnforcedForEmail: enforced }),
      ).resolves.toBeTruthy()
      await expect(
        runHook({ path: "/sso/callback/enforced-com", isSsoEnforcedForEmail: enforced }),
      ).resolves.toBeTruthy()
    })

    it("lets non-enforced emails through on enforced paths", async () => {
      await expect(
        runHook({ path: "/callback/google", isSsoEnforcedForEmail: enforced, email: "jane@personal.com" }),
      ).resolves.toBeTruthy()
    })

    it("is a no-op when the predicate is not configured", async () => {
      await expect(runHook({ path: "/callback/google" })).resolves.toBeTruthy()
    })
  })
})
