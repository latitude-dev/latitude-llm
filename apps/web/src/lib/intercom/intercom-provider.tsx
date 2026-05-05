import { Intercom, shutdown } from "@intercom/messenger-js-sdk"
import { useMountEffect } from "@repo/ui"
import { type ReactNode, useEffect } from "react"
import type { SupportUserIdentity } from "../../domains/support/support.functions.ts"

interface IntercomProviderProps {
  readonly identity: SupportUserIdentity | null
  readonly children: ReactNode
  readonly floatingButton?: "left" | "right" | "none"
}

/**
 * The Intercom Messenger SDK loader inserts its widget script before
 * `document.getElementsByTagName("script")[0]`. In TanStack Start dev the
 * live collection can be empty when our effect fires (Vite places module
 * preloads in <head> in a way that yields no matches), so we seed an inert
 * placeholder script in <head> before booting — the loader then has an
 * anchor to insert before and works as designed.
 */
export function IntercomProvider({ identity, children, floatingButton = "right" }: IntercomProviderProps) {
  // Re-run on identity changes so name/email edits in Settings propagate to
  // the Messenger. Subsequent calls take the SDK's `update` path (no full
  // re-init); first call boots the widget.
  useEffect(() => {
    if (!identity) return

    if (document.getElementsByTagName("script").length === 0) {
      const anchor = document.createElement("script")
      anchor.type = "application/json"
      document.head.appendChild(anchor)
    }

    Intercom({
      app_id: identity.appId,
      user_id: identity.identifier,
      user_hash: identity.userHash,
      name: identity.userData.name,
      email: identity.userData.email,
      created_at: identity.userData.createdAt,
      hide_default_launcher: floatingButton === "none",
      alignment: floatingButton,
    })
  }, [identity, floatingButton])

  // Shutdown only when the provider itself unmounts (sign-out, route teardown).
  // Without this, the Messenger keeps the previous user's session attached to
  // `document.body` after `authClient.signOut()` until a hard refresh.
  useMountEffect(() => () => {
    shutdown()
  })

  return <>{children}</>
}
