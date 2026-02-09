import {
  MessageContent,
  ToolResultContent,
} from '@latitude-data/constants/messages'
import { MarkdownSize } from '@latitude-data/web-ui/atoms/Markdown'
import { ProseColor, TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { useMemo } from 'react'
import { FileMessageContent } from './File'
import { ImageMessageContent } from './Image'
import { ReasoningMessageContent } from './Reasoning'
import { TextMessageContent } from './Text'
import { ToolCallMessageContent } from './ToolCall'

export function Content<M extends MarkdownSize | 'none'>({
  content,
  debugMode,
  limitVerticalPadding = false,
  messageIndex,
  isStreaming = false,
  ...rest
}: {
  index?: number
  color: M extends 'none' ? TextColor : Extract<TextColor, ProseColor>
  content: MessageContent[] | MessageContent | string
  size?: 'default' | 'small'
  debugMode?: boolean
  toolContentMap?: Record<string, ToolResultContent>
  markdownSize: M
  limitVerticalPadding?: boolean
  messageIndex?: number
  isStreaming?: boolean
}) {
  const contentArr = useMemo<MessageContent[]>(() => {
    if (content === undefined || content === null) {
      return []
    }

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
        data-content-block-index={idx}
        data-content-type={c.type}
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
          messageIndex={messageIndex}
          contentBlockIndex={idx}
          isStreaming={isStreaming}
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
  toolContentMap,
  markdownSize,
  messageIndex,
  contentBlockIndex,
  isStreaming = false,
}: {
  index?: number
  color: M extends 'none' ? TextColor : Extract<TextColor, ProseColor>
  value: MessageContent
  size?: 'default' | 'small'
  debugMode?: boolean
  toolContentMap?: Record<string, ToolResultContent>
  markdownSize: M
  messageIndex?: number
  contentBlockIndex?: number
  isStreaming?: boolean
}) {
  if (value.type === 'text') {
    return (
      <TextMessageContent
        index={index}
        color={color}
        size={size}
        markdownSize={markdownSize}
        text={value.text}
        sourceMap={value._promptlSourceMap}
        debugMode={debugMode}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
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
        sourceMap={value._promptlSourceMap}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }

  if (value.type === 'file') {
    if (value.mimeType.includes('image')) {
      return (
        <ImageMessageContent
          index={index}
          color={color}
          size={size}
          image={value.file}
          sourceMap={value._promptlSourceMap}
          messageIndex={messageIndex}
          contentBlockIndex={contentBlockIndex}
        />
      )
    }

    return (
      <FileMessageContent
        index={index}
        color={color}
        size={size}
        file={value.file}
        sourceMap={value._promptlSourceMap}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }

  if (value.type === 'tool-call') {
    return (
      <ToolCallMessageContent
        toolRequest={value}
        toolContentMap={toolContentMap}
        debugMode={debugMode}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
        isStreaming={isStreaming}
      />
    )
  }
}
