export const THEME_STORAGE_KEY = "theme"
export const THEME_COOKIE_NAME = "latitude-theme"
export const DEFAULT_THEME: Theme = "light"

export type Theme = "light" | "dark"

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark"
}
