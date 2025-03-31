'use client'
import { ContentCard, ContentCardContainer } from '../ContentCard'
import { Button } from '../../../../atoms/Button'
import { Markdown } from '../../../../atoms/Markdown'
import { Text } from '../../../../atoms/Text'
import type {
  ExtractToolArgs,
  ExtractToolResult,
} from '@latitude-data/core/services/latitudeTools/webExtract/types'
import { useEffect, useRef, useState } from 'react'
import { ToolContent } from '@latitude-data/compiler'
import { ToolResultContent, ToolResultFooter } from '../ToolResult'

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
      resultFooter={
        <ToolResultFooter loadingMessage='Rendering webpage...'>
          {toolResponse &&
            (toolResponse.isError || typeof toolResponse.result === 'string' ? (
              <ToolResultContent toolResponse={toolResponse} />
            ) : (
              <WebExtractLatitudeToolResponseContent
                result={toolResponse.result as ExtractToolResult}
              />
            ))}
        </ToolResultFooter>
      }
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
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [displayOpenButton, setDisplayOpenButton] = useState(false)

  useEffect(() => {
    if (!ref.current) return

    const observer = new ResizeObserver(() => {
      const { height } = ref.current!.getBoundingClientRect()
      setDisplayOpenButton(height > MAX_CLOSED_HEIGHT)
    })

    observer.observe(ref.current)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div
      className='w-full overflow-hidden relative p-4'
      style={{ maxHeight: isOpen ? 'none' : MAX_CLOSED_HEIGHT }}
    >
      <Markdown ref={ref}>{result.content}</Markdown>
      {displayOpenButton && (
        <>
          {!isOpen && (
            <div className='absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent to-backgroundCode pointer-events-none' />
          )}
          <div className='absolute bottom-0 right-0 z-10'>
            <Button
              variant='outline'
              onClick={() => setIsOpen((prev) => !prev)}
              className='rounded-full'
              iconProps={{
                name: isOpen ? 'minimize' : 'maximize',
                className: 'my-1.5',
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
