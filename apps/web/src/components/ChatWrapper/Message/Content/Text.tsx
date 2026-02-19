import { PromptlSourceRef } from '@latitude-data/constants/messages'
import React, { memo, useCallback, useMemo } from 'react'

import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { MarkdownSize } from '@latitude-data/web-ui/atoms/Markdown'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ProseColor, TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { AnnotatedTextRange, useAnnotations } from '../../AnnotationsContext'
import { AnnotationSection } from './_components/AnnotationSection'
import { MarkdownContent } from './_components/MarkdownContent'
import { ReferenceComponent } from './_components/Reference'
import { useBlockAnnotations } from './_hooks/useBlockAnnotations'
import { computeSegments, groupSegments, type Reference } from './helpers'

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
    sourceMap = [],
    messageIndex,
    contentBlockIndex,
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    text: string | undefined
    sourceMap?: PromptlSourceRef[]
    messageIndex?: number
    contentBlockIndex?: number
  }) => {
    const TextComponent = size === 'small' ? Text.H5 : Text.H4
    const { onAnnotationClick, currentSelection, clickedAnnotation } =
      useAnnotations()
    const { blockAnnotations: rawBlockAnnotations } = useBlockAnnotations({
      contentType: 'text',
      messageIndex,
      contentBlockIndex,
    })
    const blockAnnotations = useMemo(
      () => (text ? rawBlockAnnotations : []),
      [text, rawBlockAnnotations],
    )

    const textRangeAnnotations = useMemo(() => {
      return blockAnnotations.filter(
        (ann) => ann.context.textRange !== undefined,
      )
    }, [blockAnnotations])

    const isCurrentBlockSelected = useMemo(() => {
      if (!currentSelection) return false

      return (
        currentSelection.context.messageIndex === messageIndex &&
        currentSelection.context.contentBlockIndex === contentBlockIndex &&
        currentSelection.context.contentType === 'text'
      )
    }, [currentSelection, messageIndex, contentBlockIndex])

    const segments = useMemo(
      () => computeSegments('text', text, sourceMap),
      [text, sourceMap],
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
      if (!text) return []

      const ranges: Array<{
        start: number
        end: number
        type: 'annotation' | 'selection'
        annotation?: AnnotatedTextRange
      }> = []

      // Add annotation ranges (only those with text ranges)
      for (const ann of textRangeAnnotations) {
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
        !textRangeAnnotations.some(
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
    }, [text, isCurrentBlockSelected, currentSelection, textRangeAnnotations])

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
                  'bg-destructive-muted dark:bg-destructive/30':
                    part.annotation.result.hasPassed === false,
                  'bg-success-muted dark:bg-success/30':
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
                className='bg-yellow-100 border-b-2 border-yellow-300 dark:bg-yellow-500/30 dark:border-yellow-500 cursor-pointer hover:bg-yellow-200 dark:hover:bg-yellow-500/40'
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
      <div className='flex flex-col gap-y-1'>{messagesList}</div>
    )
  },
)

export function TextMessageContent<M extends MarkdownSize | 'none'>({
  index = 0,
  text,
  debugMode,
  color,
  size,
  sourceMap = [],
  markdownSize,
  messageIndex,
  contentBlockIndex,
}: {
  index?: number
  text: string | undefined
  color: M extends 'none' ? TextColor : Extract<TextColor, ProseColor>
  size?: 'default' | 'small'
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

  const {
    blockAnnotations: rawBlockAnnotations,
    evaluation,
    span,
  } = useBlockAnnotations({
    contentType: 'text',
    messageIndex,
    contentBlockIndex,
  })

  const blockAnnotations = useMemo(
    () => (text ? rawBlockAnnotations : []),
    [text, rawBlockAnnotations],
  )

  const fullBlockAnnotations = useMemo(() => {
    return blockAnnotations.filter(
      (ann) => ann.context.textRange === undefined,
    )
  }, [blockAnnotations])

  const content = (() => {
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
        sourceMap={debugMode ? sourceMap : undefined}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  })()

  return (
    <div className='flex flex-col gap-4'>
      {content}
      <AnnotationSection
        blockAnnotations={fullBlockAnnotations}
        evaluation={evaluation}
        span={span}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
        contentType='text'
        requireMainSpan
      />
    </div>
  )
}
