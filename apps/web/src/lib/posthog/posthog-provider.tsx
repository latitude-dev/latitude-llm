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
  readonly organizationSlug?: string | null | undefined
  readonly organizationPlan?: string | null | undefined
  readonly excludeFromAnalytics: boolean
}

export function PostHogIdentity({
  userId,
  userEmail,
  userName,
  organizationId,
  organizationName,
  organizationSlug,
  organizationPlan,
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
      organizationSlug,
      organizationPlan,
      excludeFromAnalytics,
    })
    // `organizationPlan` resolves asynchronously from the billing query; when it
    // arrives the effect re-runs and group() is updated (idempotent).
  }, [
    userId,
    userEmail,
    userName,
    organizationId,
    organizationName,
    organizationSlug,
    organizationPlan,
    excludeFromAnalytics,
  ])

  return null
}
