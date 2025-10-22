import { useMemo } from 'react'

import {
  MessageContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { ToolCallMessageContent } from './ToolCall'
import { TextMessageContent } from './Text'
import { ImageMessageContent } from './Image'
import { FileMessageContent } from './File'
import { ReasoningMessageContent } from './Reasoning'
import { cn } from '@latitude-data/web-ui/utils'

export function Content({
  content,
  debugMode,
  limitVerticalPadding = false,
  ...rest
}: {
  index?: number
  color: TextColor
  content: MessageContent[] | MessageContent | string
  size?: 'default' | 'small'
  parameters?: string[]
  debugMode?: boolean
  toolContentMap?: Record<string, ToolContent>
  limitVerticalPadding?: boolean
}) {
  const contentArr = useMemo<MessageContent[]>(() => {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }]
    }

    if (!Array.isArray(content)) {
      return [content]
    }

    return content
      .map((c) => {
        if (typeof c === 'string') {
          return { type: 'text', text: c }
        }

        return c
      })
      .filter((c) => c.type !== 'tool-result') as MessageContent[]
  }, [content])

  return contentArr.map((c, idx) => {
    const hasPadding = c.type !== 'tool-call' && !debugMode
    const isTop = idx === 0
    const isBottom = idx === contentArr.length - 1
    const topPadding = hasPadding && (limitVerticalPadding ? !isTop : true)
    const bottomPadding =
      hasPadding && (limitVerticalPadding ? !isBottom : true)

    return (
      <div
        className={cn('flex flex-col w-full', {
          'pt-4': topPadding,
          'pb-4': bottomPadding,
        })}
      >
        <ContentItem
          key={idx}
          index={idx}
          debugMode={debugMode}
          value={c}
          {...rest}
        />
      </div>
    )
  })
}

function ContentItem({
  index = 0,
  value,
  debugMode,
  color,
  size,
  parameters = [],
  toolContentMap,
}: {
  index?: number
  color: TextColor
  value: MessageContent
  size?: 'default' | 'small'
  parameters?: string[]
  debugMode?: boolean
  toolContentMap?: Record<string, ToolContent>
}) {
  if (value.type === 'text') {
    return (
      <TextMessageContent
        index={index}
        color={color}
        size={size}
        text={value.text}
        parameters={parameters}
        sourceMap={value._promptlSourceMap}
        debugMode={debugMode}
      />
    )
  }

  if (value.type === 'reasoning') {
    return (
      <ReasoningMessageContent
        reasoning={value.text}
        isStreaming={value.isStreaming}
      />
    )
  }

  if (value.type === 'image') {
    return (
      <ImageMessageContent
        index={index}
        color={color}
        size={size}
        image={value.image}
        parameters={parameters}
        sourceMap={value._promptlSourceMap}
      />
    )
  }

  if (value.type === 'file') {
    return (
      <FileMessageContent
        index={index}
        color={color}
        size={size}
        file={value.file}
        parameters={parameters}
        sourceMap={value._promptlSourceMap}
      />
    )
  }

  if (value.type === 'tool-call') {
    return (
      <ToolCallMessageContent
        toolRequest={value}
        toolContentMap={toolContentMap}
      />
    )
  }
}
