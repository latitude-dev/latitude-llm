import { createAuthClient } from "better-auth/client"
import { magicLinkClient, organizationClient, stripeClient } from "better-auth/client/plugins"
import { AUTH_BASE_PATH, WEB_BASE_URL } from "./auth-config.ts"

export const authClient = createAuthClient({
  baseURL: WEB_BASE_URL,
  basePath: AUTH_BASE_PATH,
  plugins: [magicLinkClient(), organizationClient(), stripeClient()],
})
