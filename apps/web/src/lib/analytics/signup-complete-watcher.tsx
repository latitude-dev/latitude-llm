import { useRouterState } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { getSession } from "../../domains/sessions/session.functions.ts"
import { pushSignupComplete, type SignupMethod, TRACKING_PARAM_KEYS } from "./gtm.ts"

const SUPPORTED_METHODS: ReadonlySet<string> = new Set(["email", "google", "github"])

const splitName = (name?: string | null): { first_name?: string; last_name?: string } => {
  if (!name) return {}
  const trimmed = name.trim()
  if (!trimmed) return {}
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { first_name: parts[0] }
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") }
}

export function SignupCompleteWatcher() {
  const locationKey = useRouterState({
    select: (state) => `${state.location.pathname}?${JSON.stringify(state.location.search)}`,
  })
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    const signup = params.get("signup")
    if (!signup || !SUPPORTED_METHODS.has(signup)) return

    handledRef.current = true
    void (async () => {
      try {
        const session = await getSession()
        if (!session?.user?.email) return

        pushSignupComplete({
          signup_method: signup as SignupMethod,
          user_data: {
            email: session.user.email,
            ...splitName(session.user.name),
          },
        })
      } finally {
        const cleaned = new URLSearchParams(window.location.search)
        cleaned.delete("signup")
        for (const key of TRACKING_PARAM_KEYS) cleaned.delete(key)
        const cleanedQuery = cleaned.toString()
        const newUrl = `${window.location.pathname}${cleanedQuery ? `?${cleanedQuery}` : ""}${window.location.hash}`
        window.history.replaceState(window.history.state, "", newUrl)
      }
    })()
  }, [locationKey])

  return null
}
