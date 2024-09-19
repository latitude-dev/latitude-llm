'use client'

import { ReactNode, useEffect } from 'react'

import { User, Workspace } from '@latitude-data/core/browser'
import { envClient } from '$/envClient'
import posthog from 'posthog-js'
import { PostHogProvider, usePostHog } from 'posthog-js/react'

if (typeof window !== 'undefined') {
  posthog.init(envClient.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: envClient.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
  })
}
export function CSPostHogProvider({ children }: { children: ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}

export function IdentifyUser({
  user,
  workspace,
  children,
}: {
  user: User
  workspace: Workspace
  children: ReactNode
}) {
  const posthog = usePostHog()

  useEffect(() => {
    if (user) {
      posthog?.identify(user.id, {
        email: user.email,
      })
      posthog?.group('workspace', String(workspace.id))
    }
  }, [posthog, user.id, user.email, workspace.id])

  return children
}
