import { format } from "date-fns"
import { CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"
import { DayPicker, type DateRange as DayPickerDateRange } from "react-day-picker"

import { cn } from "../../utils/cn.ts"
import { Button } from "../button/button.tsx"
import { Icon } from "../icons/icons.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "../popover/primitives.tsx"
import { Select, type SelectOption } from "../select/index.tsx"
import { Text } from "../text/text.tsx"

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
  readonly value: DateRange | undefined
  readonly presets?: readonly DateRangePickerPreset[]
  readonly selectedPresetId: string | undefined
  readonly placeholder?: string
  readonly clearLabel?: string
  readonly disabled?: boolean
  readonly align?: "start" | "center" | "end"
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
  value,
  onChange,
}: {
  readonly value: DateRange | undefined
  readonly onChange: (next: DateRange | undefined) => void
}) {
  return (
    <DayPicker
      mode="range"
      showOutsideDays
      defaultMonth={value?.from ?? value?.to ?? new Date()}
      selected={toDayPickerRange(value)}
      onSelect={(nextRange) => onChange(fromDayPickerRange(nextRange))}
      className="select-none"
      classNames={{
        months: "flex flex-col",
        month: "space-y-3",
        caption: "relative flex items-center justify-center px-1 pt-1",
        caption_label: "text-sm font-medium text-foreground",
        nav: "contents",
        nav_button:
          "inline-flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "h-8 w-9 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
        row: "mt-1.5 flex w-full",
        cell: cn(
          "relative h-9 w-9 p-0 text-center text-sm",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          "first:[&:has([aria-selected])]:rounded-l-md",
          "last:[&:has([aria-selected])]:rounded-r-md",
          "focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-muted",
          "[&:has([aria-selected])]:text-foreground",
        ),
        day: cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-sm font-normal transition-colors",
          "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        ),
        day_selected:
          "bg-foreground text-background font-medium hover:bg-foreground/90 hover:text-background aria-selected:opacity-100",
        day_today: "bg-primary text-primary-foreground font-medium hover:bg-primary/90 hover:text-primary-foreground",
        day_outside: "text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-30",
        day_hidden: "invisible",
        day_range_middle:
          "day-range-middle !rounded-none !bg-transparent !text-foreground !font-normal hover:!bg-transparent hover:!text-foreground",
        day_range_start:
          "day-range-start !bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background",
        day_range_end: "day-range-end !bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background",
      }}
      components={{
        IconLeft: () => <Icon icon={ChevronLeft} size="sm" />,
        IconRight: () => <Icon icon={ChevronRight} size="sm" />,
      }}
    />
  )
}

export function DateRangePicker({
  value,
  presets = [],
  selectedPresetId,
  placeholder = "Pick a date range",
  clearLabel = "Clear dates",
  disabled = false,
  align = "start",
  onChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(() => copyRange(value))

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
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className="w-auto justify-start gap-2">
          <span className="flex items-center gap-2">
            <Icon icon={CalendarIcon} size="sm" color={selection.selected ? "accentForeground" : "foregroundMuted"} />
            <span
              className={cn("whitespace-nowrap", {
                "text-foreground": selection.selected,
                "text-muted-foreground": !selection.selected,
              })}
            >
              {selection.label}
            </span>
          </span>
          <Icon icon={ChevronDown} size="sm" color="foregroundMuted" className="shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(100vw-2rem,360px)] p-0 sm:w-auto">
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
          <RangeCalendar value={draftRange} onChange={setDraftRange} />
          <div className="flex items-center justify-between gap-3">
            <Text.H6 color="foregroundMuted" className="min-w-0 truncate">
              {formatDraftSummary(draftRange)}
            </Text.H6>
            <Button type="button" variant="ghost" size="sm" disabled={!canClear} onClick={handleClear}>
              {clearLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
