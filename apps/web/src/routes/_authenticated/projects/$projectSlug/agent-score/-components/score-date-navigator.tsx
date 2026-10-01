import { Button, DateRangePicker, Icon } from "@repo/ui"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { agentScoreDateSchema } from "../../../../../../domains/agent-score/agent-score-date.ts"

const calendarDate = (date: string): Date => new Date(`${date}T00:00:00`)

const adjacentDate = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function ScoreDateNavigator({
  date,
  onDateChange,
  disabled = false,
}: {
  readonly date: string | undefined
  readonly onDateChange: (date: string) => void
  readonly disabled?: boolean
}) {
  const selectedDate = date ? calendarDate(date) : undefined
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous day"
          disabled={disabled || !date}
          onClick={() => date && onDateChange(adjacentDate(date, -1))}
        >
          <Icon icon={ChevronLeftIcon} size="sm" />
        </Button>
        <DateRangePicker
          mode="single"
          ariaLabel="Score date (UTC)"
          selectedPresetId={undefined}
          value={selectedDate ? { from: selectedDate, to: selectedDate } : undefined}
          maxDate={calendarDate(today)}
          disabled={disabled || !date}
          onChange={({ range }) => {
            const selected = range?.from
            if (!selected) return
            const value = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`
            const parsed = agentScoreDateSchema.safeParse(value)
            if (parsed.success) onDateChange(parsed.data)
          }}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Next day"
          disabled={disabled || !date || date >= today}
          onClick={() => date && onDateChange(adjacentDate(date, 1))}
        >
          <Icon icon={ChevronRightIcon} size="sm" />
        </Button>
      </div>
    </div>
  )
}
