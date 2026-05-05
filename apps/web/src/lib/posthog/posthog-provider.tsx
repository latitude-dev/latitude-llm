import { useMountEffect } from "@repo/ui"
import { useEffect } from "react"
import { identifyOrganization, identifyUser, initPostHog } from "./posthog-client.ts"

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
    void identifyUser({
      id: userId,
      email: userEmail,
      ...(userName != null ? { name: userName } : {}),
    })
  })

  useEffect(() => {
    if (!organizationName) return
    void identifyOrganization({ id: organizationId, name: organizationName })
  }, [organizationId, organizationName])

  return null
}
