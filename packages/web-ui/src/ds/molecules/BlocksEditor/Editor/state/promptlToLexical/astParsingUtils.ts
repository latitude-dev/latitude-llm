import { camelCase, kebabCase } from 'lodash-es'

import {
  BLOCK_EDITOR_TYPE,
  BLOCK_WITH_CHILDREN,
  BlockAttributes,
  BlockWithChildren,
  CONTENT_BLOCK,
  type ContentBlockType,
  type ElementTag,
  FileBlock,
  MESSAGE_BLOCK,
  type MessageBlockType,
  type MustacheTag,
  ReferenceLink,
  TemplateNode,
  TextBlock,
  ToolCallBlock,
} from './types'

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

export function nodeToText(node: TemplateNode): string {
  switch (node.type) {
    case 'Text':
      return node.raw
    case 'MustacheTag': {
      const mustache = node as MustacheTag
      return `{{${expressionToString(mustache.expression)}}}`
    }
    case 'ElementTag': {
      const tag = node as ElementTag
      // Always convert element tags to text when they're nested in content
      return convertElementToText(tag)
    }

    case 'Comment':
      return `<!-- ${node.data} -->`

    default:
      return ''
  }
}

export function extractTextContent(nodes: TemplateNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return ''

  return nodes.map((node) => nodeToText(node)).join('')
}

export function isAttributeLiteral(
  node: ElementTag,
  attribute: string,
): boolean {
  const attr = node.attributes.find(({ name }) => name === attribute)
  return (
    !attr ||
    attr.value === undefined ||
    attr.value === null ||
    attr.value === true ||
    attr.value.every((v) => v.type === 'Text')
  )
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

  return attributes as ReferenceLink['attributes']
}

export function isConfigNode(
  node: TemplateNode | undefined,
): node is ElementTag {
  if (!node) return false

  return node.type === 'Config'
}

export function isBlockWithChildren(
  node: TemplateNode | undefined,
): node is ElementTag {
  if (!node) return false

  return (
    node.type === 'ElementTag' &&
    BLOCK_WITH_CHILDREN.includes(node.name as BlockWithChildren)
  )
}

export function isStepBlock(node: TemplateNode): node is ElementTag {
  return (
    node.type === 'ElementTag' &&
    node.name === 'step' &&
    isAttributeLiteral(node, 'as') &&
    isAttributeLiteral(node, 'isolated')
  )
}

export function isReferenceLink(node: TemplateNode): node is ElementTag {
  return node.type === 'ElementTag' && node.name === 'prompt'
}

export function isMessageBlock(node: TemplateNode): node is ElementTag {
  return (
    node.type === 'ElementTag' &&
    MESSAGE_BLOCK.includes(node.name as MessageBlockType)
  )
}

export function isContentBlock(
  node: TemplateNode | undefined,
): node is ElementTag {
  if (!node) return false

  return (
    node.type === 'ElementTag' &&
    CONTENT_BLOCK.includes(node.name as ContentBlockType)
  )
}

export function isVariable(node: TemplateNode) {
  return node.type === 'MustacheTag' && node.expression.type === 'Identifier'
}

export function convertElementToText(tag: ElementTag): string {
  const attrs = tag.attributes
    .map((attr) => {
      // Note: do not include not undefined values here as they could be required attributes
      if (attr.value === undefined) {
        return ''
      }

      if (attr.value === null) {
        return `${attr.name}={{null}}`
      }

      if (attr.value === true) {
        return attr.name
      }

      if (Array.isArray(attr.value)) {
        return `${attr.name}="${extractTextContent(attr.value)}"`
      }

      return `${attr.name}="${attr.value}"`
    })
    .join(' ')

  const attrsStr = attrs ? ` ${attrs}` : ''
  const content = extractTextContent(tag.children)

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
      // Note: do not include not undefined values here as they could be required attributes
      if (value === undefined) {
        continue
      }

      const treatedKey = shouldKebabCase.includes(key) ? kebabCase(key) : key
      if (value === null) {
        stepAttrs.push(`${treatedKey}={{null}}`)
      } else if (value === true) {
        stepAttrs.push(treatedKey)
      } else if (value === false) {
        stepAttrs.push(`${treatedKey}={{false}}`)
      } else {
        // Don't quote mustache expressions (e.g., {{variable}})
        const stringValue = String(value)
        if (stringValue.startsWith('{{') && stringValue.endsWith('}}')) {
          stepAttrs.push(`${treatedKey}=${value}`)
        } else {
          stepAttrs.push(`${treatedKey}="${value}"`)
        }
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
  const attributes = getAttributes({
    tag,
    prompt,
    shouldCamelCase: ['as', 'isolated'],
  })

  const { as, isolated, ...rest } = attributes

  const attr: Record<string, string | boolean | object> = {}
  if (typeof as === 'string') attr.as = as.trim()
  if (isolated === true) attr.isolated = true

  if (Object.keys(rest).length) {
    attr.otherAttributes = rest
  }

  if (!Object.keys(attr).length) return undefined

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

export function createTextNode({ text }: { text: string }) {
  return {
    type: BLOCK_EDITOR_TYPE.TEXT_CONTENT,
    text,
    version: 1,
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
  } satisfies TextBlock
}
