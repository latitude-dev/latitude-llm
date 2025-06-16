import { attributesToString } from './astParsingUtils'
import { AnyBlock, StepChild, MessageChild, BlockAttributes } from './types'

function messageChildToText(child: MessageChild): string {
  switch (child.type) {
    case 'content-image':
      if (child.content === '') {
        return `<content-image />`
      } else {
        return `<content-image>${child.content}</content-image>`
      }
    case 'content-file': {
      const attrsString = attributesToString({
        attributes: child.attributes,
      })
      if (child.content === '') {
        return `<content-file${attrsString} />`
      } else {
        return `<content-file${attrsString}>${child.content}</content-file>`
      }
    }
    case 'tool-call': {
      // For tool-call blocks, include id, name, and parameters as attributes
      const toolCallAttrs: BlockAttributes = {}
      if (child.attributes.id) {
        toolCallAttrs.id = child.attributes.id
      }
      if (child.attributes.name) {
        toolCallAttrs.name = child.attributes.name
      }
      // Add parameters as individual attributes
      if (child.attributes.parameters) {
        Object.assign(toolCallAttrs, child.attributes.parameters)
      }

      const attrsString = attributesToString({
        attributes: toolCallAttrs,
      })
      return `<tool-call${attrsString} />`
    }
    case 'prompt': {
      const attrsString = Object.entries(child.attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ')

      return `<prompt ${attrsString} />`
    }
    case 'text':
      return child.content
    default:
      return ''
  }
}

function stepChildToText(block: StepChild): string {
  switch (block.type) {
    case 'system':
    case 'assistant':
    case 'developer':
    case 'user':
      return `<${block.type}>${block.children.map(messageChildToText).join('')}</${block.type}>`

    case 'content-image':
    case 'content-file':
    case 'tool-call':
    case 'prompt':
    case 'text':
      return messageChildToText(block)
  }
}

export function simpleBlocksToText(blocks: AnyBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'step': {
          const children = block.children ?? []
          const attr = attributesToString({
            attributes: block.attributes,
            shouldKebabCase: ['as', 'isolate'],
          })
          const stepContent = children.map(stepChildToText).join('')

          return `<step${attr}>${stepContent}</step>`
        }
        case 'text':
        case 'content-image':
        case 'content-file':
        case 'tool-call':
        case 'prompt':
        case 'system':
        case 'user':
        case 'assistant':
        case 'developer':
          return stepChildToText(block)
      }
    })
    .join('')
}
