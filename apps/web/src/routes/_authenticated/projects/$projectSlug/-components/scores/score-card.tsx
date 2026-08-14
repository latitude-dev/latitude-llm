import type { ScoreSourceType } from "@domain/scores"
import { Badge, Icon, Text, Tooltip } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Link, useParams } from "@tanstack/react-router"
import { AlertCircleIcon, ShieldAlertIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import type { ScoreRecord } from "../../../../../../domains/scores/scores.functions.ts"
import { useSignal } from "../../../../../../domains/signals/signals.collection.ts"
import { scoreCardEvaluationVerdict, scoreCardLinkedSignalId, scoreCardSourceTitle } from "./score-card-display.ts"

const SOURCE_LABELS: Record<ScoreSourceType, string> = {
  annotation: "Annotation",
  custom: "Custom",
  evaluation: "Evaluation",
}

interface ScoreCardProps {
  readonly score: ScoreRecord
  readonly projectId: string
}

export function ReadOnlyScoreCard({ score, projectId }: ScoreCardProps) {
  const { projectSlug } = useParams({ strict: false })
  const linkedSignalId = scoreCardLinkedSignalId(score)
  const isOccurrence = score.signalId !== null
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
  const evaluationVerdict = scoreCardEvaluationVerdict(score)

  return (
    <div data-score-card-id={score.id} tabIndex={-1} className="flex flex-col gap-1 m-1 p-1 rounded-lg outline-none">
      <div className="flex items-center gap-2">
        <Badge variant="outline" size="small">
          {sourceLabel}
        </Badge>
        <Text.H6 color="foregroundMuted" className="truncate">
          {sourceTitle}
        </Text.H6>
        {evaluationVerdict ? (
          <Badge variant="secondary" size="small">
            {evaluationVerdict}
          </Badge>
        ) : null}
        <Text.H6 color="foregroundMuted">{relativeTime(new Date(score.createdAt))}</Text.H6>
        <div className="ml-auto flex items-center gap-x-1">
          {score.errored ? (
            <Tooltip
              asChild
              trigger={
                <div className="flex h-8 w-8 items-center justify-center">
                  <Icon icon={AlertCircleIcon} size="xs" color="destructiveMutedForeground" />
                </div>
              }
            >
              {score.error ?? "Score generation failed"}
            </Tooltip>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center">
              <Icon
                icon={score.passed ? ThumbsUpIcon : ThumbsDownIcon}
                size="xs"
                color={score.passed ? "successMutedForeground" : "destructiveMutedForeground"}
              />
            </div>
          )}
        </div>
      </div>

      <Text.H6 color="foregroundMuted">Value: {Math.round(score.value * 100)}%</Text.H6>

      {feedback ? <Text.H5 className="whitespace-pre-wrap">{feedback}</Text.H5> : null}

      {linkedSignalName ? (
        <div className="flex items-center gap-2 pt-1">
          {(() => {
            const isNavigable = Boolean(projectSlug && linkedSignalId)
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
                {linkedSignalName}
              </Badge>
            )
            const trigger =
              projectSlug && linkedSignalSlug ? (
                <Link
                  data-no-navigate
                  to="/projects/$projectSlug/signals/$signalSlug"
                  params={{ projectSlug, signalSlug: linkedSignalSlug }}
                  aria-label={`Open signal ${linkedSignalName}`}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex min-w-0"
                >
                  {badge}
                </Link>
              ) : (
                badge
              )
            const tooltip = isOccurrence
              ? linkedSignalDescription
              : `This evaluation monitors ${linkedSignalName}. This run did not record an occurrence.`
            return tooltip ? (
              <Tooltip asChild trigger={trigger}>
                <span className="block max-w-xs whitespace-pre-wrap text-left">{tooltip}</span>
              </Tooltip>
            ) : (
              trigger
            )
          })()}
        </div>
      ) : null}
    </div>
  )
}
