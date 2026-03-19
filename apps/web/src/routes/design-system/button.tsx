import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Label,
  Text,
  useMountEffect,
} from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Check, Copy, type LucideIcon, Moon, Plus, Send, Sparkles, Sun, Trash2 } from "lucide-react"
import { useState } from "react"

const VARIANTS = [
  { value: "default", label: "Default" },
  { value: "secondary", label: "Secondary" },
  { value: "outline", label: "Outline" },
  { value: "ghost", label: "Ghost" },
  { value: "destructive", label: "Destructive" },
  { value: "link", label: "Link" },
] as const

const SIZES = [
  { value: "sm", label: "Small" },
  { value: "default", label: "Default" },
  { value: "lg", label: "Large" },
  { value: "icon", label: "Icon only" },
  { value: "full", label: "Full width" },
] as const

const STATES = [
  { value: "normal", label: "Normal" },
  { value: "loading", label: "Loading" },
  { value: "disabled", label: "Disabled" },
] as const

const ICONS: { value: string; label: string; Component: LucideIcon }[] = [
  { value: "none", label: "None", Component: Check },
  { value: "check", label: "Check", Component: Check },
  { value: "plus", label: "Plus", Component: Plus },
  { value: "trash2", label: "Trash", Component: Trash2 },
  { value: "sparkles", label: "Sparkles", Component: Sparkles },
  { value: "send", label: "Send", Component: Send },
  { value: "copy", label: "Copy", Component: Copy },
]

export const Route = createFileRoute("/design-system/button")({
  component: ButtonPage,
})

function ButtonPage() {
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

  const [variant, setVariant] = useState<"default" | "secondary" | "outline" | "ghost" | "destructive" | "link">(
    "default",
  )
  const [size, setSize] = useState<"sm" | "default" | "lg" | "icon" | "full">("default")
  const [state, setState] = useState<"normal" | "loading" | "disabled">("normal")
  const [label, setLabel] = useState("Button")
  const [iconKey, setIconKey] = useState("none")

  const iconEntry = ICONS.find((i) => i.value === iconKey)
  const IconComponent = iconEntry?.Component
  const showIcon = Boolean(IconComponent && iconKey !== "none")
  const showLabel = size !== "icon"
  const buttonLabel = size === "icon" ? "" : label || " "
  const previewIcon: LucideIcon | null =
    size === "icon"
      ? iconKey === "none"
        ? Check
        : (iconEntry?.Component ?? Check)
      : showIcon && iconEntry
        ? iconEntry.Component
        : null

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
              Playground
            </Text.H6>
            <Text.H2 className="text-balance">Button</Text.H2>
          </div>
          <Text.H6 color="foregroundMuted">
            Configure variant, size, state, label, and icon to preview button updates. Toggle theme to validate light
            and dark styles.
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

        <div className="grid gap-6 lg:grid-cols-[1fr,1fr]">
          <Card className="border-border/70 shadow-xl">
            <CardHeader>
              <CardTitle>
                <Text.H4>Controls</Text.H4>
              </CardTitle>
              <CardDescription>
                <Text.H6 color="foregroundMuted">Colors, size, state, text, and icon.</Text.H6>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="button-variant">
                  <Text.H6>Variant (color)</Text.H6>
                </Label>
                <select
                  id="button-variant"
                  value={variant}
                  onChange={(e) =>
                    setVariant(e.target.value as "default" | "secondary" | "outline" | "ghost" | "destructive" | "link")
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {VARIANTS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="button-size">
                  <Text.H6>Size</Text.H6>
                </Label>
                <select
                  id="button-size"
                  value={size}
                  onChange={(e) => setSize(e.target.value as "sm" | "default" | "lg" | "icon" | "full")}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="button-state">
                  <Text.H6>State</Text.H6>
                </Label>
                <select
                  id="button-state"
                  value={state}
                  onChange={(e) => setState(e.target.value as "normal" | "loading" | "disabled")}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {STATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="button-label">
                  <Text.H6>Label text</Text.H6>
                </Label>
                <Input
                  id="button-label"
                  name="label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Button"
                  disabled={size === "icon"}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="button-icon">
                  <Text.H6>Icon</Text.H6>
                </Label>
                <select
                  id="button-icon"
                  value={iconKey}
                  onChange={(e) => setIconKey(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {ICONS.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xl">
            <CardHeader>
              <CardTitle>
                <Text.H4>Preview</Text.H4>
              </CardTitle>
              <CardDescription>
                <Text.H6 color="foregroundMuted">Live button with current options.</Text.H6>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex min-h-[120px] flex-wrap items-center justify-center gap-4 rounded-lg border border-dashed border-border/70 bg-muted/20 p-6">
                <Button
                  variant={variant}
                  size={size}
                  isLoading={state === "loading"}
                  disabled={state === "disabled"}
                  aria-label={size === "icon" ? label || "Icon button" : undefined}
                >
                  {previewIcon ? <Icon icon={previewIcon} size="sm" /> : null}
                  {showLabel && buttonLabel}
                </Button>
              </div>
              <div className="flex flex-col gap-1 rounded-md bg-muted/30 p-3">
                <Text.Mono size="h6" display="block">
                  {`<Button variant="${variant}" size="${size}"${state === "loading" ? " isLoading" : ""}${state === "disabled" ? " disabled" : ""}>`}
                </Text.Mono>
                {(IconComponent && iconKey !== "none") || showLabel ? (
                  <Text.Mono size="h6" display="block">
                    {IconComponent && iconKey !== "none" && "<Icon ... />"}
                    {showLabel && (label ? ` "${label}"` : " (empty)")}
                  </Text.Mono>
                ) : null}
                <Text.Mono size="h6" display="block">{`</Button>`}</Text.Mono>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
