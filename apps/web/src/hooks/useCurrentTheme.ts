'use client'

import { AppLocalStorage, useLocalStorage } from '@latitude-data/web-ui/hooks/useLocalStorage'
import type { CurrentTheme } from '@latitude-data/web-ui/browser'
import { useTheme } from 'next-themes'

export function useCurrentTheme() {
  const { resolvedTheme } = useTheme()
  const { value: theme } = useLocalStorage<CurrentTheme>({
    key: AppLocalStorage.colorTheme,
    defaultValue: resolvedTheme as CurrentTheme,
  })

  return theme
}
