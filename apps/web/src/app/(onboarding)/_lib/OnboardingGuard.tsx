'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { ROUTES } from '$/services/routes'

export default function OnboardingGuard({
  children,
  isOnboardingCompleted,
}: {
  children: ReactNode
  isOnboardingCompleted: boolean
}) {
  const router = useRouter()
  const { value: isReplaying } = useLocalStorage<boolean>({
    key: AppLocalStorage.replayOnboarding,
    defaultValue: false,
  })
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (isOnboardingCompleted && !isReplaying) {
      router.replace(ROUTES.dashboard.root)
    } else {
      setIsReady(true)
    }
  }, [isOnboardingCompleted, isReplaying, router])

  if (!isReady) {
    return null
  }

  return <>{children}</>
}
