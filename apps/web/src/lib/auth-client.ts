import { ssoClient } from "@better-auth/sso/client"
import { createAuthClient } from "better-auth/client"
import { magicLinkClient, organizationClient } from "better-auth/client/plugins"
import { AUTH_BASE_PATH, WEB_BASE_URL } from "./auth-config.ts"

// `ssoClient` is only used for `authClient.signIn.sso(...)` redirects —
// provider registration/mutation goes through server fns (the HTTP mutation
// endpoints are in `disabledPaths`, see `createBetterAuth`).
export const authClient = createAuthClient({
  baseURL: WEB_BASE_URL,
  basePath: AUTH_BASE_PATH,
  plugins: [magicLinkClient(), organizationClient(), ssoClient()],
})
