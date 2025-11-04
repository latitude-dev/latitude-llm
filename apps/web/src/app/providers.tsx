'use client'

import { ReactNode, useEffect } from 'react'
import { envClient } from '$/envClient'
import posthog from 'posthog-js'
import { PostHogProvider, usePostHog } from 'posthog-js/react'

import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { SubscriptionPlanContent } from '@latitude-data/core/plans'
if (
  typeof window !== 'undefined' &&
  envClient.NEXT_PUBLIC_POSTHOG_KEY &&
  envClient.NEXT_PUBLIC_POSTHOG_HOST
) {
  posthog.init(envClient.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: envClient.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
    disable_session_recording: true,
  })
}
export function CSPostHogProvider({ children }: { children: ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}

export function IdentifyUser({
  user,
  workspace,
  subscription,
  children,
}: {
  user: User
  workspace: Workspace
  subscription: SubscriptionPlanContent
  children: ReactNode
}) {
  const posthog = usePostHog()

  const email = user?.email
  const title = user?.title
  const plan = subscription?.plan

  useEffect(() => {
    if (!posthog || !email) return

    try {
      const isStaff = !!email.match(/@latitude\.so$/)

      if (isStaff) return

      posthog.identify(email, {
        email: email,
        title: title,
        subscriptionPlan: plan,
      })
      posthog.group('workspace', String(workspace.id))
      posthog.startSessionRecording()
    } catch (_) {
      // do nothing, just to avoid crashing the app
    }
  }, [posthog, email, workspace.id, title, plan])

  return children
}
