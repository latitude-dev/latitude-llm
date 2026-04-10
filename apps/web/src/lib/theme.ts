export const THEME_STORAGE_KEY = "latitude-theme"
export const THEME_CHANGE_EVENT_NAME = "latitude-theme-change"
export const HOST_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)"

export type Theme = "light" | "dark"

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark"
}

export function getDocumentTheme(): Theme {
  if (typeof document === "undefined") {
    return "light"
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(storedTheme) ? storedTheme : null
  } catch {
    return null
  }
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") {
    return "light"
  }

  return window.matchMedia(HOST_THEME_MEDIA_QUERY).matches ? "dark" : "light"
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme()
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") {
    return
  }

  const root = document.documentElement
  const isDark = theme === "dark"

  root.classList.toggle("dark", isDark)
  root.style.colorScheme = theme

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT_NAME, { detail: theme }))
  }
}

export function setThemePreference(theme: Theme) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Ignore storage errors so theme toggling still works in-memory.
    }
  }

  applyTheme(theme)
}

export function createThemeInitializationScript() {
  const storageKey = JSON.stringify(THEME_STORAGE_KEY)
  const themeChangeEventName = JSON.stringify(THEME_CHANGE_EVENT_NAME)
  const mediaQuery = JSON.stringify(HOST_THEME_MEDIA_QUERY)

  return `(() => {
  const isTheme = (value) => value === "light" || value === "dark";
  const applyTheme = (theme) => {
    const root = document.documentElement;
    const isDark = theme === "dark";
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = theme;
    window.dispatchEvent(new CustomEvent(${themeChangeEventName}, { detail: theme }));
  };

  try {
    const storedTheme = window.localStorage.getItem(${storageKey});
    if (isTheme(storedTheme)) {
      applyTheme(storedTheme);
      return;
    }
  } catch {}

  const systemTheme = window.matchMedia(${mediaQuery}).matches ? "dark" : "light";
  applyTheme(systemTheme);
})();`
}
