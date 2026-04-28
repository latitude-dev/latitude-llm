import { cn, Skeleton, Text } from "@repo/ui"
import { type KeyboardEvent, type MouseEvent, useCallback } from "react"
import {
  useAnnotationsByTrace,
  useCreateAnnotation,
  useUpdateAnnotation,
} from "../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { AnnotationCard } from "./annotation-card.tsx"
import { AnnotationInput } from "./annotation-input.tsx"
import { isGlobalAnnotation } from "./hooks/use-annotation-navigation.ts"

export function TraceAnnotationsList({
  projectId,
  traceId,
  selectedAnnotationId,
  onAnnotationClick,
  hideAnnotationIntro = false,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly selectedAnnotationId?: string | undefined
  readonly onAnnotationClick?: ((annotation: AnnotationRecord) => void) | undefined
  /** When true, omit the Annotations title and helper line (e.g. trace detail tab already shows the label). */
  readonly hideAnnotationIntro?: boolean | undefined
}) {
  const {
    data: annotationsData,
    isLoading: annotationsLoading,
    isError: annotationsError,
  } = useAnnotationsByTrace({
    projectId,
    traceId,
    draftMode: "include",
  })
  const createMutation = useCreateAnnotation()
  const updateMutation = useUpdateAnnotation()

  const annotations: readonly AnnotationRecord[] = annotationsData?.items ?? []
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

  function handleSave(data: { passed: boolean; comment: string; issueId: string | null }) {
    createMutation.mutate({
      projectId,
      traceId,
      value: data.passed ? 1 : 0,
      passed: data.passed,
      feedback: data.comment || " ",
      ...(data.issueId ? { issueId: data.issueId } : {}),
    })
  }

  function handleUpdate(
    annotation: AnnotationRecord,
    data: { passed: boolean; comment: string; issueId: string | null },
  ) {
    updateMutation.mutate({
      scoreId: annotation.id,
      projectId,
      traceId,
      value: data.passed ? 1 : 0,
      passed: data.passed,
      feedback: data.comment || " ",
      issueId: data.issueId ?? undefined,
    })
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto p-6 gap-6">
      {!hideAnnotationIntro && (
        <div className="flex flex-col">
          <Text.H5M>Annotations</Text.H5M>
          <Text.H5 color="foregroundMuted">
            Select text, a message or annotate the entire conversation in this section
          </Text.H5>
        </div>
      )}

      {/* Input and list */}
      <div className="flex flex-col gap-4">
        <AnnotationInput projectId={projectId} isLoading={createMutation.isPending} onSave={handleSave} />

        {annotationsLoading ? (
          <div className="flex flex-col gap-4 pt-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : annotationsError ? (
          <Text.H6 color="foregroundMuted" className="pt-4">
            Could not load existing annotations.
          </Text.H6>
        ) : sortedAnnotations.length > 0 ? (
          <div className="flex flex-col gap-2 pt-4">
            {sortedAnnotations.map((annotation) => {
              const isGlobal = isGlobalAnnotation(annotation)
              const isSelected = selectedAnnotationId === annotation.id
              return (
                /* biome-ignore lint/a11y/noStaticElementInteractions: only interactive when not global */
                <div
                  key={`${annotation.id}:${annotation.draftedAt !== null ? "draft" : "pub"}`}
                  data-annotation-navigation={isGlobal ? undefined : "true"}
                  className={cn(
                    "rounded-lg",
                    isGlobal ? undefined : "cursor-pointer hover:bg-secondary",
                    isSelected && "bg-secondary ring-2 ring-primary/50 ring-offset-2",
                  )}
                  onClick={onClickAnnotationCard({ isGlobal, annotation })}
                  onKeyDown={onClickAnnotationCard({ isGlobal, annotation })}
                  role={isGlobal ? undefined : "button"}
                  tabIndex={isGlobal ? undefined : 0}
                >
                  <AnnotationCard
                    annotation={annotation}
                    projectId={projectId}
                    isGlobal={isGlobal}
                    isUpdateLoading={updateMutation.isPending}
                    onUpdate={(data) => handleUpdate(annotation, data)}
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
