import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
} from "@repo/ui"
import { CalendarIcon, ChevronDown } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

const TIME_PRESETS = [
  { label: "Last 30 seconds", seconds: 30 },
  { label: "Last 15 minutes", seconds: 15 * 60 },
  { label: "Last 30 minutes", seconds: 30 * 60 },
  { label: "Last hour", seconds: 60 * 60 },
  { label: "Last day", seconds: 24 * 60 * 60 },
  { label: "Last week", seconds: 7 * 24 * 60 * 60 },
  { label: "Last 2 weeks", seconds: 14 * 24 * 60 * 60 },
  { label: "Last month", seconds: 30 * 24 * 60 * 60 },
] as const

interface TimeFilterDropdownProps {
  readonly startTimeFrom?: string
  readonly startTimeTo?: string
  readonly onChange: (from?: string, to?: string) => void
}

function getActivePresetLabel(from?: string, _to?: string): string | null {
  if (!from) return null
  const fromDate = new Date(from)
  const diffMs = Date.now() - fromDate.getTime()
  const diffSeconds = Math.round(diffMs / 1000)

  for (const preset of TIME_PRESETS) {
    if (Math.abs(diffSeconds - preset.seconds) < preset.seconds * 0.1) {
      return preset.label
    }
  }
  return null
}

function formatDateForInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  const h = String(date.getHours()).padStart(2, "0")
  const min = String(date.getMinutes()).padStart(2, "0")
  return `${y}-${m}-${d}T${h}:${min}`
}

export function TimeFilterDropdown({ startTimeFrom, startTimeTo, onChange }: TimeFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const activeLabel = useMemo(() => {
    const presetLabel = getActivePresetLabel(startTimeFrom, startTimeTo)
    if (presetLabel) return presetLabel
    if (startTimeFrom || startTimeTo) return "Custom range"
    return "All time"
  }, [startTimeFrom, startTimeTo])

  const applyPreset = useCallback(
    (seconds: number) => {
      const from = new Date(Date.now() - seconds * 1000).toISOString()
      onChange(from, undefined)
      setOpen(false)
    },
    [onChange],
  )

  const applyCustomRange = useCallback(() => {
    const from = customFrom ? new Date(customFrom).toISOString() : undefined
    const to = customTo ? new Date(customTo).toISOString() : undefined
    onChange(from, to)
    setOpen(false)
  }, [customFrom, customTo, onChange])

  const clearTimeFilter = useCallback(() => {
    onChange(undefined, undefined)
    setCustomFrom("")
    setCustomTo("")
    setOpen(false)
  }, [onChange])

  return (
    <DropdownMenuRoot open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" flat>
          <CalendarIcon className="h-4 w-4" />
          <Text.H6>{activeLabel}</Text.H6>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {TIME_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.seconds}
            className="cursor-pointer"
            onSelect={() => applyPreset(preset.seconds)}
          >
            <Text.H6>{preset.label}</Text.H6>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <fieldset
          className="flex flex-col gap-2 px-2 py-2 border-none p-0 m-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Text.H6 color="foregroundMuted">Custom range</Text.H6>
          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground">From</span>
              <input
                type="datetime-local"
                value={customFrom || (startTimeFrom ? formatDateForInput(new Date(startTimeFrom)) : "")}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground">To</span>
              <input
                type="datetime-local"
                value={customTo || (startTimeTo ? formatDateForInput(new Date(startTimeTo)) : "")}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          </div>
          <Button variant="outline" size="sm" flat onClick={applyCustomRange}>
            <Text.H6>Apply</Text.H6>
          </Button>
        </fieldset>
        {(startTimeFrom || startTimeTo) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onSelect={clearTimeFilter}>
              <Text.H6 color="destructive">Clear time filter</Text.H6>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  )
}
