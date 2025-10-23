import { memo, useMemo } from 'react'

import { PromptlSourceRef } from '@latitude-data/constants/legacyCompiler'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ProseColor, TextColor } from '@latitude-data/web-ui/tokens'
import { computeSegments, groupSegments } from './helpers'
import { ReferenceComponent } from './_components/Reference'
import { MarkdownContent } from './_components/MarkdownContent'
import { MarkdownSize } from '@latitude-data/web-ui/atoms/Markdown'

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
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    text: string | undefined
    parameters?: string[]
    sourceMap?: PromptlSourceRef[]
  }) => {
    const TextComponent = size === 'small' ? Text.H5 : Text.H4
    const segments = useMemo(
      () => computeSegments('text', text, sourceMap, parameters),
      [text, sourceMap, parameters],
    )

    const groups = useMemo(() => groupSegments(segments), [segments])
    const messagesList = groups.map((group, groupIndex) => (
      <TextComponent
        color={color}
        whiteSpace='preWrap'
        wordBreak='breakAll'
        key={`${index}-group-${groupIndex}`}
      >
        {group.length > 0
          ? group.map((segment, segmentIndex) => (
              <span
                key={`${index}-group-${groupIndex}-segment-${segmentIndex}`}
              >
                {typeof segment === 'string' ? (
                  segment
                ) : (
                  <ReferenceComponent reference={segment} />
                )}
              </span>
            ))
          : '\n'}
      </TextComponent>
    ))

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
}: {
  index?: number
  text: string | undefined
  color: M extends 'none' ? TextColor : Extract<TextColor, ProseColor>
  size?: 'default' | 'small'
  parameters?: string[]
  debugMode?: boolean
  sourceMap?: PromptlSourceRef[]
  markdownSize: M
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
    />
  )
}
