import {
  AgentTextarea,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Label,
  Text,
  useMountEffect,
  useStagedStatus,
} from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Moon, Sparkles, Sun } from "lucide-react"
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
  const [simulating, setSimulating] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useMountEffect(() => () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
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

  return (
    <main className={`flex min-h-screen flex-col gap-6 p-4 text-foreground sm:p-6 lg:p-8 ${pageSurfaceClass}`}>
      <div className="flex w-full max-w-3xl flex-col gap-6 self-center">
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
              Component
            </Text.H6>
            <Text.H2 className="text-balance">Agent textarea</Text.H2>
          </div>
          <Text.H6 color="foregroundMuted">
            Focus the field to see the focused border; run the simulation for the loading fill.
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
            />
            <AgentTextarea
              label="Error state"
              minRows={2}
              placeholder={PLACEHOLDER}
              errors={["Something went wrong generating the script."]}
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
    </main>
  )
}
