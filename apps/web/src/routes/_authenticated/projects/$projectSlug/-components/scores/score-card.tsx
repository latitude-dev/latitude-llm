import type { ScoreSourceType } from "@domain/scores"
import { Badge, Button, cn, Icon, Text, Tooltip } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Link, useParams } from "@tanstack/react-router"
import { AlertCircleIcon, ShieldAlertIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { useState } from "react"
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

const SOURCE_LABELS: Record<ScoreSourceType, string> = {
  annotation: "Annotation",
  custom: "Custom",
  evaluation: "Evaluation",
}

const COMPACT_SOURCE_LABELS: Record<ScoreSourceType, string> = {
  annotation: "Annotation",
  custom: "Custom score",
  evaluation: "Evaluation",
}

interface ScoreCardProps {
  readonly score: ScoreRecord
  readonly projectId: string
  readonly showLinkedSignal?: boolean
  readonly compact?: boolean
  readonly feedbackPrefix?: string
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

export function ReadOnlyScoreCard({
  score,
  projectId,
  showLinkedSignal = true,
  compact = false,
  feedbackPrefix,
}: ScoreCardProps) {
  const { projectSlug } = useParams({ strict: false })
  const [showFullFeedback, setShowFullFeedback] = useState(false)
  const linkedSignalId = scoreCardLinkedSignalId(score)
  const { data: linkedSignal } = useSignal({
    projectId,
    signalId: linkedSignalId ?? "",
    enabled: showLinkedSignal && linkedSignalId !== null,
  })

  const linkedSignalName = linkedSignal?.name ?? null
  const linkedSignalSlug = linkedSignal?.slug ?? null
  const linkedSignalDescription = linkedSignal?.description?.trim()
  const sourceLabel = SOURCE_LABELS[score.source]
  const sourceTitle = scoreCardSourceTitle(score)
  const feedback = score.feedback?.trim()
  const feedbackPrefixWithSeparator = feedbackPrefix?.trim() ? `${feedbackPrefix.trim()}:` : undefined
  const displayedFeedback =
    feedback &&
    feedbackPrefixWithSeparator &&
    feedback.toLocaleLowerCase().startsWith(feedbackPrefixWithSeparator.toLocaleLowerCase())
      ? feedback.slice(feedbackPrefixWithSeparator.length).trim()
      : feedback
  const showValue = scoreCardShouldShowValue(score)
  const showFeedback = scoreCardShouldShowFeedback(score)
  const evaluationVerdict = scoreCardEvaluationVerdict(score)
  const signalLink =
    showLinkedSignal && linkedSignalId ? (
      <ScoreSignalLink
        projectSlug={projectSlug}
        signalId={linkedSignalId}
        name={linkedSignalName}
        slug={linkedSignalSlug}
        description={linkedSignalDescription}
      />
    ) : null

  if (compact) {
    return (
      <div data-score-card-id={score.id} tabIndex={-1} className="flex flex-col gap-2 px-4 py-3 outline-none">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Text.H6 color="foregroundMuted" noWrap>
              {COMPACT_SOURCE_LABELS[score.source]}
            </Text.H6>
            {evaluationVerdict ? (
              <Text.H6 color="foregroundMuted" noWrap>
                · {evaluationVerdict}
              </Text.H6>
            ) : null}
            <Text.H6 color="foregroundMuted" noWrap>
              · {relativeTime(new Date(score.createdAt))}
            </Text.H6>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {showValue && !score.errored && !evaluationVerdict ? (
              <Text.H6B
                className={cn("tabular-nums", {
                  "text-destructive-muted-foreground": !score.passed,
                  "text-success-muted-foreground": score.passed,
                })}
              >
                Score: {Math.round(score.value * 100)}%
              </Text.H6B>
            ) : null}
            {score.errored ? (
              <Tooltip
                asChild
                trigger={
                  <div className="flex h-7 w-7 items-center justify-center">
                    <Icon icon={AlertCircleIcon} size="xs" color="destructiveMutedForeground" />
                  </div>
                }
              >
                {score.error ?? "Score generation failed"}
              </Tooltip>
            ) : evaluationVerdict ? null : (
              <div className="flex h-7 w-7 items-center justify-center">
                <Icon
                  icon={score.passed ? ThumbsUpIcon : ThumbsDownIcon}
                  size="xs"
                  color={score.passed ? "successMutedForeground" : "destructiveMutedForeground"}
                />
              </div>
            )}
          </div>
        </div>

        {showFeedback && displayedFeedback ? (
          <div className="flex flex-col items-start gap-1">
            <Text.H6
              className="whitespace-pre-wrap leading-5"
              wordBreak="words"
              {...(!showFullFeedback ? { lineClamp: 3 } : {})}
            >
              {displayedFeedback}
            </Text.H6>
            {displayedFeedback.length > 240 ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 py-0"
                onClick={() => setShowFullFeedback((current) => !current)}
              >
                {showFullFeedback ? "Show less" : "Show more"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {score.source !== "evaluation" && signalLink ? (
          <div className="flex items-center gap-2 pt-1">{signalLink}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div data-score-card-id={score.id} tabIndex={-1} className="m-1 flex flex-col gap-1 rounded-lg p-1 outline-none">
      <div className="flex items-center gap-2">
        <Badge variant="outline" size="small">
          {sourceLabel}
        </Badge>
        {score.source === "evaluation" ? signalLink : null}
        {sourceTitle ? (
          <Text.H6 color="foregroundMuted" className="truncate">
            {sourceTitle}
          </Text.H6>
        ) : null}
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
          ) : evaluationVerdict ? null : (
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

      {showValue ? <Text.H6 color="foregroundMuted">Value: {Math.round(score.value * 100)}%</Text.H6> : null}

      {showFeedback && displayedFeedback ? (
        <Text.H5 className="whitespace-pre-wrap">{displayedFeedback}</Text.H5>
      ) : null}

      {score.source !== "evaluation" && signalLink ? (
        <div className="flex items-center gap-2 pt-1">{signalLink}</div>
      ) : null}
    </div>
  )
}
