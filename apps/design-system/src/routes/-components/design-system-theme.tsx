import { Button, Icon, useMountEffect } from "@repo/ui"
import { Moon, Sun } from "lucide-react"
import { createContext, type ReactNode, useContext, useState } from "react"

type DesignSystemTheme = "light" | "dark"

type DesignSystemThemeContextValue = {
  theme: DesignSystemTheme
  setTheme: (theme: DesignSystemTheme) => void
  toggleTheme: () => void
  surfaceClass: string
}

const DesignSystemThemeContext = createContext<DesignSystemThemeContextValue | null>(null)

function applyTheme(nextTheme: DesignSystemTheme) {
  const root = document.documentElement
  root.classList.toggle("dark", nextTheme === "dark")
  root.style.colorScheme = nextTheme
}

function restoreHostTheme() {
  const root = document.documentElement
  const hostTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  root.classList.toggle("dark", hostTheme === "dark")
  root.style.colorScheme = hostTheme
}

export function DesignSystemThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<DesignSystemTheme>("light")

  useMountEffect(() => {
    applyTheme(theme)
    return () => {
      restoreHostTheme()
    }
  })

  const setTheme = (nextTheme: DesignSystemTheme) => {
    applyTheme(nextTheme)
    setThemeState(nextTheme)
  }

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light")
  }

  const value: DesignSystemThemeContextValue = {
    theme,
    setTheme,
    toggleTheme,
    surfaceClass: theme === "dark" ? "bg-black" : "bg-white",
  }

  return <DesignSystemThemeContext.Provider value={value}>{children}</DesignSystemThemeContext.Provider>
}

export function useDesignSystemTheme() {
  const context = useContext(DesignSystemThemeContext)
  if (!context) {
    throw new Error("useDesignSystemTheme must be used within DesignSystemThemeProvider")
  }
  return context
}

export function DesignSystemThemeToggle() {
  const { theme, toggleTheme } = useDesignSystemTheme()

  return (
    <Button variant="outline" size="icon" onClick={toggleTheme} className="h-8 w-8 shrink-0" aria-label="Toggle theme">
      <Icon icon={theme === "light" ? Moon : Sun} size="sm" color="foregroundMuted" />
    </Button>
  )
}
