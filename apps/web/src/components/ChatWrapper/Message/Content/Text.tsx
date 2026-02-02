import React, { memo, useMemo, useCallback } from 'react'

import { PromptlSourceRef } from '@latitude-data/constants/legacyCompiler'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ProseColor, TextColor } from '@latitude-data/web-ui/tokens'
import { computeSegments, groupSegments, type Reference } from './helpers'
import { ReferenceComponent } from './_components/Reference'
import { MarkdownContent } from './_components/MarkdownContent'
import { MarkdownSize } from '@latitude-data/web-ui/atoms/Markdown'
import { AnnotatedTextRange, useAnnotations } from '../../AnnotationsContext'
import { cn } from '@latitude-data/web-ui/utils'
import { isMainSpan } from '@latitude-data/constants'

const ContentJson = memo(({ json }: { json: string }) => {
  return (
    <div className='max-w-full'>
      <div className='overflow-hidden rounded-xl w-full'>
        <CodeBlock language='json'>{json}</CodeBlock>
      </div>
    </div>
  )
})

const ContentText = memo(
  ({
    index = 0,
    color,
    size,
    text,
    parameters = [],
    sourceMap = [],
    messageIndex,
    contentBlockIndex,
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    text: string | undefined
    parameters?: string[]
    sourceMap?: PromptlSourceRef[]
    messageIndex?: number
    contentBlockIndex?: number
  }) => {
    const TextComponent = size === 'small' ? Text.H5 : Text.H4
    const {
      getAnnotationsForBlock,
      onAnnotationClick,
      currentSelection,
      clickedAnnotation,
      span,
    } = useAnnotations()

    const hasBlockIndices =
      messageIndex !== undefined && contentBlockIndex !== undefined
    const isAnnotationEnabled =
      hasBlockIndices && !!getAnnotationsForBlock && !!span && isMainSpan(span)

    const blockAnnotations = useMemo(() => {
      if (!isAnnotationEnabled || !text) return []

      return getAnnotationsForBlock!(messageIndex!, contentBlockIndex!).filter(
        (ann) => ann.context.contentType === 'text',
      )
    }, [isAnnotationEnabled, messageIndex, contentBlockIndex, getAnnotationsForBlock, text])

    const isCurrentBlockSelected = useMemo(() => {
      if (!isAnnotationEnabled || !currentSelection) return false

      return (
        currentSelection.context.messageIndex === messageIndex &&
        currentSelection.context.contentBlockIndex === contentBlockIndex &&
        currentSelection.context.contentType === 'text'
      )
    }, [isAnnotationEnabled, currentSelection, messageIndex, contentBlockIndex])

    const segments = useMemo(
      () => computeSegments('text', text, sourceMap, parameters),
      [text, sourceMap, parameters],
    )
    const groups = useMemo(() => groupSegments(segments), [segments])

    const handleAnnotationClick = useCallback(
      (e: React.MouseEvent<HTMLElement>, annotation: AnnotatedTextRange) => {
        e.stopPropagation()
        if (onAnnotationClick) {
          onAnnotationClick(annotation, e.currentTarget)
        }
      },
      [onAnnotationClick],
    )

    const sortedRanges = useMemo(() => {
      if (!isAnnotationEnabled || !text) return []
      const ranges: Array<{
        start: number
        end: number
        type: 'annotation' | 'selection'
        annotation?: AnnotatedTextRange
      }> = []

      // Add annotation ranges
      for (const ann of blockAnnotations) {
        if (ann.context.textRange) {
          ranges.push({
            start: ann.context.textRange.start,
            end: ann.context.textRange.end,
            type: 'annotation',
            annotation: ann,
          })
        }
      }

      // Add current selection range if it matches this block
      if (
        isCurrentBlockSelected &&
        currentSelection?.context.textRange &&
        !blockAnnotations.some(
          (ann) =>
            ann.context.textRange?.start ===
            currentSelection.context.textRange?.start &&
            ann.context.textRange?.end ===
            currentSelection.context.textRange?.end,
        )
      ) {
        ranges.push({
          start: currentSelection.context.textRange.start,
          end: currentSelection.context.textRange.end,
          type: 'selection',
        })
      }

      return ranges.sort((a, b) => a.start - b.start)
    }, [isAnnotationEnabled, text, blockAnnotations, isCurrentBlockSelected, currentSelection])

    const renderSegmentWithAnnotations = useCallback(
      (segment: string | Reference, segmentStart: number): React.ReactNode => {
        if (typeof segment !== 'string') {
          return <ReferenceComponent reference={segment} />
        }

        const segmentEnd = segmentStart + segment.length

        // Find ranges that overlap with this segment
        const overlappingRanges = sortedRanges.filter((range) => {
          return range.start < segmentEnd && range.end > segmentStart
        })

        if (overlappingRanges.length === 0) {
          return segment
        }

        // Split segment by ranges (annotations and selection)
        const parts: Array<{
          text: string
          type: 'annotation' | 'selection' | 'normal'
          annotation?: AnnotatedTextRange
        }> = []
        let currentPos = 0

        for (const range of overlappingRanges) {
          const rangeStart = Math.max(0, range.start - segmentStart)
          const rangeEnd = Math.min(segment.length, range.end - segmentStart)

          // Add text before range
          if (rangeStart > currentPos) {
            parts.push({
              text: segment.slice(currentPos, rangeStart),
              type: 'normal',
            })
          }

          // Add range text (annotation or selection)
          parts.push({
            text: segment.slice(rangeStart, rangeEnd),
            type: range.type,
            annotation: range.annotation,
          })

          currentPos = rangeEnd
        }

        // Add remaining text
        if (currentPos < segment.length) {
          parts.push({
            text: segment.slice(currentPos),
            type: 'normal',
          })
        }

        return parts.map((part, partIndex) => {
          if (part.type === 'annotation' && part.annotation) {
            const annotationKey = `${part.annotation.result.uuid}-${messageIndex}-${contentBlockIndex}-${part.annotation.context.textRange?.start}-${part.annotation.context.textRange?.end}`
            const isClicked =
              clickedAnnotation &&
              clickedAnnotation.result.uuid === part.annotation.result.uuid &&
              clickedAnnotation.context.textRange?.start ===
              part.annotation.context.textRange?.start &&
              clickedAnnotation.context.textRange?.end ===
              part.annotation.context.textRange?.end
            return (
              <span
                key={`part-${partIndex}`}
                data-annotated-text
                data-annotation-key={annotationKey}
                onClick={(e) => handleAnnotationClick(e, part.annotation!)}
                className={cn('cursor-pointer', {
                  'bg-destructive-muted dark:bg-destructive-muted/50':
                    part.annotation.result.hasPassed === false,
                  'bg-success-muted dark:bg-success-muted/50':
                    part.annotation.result.hasPassed,
                  'border-b-2 border-destructive/50 dark:border-destructive/50':
                    part.annotation.result.hasPassed === false && isClicked,
                  'border-b-2 border-success/50 dark:border-success/50':
                    part.annotation.result.hasPassed && isClicked,
                })}
              >
                {part.text}
              </span>
            )
          }
          if (part.type === 'selection') {
            return (
              <span
                key={`part-${partIndex}`}
                data-selected-text
                className='bg-yellow-100 border-b-2 border-yellow-300 dark:bg-yellow-900/30 cursor-pointer hover:bg-yellow-200 dark:hover:bg-yellow-900/50'
              >
                {part.text}
              </span>
            )
          }
          return <span key={`part-${partIndex}`}>{part.text}</span>
        })
      },
      [
        sortedRanges,
        messageIndex,
        contentBlockIndex,
        clickedAnnotation,
        handleAnnotationClick,
      ],
    )

    const messagesList = useMemo(() => {
      let cumulativeOffset = 0
      return groups.map((group, groupIndex) => {
        const groupElements = group.map((segment, segmentIndex) => {
          const segmentStart = cumulativeOffset
          const segmentLength =
            typeof segment === 'string'
              ? segment.length
              : segment.content.length
          const rendered = renderSegmentWithAnnotations(segment, segmentStart)
          cumulativeOffset += segmentLength
          return (
            <span key={`${index}-group-${groupIndex}-segment-${segmentIndex}`}>
              {rendered}
            </span>
          )
        })
        cumulativeOffset += 1 // newline between groups

        return (
          <TextComponent
            color={color}
            whiteSpace='preWrap'
            wordBreak='breakWord'
            ellipsis
            key={`${index}-group-${groupIndex}`}
          >
            {groupElements}
          </TextComponent>
        )
      })
    }, [groups, index, color, TextComponent, renderSegmentWithAnnotations])

    return (
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-y-1'>{messagesList}</div>
      </div>
    )
  },
)

export function TextMessageContent<M extends MarkdownSize | 'none'>({
  index = 0,
  text,
  debugMode,
  color,
  size,
  parameters = [],
  sourceMap = [],
  markdownSize,
  messageIndex,
  contentBlockIndex,
}: {
  index?: number
  text: string | undefined
  color: M extends 'none' ? TextColor : Extract<TextColor, ProseColor>
  size?: 'default' | 'small'
  parameters?: string[]
  debugMode?: boolean
  sourceMap?: PromptlSourceRef[]
  markdownSize: M
  messageIndex?: number
  contentBlockIndex?: number
}) {
  const stringifiedJson = useMemo(() => {
    if (!text) return undefined
    try {
      const object = JSON.parse(text)
      return JSON.stringify(object, null, 2)
    } catch (_) {
      return undefined
    }
  }, [text])

  if (stringifiedJson) {
    return <ContentJson json={stringifiedJson} />
  }

  if (!debugMode && text && markdownSize !== 'none') {
    return (
      <MarkdownContent
        text={text}
        size={markdownSize}
        color={color as ProseColor}
      />
    )
  }

  return (
    <ContentText
      index={index}
      color={color}
      size={size}
      text={text}
      parameters={parameters}
      sourceMap={debugMode ? sourceMap : undefined}
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
    />
  )
}
