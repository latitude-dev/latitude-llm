import { useMemo } from 'react'

import type { SelectedContext } from '@latitude-data/constants'
import { isMainSpan } from '@latitude-data/constants'

import type { AnnotatedTextRange } from '../../../AnnotationsContext'
import { useAnnotations } from '../../../AnnotationsContext'

type UseBlockAnnotationsProps = {
  contentType: SelectedContext['contentType']
  messageIndex?: number
  contentBlockIndex?: number
  requireMainSpan?: boolean
}

type EvaluationItem = NonNullable<
  ReturnType<typeof useAnnotations>['evaluations']
>[number]

/**
 * Returns annotations and evaluation state for a message content block.
 */
export function useBlockAnnotations({
  contentType,
  messageIndex,
  contentBlockIndex,
  requireMainSpan = false,
}: UseBlockAnnotationsProps) {
  const { getAnnotationsForBlock, evaluations = [], span } = useAnnotations()
  const isMainSpanType = !!span && isMainSpan(span)
  const blockAnnotations = useMemo(() => {
    if (
      messageIndex === undefined ||
      contentBlockIndex === undefined ||
      !getAnnotationsForBlock
    ) {
      return [] as AnnotatedTextRange[]
    }

    if (requireMainSpan && !isMainSpanType) {
      return [] as AnnotatedTextRange[]
    }

    return getAnnotationsForBlock(messageIndex, contentBlockIndex).filter(
      (annotation) => annotation.context.contentType === contentType,
    )
  }, [
    messageIndex,
    contentBlockIndex,
    getAnnotationsForBlock,
    contentType,
    requireMainSpan,
    isMainSpanType,
  ])

  const evaluation = evaluations[0] as EvaluationItem | undefined

  return {
    blockAnnotations,
    evaluation,
    span,
    isMainSpan: isMainSpanType,
  }
}
