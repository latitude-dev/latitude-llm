import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Icon, Text, useMountEffect } from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"
import { useEffect, useRef, useState } from "react"

function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!match) return ""
  const r = Number.parseInt(match[1], 10)
  const g = Number.parseInt(match[2], 10)
  const b = Number.parseInt(match[3], 10)
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0")
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase()
}

const COLOR_GROUPS: { title: string; colors: { token: string; label: string; fgToken?: string }[] }[] = [
  {
    title: "Core",
    colors: [
      { token: "background", label: "background" },
      { token: "foreground", label: "foreground", fgToken: "background" },
      { token: "background-gray", label: "background-gray" },
      { token: "background-code", label: "background-code" },
      { token: "border", label: "border" },
      { token: "input", label: "input" },
      { token: "ring", label: "ring" },
    ],
  },
  {
    title: "Primary",
    colors: [
      { token: "primary", label: "primary", fgToken: "primary-foreground" },
      { token: "primary-foreground", label: "primary-foreground", fgToken: "primary" },
      { token: "primary-muted", label: "primary-muted" },
      { token: "primary-muted-hover", label: "primary-muted-hover" },
    ],
  },
  {
    title: "Secondary",
    colors: [
      { token: "secondary", label: "secondary", fgToken: "secondary-foreground" },
      { token: "secondary-foreground", label: "secondary-foreground", fgToken: "secondary" },
    ],
  },
  {
    title: "Accent",
    colors: [
      { token: "accent", label: "accent", fgToken: "accent-foreground" },
      { token: "accent-button", label: "accent-button", fgToken: "primary-foreground" },
      { token: "accent-foreground", label: "accent-foreground", fgToken: "accent" },
    ],
  },
  {
    title: "Muted",
    colors: [
      { token: "muted", label: "muted" },
      { token: "muted-foreground", label: "muted-foreground", fgToken: "muted" },
    ],
  },
  {
    title: "Destructive",
    colors: [
      { token: "destructive", label: "destructive", fgToken: "destructive-foreground" },
      { token: "destructive-foreground", label: "destructive-foreground", fgToken: "destructive" },
      { token: "destructive-muted", label: "destructive-muted" },
      { token: "destructive-muted-foreground", label: "destructive-muted-foreground", fgToken: "destructive-muted" },
    ],
  },
  {
    title: "Success",
    colors: [
      { token: "success", label: "success", fgToken: "success-foreground" },
      { token: "success-foreground", label: "success-foreground", fgToken: "success" },
      { token: "success-muted", label: "success-muted" },
      { token: "success-muted-foreground", label: "success-muted-foreground", fgToken: "success-muted" },
    ],
  },
  {
    title: "Warning",
    colors: [
      { token: "warning-muted", label: "warning-muted" },
      { token: "warning-muted-foreground", label: "warning-muted-foreground", fgToken: "warning-muted" },
    ],
  },
  {
    title: "Surfaces",
    colors: [
      { token: "card", label: "card", fgToken: "card-foreground" },
      { token: "card-foreground", label: "card-foreground", fgToken: "card" },
      { token: "popover", label: "popover", fgToken: "popover-foreground" },
      { token: "popover-foreground", label: "popover-foreground", fgToken: "popover" },
    ],
  },
  {
    title: "Brand & special",
    colors: [
      { token: "purple", label: "purple" },
      { token: "purple-foreground", label: "purple-foreground", fgToken: "purple" },
      { token: "yellow", label: "yellow" },
    ],
  },
  {
    title: "Charts",
    colors: [
      { token: "chart-1", label: "chart-1" },
      { token: "chart-2", label: "chart-2" },
      { token: "chart-3", label: "chart-3" },
      { token: "chart-4", label: "chart-4" },
      { token: "chart-5", label: "chart-5" },
    ],
  },
]

export const Route = createFileRoute("/design-system/colors")({
  component: ColorsPage,
})

function ColorsPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [hexByToken, setHexByToken] = useState<Record<string, string>>({})
  const swatchesRef = useRef<HTMLDivElement>(null)
  const surfaceClass = theme === "dark" ? "bg-black" : "bg-white"

  useEffect(() => {
    if (!swatchesRef.current) return
    const swatches = swatchesRef.current.querySelectorAll<HTMLDivElement>("[data-color-swatch]")
    const next: Record<string, string> = {}
    for (const el of swatches) {
      const token = el.getAttribute("data-token")
      if (token) {
        const bg = window.getComputedStyle(el).backgroundColor
        next[token] = rgbToHex(bg)
      }
    }
    setHexByToken((prev) => (Object.keys(next).length > 0 ? { ...prev, ...next } : prev))
  }, [theme])

  const applyTheme = (nextTheme: "light" | "dark") => {
    const root = document.documentElement
    root.classList.toggle("dark", nextTheme === "dark")
    root.style.colorScheme = nextTheme
  }

  const restoreHostTheme = () => {
    const root = document.documentElement
    const hostTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    root.classList.toggle("dark", hostTheme === "dark")
    root.style.colorScheme = hostTheme
  }

  useMountEffect(() => {
    applyTheme(theme)
    return () => {
      restoreHostTheme()
    }
  })

  return (
    <main className={`flex min-h-screen flex-col gap-6 p-4 text-foreground sm:p-6 lg:p-8 ${surfaceClass}`}>
      <div className="flex w-full max-w-6xl flex-col gap-6 self-center">
        <header
          className={`flex flex-col gap-4 rounded-2xl border border-border/70 p-5 shadow-xl sm:p-6 ${surfaceClass}`}
        >
          <Link
            to="/design-system"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <span aria-hidden="true">←</span>
            Design system
          </Link>
          <div className="flex flex-col gap-2">
            <Text.H6 color="accentForeground" weight="semibold">
              Tokens
            </Text.H6>
            <Text.H2 className="text-balance">Colors</Text.H2>
          </div>
          <Text.H6 color="foregroundMuted">
            All design system colors from <Text.Mono size="h6">@repo/ui</Text.Mono> and theme CSS variables. Toggle
            theme to see light/dark values.
          </Text.H6>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setTheme((t) => {
                  const next = t === "light" ? "dark" : "light"
                  applyTheme(next)
                  return next
                })
              }}
            >
              <Icon icon={theme === "light" ? Moon : Sun} size="sm" />
              {theme === "light" ? "Switch to dark" : "Switch to light"}
            </Button>
            <div className={`flex items-center gap-2 rounded-lg border border-border/60 p-2 ${surfaceClass}`}>
              <Text.H6 color="foregroundMuted">Theme</Text.H6>
              <Text.Mono>{theme}</Text.Mono>
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-8" ref={swatchesRef}>
          {COLOR_GROUPS.map((group) => (
            <Card key={group.title} className={`overflow-hidden border-border/70 shadow-xl ${surfaceClass}`}>
              <CardHeader>
                <CardTitle>
                  <Text.H4>{group.title}</Text.H4>
                </CardTitle>
                <CardDescription>
                  <Text.H6 color="foregroundMuted">CSS variables and Tailwind tokens</Text.H6>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {group.colors.map(({ token, label, fgToken }) => {
                    const bgStyle = { backgroundColor: `hsl(var(--${token}))` }
                    const fgStyle = fgToken ? { color: `hsl(var(--${fgToken}))` } : { color: "hsl(var(--foreground))" }
                    const hex = hexByToken[token]
                    return (
                      <div
                        key={token}
                        className="flex flex-col gap-2 rounded-lg border border-border/60 overflow-hidden"
                      >
                        <div
                          className="h-16 w-full border-0 flex items-end"
                          style={bgStyle}
                          data-color-swatch
                          data-token={token}
                        >
                          <span className="inline-block p-2 text-xs font-medium" style={fgStyle}>
                            {label}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 px-2 pb-2">
                          <Text.Mono size="h6">{token}</Text.Mono>
                          <Text.H6 color="foregroundMuted" className="text-xs">
                            --{token}
                          </Text.H6>
                          {hex && (
                            <Text.Mono size="h6" weight="semibold">
                              {hex}
                            </Text.Mono>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}
