import { Icon, Skeleton, Status, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { ThumbsDownIcon, ThumbsUpIcon, TriangleAlertIcon } from "lucide-react"
import type { MouseEvent } from "react"

export interface IndicatorAnnotationCounts {
  readonly positiveCount: number
  readonly negativeCount: number
}

/**
 * Inline cell that surfaces "needs-attention" signals at the row grain:
 * positive/negative annotations and an error count. Used by both the traces
 * and sessions list — sessions pass `annotationCounts: undefined` because
 * annotation rollups don't exist at the session grain.
 */
export function IndicatorsCell({
  errorCount,
  annotationCounts,
  annotationCountsPending,
  onErrorClick,
  onAnnotationClick,
}: {
  readonly errorCount: number
  readonly annotationCounts?: IndicatorAnnotationCounts | undefined
  readonly annotationCountsPending?: boolean | undefined
  readonly onErrorClick?: (e: MouseEvent) => void
  readonly onAnnotationClick?: (e: MouseEvent) => void
}) {
  const positiveCount = annotationCounts?.positiveCount ?? 0
  const negativeCount = annotationCounts?.negativeCount ?? 0
  const hasBadges = positiveCount > 0 || negativeCount > 0 || errorCount > 0
  const showIconOnly = positiveCount > 0 && negativeCount > 0 && errorCount > 0

  return (
    <span className="flex items-center justify-start gap-1">
      {positiveCount > 0 ? (
        <Tooltip
          asChild
          trigger={
            <Status
              variant="success"
              indicator={<Icon icon={ThumbsUpIcon} size="xs" weight="L" />}
              label={showIconOnly ? "" : formatCount(positiveCount)}
              className={showIconOnly ? "gap-0 px-1.5" : onAnnotationClick ? "cursor-pointer" : undefined}
              aria-label={`${positiveCount} positive ${positiveCount === 1 ? "annotation" : "annotations"}`}
              onClick={onAnnotationClick}
            />
          }
        >
          {positiveCount} positive {positiveCount === 1 ? "annotation" : "annotations"}
        </Tooltip>
      ) : null}
      {negativeCount > 0 ? (
        <Tooltip
          asChild
          trigger={
            <Status
              variant="destructive"
              indicator={<Icon icon={ThumbsDownIcon} size="xs" weight="L" />}
              label={showIconOnly ? "" : formatCount(negativeCount)}
              className={showIconOnly ? "gap-0 px-1.5" : onAnnotationClick ? "cursor-pointer" : undefined}
              aria-label={`${negativeCount} negative ${negativeCount === 1 ? "annotation" : "annotations"}`}
              onClick={onAnnotationClick}
            />
          }
        >
          {negativeCount} negative {negativeCount === 1 ? "annotation" : "annotations"}
        </Tooltip>
      ) : null}
      {errorCount > 0 ? (
        <Tooltip
          asChild
          trigger={
            <Status
              variant="warning"
              indicator={<Icon icon={TriangleAlertIcon} size="xs" weight="L" />}
              label={showIconOnly ? "" : formatCount(errorCount)}
              className={showIconOnly ? "gap-0 px-1.5" : onErrorClick ? "cursor-pointer" : undefined}
              aria-label={`${errorCount} ${errorCount === 1 ? "error" : "errors"}`}
              onClick={onErrorClick}
            />
          }
        >
          {errorCount} {errorCount === 1 ? "error" : "errors"}
        </Tooltip>
      ) : null}
      {!hasBadges && annotationCountsPending ? <Skeleton className="h-5 w-20" /> : null}
    </span>
  )
}
