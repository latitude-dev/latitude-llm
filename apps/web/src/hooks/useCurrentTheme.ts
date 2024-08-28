import { CurrentTheme } from '@latitude-data/web-ui/browser'
import { useTheme } from 'next-themes'

export function useCurrentTheme() {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme as CurrentTheme

  return theme
}
