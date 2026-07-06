import {
  AgentTextarea,
  type AgentTextareaSettings,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DEFAULT_AGENT_TEXTAREA_SETTINGS,
  Icon,
  Label,
  Text,
  useMountEffect,
  useStagedStatus,
} from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Check, Copy, Moon, RotateCcw, Sparkles, Sun } from "lucide-react"
import { useRef, useState } from "react"

const MIN_ROWS_OPTIONS = [2, 3, 5] as const

const SIMULATION_DURATION_MS = 32_000

const DEMO_STAGES = [
  { atSeconds: 0, label: "Reading your description" },
  { atSeconds: 3, label: "Writing the script" },
  { atSeconds: 14, label: "Running it against a recent session" },
  { atSeconds: 26, label: "Refining the result" },
]

const PLACEHOLDER = '"the session took over 30 seconds and the assistant apologized at any point."'

type NumericSettingKey = {
  [K in keyof AgentTextareaSettings]: AgentTextareaSettings[K] extends number ? K : never
}[keyof AgentTextareaSettings]

interface SettingSlider {
  readonly key: NumericSettingKey
  readonly label: string
  readonly min: number
  readonly max: number
  readonly step: number
}

const SETTING_SECTIONS: { readonly title: string; readonly sliders: readonly SettingSlider[] }[] = [
  {
    title: "Border",
    sliders: [
      { key: "thicknessIdle", label: "Thickness idle (px)", min: 0, max: 8, step: 0.1 },
      { key: "thicknessFocus", label: "Thickness focused (px)", min: 0, max: 16, step: 0.1 },
      { key: "spotCount", label: "Spots per color", min: 1, max: 6, step: 1 },
      { key: "spotSizeIdle", label: "Spot size idle", min: 0, max: 1, step: 0.01 },
      { key: "spotSizeFocus", label: "Spot size focused", min: 0, max: 1, step: 0.01 },
      { key: "spotIntensity", label: "Spot intensity", min: 0, max: 4, step: 0.05 },
      { key: "pulse", label: "Pulse", min: 0, max: 1, step: 0.01 },
      { key: "bloom", label: "Bloom", min: 0, max: 1, step: 0.01 },
      { key: "baseAlpha", label: "Base ring alpha", min: 0, max: 1.5, step: 0.05 },
      { key: "smokeIdle", label: "Smoke idle", min: 0, max: 1, step: 0.01 },
      { key: "smokeFocus", label: "Smoke focused", min: 0, max: 1, step: 0.01 },
      { key: "smokeScaleIdle", label: "Smoke scale idle (px)", min: 20, max: 300, step: 5 },
      { key: "smokeScaleFocus", label: "Smoke scale focused (px)", min: 20, max: 300, step: 5 },
    ],
  },
  {
    title: "Loading fill",
    sliders: [
      { key: "poolCount", label: "Pools", min: 2, max: 7, step: 1 },
      { key: "poolHeight", label: "Pool height", min: 0.1, max: 1, step: 0.05 },
      { key: "poolSpeed", label: "Pool speed", min: 0, max: 3, step: 0.05 },
      { key: "poolDrift", label: "Pool drift", min: 0, max: 0.15, step: 0.005 },
      { key: "poolIntensity", label: "Pool intensity", min: 0, max: 2, step: 0.05 },
    ],
  },
  {
    title: "Motion & intensity",
    sliders: [
      { key: "idleIntensity", label: "Intensity idle", min: 0, max: 1, step: 0.05 },
      { key: "focusIntensity", label: "Intensity focused", min: 0, max: 1, step: 0.05 },
      { key: "loadingIntensity", label: "Intensity loading", min: 0, max: 1, step: 0.05 },
      { key: "idleTimeScale", label: "Speed idle", min: 0, max: 4, step: 0.02 },
      { key: "focusTimeScale", label: "Speed focused", min: 0, max: 4, step: 0.02 },
      { key: "loadingTimeScale", label: "Speed loading", min: 0, max: 4, step: 0.02 },
    ],
  },
]

export const Route = createFileRoute("/design-system/agent-textarea")({
  component: AgentTextareaPage,
})

function AgentTextareaPage() {
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

  const [minRows, setMinRows] = useState(3)
  const [settings, setSettings] = useState<AgentTextareaSettings>(DEFAULT_AGENT_TEXTAREA_SETTINGS)
  const [copied, setCopied] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useMountEffect(() => () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    if (copiedTimeoutRef.current !== null) clearTimeout(copiedTimeoutRef.current)
  })

  const status = useStagedStatus(DEMO_STAGES, simulating)

  const toggleSimulation = () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    if (simulating) {
      setSimulating(false)
      return
    }
    setSimulating(true)
    timeoutRef.current = setTimeout(() => setSimulating(false), SIMULATION_DURATION_MS)
  }

  const copySettings = () => {
    void navigator.clipboard.writeText(JSON.stringify(settings, null, 2))
    setCopied(true)
    if (copiedTimeoutRef.current !== null) clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className={`flex min-h-screen flex-col gap-6 p-4 text-foreground sm:p-6 lg:p-8 ${pageSurfaceClass}`}>
      <div className="flex w-full max-w-6xl flex-col gap-6 self-center">
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
            <Text.H2 className="text-balance">Agent textarea</Text.H2>
          </div>
          <Text.H6 color="foregroundMuted">
            Tune every shader setting live, then copy the values. Focus the field to see the focused state; run the
            simulation for the loading fill.
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
            <Button onClick={toggleSimulation}>
              <Icon icon={Sparkles} size="sm" />
              {simulating ? "Stop simulation" : "Simulate generation"}
            </Button>
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[3fr,2fr]">
          <div className="flex flex-col gap-6 lg:sticky lg:top-6">
            <Card className="border-border/70 shadow-xl">
              <CardHeader>
                <CardTitle>
                  <Text.H4>Preview</Text.H4>
                </CardTitle>
                <CardDescription>
                  <Text.H6 color="foregroundMuted">Idle, focused, loading, and error states.</Text.H6>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <AgentTextarea
                  label="This script should check whether…"
                  minRows={minRows}
                  placeholder={PLACEHOLDER}
                  status={status}
                  settings={settings}
                />
                <AgentTextarea
                  label="Error state"
                  minRows={2}
                  placeholder={PLACEHOLDER}
                  errors={["Something went wrong generating the script."]}
                  settings={settings}
                />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="agent-textarea-min-rows">
                    <Text.H6>Min rows</Text.H6>
                  </Label>
                  <select
                    id="agent-textarea-min-rows"
                    value={minRows}
                    onChange={(e) => setMinRows(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {MIN_ROWS_OPTIONS.map((rows) => (
                      <option key={rows} value={rows}>
                        {rows}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 shadow-xl">
            <CardHeader>
              <CardTitle>
                <Text.H4>Shader settings</Text.H4>
              </CardTitle>
              <CardDescription>
                <Text.H6 color="foregroundMuted">
                  Colors and shape adaptation are fixed; everything else is yours.
                </Text.H6>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={copySettings}>
                  <Icon icon={copied ? Check : Copy} size="sm" />
                  {copied ? "Copied" : "Copy values"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSettings(DEFAULT_AGENT_TEXTAREA_SETTINGS)}>
                  <Icon icon={RotateCcw} size="sm" />
                  Reset
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="setting-nativeBorder">
                  <Text.H6 color="foregroundMuted">Original textarea border</Text.H6>
                </Label>
                <input
                  id="setting-nativeBorder"
                  type="checkbox"
                  checked={settings.nativeBorder}
                  onChange={(e) => setSettings((previous) => ({ ...previous, nativeBorder: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
              </div>
              {SETTING_SECTIONS.map((section) => (
                <div key={section.title} className="flex flex-col gap-3">
                  <Text.H6 weight="semibold">{section.title}</Text.H6>
                  {section.sliders.map((slider) => (
                    <div key={slider.key} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={`setting-${slider.key}`}>
                          <Text.H6 color="foregroundMuted">{slider.label}</Text.H6>
                        </Label>
                        <Text.Mono size="h6">{settings[slider.key]}</Text.Mono>
                      </div>
                      <input
                        id={`setting-${slider.key}`}
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        step={slider.step}
                        value={settings[slider.key]}
                        onChange={(e) =>
                          setSettings((previous) => ({ ...previous, [slider.key]: Number(e.target.value) }))
                        }
                        className="w-full accent-primary"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
