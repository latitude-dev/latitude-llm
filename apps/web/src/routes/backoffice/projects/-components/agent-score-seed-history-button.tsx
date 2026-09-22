import { Alert, Button, CloseTrigger, Icon, Input, Modal, Slider, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { LockIcon } from "lucide-react"
import { useMemo, useState } from "react"
import {
  type AdminAgentScoreHistoryPointDto,
  AGENT_SCORE_SEED_HISTORY_DAYS,
  adminSeedAgentScoreHistory,
  SEED_AGENT_SCORE_HISTORY_CONFIRMATION,
} from "../../../../domains/admin/agent-score.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"
import { formatFullDate } from "../../../_authenticated/projects/$projectSlug/agent-score/-components/agent-score-format.ts"
import { calendarEndingOn } from "../../../_authenticated/projects/$projectSlug/agent-score/-components/score-trend.tsx"

const DEFAULT_START = 62
const DEFAULT_END = 80
const DEFAULT_VOLATILITY = 4

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

const clampScore = (value: number): number => Math.max(0, Math.min(100, value))

const roundToTenth = (value: number): number => Math.round(value * 10) / 10

/** `0.7` damps the walk so neighbouring days stay related instead of reading as measurement error. */
export const generateScoreCurve = ({
  dayCount,
  start,
  end,
  volatility,
  random,
}: {
  readonly dayCount: number
  readonly start: number
  readonly end: number
  readonly volatility: number
  readonly random: () => number
}): readonly number[] => {
  let drift = 0
  return Array.from({ length: dayCount }, (_, index) => {
    const progress = dayCount === 1 ? 1 : index / (dayCount - 1)
    drift = drift * 0.7 + (random() * 2 - 1) * volatility
    return roundToTenth(clampScore(start + (end - start) * progress + drift))
  })
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`

/** Exported for tests. */
export const writeSummary = (writable: number, total: number): string =>
  writable === total
    ? `Will write ${plural(writable, "day")}.`
    : `Will write ${plural(writable, "day")}. ${plural(total - writable, "day")} already ${total - writable === 1 ? "has" : "have"} a published score and will be left alone.`

const numberOrNull = (value: string): number | null => {
  const parsed = Number(value)
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : null
}

function CurveControl({
  label,
  value,
  max,
  onChange,
}: {
  readonly label: string
  readonly value: number
  readonly max: number
  readonly onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <input
        type="number"
        aria-label={label}
        className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
        min={0}
        max={max}
        step={0.1}
        value={value}
        onChange={(event) => {
          const parsed = numberOrNull(event.target.value)
          if (parsed !== null) onChange(Math.max(0, Math.min(max, parsed)))
        }}
      />
    </label>
  )
}

function DayColumn({
  date,
  firstDate,
  value,
  published,
  onChange,
}: {
  readonly date: string
  readonly firstDate: string
  readonly value: number
  readonly published: boolean
  readonly onChange: (value: number) => void
}) {
  // A run of bare day numbers that resets to 01 mid-strip reads as a glitch, so month starts say so.
  const day = date.slice(8)
  const dayLabel = day === "01" || date === firstDate ? `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(day)}` : day
  const label = `${formatFullDate(date)}: ${value.toFixed(1)}`

  return (
    <div
      title={published ? `${label} — already published` : label}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-md py-1.5 ${published ? "bg-muted/60" : ""}`}
    >
      <div className="flex h-4 items-center gap-0.5">
        {published ? <Icon icon={LockIcon} size="xs" color="foregroundMuted" /> : null}
        <Text.H7 color={published ? "foregroundMuted" : "foreground"} className="tabular-nums">
          {value.toFixed(1)}
        </Text.H7>
      </div>
      <div className="h-40">
        <Slider
          orientation="vertical"
          aria-label={label}
          min={0}
          max={100}
          step={0.1}
          disabled={published}
          value={[value]}
          onValueChange={([next]) => next !== undefined && onChange(next)}
        />
      </div>
      <Text.H7 color="foregroundMuted" className="tabular-nums">
        {dayLabel}
      </Text.H7>
    </div>
  )
}

export function AgentScoreSeedHistoryButton({
  projectId,
  projectName,
  currentDate,
  history,
}: {
  readonly projectId: string
  readonly projectName: string
  readonly currentDate: string
  readonly history: readonly AdminAgentScoreHistoryPointDto[]
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [start, setStart] = useState(DEFAULT_START)
  const [end, setEnd] = useState(DEFAULT_END)
  const [volatility, setVolatility] = useState(DEFAULT_VOLATILITY)

  const dates = useMemo(() => calendarEndingOn(currentDate, AGENT_SCORE_SEED_HISTORY_DAYS), [currentDate])
  const publishedByDate = useMemo(() => new Map(history.map((entry) => [entry.date, entry.score])), [history])
  const [drafts, setDrafts] = useState<readonly number[]>(() =>
    generateScoreCurve({
      dayCount: AGENT_SCORE_SEED_HISTORY_DAYS,
      start: DEFAULT_START,
      end: DEFAULT_END,
      volatility: DEFAULT_VOLATILITY,
      random: Math.random,
    }),
  )

  const editableDates = dates.filter((date) => !publishedByDate.has(date))
  const isConfirmed = confirmText.trim().toLowerCase() === SEED_AGENT_SCORE_HISTORY_CONFIRMATION

  const close = () => {
    setIsOpen(false)
    setConfirmText("")
  }

  const regenerate = () =>
    setDrafts(
      generateScoreCurve({ dayCount: AGENT_SCORE_SEED_HISTORY_DAYS, start, end, volatility, random: Math.random }),
    )

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      const days = dates.flatMap((date, index) =>
        publishedByDate.has(date) ? [] : [{ date, score: drafts[index] ?? DEFAULT_START }],
      )
      const result = await adminSeedAgentScoreHistory({
        data: { projectId, confirmation: SEED_AGENT_SCORE_HISTORY_CONFIRMATION, days },
      })
      toast({
        description:
          result.skipped > 0
            ? `Seeded ${result.written} days of Agent Score history for ${projectName}. ${result.skipped} already had a published score and were left alone.`
            : `Seeded ${result.written} days of Agent Score history for ${projectName}.`,
      })
      close()
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not seed the score history",
        description: toUserMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        Seed score history
      </Button>
      <Modal.Root
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setIsOpen(true)
          else close()
        }}
      >
        <Modal.Content dismissible size="xl">
          <Modal.Header
            title="Seed Agent Score history"
            description={
              <Text.H5 color="foregroundMuted">
                Write {AGENT_SCORE_SEED_HISTORY_DAYS} days of fabricated Agent Scores for{" "}
                <span className="font-medium text-foreground">{projectName}</span>, ending {formatFullDate(currentDate)}{" "}
                UTC.
              </Text.H5>
            }
          />
          <Modal.Body>
            <div className="flex flex-col gap-4">
              <Alert
                variant="warning"
                description="These scores are invented, not measured, and a stored score is never rewritten — there is no undo short of deleting the rows by hand. Days that already have a published score are locked below and stay exactly as they are."
              />

              <div className="flex flex-wrap items-center gap-4">
                <CurveControl label="Start" value={start} max={100} onChange={setStart} />
                <CurveControl label="End" value={end} max={100} onChange={setEnd} />
                <CurveControl label="Volatility" value={volatility} max={25} onChange={setVolatility} />
                <Button type="button" variant="outline" size="sm" onClick={regenerate}>
                  Generate curve
                </Button>
                <Text.H6 color="foregroundMuted">Then drag any day to adjust it.</Text.H6>
              </div>

              <div className="flex items-stretch gap-0.5 overflow-x-auto rounded-lg border border-border p-2">
                {dates.map((date, index) => {
                  const published = publishedByDate.get(date)
                  return (
                    <DayColumn
                      key={date}
                      date={date}
                      firstDate={dates[0] ?? date}
                      value={published ?? drafts[index] ?? DEFAULT_START}
                      published={published !== undefined}
                      onChange={(next) =>
                        setDrafts((current) => current.map((value, at) => (at === index ? next : value)))
                      }
                    />
                  )
                })}
              </div>

              <Text.H6 color="foregroundMuted">{writeSummary(editableDates.length, dates.length)}</Text.H6>

              <Text.H5 color="foregroundMuted">
                Type <span className="font-medium text-foreground">{SEED_AGENT_SCORE_HISTORY_CONFIRMATION}</span> to
                confirm.
              </Text.H5>
              <Input
                type="text"
                label="Confirmation"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={SEED_AGENT_SCORE_HISTORY_CONFIRMATION}
              />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button
              type="button"
              size="sm"
              disabled={!isConfirmed || isSubmitting || editableDates.length === 0}
              onClick={() => void handleConfirm()}
            >
              {isSubmitting ? "Seeding…" : `Seed ${editableDates.length} days`}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
