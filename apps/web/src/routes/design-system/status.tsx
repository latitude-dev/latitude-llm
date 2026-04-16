import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Status,
  Text,
  useMountEffect,
} from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Loader2, Moon, Star, Sun } from "lucide-react"
import { useState } from "react"

const STATUS_VARIANTS = ["neutral", "info", "success", "warning", "destructive"] as const

export const Route = createFileRoute("/design-system/status")({
  component: StatusPage,
})

function StatusPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const pageSurfaceClass = theme === "dark" ? "bg-black" : "bg-white"

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
    <main className={`flex min-h-screen flex-col gap-6 p-4 text-foreground sm:p-6 lg:p-8 ${pageSurfaceClass}`}>
      <div className="flex w-full max-w-4xl flex-col gap-6 self-center">
        <header
          className={`flex flex-col gap-4 rounded-2xl border border-border/70 p-5 shadow-xl sm:p-6 ${pageSurfaceClass}`}
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
              Reference
            </Text.H6>
            <Text.H2 className="text-balance">Status</Text.H2>
          </div>
          <Text.H6 color="foregroundMuted">
            Semantic variants with the default dot, text-only mode, truncation, and a custom leading indicator. Toggle
            theme for light and dark checks.
          </Text.H6>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setTheme((currentTheme) => {
                  const nextTheme = currentTheme === "light" ? "dark" : "light"
                  applyTheme(nextTheme)
                  return nextTheme
                })
              }}
            >
              <Icon icon={theme === "light" ? Moon : Sun} size="sm" />
              {theme === "light" ? "Switch to Dark" : "Switch to Light"}
            </Button>
            <div className={`flex items-center gap-2 rounded-lg border border-border/60 p-2 ${pageSurfaceClass}`}>
              <Text.H6 color="foregroundMuted">Theme</Text.H6>
              <Text.Mono>{theme}</Text.Mono>
            </div>
          </div>
        </header>

        <Card className="border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle>
              <Text.H4>Variants</Text.H4>
            </CardTitle>
            <CardDescription>
              <Text.H6 color="foregroundMuted">All `variant` values with the default leading dot.</Text.H6>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {STATUS_VARIANTS.map((variant) => (
              <div
                key={variant}
                className="grid grid-cols-1 items-center gap-3 border-b border-border/40 pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,10rem)_1fr]"
              >
                <Text.Mono size="h6" color="foregroundMuted">
                  {variant}
                </Text.Mono>
                <Status variant={variant} label={variant.charAt(0).toUpperCase() + variant.slice(1)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle>
              <Text.H4>No dot</Text.H4>
            </CardTitle>
            <CardDescription>
              <Text.H6 color="foregroundMuted">`indicator={false}` removes the leading marker.</Text.H6>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {STATUS_VARIANTS.map((variant) => (
              <Status key={variant} variant={variant} indicator={false} label="Text only" />
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle>
              <Text.H4>Custom indicator</Text.H4>
            </CardTitle>
            <CardDescription>
              <Text.H6 color="foregroundMuted">Pass any `ReactNode` as `indicator`.</Text.H6>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Status
              variant="info"
              label="Loading"
              indicator={<Icon icon={Loader2} size="xs" className="animate-spin" aria-hidden />}
            />
            <Status variant="success" label="Star" indicator={<Icon icon={Star} size="xs" aria-hidden />} />
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle>
              <Text.H4>Truncation</Text.H4>
            </CardTitle>
            <CardDescription>
              <Text.H6 color="foregroundMuted">Long labels truncate inside constrained widths.</Text.H6>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex max-w-sm flex-col gap-4">
            {STATUS_VARIANTS.map((variant) => (
              <Status
                key={variant}
                variant={variant}
                label="This status line is long and should ellipsize instead of wrapping the layout"
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
