import { useLocalStorage } from "@repo/ui"
import { useCallback } from "react"
import { setThemePreference } from "../domains/theme/theme.functions.ts"
import { DEFAULT_THEME, isTheme, THEME_STORAGE_KEY, type Theme } from "./theme-preference.ts"

function useStoredTheme(initialTheme = DEFAULT_THEME) {
  return useLocalStorage<Theme>({
    key: THEME_STORAGE_KEY,
    defaultValue: initialTheme,
  })
}

export function useThemePreference(initialTheme = DEFAULT_THEME): {
  readonly theme: Theme
  readonly setTheme: (theme: Theme) => void
} {
  const { value, setValue } = useStoredTheme(initialTheme)

  const theme = isTheme(value) ? value : initialTheme

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      setValue(nextTheme)
      void setThemePreference({ data: nextTheme })
    },
    [setValue],
  )

  return {
    theme,
    setTheme,
  }
}
