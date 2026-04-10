import { useLocalStorage } from "@repo/ui"
import { useCallback, useSyncExternalStore } from "react"

const THEME_STORAGE_KEY = "theme"
const HOST_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)"
const DEFAULT_THEME: Theme = "light"

type Theme = "light" | "dark"

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark"
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME
  }

  return window.matchMedia(HOST_THEME_MEDIA_QUERY).matches ? "dark" : "light"
}

function subscribeToSystemTheme(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const media = window.matchMedia(HOST_THEME_MEDIA_QUERY)
  media.addEventListener("change", onStoreChange)

  return () => {
    media.removeEventListener("change", onStoreChange)
  }
}

function useSystemTheme(): Theme {
  return useSyncExternalStore(subscribeToSystemTheme, getSystemTheme, () => DEFAULT_THEME)
}

export function useThemePreference(): {
  readonly theme: Theme
  readonly setTheme: (theme: Theme) => void
} {
  const { value, setValue } = useLocalStorage<Theme | null>({
    key: THEME_STORAGE_KEY,
    defaultValue: null,
  })
  const systemTheme = useSystemTheme()
  const storedTheme = isTheme(value) ? value : null

  const setTheme = useCallback(
    (theme: Theme) => {
      setValue(theme)
    },
    [setValue],
  )

  const theme: Theme = storedTheme ?? systemTheme

  return {
    theme,
    setTheme,
  }
}
