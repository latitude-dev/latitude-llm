import { cn, Skeleton, Text } from "@repo/ui"
import { type KeyboardEvent, type MouseEvent, type ReactNode, useCallback } from "react"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { AnnotationCard } from "./annotation-card.tsx"
import { AnnotationInput } from "./annotation-input.tsx"
import { isGlobalAnnotation } from "./hooks/use-annotation-navigation.ts"

export type AnnotationSaveData = { passed: boolean; comment: string; issueId: string | null }

/**
 * Presentational annotation surface shared by the trace drawer
 * (`TraceAnnotationsList`) and the session panel's Annotations tab: the create
 * form + the newest-first list of clickable `AnnotationCard`s, with the
 * `data-no-navigate` click guard. Data fetching, which trace create/update
 * targets, and what a card click does are all the caller's concern.
 */
export function AnnotationList({
  projectId,
  annotations,
  isLoading,
  isError,
  intro,
  showCreateForm = true,
  createPending = false,
  onCreate,
  updatePending = false,
  onUpdate,
  onAnnotationClick,
  selectedAnnotationId,
  renderItemAccessory,
}: {
  readonly projectId: string
  readonly annotations: readonly AnnotationRecord[]
  readonly isLoading: boolean
  readonly isError: boolean
  /** Optional header above the form (e.g. the trace drawer's "Annotations" intro). */
  readonly intro?: ReactNode
  readonly showCreateForm?: boolean
  readonly createPending?: boolean
  readonly onCreate: (data: AnnotationSaveData) => void
  readonly updatePending?: boolean
  readonly onUpdate: (annotation: AnnotationRecord, data: AnnotationSaveData) => void
  /** Called when a non-global card is activated. Omit to make cards non-clickable. */
  readonly onAnnotationClick?: (annotation: AnnotationRecord) => void
  readonly selectedAnnotationId?: string | undefined
  /** Optional content rendered above each card (e.g. the session's "Turn N" label). */
  readonly renderItemAccessory?: (annotation: AnnotationRecord) => ReactNode
}) {
  const sortedAnnotations = [...annotations].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const onClickAnnotationCard = useCallback(
    ({ isGlobal, annotation }: { isGlobal: boolean; annotation: AnnotationRecord }) =>
      (event: MouseEvent | KeyboardEvent) => {
        if (isGlobal) return
        const target = event.target
        if (target instanceof Element && target.closest("[data-no-navigate]")) return
        if ("key" in event && event.key !== "Enter" && event.key !== " ") return
        onAnnotationClick?.(annotation)
      },
    [onAnnotationClick],
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
            Could not load existing annotations.
          </Text.H6>
        ) : sortedAnnotations.length > 0 ? (
          <div className="flex flex-col gap-2 pt-4">
            {sortedAnnotations.map((annotation) => {
              const isGlobal = isGlobalAnnotation(annotation)
              const isSelected = selectedAnnotationId === annotation.id
              const clickable = !isGlobal && onAnnotationClick !== undefined
              return (
                /* biome-ignore lint/a11y/noStaticElementInteractions: only interactive when not global */
                <div
                  key={`${annotation.id}:${annotation.draftedAt !== null ? "draft" : "pub"}`}
                  data-annotation-navigation={isGlobal ? undefined : "true"}
                  className={cn(
                    "rounded-lg",
                    clickable ? "cursor-pointer hover:bg-secondary" : undefined,
                    isSelected && "bg-secondary ring-2 ring-primary/50 ring-offset-2",
                  )}
                  onClick={onClickAnnotationCard({ isGlobal, annotation })}
                  onKeyDown={onClickAnnotationCard({ isGlobal, annotation })}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                >
                  {renderItemAccessory?.(annotation)}
                  <AnnotationCard
                    annotation={annotation}
                    projectId={projectId}
                    isGlobal={isGlobal}
                    isUpdateLoading={updatePending}
                    onUpdate={(data) => onUpdate(annotation, data)}
                  />
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
