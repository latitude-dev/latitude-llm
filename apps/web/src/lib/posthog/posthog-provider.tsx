import { useMountEffect } from "@repo/ui"
import { useEffect } from "react"
import { initPostHog, syncPostHogSession } from "./posthog-client.ts"

export function PostHogProvider() {
  useMountEffect(() => {
    void initPostHog()
  })
  return null
}

interface PostHogIdentityProps {
  readonly userId: string
  readonly userEmail: string
  readonly userName?: string | null | undefined
  readonly organizationId: string
  readonly organizationName?: string | null | undefined
  readonly excludeFromAnalytics: boolean
}

export function PostHogIdentity({
  userId,
  userEmail,
  userName,
  organizationId,
  organizationName,
  excludeFromAnalytics,
}: PostHogIdentityProps) {
  useEffect(() => {
    void syncPostHogSession({
      user: {
        id: userId,
        email: userEmail,
        ...(userName != null ? { name: userName } : {}),
      },
      organizationId,
      organizationName,
      excludeFromAnalytics,
    })
  }, [userId, userEmail, userName, organizationId, organizationName, excludeFromAnalytics])

  return null
}
