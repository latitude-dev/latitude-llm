'use client'

import React, {
  createContext,
  useContext,
  useMemo,
  ReactNode,
  useCallback,
  useState,
} from 'react'
import type {
  EvaluationResultV2,
  EvaluationType,
  HumanEvaluationMetric,
  SelectedContext,
  SpanWithDetails,
} from '@latitude-data/constants'
import { useAnnotationBySpan } from '$/hooks/useAnnotationsBySpan'
import { ResultWithEvaluationV2 } from '@latitude-data/core/schema/types'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Message } from '@latitude-data/constants/legacyCompiler'
import { useTextSelection } from './useTextSelection'
import { SelectionPopover } from './SelectionPopover'
import { AnnotationClickPopover } from './AnnotationClickPopover'

type AnnotationsContextValue = {
  getAnnotationsForBlock?: (
    messageIndex: number,
    contentBlockIndex: number,
  ) => AnnotatedTextRange[]
  onAnnotationClick?: (
    annotation: AnnotatedTextRange,
    element: HTMLElement,
  ) => void
  evaluations?: ReturnType<typeof useAnnotationBySpan>['evaluations']
  annotations?: ReturnType<typeof useAnnotationBySpan>['annotations']
  span?: SpanWithDetails
  containerRef?: React.RefObject<HTMLDivElement>
  currentSelection?: { context: SelectedContext; selectedText: string } | null
  clickedAnnotation?: AnnotatedTextRange | null
  handleAnnotate?: (
    result: EvaluationResultV2<EvaluationType.Human, HumanEvaluationMetric>,
  ) => void
}

const AnnotationsContext = createContext<AnnotationsContextValue>({})

/**
 * Provider component that enables annotation capabilities for message lists.
 *
 * This provider handles all annotation-related functionality including:
 * - Text selection and popover display for creating new annotations
 * - Click handlers for existing annotations
 * - Annotation data fetching and organization
 * - Styling for text selection and annotations
 *
 * When `messages` and `span` are provided, the provider automatically enables
 * text selection and renders popovers for both text selection and annotation clicks.
 *
 * @param props - Component props
 * @param props.children - React children to wrap with annotation context
 * @param props.project - Project instance for fetching annotations
 * @param props.commit - Commit instance for fetching annotations
 * @param props.span - Optional span to annotate. When provided with messages, enables popovers
 * @param props.messages - Optional array of messages. When provided with span, enables text selection
 *
 * @example
 * ```tsx
 * <AnnotationsProvider project={project} commit={commit} span={span} messages={messages}>
 *   <MessageList messages={messages} />
 * </AnnotationsProvider>
 * ```
 */
export function AnnotationsProvider({
  children,
  project,
  commit,
  span,
  messages,
  onAnnotate,
}: {
  children: ReactNode
  project: Project
  commit: Commit
  messages?: Message[]
  span?: SpanWithDetails
  onAnnotate?: (
    result: EvaluationResultV2<EvaluationType.Human, HumanEvaluationMetric>,
  ) => void
}) {
  const { annotations, evaluations } = useAnnotationBySpan({
    project,
    commit,
    span,
  })
  const { getAnnotationsForBlock } = useAnnotatedText(
    annotations.map((a) => ({ result: a.result, evaluation: a.evaluation })),
  )
  const [clickedAnnotation, setClickedAnnotation] = useState<{
    annotation: AnnotatedTextRange
    position: { x: number; y: number }
  } | null>(null)
  const handleAnnotationClick = useCallback(
    (annotation: AnnotatedTextRange, element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      setClickedAnnotation({
        annotation,
        position: {
          x: rect.left + rect.width / 2,
          y: rect.top,
        },
      })
    },
    [setClickedAnnotation],
  )
  const handleCloseAnnotation = useCallback(() => {
    setClickedAnnotation(null)
  }, [setClickedAnnotation])

  const { selection, popoverPosition, containerRef, clearSelection } =
    useTextSelection(messages ?? [])

  const showPopovers = !!span && !!messages && messages.length > 0
  const handleAnnotate = useCallback(
    (
      result: EvaluationResultV2<EvaluationType.Human, HumanEvaluationMetric>,
    ) => {
      onAnnotate?.(result)
      if (selection && popoverPosition) {
        const evaluation = evaluations.find(
          (e) => e.uuid === result.evaluationUuid,
        )
        if (evaluation) {
          const annotation: AnnotatedTextRange = {
            context: selection.context,
            result,
            evaluation,
          }

          setClickedAnnotation({
            annotation,
            position: popoverPosition,
          })
          clearSelection()
        }
      }
    },
    [onAnnotate, selection, popoverPosition, evaluations, clearSelection],
  )

  return (
    <AnnotationsContext.Provider
      value={{
        getAnnotationsForBlock,
        onAnnotationClick: handleAnnotationClick,
        evaluations,
        annotations,
        span,
        containerRef: containerRef as React.RefObject<HTMLDivElement>,
        currentSelection: selection,
        clickedAnnotation: clickedAnnotation?.annotation ?? null,
        handleAnnotate,
      }}
    >
      <div ref={containerRef} className='relative' data-traces-container>
        {children}
        {showPopovers && (
          <>
            {selection && popoverPosition && (
              <SelectionPopover
                selection={selection}
                position={popoverPosition}
                onClose={clearSelection}
                span={span}
                onAnnotate={handleAnnotate}
              />
            )}
            <AnnotationClickPopover
              clickedAnnotation={clickedAnnotation}
              onClose={handleCloseAnnotation}
              span={span}
            />
          </>
        )}
      </div>
    </AnnotationsContext.Provider>
  )
}

/**
 * Hook to access annotation context values.
 *
 * Must be used within an `AnnotationsProvider`. Provides access to:
 * - Annotation data and evaluations
 * - Helper functions for retrieving annotations by block
 * - Click handlers for annotations
 * - Container ref for text selection
 *
 * @returns Annotation context value containing annotations, evaluations, and handlers
 *
 * @example
 * ```tsx
 * const { getAnnotationsForBlock, annotations, span } = useAnnotations()
 * const blockAnnotations = getAnnotationsForBlock?.(0, 0) ?? []
 * ```
 */
export function useAnnotations() {
  return useContext(AnnotationsContext)
}

export type AnnotatedTextRange = {
  context: SelectedContext
  result: ResultWithEvaluationV2['result']
  evaluation: ResultWithEvaluationV2['evaluation']
}

/**
 * Hook to extract and organize annotations from evaluation results.
 * Groups annotations by their location (message index, content block index, text range).
 *
 * @param results - Array of evaluation results that may contain selectedContexts with annotations
 * @returns Object containing:
 *   - annotations: Map of text ranges to their associated annotation data
 *   - getAnnotationsForBlock: Helper function to retrieve annotations for a specific message/content block
 */
export function useAnnotatedText(results: ResultWithEvaluationV2[]) {
  const annotations = useMemo(() => {
    const annotatedRanges: Map<string, AnnotatedTextRange[]> = new Map()

    for (const item of results) {
      if (
        !item.result.metadata ||
        !('selectedContexts' in item.result.metadata)
      ) {
        continue
      }

      const selectedContexts = item.result.metadata.selectedContexts
      if (!selectedContexts || selectedContexts.length === 0) {
        continue
      }

      for (const context of selectedContexts) {
        const key = `${context.messageIndex}-${context.contentBlockIndex}-${context.textRange?.start}-${context.textRange?.end}`

        if (!annotatedRanges.has(key)) {
          annotatedRanges.set(key, [])
        }

        annotatedRanges.get(key)!.push({
          context,
          result: item.result,
          evaluation: item.evaluation,
        })
      }
    }

    return annotatedRanges
  }, [results])

  // Helper to get annotations for a specific message and content block
  const getAnnotationsForBlock = useMemo(() => {
    return (messageIndex: number, contentBlockIndex: number) => {
      const matchingAnnotations: AnnotatedTextRange[] = []

      for (const [, ranges] of annotations.entries()) {
        for (const range of ranges) {
          if (
            range.context.messageIndex === messageIndex &&
            range.context.contentBlockIndex === contentBlockIndex
          ) {
            matchingAnnotations.push(range)
          }
        }
      }

      return matchingAnnotations
    }
  }, [annotations])

  return useMemo(
    () => ({
      annotations,
      getAnnotationsForBlock,
    }),
    [annotations, getAnnotationsForBlock],
  )
}
