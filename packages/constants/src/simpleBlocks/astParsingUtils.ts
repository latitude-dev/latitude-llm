import camelCase from 'lodash.camelcase'
import kebabCase from 'lodash.kebabcase'

import {
  CONTENT_BLOCK,
  type ElementTag,
  type MessageBlockType,
  type ContentBlockType,
  type MustacheTag,
  IfBlock,
  ForBlock,
  TemplateNode,
  Text,
  BLOCK_TYPES,
  BlockType,
  StepBlock,
  BlockAttributes,
  PromptBlock,
  FileBlock,
  ToolCallBlock,
} from './types'

export function isMessageBlock(tag: ElementTag): boolean {
  const promptlToBlockType: Record<string, MessageBlockType> = {
    system: 'system',
    user: 'user',
    assistant: 'assistant',
    developer: 'developer',
  }
  return tag.name in promptlToBlockType
}

export function getMessageBlockType(tag: ElementTag): MessageBlockType {
  const promptlToBlockType: Record<string, MessageBlockType> = {
    system: 'system',
    user: 'user',
    assistant: 'assistant',
    developer: 'developer',
  }
  return promptlToBlockType[tag.name] || 'system'
}

export function isContentBlock(tag: ElementTag): boolean {
  return CONTENT_BLOCK.includes(tag.name as ContentBlockType)
}

export function isStepBlock(tag: ElementTag): boolean {
  return tag.name === 'step'
}

export function expressionToString(
  expression: MustacheTag['expression'],
): string {
  if (expression.type === 'Identifier') {
    return expression.name
  }
  if (expression.type === 'Literal') {
    return JSON.stringify(expression.value)
  }
  if (expression.type === 'MemberExpression') {
    const object = expressionToString(expression.object)
    const property = expressionToString(expression.property)
    // Use bracket notation for array access to preserve original format
    if (expression.computed) {
      return `${object}[${property}]`
    }
    return `${object}.${property}`
  }
  if (expression.type === 'BinaryExpression') {
    return `${expressionToString(expression.left)} ${expression.operator} ${expressionToString(expression.right)}`
  }

  return JSON.stringify(expression)
}

function convertIfBlockToText(ifBlock: IfBlock, insideStep = false): string {
  let result = `{{#if ${expressionToString(ifBlock.expression)}}}\n`
  result += extractTextContent(ifBlock.children || [], insideStep)

  if (ifBlock.else) {
    result += '\n{{else}}\n'
    result += extractTextContent(ifBlock.else.children || [], insideStep)
  }

  result += '\n{{/if}}'
  return result
}

function convertForBlockToText(forBlock: ForBlock, insideStep = false): string {
  const context = forBlock.context.name
  const index = forBlock.index ? `, ${forBlock.index.name}` : ''

  let result = `{{#for ${expressionToString(forBlock.expression)} as ${context}${index}}}\n`
  result += extractTextContent(forBlock.children || [], insideStep)

  if (forBlock.else) {
    result += '\n{{else}}\n'
    result += extractTextContent(forBlock.else.children || [], insideStep)
  }

  result += '\n{{/for}}'
  return result
}

export function nodeToText(node: TemplateNode, insideStep = false): string {
  switch (node.type) {
    case 'Text':
      return (node as Text).data

    case 'MustacheTag': {
      const mustache = node as MustacheTag
      return `{{${expressionToString(mustache.expression)}}}`
    }

    case 'IfBlock':
      return convertIfBlockToText(node as IfBlock, insideStep)

    case 'ForBlock':
      return convertForBlockToText(node as ForBlock, insideStep)

    case 'ElementTag': {
      const tag = node as ElementTag
      // Always convert element tags to text when they're nested in content
      return convertElementToText(tag, insideStep)
    }

    case 'Config':
      // Config nodes should not appear in content
      return ''

    case 'Comment':
      return `<!-- ${node.data} -->`

    default:
      return ''
  }
}

export function extractTextContent(
  nodes: TemplateNode[],
  insideStep = false,
): string {
  return nodes.map((node) => nodeToText(node, insideStep)).join('')
}

export function getPromptAttributes({
  tag,
  prompt,
}: {
  tag: ElementTag
  prompt: string
}) {
  const attributes = getAttributes({
    tag,
    prompt,
    shouldCamelCase: ['as', 'isolated'],
  })

  // Ensure path attribute exists
  if (!('path' in attributes)) {
    attributes.path = ''
  }

  return attributes as PromptBlock['attributes']
}

export function isTopLevelBlock(tag: ElementTag): boolean {
  return BLOCK_TYPES.includes(tag.name as BlockType)
}

export function convertElementToText(
  tag: ElementTag,
  insideStep = false,
): string {
  const attrs = tag.attributes
    .map((attr: any) => {
      if (attr.value === true) {
        return attr.name
      }

      if (Array.isArray(attr.value)) {
        return `${attr.name}="${extractTextContent(attr.value, insideStep)}"`
      }

      return `${attr.name}="${attr.value}"`
    })
    .join(' ')

  const attrsStr = attrs ? ` ${attrs}` : ''
  const content = extractTextContent(tag.children, insideStep)

  if (content.trim()) {
    return `<${tag.name}${attrsStr}>${content}</${tag.name}>`
  } else {
    return `<${tag.name}${attrsStr} />`
  }
}

function getAttributes({
  tag,
  prompt,
  shouldCamelCase = [],
}: {
  tag: ElementTag
  prompt: string
  shouldCamelCase?: string[]
}) {
  return tag.attributes.reduce((acc, attr) => {
    const name = shouldCamelCase.includes(attr.name)
      ? camelCase(attr.name)
      : attr.name

    if (Array.isArray(attr.value)) {
      const firstNode = attr.value[0]!
      const lastNode = attr.value[attr.value.length - 1]!

      const start = firstNode.start || 0
      const end = lastNode.end || prompt.length
      acc[name] = prompt.slice(start, end).trim()
      return acc
    }

    acc[name] = attr.value
    return acc
  }, {} as BlockAttributes)
}

export function attributesToString({
  attributes,
  shouldKebabCase = [],
}: {
  attributes?: BlockAttributes
  shouldKebabCase?: string[]
}) {
  if (!attributes || Object.keys(attributes).length === 0) {
    return ''
  }

  const stepAttrs = []
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined || value === null || value === '') {
        continue
      }

      const treatedKey = shouldKebabCase.includes(key) ? kebabCase(key) : key
      if (value === true) {
        stepAttrs.push(treatedKey)
      } else {
        stepAttrs.push(`${treatedKey}="${value}"`)
      }
    }
  }

  return stepAttrs.length > 0 ? ` ${stepAttrs.join(' ')}` : ''
}

export function getStepAttributes({
  tag,
  prompt,
}: {
  tag: ElementTag
  prompt: string
}) {
  let attr: StepBlock['attributes'] = {}

  const attributes = getAttributes({
    tag,
    prompt,
    shouldCamelCase: ['as', 'isolated'],
  })

  if ('as' in attributes) {
    if (typeof attributes.as === 'string') {
      attr.as = attributes.as.trim()
    }
  }

  if ('isolated' in attributes) {
    if (attributes.isolated === true) {
      attr.isolated = true
    }
  }

  if (!Object.keys(attributes).length) return undefined

  return attr
}

export function getContentFileAttributes({
  tag,
  prompt,
}: {
  tag: ElementTag
  prompt: string
}) {
  const attributes = getAttributes({
    tag,
    prompt,
  })

  // Ensure name attribute exists (required by promptl compiler)
  if (!('name' in attributes)) {
    attributes.name = ''
  }

  return attributes as FileBlock['attributes']
}

export function getToolCallAttributes({
  tag,
  prompt,
}: {
  tag: ElementTag
  prompt: string
}) {
  let attr: ToolCallBlock['attributes'] = {}
  const attributes = getAttributes({
    tag,
    prompt,
  })

  attr.id = 'id' in attributes ? (attributes.id as string) : ''
  attr.name = 'name' in attributes ? (attributes.name as string) : ''
  if ('id' in attributes) {
    delete attributes.id
  }
  if ('name' in attributes) {
    delete attributes.name
  }

  attr.parameters = attributes

  return attr
}
