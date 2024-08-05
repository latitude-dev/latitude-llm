import { CurrentTheme } from '$ui/constants'
import { useTheme } from 'next-themes'

export function useCurrentTheme() {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme as CurrentTheme

  return theme
}
