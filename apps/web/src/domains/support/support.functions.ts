import crypto from "node:crypto"
import { parseEnvOptional } from "@platform/env"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { getBetterAuth } from "../../server/clients.ts"

/**
 * Intercom Identity Verification payload. The HMAC is computed server-side
 * with `LAT_SUPPORT_APP_SECRET_KEY` so the browser cannot forge another
 * user's identity to the Intercom widget.
 *
 * See https://www.intercom.com/help/en/articles/183-set-up-identity-verification-for-web-and-mobile.
 */
export interface SupportUserIdentity {
  readonly appId: string
  readonly userHash: string
  readonly identifier: string
  readonly userData: {
    readonly email: string
    readonly name: string
    readonly id: string
    readonly createdAt: number
  }
}

const toUnixTimestampInSeconds = (date: Date): number => Math.floor(date.getTime() / 1000)

// Infra seeds optional secrets with this sentinel string (see infra/lib/secrets.ts).
// Treat it as "not configured" so deployments that haven't set the real Intercom
// credentials yet don't try to boot the widget against a non-existent workspace.
const PLACEHOLDER_SECRET = "placeholder-change-me"
const isConfigured = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0 && value !== PLACEHOLDER_SECRET

/**
 * Build the Intercom identity payload for the current user. Returns `null`
 * when either credential is unset (local dev / self-hosted) so the caller
 * can simply skip booting the widget.
 */
export const getSupportUserIdentity = createServerFn({ method: "GET" }).handler(
  async (): Promise<SupportUserIdentity | null> => {
    const appId = Effect.runSync(parseEnvOptional("LAT_V2_SUPPORT_APP_ID", "string"))
    const secretKey = Effect.runSync(parseEnvOptional("LAT_V2_SUPPORT_APP_SECRET_KEY", "string"))
    if (!isConfigured(appId) || !isConfigured(secretKey)) return null

    const headers = getRequestHeaders()
    const session = await getBetterAuth().api.getSession({ headers })
    if (!session) return null

    const { user } = session
    // HMAC the immutable database id, not the email. Users can rename their
    // email (see backoffice/-components/account-actions/change-email.tsx),
    // and using email as user_id would split a single account into separate
    // Intercom contacts on every rename.
    const userHash = crypto.createHmac("sha256", secretKey).update(user.id).digest("hex")

    return {
      appId,
      userHash,
      identifier: user.id,
      userData: {
        email: user.email,
        name: user.name?.trim() ? user.name : "No name",
        id: user.id,
        createdAt: toUnixTimestampInSeconds(new Date(user.createdAt)),
      },
    }
  },
)
