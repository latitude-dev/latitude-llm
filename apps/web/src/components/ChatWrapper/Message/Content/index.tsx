import { useMemo } from 'react'

import {
  MessageContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import { ToolCallMessageContent } from './ToolCall'
import { TextMessageContent } from './Text'
import { ImageMessageContent } from './Image'
import { FileMessageContent } from './File'
import { ReasoningMessageContent } from './Reasoning'
import { cn } from '@latitude-data/web-ui/utils'
import { ProseColor, TextColor } from '@latitude-data/web-ui/tokens'
import { MarkdownSize } from '@latitude-data/web-ui/atoms/Markdown'

export function Content<M extends MarkdownSize | 'none'>({
  content,
  debugMode,
  limitVerticalPadding = false,
  ...rest
}: {
  index?: number
  color: M extends 'none' ? TextColor : Extract<TextColor, ProseColor>
  content: MessageContent[] | MessageContent | string
  size?: 'default' | 'small'
  parameters?: string[]
  debugMode?: boolean
  toolContentMap?: Record<string, ToolContent>
  markdownSize: M
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
        key={idx}
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

function ContentItem<M extends MarkdownSize | 'none'>({
  index = 0,
  value,
  debugMode,
  color,
  size,
  parameters = [],
  toolContentMap,
  markdownSize,
}: {
  index?: number
  color: M extends 'none' ? TextColor : Extract<TextColor, ProseColor>
  value: MessageContent
  size?: 'default' | 'small'
  parameters?: string[]
  debugMode?: boolean
  toolContentMap?: Record<string, ToolContent>
  markdownSize: M
}) {
  if (value.type === 'text') {
    return (
      <TextMessageContent
        index={index}
        color={color}
        size={size}
        markdownSize={markdownSize}
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
        debugMode={debugMode}
      />
    )
  }
}
