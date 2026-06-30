import { ssoClient } from "@better-auth/sso/client"
import { magicLinkClient, organizationClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { AUTH_BASE_PATH } from "./auth-config.ts"

// No `baseURL`: Better Auth's client resolves `window.location.origin` in the
// browser and a relative `/api/auth` under SSR, so the client is origin-neutral
// and one build serves any deployment domain.
//
// `ssoClient` is only used for `authClient.signIn.sso(...)` redirects —
// provider registration/mutation goes through server fns (the HTTP mutation
// endpoints are in `disabledPaths`, see `createBetterAuth`).
export const authClient = createAuthClient({
  basePath: AUTH_BASE_PATH,
  plugins: [magicLinkClient(), organizationClient(), ssoClient()],
})
