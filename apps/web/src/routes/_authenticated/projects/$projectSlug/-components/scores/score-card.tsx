import type { ScoreSourceType } from "@domain/scores"
import { Badge, Icon, Text, ThumbButton, Tooltip } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Link, useParams } from "@tanstack/react-router"
import { AlertCircleIcon, ShieldAlertIcon } from "lucide-react"
import type { ScoreRecord } from "../../../../../../domains/scores/scores.functions.ts"
import { useSignal } from "../../../../../../domains/signals/signals.collection.ts"
import {
  scoreCardEvaluationVerdict,
  scoreCardLinkedSignalId,
  scoreCardShouldShowFeedback,
  scoreCardShouldShowValue,
  scoreCardSignalLabel,
  scoreCardSourceTitle,
} from "./score-card-display.ts"
import { ScoreEntryCard, ScoreEntryCardBody, ScoreEntryCardHeader } from "./score-entry-card.tsx"

const SOURCE_LABELS: Record<ScoreSourceType, string> = {
  annotation: "Annotation",
  custom: "Custom",
  evaluation: "Evaluation",
}

interface ScoreCardProps {
  readonly score: ScoreRecord
  readonly projectId: string
  readonly className?: string
}

function ScoreVerdictReadout({
  passed,
  errored,
  error,
}: {
  readonly passed: boolean
  readonly errored: boolean
  readonly error: string | null
}) {
  if (errored) {
    return (
      <Tooltip
        asChild
        trigger={
          <div className="flex h-8 w-8 items-center justify-center rounded-lg">
            <Icon icon={AlertCircleIcon} size="xs" color="destructiveMutedForeground" />
          </div>
        }
      >
        {error ?? "Score generation failed"}
      </Tooltip>
    )
  }

  return (
    <ThumbButton
      selected
      readOnly
      variant={passed ? "up" : "down"}
      appearance="icon"
      onClick={() => undefined}
    />
  )
}

function ScoreSignalLink({
  projectSlug,
  signalId,
  name,
  slug,
  description,
}: {
  readonly projectSlug: string | undefined
  readonly signalId: string
  readonly name: string | null
  readonly slug: string | null
  readonly description: string | undefined
}) {
  const label = scoreCardSignalLabel({ name, slug })
  if (!label) return null
  const signalSlug = slug ?? signalId
  const isNavigable = Boolean(projectSlug && signalSlug)
  const badge = (
    <Badge
      variant="outline"
      size="small"
      ellipsis
      {...(isNavigable ? { className: "cursor-pointer hover:bg-muted" } : {})}
      iconProps={{
        icon: ShieldAlertIcon,
        color: "foregroundMuted",
        placement: "start",
        className: "stroke-[2.5]",
      }}
    >
      {label}
    </Badge>
  )
  const trigger =
    projectSlug && signalSlug ? (
      <Link
        data-no-navigate
        to="/projects/$projectSlug/signals/$signalSlug"
        params={{ projectSlug, signalSlug }}
        aria-label={`Open signal ${label}`}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex min-w-0"
      >
        {badge}
      </Link>
    ) : (
      badge
    )

  if (!description) return trigger
  return (
    <Tooltip asChild trigger={trigger}>
      <span className="block max-w-xs whitespace-pre-wrap text-left">{description}</span>
    </Tooltip>
  )
}

export function ReadOnlyScoreCard({ score, projectId, className }: ScoreCardProps) {
  const { projectSlug } = useParams({ strict: false })
  const linkedSignalId = scoreCardLinkedSignalId(score)
  const { data: linkedSignal } = useSignal({
    projectId,
    signalId: linkedSignalId ?? "",
    enabled: linkedSignalId !== null,
  })

  const linkedSignalName = linkedSignal?.name ?? null
  const linkedSignalSlug = linkedSignal?.slug ?? null
  const linkedSignalDescription = linkedSignal?.description?.trim()
  const sourceLabel = SOURCE_LABELS[score.source]
  const sourceTitle = scoreCardSourceTitle(score)
  const feedback = score.feedback?.trim()
  const showValue = scoreCardShouldShowValue(score)
  const showFeedback = scoreCardShouldShowFeedback(score)
  const evaluationVerdict = scoreCardEvaluationVerdict(score)
  const signalLink = linkedSignalId ? (
    <ScoreSignalLink
      projectSlug={projectSlug}
      signalId={linkedSignalId}
      name={linkedSignalName}
      slug={linkedSignalSlug}
      description={linkedSignalDescription}
    />
  ) : null

  return (
    <ScoreEntryCard dataAttributeName="data-score-card-id" id={score.id} className={className}>
      <ScoreEntryCardHeader
        meta={
          <>
            <Badge variant="outline" size="small">
              {sourceLabel}
            </Badge>
            <Text.H6 color="foregroundMuted">{relativeTime(new Date(score.createdAt))}</Text.H6>
          </>
        }
        title={
          <>
            {sourceTitle ? (
              <Text.H5M className="min-w-0 max-w-full truncate">
                {sourceTitle}
              </Text.H5M>
            ) : null}
            {evaluationVerdict ? (
              <Badge variant="secondary" size="small">
                {evaluationVerdict}
              </Badge>
            ) : null}
          </>
        }
        supporting={score.source === "evaluation" ? signalLink : null}
        trailing={
          evaluationVerdict ? null : (
            <ScoreVerdictReadout passed={score.passed} errored={score.errored} error={score.error} />
          )
        }
      />

      {showFeedback && feedback ? (
        <ScoreEntryCardBody>
          <Text.H5 className="whitespace-pre-wrap break-words leading-relaxed">{feedback}</Text.H5>
        </ScoreEntryCardBody>
      ) : null}

      {showValue || (score.source !== "evaluation" && signalLink) ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {showValue ? (
            <Badge variant="accent" size="small">
              Value {Math.round(score.value * 100)}%
            </Badge>
          ) : null}
          {score.source !== "evaluation" ? signalLink : null}
        </div>
      ) : null}
    </ScoreEntryCard>
  )
}
