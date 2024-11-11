import { TAG_NAMES } from '$promptl/constants'
import {
  ChainStepTag,
  ContentTag,
  ElementTag,
  MessageTag,
  ReferenceTag,
} from '$promptl/parser/interfaces'
import { ContentTypeTagName, MessageRole } from '$promptl/types'
import { Scalar, Node as YAMLItem, YAMLMap, YAMLSeq } from 'yaml'

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
  if (tag.name === TAG_NAMES.message) return true
  return Object.values(MessageRole).includes(tag.name as MessageRole)
}

export function isContentTag(tag: ElementTag): tag is ContentTag {
  if (tag.name === TAG_NAMES.content) return true
  return Object.values(ContentTypeTagName).includes(
    tag.name as ContentTypeTagName,
  )
}

export function isRefTag(tag: ElementTag): tag is ReferenceTag {
  return tag.name === TAG_NAMES.prompt
}

export function isChainStepTag(tag: ElementTag): tag is ChainStepTag {
  return tag.name === TAG_NAMES.step
}

export function tagAttributeIsLiteral(tag: ElementTag, name: string): boolean {
  const attr = tag.attributes.find((attr) => attr.name === name)
  if (!attr) return false
  if (attr.value === true) return true
  return attr.value.every((v) => v.type === 'Text')
}

type YAMLItemRange = [number, number] | undefined
export function findYAMLItemPosition(
  parent: YAMLItem,
  path: (string | number)[],
): YAMLItemRange {
  const parentRange: YAMLItemRange = parent?.range
    ? [parent.range[0], parent.range[1]]
    : undefined

  if (!parentRange || path.length === 0 || !('items' in parent)) {
    return parentRange
  }

  let child: YAMLItem | undefined
  if (parent instanceof YAMLMap) {
    child = parent.items.find((i) => {
      return (i.key as Scalar)?.value === path[0]!
    })?.value as YAMLItem | undefined
  }
  if (parent instanceof YAMLSeq && typeof path[0] === 'number') {
    child = parent.items[Number(path[0])] as YAMLItem | undefined
  }

  if (!child) return parentRange
  return findYAMLItemPosition(child, path.slice(1)) ?? parentRange
}
