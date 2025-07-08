import { attributesToString } from './astParsingUtils'
import {
  StepChild,
  ContentBlock,
  BlockAttributes,
  BLOCK_EDITOR_TYPE,
  BlockRootNode,
  InlineBlock,
  ParagraphBlock,
  CodeBlock,
} from './types'

function contentBlockToText(child: ContentBlock): string {
  switch (child.type) {
    case BLOCK_EDITOR_TYPE.IMAGE_CONTENT:
      if (child.content === '') {
        return `<content-image />`
      } else {
        return `<content-image>${child.content}</content-image>`
      }
    case BLOCK_EDITOR_TYPE.FILE_CONTENT: {
      const attrsString = attributesToString({
        attributes: child.attributes,
      })
      if (child.content === '') {
        return `<content-file${attrsString} />`
      } else {
        return `<content-file${attrsString}>${child.content}</content-file>`
      }
    }
    case BLOCK_EDITOR_TYPE.TOOL_CALL: {
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
    default:
      return ''
  }
}

function inlineBlockToText(child: InlineBlock): string {
  switch (child.type) {
    case BLOCK_EDITOR_TYPE.TEXT_CONTENT:
      return child.text
    case BLOCK_EDITOR_TYPE.VARIABLE:
      return `{{${child.name}}}`
    case BLOCK_EDITOR_TYPE.REFERENCE_LINK: {
      const path = child.path
      const attrsString = attributesToString({
        attributes: child.attributes,
      })

      return `<prompt path="${path}"${attrsString} />`
    }
    default:
      return ''
  }
}

function isInlineBlock(child: any): child is InlineBlock {
  return (
    child.type === BLOCK_EDITOR_TYPE.TEXT_CONTENT ||
    child.type === BLOCK_EDITOR_TYPE.VARIABLE ||
    child.type === BLOCK_EDITOR_TYPE.REFERENCE_LINK
  )
}

function paragraphToText(block: ParagraphBlock): string {
  return block.children
    .map((child) => {
      if (isInlineBlock(child)) {
        return inlineBlockToText(child)
      } else {
        return contentBlockToText(child)
      }
    })
    .join('')
}

function codeBlockToText(block: CodeBlock): string {
  return block.children.map((child) => child.text).join('')
}

function stepChildToText(block: StepChild): string {
  switch (block.type) {
    case BLOCK_EDITOR_TYPE.MESSAGE:
      return `<${block.role}>${block.children
        .map((child) => {
          if (child.type === BLOCK_EDITOR_TYPE.CODE) {
            return codeBlockToText(child)
          }
          return paragraphToText(child)
        })
        .join('\n')}</${block.role}>`
    case BLOCK_EDITOR_TYPE.PARAGRAPH:
      return paragraphToText(block)
    case BLOCK_EDITOR_TYPE.CODE:
      return codeBlockToText(block)
    default:
      return ''
  }
}

export function fromBlocksToText(rootNode: BlockRootNode): string {
  return rootNode.children
    .map((block) => {
      switch (block.type) {
        case BLOCK_EDITOR_TYPE.CONFIG:
          return `---${block.config}\n---`
        case BLOCK_EDITOR_TYPE.CODE:
          return codeBlockToText(block)
        case BLOCK_EDITOR_TYPE.STEP: {
          const children = block.children ?? []
          const attr = attributesToString({
            attributes: block.attributes as BlockAttributes,
            shouldKebabCase: ['as', 'isolate'],
          })
          const stepContent = children
            .map((child: any) => stepChildToText(child))
            .join('\n')

          return `<step${attr}>${stepContent}</step>`
        }
        case BLOCK_EDITOR_TYPE.MESSAGE:
        case BLOCK_EDITOR_TYPE.PARAGRAPH:
          return stepChildToText(block)
        default:
          return ''
      }
    })
    .join('\n')
}
