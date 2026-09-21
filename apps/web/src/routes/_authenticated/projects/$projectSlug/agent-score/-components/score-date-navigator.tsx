import { Button, Icon, Input } from "@repo/ui"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { agentScoreDateSchema } from "../../../../../../domains/agent-score/agent-score-date.ts"

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
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          aria-label="Previous day"
          disabled={disabled || !date}
          onClick={() => date && onDateChange(adjacentDate(date, -1))}
        >
          <Icon icon={ChevronLeftIcon} size="sm" />
        </Button>
        <Input
          type="date"
          aria-label="Score date (UTC)"
          value={date ?? ""}
          max={today}
          disabled={disabled || !date}
          size="sm"
          className="w-auto"
          onChange={(event) => {
            const parsed = agentScoreDateSchema.safeParse(event.target.value)
            if (parsed.success) onDateChange(parsed.data)
          }}
        />
        <Button
          variant="outline"
          size="sm"
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
