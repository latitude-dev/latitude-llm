import {
  CUSTOM_MESSAGE_TAG,
  REFERENCE_PROMPT_TAG,
  TOOL_CALL_TAG,
} from '$compiler/constants'
import {
  ContentTag,
  ElementTag,
  MessageTag,
  ReferenceTag,
  ToolCallTag,
} from '$compiler/parser/interfaces'
import { ContentType, MessageRole } from '$compiler/types'

export function isIterable(obj: unknown): obj is Iterable<unknown> {
  return (obj as Iterable<unknown>)?.[Symbol.iterator] !== undefined
}

export async function hasContent(iterable: Iterable<unknown>) {
  for await (const _ of iterable) {
    return true
  }
  return false
}

export function removeCommonIndent(text: string): string {
  const lines = text.split('\n')
  const commonIndent =
    lines.reduce((acc: number | null, line: string) => {
      if (line.trim() === '') return acc
      const indent = line.match(/^\s*/)![0]
      if (acc === null) return indent.length
      return indent.length < acc ? indent.length : acc
    }, null) ?? 0
  return lines
    .map((line) => {
      return line.slice(commonIndent)
    })
    .join('\n')
    .trim()
}

export function isMessageTag(tag: ElementTag): tag is MessageTag {
  if (tag.name === CUSTOM_MESSAGE_TAG) return true
  return Object.values(MessageRole).includes(tag.name as MessageRole)
}

export function isContentTag(tag: ElementTag): tag is ContentTag {
  return Object.values(ContentType).includes(tag.name as ContentType)
}

export function isRefTag(tag: ElementTag): tag is ReferenceTag {
  return tag.name === REFERENCE_PROMPT_TAG
}

export function isToolCallTag(tag: ElementTag): tag is ToolCallTag {
  return tag.name === TOOL_CALL_TAG
}
