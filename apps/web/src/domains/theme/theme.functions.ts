import { createServerFn } from "@tanstack/react-start"
import { getCookies, setCookie } from "@tanstack/react-start/server"
import { DEFAULT_THEME, isTheme, THEME_COOKIE_NAME, type Theme } from "../../lib/theme-preference.ts"

export const getThemePreference = createServerFn({ method: "GET" }).handler(async (): Promise<Theme> => {
  const cookies = getCookies()
  const theme = cookies[THEME_COOKIE_NAME]

  return isTheme(theme) ? theme : DEFAULT_THEME
})

export const setThemePreference = createServerFn({ method: "POST" })
  .inputValidator((value: unknown): Theme => {
    if (!isTheme(value)) {
      throw new Error("Invalid theme preference")
    }

    return value
  })
  .handler(async ({ data }): Promise<void> => {
    setCookie(THEME_COOKIE_NAME, data, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    })
  })
