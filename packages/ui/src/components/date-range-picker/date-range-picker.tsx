import { format } from "date-fns"
import { CalendarIcon, ChevronDown } from "lucide-react"
import { useState } from "react"
import type { DateRange as DayPickerDateRange } from "react-day-picker"

import { cn } from "../../utils/cn.ts"
import { Button } from "../button/button.tsx"
import { Icon } from "../icons/icons.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "../popover/primitives.tsx"
import { Select, type SelectOption } from "../select/index.tsx"
import { Text } from "../text/text.tsx"
import { Calendar } from "./calendar.tsx"

export interface DateRange {
  readonly from?: Date
  readonly to?: Date
}

export interface DateRangePickerPreset {
  readonly id: string
  readonly label: string
  readonly range: DateRange
}

export interface DateRangePickerChange {
  readonly range: DateRange | undefined
  readonly source: "calendar" | "preset" | "clear"
  readonly presetId?: string
}

interface DateRangePickerProps {
  readonly mode?: "single" | "range"
  readonly ariaLabel?: string
  readonly value: DateRange | undefined
  readonly presets?: readonly DateRangePickerPreset[]
  readonly selectedPresetId: string | undefined
  readonly placeholder?: string
  readonly clearLabel?: string
  readonly disabled?: boolean
  /** Selectable bounds. Days outside are disabled and month navigation stops at them. */
  readonly minDate?: Date
  readonly maxDate?: Date
  readonly align?: "start" | "center" | "end"
  readonly portalTarget?: "local" | "body"
  /** Fill the available width, pushing the chevron to the far end (defaults to sizing to content). */
  readonly fullWidth?: boolean
  readonly onChange: (change: DateRangePickerChange) => void
}

function copyDate(date: Date): Date {
  return new Date(date)
}

function copyRange(range?: DateRange): DateRange | undefined {
  if (!range) return undefined

  return {
    ...(range.from ? { from: copyDate(range.from) } : {}),
    ...(range.to ? { to: copyDate(range.to) } : {}),
  }
}

function toDayPickerRange(range?: DateRange): DayPickerDateRange | undefined {
  if (!range?.from && !range?.to) return undefined

  return {
    from: range?.from,
    ...(range?.to ? { to: range.to } : {}),
  }
}

function fromDayPickerRange(range?: DayPickerDateRange): DateRange | undefined {
  if (!range?.from && !range?.to) return undefined

  return {
    ...(range.from ? { from: copyDate(range.from) } : {}),
    ...(range.to ? { to: copyDate(range.to) } : {}),
  }
}

function rangesEqual(left?: DateRange, right?: DateRange): boolean {
  return left?.from?.getTime() === right?.from?.getTime() && left?.to?.getTime() === right?.to?.getTime()
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function formatSelectionLabel({
  value,
  presets,
  selectedPresetId,
  placeholder,
}: {
  readonly value: DateRange | undefined
  readonly presets: readonly DateRangePickerPreset[]
  readonly selectedPresetId: string | undefined
  readonly placeholder: string
}) {
  const selectedPreset = selectedPresetId ? presets.find((preset) => preset.id === selectedPresetId) : undefined

  if (selectedPreset) {
    return { label: selectedPreset.label, selected: true }
  }

  if (value?.from && value?.to) {
    if (isSameDay(value.from, value.to)) {
      return { label: format(value.from, "LLL d, y"), selected: true }
    }

    return {
      label: `${format(value.from, "LLL d, y")} - ${format(value.to, "LLL d, y")}`,
      selected: true,
    }
  }

  if (value?.from) {
    return { label: `From ${format(value.from, "LLL d, y")}`, selected: true }
  }

  if (value?.to) {
    return { label: `Until ${format(value.to, "LLL d, y")}`, selected: true }
  }

  return { label: placeholder, selected: false }
}

function formatDraftSummary(range?: DateRange) {
  if (range?.from && range?.to) {
    if (isSameDay(range.from, range.to)) {
      return format(range.from, "EEEE, LLL d, y")
    }

    return `${format(range.from, "LLL d, y")} to ${format(range.to, "LLL d, y")}`
  }

  if (range?.from) {
    return `From ${format(range.from, "EEEE, LLL d, y")}`
  }

  if (range?.to) {
    return `Until ${format(range.to, "EEEE, LLL d, y")}`
  }

  return "No dates selected"
}

function RangeCalendar({
  mode,
  value,
  minDate,
  maxDate,
  onChange,
}: {
  readonly mode: "single" | "range"
  readonly value: DateRange | undefined
  readonly minDate?: Date
  readonly maxDate?: Date
  readonly onChange: (next: DateRange | undefined) => void
}) {
  if (mode === "single") {
    return (
      <Calendar
        mode="single"
        required
        showOutsideDays
        defaultMonth={value?.from ?? maxDate ?? new Date()}
        {...(minDate ? { fromDate: minDate } : {})}
        {...(maxDate ? { toDate: maxDate } : {})}
        selected={value?.from}
        onSelect={(date) => {
          if (date) onChange({ from: date, to: date })
        }}
      />
    )
  }
  return (
    <Calendar
      mode="range"
      showOutsideDays
      defaultMonth={value?.from ?? value?.to ?? maxDate ?? new Date()}
      {...(minDate ? { fromDate: minDate } : {})}
      {...(maxDate ? { toDate: maxDate } : {})}
      selected={toDayPickerRange(value)}
      onSelect={(nextRange) => onChange(fromDayPickerRange(nextRange))}
    />
  )
}

export function DateRangePicker({
  mode = "range",
  ariaLabel,
  value,
  presets = [],
  selectedPresetId,
  placeholder = "Pick a date range",
  clearLabel = "Clear dates",
  disabled = false,
  minDate,
  maxDate,
  align = "start",
  portalTarget = "local",
  fullWidth = false,
  onChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(() => copyRange(value))
  // Local portals stay within modal interaction scopes; body portals escape ancestor stacking and overflow contexts.
  const [popoverContainer, setPopoverContainer] = useState<HTMLDivElement | null>(null)

  const selection = formatSelectionLabel({
    value,
    presets,
    selectedPresetId,
    placeholder,
  })
  const canClear = Boolean(value?.from || value?.to || draftRange?.from || draftRange?.to)
  const presetOptions: SelectOption<string>[] = presets.map((preset) => ({
    value: preset.id,
    label: preset.label,
  }))

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftRange(copyRange(value))
      setOpen(true)
      return
    }

    setOpen(false)

    if (rangesEqual(draftRange, value)) return

    onChange({
      range: copyRange(draftRange),
      source: "calendar",
    })
  }

  const handlePresetSelect = (preset: DateRangePickerPreset) => {
    setDraftRange(copyRange(preset.range))
    setOpen(false)
    onChange({
      range: copyRange(preset.range),
      source: "preset",
      presetId: preset.id,
    })
  }

  const handleClear = () => {
    setDraftRange(undefined)
    setOpen(false)
    onChange({
      range: undefined,
      source: "clear",
    })
  }

  return (
    <div ref={setPopoverContainer} className={fullWidth ? "w-full" : "w-auto"}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="default"
            disabled={disabled}
            aria-label={ariaLabel}
            // `[&>div]` targets Button's inner content wrapper so the chevron sits at the far end;
            // Button packs its children into one content-width row, so plain `justify-between` can't.
            className={cn(
              "gap-2",
              fullWidth ? "w-full [&>div]:w-full [&>div]:justify-between" : "w-auto justify-start",
            )}
          >
            <span className="flex items-center gap-2">
              <Icon icon={CalendarIcon} size="sm" color={selection.selected ? "accentForeground" : "foreground"} />
              <span
                className={cn("whitespace-nowrap", {
                  "text-accent-foreground": selection.selected,
                  "text-foreground": !selection.selected,
                })}
              >
                {selection.label}
              </span>
            </span>
            <Icon icon={ChevronDown} size="sm" color="foregroundMuted" className="shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          container={portalTarget === "local" ? (popoverContainer ?? undefined) : undefined}
          align={align}
          className="w-[min(100vw-2rem,360px)] p-0 sm:w-auto"
        >
          <div className="flex flex-col gap-3 p-3">
            {presets.length > 0 ? (
              <Select
                name="date-range-picker-preset"
                options={presetOptions}
                value={selectedPresetId}
                placeholder="Custom range"
                width="full"
                contentWidth="trigger"
                side="bottom"
                onChange={(presetId) => {
                  const preset = presets.find((entry) => entry.id === presetId)
                  if (!preset) return
                  handlePresetSelect(preset)
                }}
              />
            ) : null}
            <RangeCalendar
              mode={mode}
              value={draftRange}
              {...(minDate ? { minDate } : {})}
              {...(maxDate ? { maxDate } : {})}
              onChange={(range) => {
                setDraftRange(range)
                if (mode === "single") {
                  setOpen(false)
                  onChange({ range, source: "calendar" })
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <Text.H6 color="foregroundMuted" className="min-w-0 truncate">
                {formatDraftSummary(draftRange)}
              </Text.H6>
              {mode === "range" ? (
                <Button type="button" variant="ghost" size="sm" disabled={!canClear} onClick={handleClear}>
                  {clearLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
