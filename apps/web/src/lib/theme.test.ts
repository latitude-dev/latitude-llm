// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  applyTheme,
  createThemeInitializationScript,
  getDocumentTheme,
  getStoredTheme,
  HOST_THEME_MEDIA_QUERY,
  resolveTheme,
  setThemePreference,
  THEME_CHANGE_EVENT_NAME,
  THEME_STORAGE_KEY,
} from "./theme.ts"

function setSystemTheme(theme: "light" | "dark") {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === HOST_THEME_MEDIA_QUERY ? theme === "dark" : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

beforeEach(() => {
  document.documentElement.className = ""
  document.documentElement.style.colorScheme = ""
  window.localStorage.removeItem(THEME_STORAGE_KEY)
  vi.unstubAllGlobals()
  setSystemTheme("light")
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("theme helpers", () => {
  it("stores and applies an explicit theme preference", () => {
    const receivedThemes: string[] = []
    const onThemeChange = (event: Event) => {
      receivedThemes.push((event as CustomEvent<string>).detail)
    }

    window.addEventListener(THEME_CHANGE_EVENT_NAME, onThemeChange)

    setThemePreference("dark")

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
    expect(getStoredTheme()).toBe("dark")
    expect(getDocumentTheme()).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe("dark")
    expect(receivedThemes).toEqual(["dark"])

    window.removeEventListener(THEME_CHANGE_EVENT_NAME, onThemeChange)
  })

  it("falls back to the system theme when no preference is stored", () => {
    setSystemTheme("dark")

    expect(getStoredTheme()).toBeNull()
    expect(resolveTheme()).toBe("dark")
  })

  it("updates the document theme without touching local storage", () => {
    applyTheme("light")

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(getDocumentTheme()).toBe("light")

    applyTheme("dark")

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(getDocumentTheme()).toBe("dark")
  })

  it("initialization script applies a stored preference before hydration", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark")
    setSystemTheme("light")

    const execute = new Function(createThemeInitializationScript())
    execute()

    expect(getDocumentTheme()).toBe("dark")
    expect(document.documentElement.style.colorScheme).toBe("dark")
  })

  it("initialization script falls back to the system theme when nothing is stored", () => {
    setSystemTheme("dark")

    const execute = new Function(createThemeInitializationScript())
    execute()

    expect(getDocumentTheme()).toBe("dark")
    expect(document.documentElement.style.colorScheme).toBe("dark")
  })
})
