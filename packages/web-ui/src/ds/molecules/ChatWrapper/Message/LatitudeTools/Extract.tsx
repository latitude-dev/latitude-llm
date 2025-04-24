'use client'
import { ContentCard, ContentCardContainer } from '../ContentCard'
import { Markdown } from '../../../../atoms/Markdown'
import { Text } from '../../../../atoms/Text'
import type {
  ExtractToolArgs,
  ExtractToolResult,
} from '@latitude-data/core/services/latitudeTools/webExtract/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ToolContent } from '@latitude-data/compiler'
import { ToolResultContent, ToolResultFooter } from '../ToolResult'
import { CollapsibleContent } from './CollapsibleContent'

export function WebExtractLatitudeToolCallContent({
  toolCallId,
  args,
  toolResponse,
}: {
  toolCallId: string
  args: ExtractToolArgs
  toolResponse?: ToolContent
}) {
  return (
    <ContentCard
      label='Read webpage'
      icon='globe'
      bgColor='bg-success'
      fgColor='successForeground'
      info={toolCallId}
      separatorColor={
        toolResponse?.isError ? 'destructiveMutedForeground' : undefined
      }
      resultFooter={useMemo(
        () => (
          <ToolResultFooter loadingMessage='Rendering webpage...'>
            {toolResponse &&
              (toolResponse.isError ||
              typeof toolResponse.result === 'string' ? (
                <ToolResultContent toolResponse={toolResponse} />
              ) : (
                <WebExtractLatitudeToolResponseContent
                  result={toolResponse.result as ExtractToolResult}
                />
              ))}
          </ToolResultFooter>
        ),
        [toolResponse],
      )}
    >
      <ContentCardContainer copy={args.url}>
        <div className='w-full'>
          <Text.H5>{args.url}</Text.H5>
        </div>
      </ContentCardContainer>
    </ContentCard>
  )
}

const MAX_CLOSED_HEIGHT = 300

export function WebExtractLatitudeToolResponseContent({
  result,
}: {
  result: ExtractToolResult
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shouldCollapse, setShouldCollapse] = useState(false)

  useEffect(() => {
    if (!ref.current) return

    const observer = new ResizeObserver(() => {
      const { height } = ref.current!.getBoundingClientRect()
      setShouldCollapse(height > MAX_CLOSED_HEIGHT)
    })

    observer.observe(ref.current)

    return () => {
      observer.disconnect()
    }
  }, [])

  if (!shouldCollapse) {
    return (
      <div className='w-full flex flex-col gap-4 p-4'>
        <Markdown ref={ref}>{result.content}</Markdown>
      </div>
    )
  }

  return (
    <CollapsibleContent maxCollapsedHeight={100}>
      <Markdown ref={ref}>{result.content}</Markdown>
    </CollapsibleContent>
  )
}
