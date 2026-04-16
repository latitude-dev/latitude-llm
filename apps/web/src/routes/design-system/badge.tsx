import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Text,
  useMountEffect,
} from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Check, Moon, Star, Sun } from "lucide-react"
import { useState } from "react"

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "yellow",
  "purple",
  "accent",
  "success",
  "successMuted",
  "destructive",
  "destructiveMuted",
  "warningMuted",
  "muted",
  "outline",
  "outlineMuted",
  "outlineAccent",
  "outlinePurple",
  "outlineSuccessMuted",
  "outlineDestructiveMuted",
  "outlineWarningMuted",
  "noBorderMuted",
  "noBorderDestructiveMuted",
  "white",
] as const

const BADGE_SIZES = ["small", "normal", "large"] as const

const BADGE_SHAPES = ["default", "rounded"] as const

export const Route = createFileRoute("/design-system/badge")({
  component: BadgePage,
})

function BadgePage() {
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
            <Text.H2 className="text-balance">Badge</Text.H2>
          </div>
          <Text.H6 color="foregroundMuted">
            Every color variant, size, shape, and common modifier states. Toggle theme to validate light and dark
            styles.
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
              <Text.H6 color="foregroundMuted">All `variant` values at default size and shape.</Text.H6>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {BADGE_VARIANTS.map((variant) => (
              <div
                key={variant}
                className="grid grid-cols-1 items-center gap-3 border-b border-border/40 pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,14rem)_1fr]"
              >
                <div className="min-w-0 truncate">
                  <Text.Mono size="h6" color="foregroundMuted" display="block">
                    {variant}
                  </Text.Mono>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={variant} noWrap>
                    Label
                  </Badge>
                  <Badge variant={variant} uppercase noWrap>
                    status
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle>
              <Text.H4>Sizes</Text.H4>
            </CardTitle>
            <CardDescription>
              <Text.H6 color="foregroundMuted">`small`, `normal`, and `large` on the default variant.</Text.H6>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            {BADGE_SIZES.map((size) => (
              <div key={size} className="flex flex-col gap-2">
                <Text.Mono size="h6" color="foregroundMuted">
                  {size}
                </Text.Mono>
                <Badge size={size} noWrap>
                  {size === "large" ? "Large" : "Text"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle>
              <Text.H4>Shapes</Text.H4>
            </CardTitle>
            <CardDescription>
              <Text.H6 color="foregroundMuted">`default` vs pill `rounded`.</Text.H6>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            {BADGE_SHAPES.map((shape) => (
              <div key={shape} className="flex flex-col gap-2">
                <Text.Mono size="h6" color="foregroundMuted">
                  {shape}
                </Text.Mono>
                <Badge shape={shape} variant="secondary" noWrap>
                  Shape
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle>
              <Text.H4>States & composition</Text.H4>
            </CardTitle>
            <CardDescription>
              <Text.H6 color="foregroundMuted">Disabled, leading dot, icons, truncation, and alignment.</Text.H6>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Text.H6 weight="semibold">Disabled</Text.H6>
              <div className="flex flex-wrap items-center gap-3">
                <Badge disabled>Muted off</Badge>
                <Badge variant="success" disabled>
                  Success off
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Text.H6 weight="semibold">Leading dot (`indicatorProps`)</Text.H6>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" indicatorProps={{ variant: "default" }} noWrap>
                  Default dot
                </Badge>
                <Badge variant="outline" indicatorProps={{ variant: "success", size: "md" }} noWrap>
                  Success dot
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Text.H6 weight="semibold">Icons (`iconProps`)</Text.H6>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary" iconProps={{ icon: Check, placement: "start" }} noWrap>
                  Start icon
                </Badge>
                <Badge variant="secondary" iconProps={{ icon: Star, placement: "end" }} noWrap>
                  End icon
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Text.H6 weight="semibold">Ellipsis in narrow layout</Text.H6>
              <div className="max-w-48">
                <Badge variant="muted" ellipsis className="w-full max-w-full">
                  This label is intentionally long and should truncate with an ellipsis
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Text.H6 weight="semibold">Centered</Text.H6>
              <div className="w-full max-w-xs rounded-lg border border-dashed border-border/60 p-3">
                <Badge variant="outline" centered className="w-full" noWrap>
                  Centered in container
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
