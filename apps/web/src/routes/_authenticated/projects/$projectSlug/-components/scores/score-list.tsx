import { cn, Skeleton, Text } from "@repo/ui"
import { type KeyboardEvent, type MouseEvent, type ReactNode, useCallback } from "react"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import type { ScoreRecord } from "../../../../../../domains/scores/scores.functions.ts"
import { AnnotationCard } from "../annotations/annotation-card.tsx"
import { AnnotationInput } from "../annotations/annotation-input.tsx"
import type { AnnotationSaveData } from "../annotations/annotation-list.tsx"
import { isGlobalAnnotation } from "../annotations/hooks/use-annotation-navigation.ts"
import { ReadOnlyScoreCard } from "./score-card.tsx"

function isAnnotationScore(score: ScoreRecord): boolean {
  return score.source === "annotation"
}

const asAnnotationRecord = (score: ScoreRecord): AnnotationRecord => score as unknown as AnnotationRecord

/**
 * Presentational scores surface shared by the trace drawer and session panel:
 * annotation create form + newest-first list of every score source.
 */
export function ScoreList({
  projectId,
  scores,
  isLoading,
  isError,
  intro,
  showCreateForm = true,
  createPending = false,
  onCreate,
  updatePending = false,
  onUpdate,
  onScoreClick,
  selectedScoreId,
  renderItemAccessory,
}: {
  readonly projectId: string
  readonly scores: readonly ScoreRecord[]
  readonly isLoading: boolean
  readonly isError: boolean
  readonly intro?: ReactNode
  readonly showCreateForm?: boolean
  readonly createPending?: boolean
  readonly onCreate: (data: AnnotationSaveData) => void
  readonly updatePending?: boolean
  readonly onUpdate: (score: AnnotationRecord, data: AnnotationSaveData) => void
  readonly onScoreClick?: (score: ScoreRecord) => void
  readonly selectedScoreId?: string | undefined
  readonly renderItemAccessory?: (score: ScoreRecord) => ReactNode
}) {
  const sortedScores = [...scores].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const onClickScoreCard = useCallback(
    ({ score, clickable }: { score: ScoreRecord; clickable: boolean }) =>
      (event: MouseEvent | KeyboardEvent) => {
        if (!clickable) return
        const target = event.target
        if (target instanceof Element && target.closest("[data-no-navigate]")) return
        if ("key" in event && event.key !== "Enter" && event.key !== " ") return
        onScoreClick?.(score)
      },
    [onScoreClick],
  )

  return (
    <div className="flex flex-col flex-1 overflow-y-auto p-6 gap-6">
      {intro}

      <div className="flex flex-col gap-4">
        {showCreateForm ? <AnnotationInput projectId={projectId} isLoading={createPending} onSave={onCreate} /> : null}

        {isLoading ? (
          <div className="flex flex-col gap-4 pt-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError ? (
          <Text.H6 color="foregroundMuted" className="pt-4">
            Could not load scores.
          </Text.H6>
        ) : sortedScores.length > 0 ? (
          <div className="flex flex-col gap-2 pt-4">
            {sortedScores.map((score) => {
              const isSelected = selectedScoreId === score.id
              const annotation = isAnnotationScore(score) ? asAnnotationRecord(score) : null
              const isGlobal = annotation ? isGlobalAnnotation(annotation) : false
              const clickable = annotation !== null && !isGlobal && onScoreClick !== undefined

              return (
                /* biome-ignore lint/a11y/noStaticElementInteractions: only interactive for navigable annotations */
                <div
                  key={`${score.id}:${score.draftedAt !== null ? "draft" : "pub"}`}
                  data-annotation-navigation={clickable ? "true" : undefined}
                  className={cn(clickable ? "cursor-pointer" : undefined)}
                  onClick={onClickScoreCard({ score, clickable })}
                  onKeyDown={onClickScoreCard({ score, clickable })}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                >
                  {renderItemAccessory?.(score)}
                  {annotation ? (
                    <AnnotationCard
                      annotation={annotation}
                      projectId={projectId}
                      isGlobal={isGlobal}
                      isUpdateLoading={updatePending}
                      onUpdate={(data) => onUpdate(annotation, data)}
                      className={cn(
                        clickable && "hover:bg-secondary/60",
                        isSelected && "bg-secondary ring-2 ring-primary/50 ring-offset-2",
                      )}
                    />
                  ) : (
                    <ReadOnlyScoreCard
                      score={score}
                      projectId={projectId}
                      className={cn(
                        clickable && "hover:bg-secondary/60",
                        isSelected && "bg-secondary ring-2 ring-primary/50 ring-offset-2",
                      )}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
