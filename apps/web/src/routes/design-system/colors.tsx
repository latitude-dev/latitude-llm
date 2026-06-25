import { Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { useDesignSystemTheme } from "./-components/design-system-theme.tsx"
import { TypographySection } from "./-components/typography-table.tsx"
import { UsageCode, UsageSection } from "./-components/usage-section.tsx"

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
      { token: "secondary-muted", label: "secondary-muted" },
      { token: "secondary-muted-hover", label: "secondary-muted-hover" },
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
      { token: "destructive-muted-hover", label: "destructive-muted-hover" },
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
      { token: "phrase", label: "phrase" },
      { token: "phrase-foreground", label: "phrase-foreground", fgToken: "phrase" },
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
  const { theme } = useDesignSystemTheme()
  const [hexByToken, setHexByToken] = useState<Record<string, string>>({})
  const swatchesRef = useRef<HTMLDivElement>(null)

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

  return (
    <DesignSystemPage
      eyebrow="Product"
      title="Colors"
      description="All design system colors from @repo/ui and theme CSS variables. Toggle theme in the sidebar to compare light and dark values."
      wide
    >
      <UsageSection description="Semantic colors are CSS variables on :root. Reference them with hsl(var(--token)) or the matching Tailwind utility classes.">
        <UsageCode
          lines={[
            '<div className="bg-background text-foreground border-border" />',
            "",
            '<div style={{ backgroundColor: "hsl(var(--primary))" }} />',
          ]}
        />
      </UsageSection>

      <div ref={swatchesRef}>
        {COLOR_GROUPS.map((group) => (
          <TypographySection key={group.title} title={group.title} description="CSS variables and Tailwind tokens.">
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {group.colors.map(({ token, label, fgToken }) => {
                const bgStyle = { backgroundColor: `hsl(var(--${token}))` }
                const fgStyle = fgToken ? { color: `hsl(var(--${fgToken}))` } : { color: "hsl(var(--foreground))" }
                const hex = hexByToken[token]
                return (
                  <div
                    key={token}
                    className="flex flex-col gap-3 overflow-hidden rounded-xl border border-border/70 bg-background"
                  >
                    <div
                      className="flex h-20 w-full items-end p-3"
                      style={bgStyle}
                      data-color-swatch
                      data-token={token}
                    >
                      <span className="text-xs font-medium" style={fgStyle}>
                        {label}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 px-4 pb-4">
                      <Text.Mono size="h6">{token}</Text.Mono>
                      <Text.H7 color="foregroundMuted">--{token}</Text.H7>
                      {hex ? (
                        <Text.Mono size="h6" weight="semibold">
                          {hex}
                        </Text.Mono>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </TypographySection>
        ))}
      </div>
    </DesignSystemPage>
  )
}
