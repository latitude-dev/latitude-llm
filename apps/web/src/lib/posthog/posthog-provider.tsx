import { useMountEffect } from "@repo/ui"
import { identifyOrganization, identifyUser, initPostHog, resetPostHog } from "./posthog-client.ts"

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
}

export function PostHogIdentity({
  userId,
  userEmail,
  userName,
  organizationId,
  organizationName,
}: PostHogIdentityProps) {
  useMountEffect(() => {
    void (async () => {
      await resetPostHog()
      await identifyUser({
        id: userId,
        email: userEmail,
        ...(userName != null ? { name: userName } : {}),
      })
      await identifyOrganization({
        id: organizationId,
        ...(organizationName != null ? { name: organizationName } : {}),
      })
    })()
  })
  return null
}
