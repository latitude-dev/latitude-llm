import { attributesToString } from './astParsingUtils'
import {
  BLOCK_EDITOR_TYPE,
  BlockRootNode,
  CodeBlock,
  ContentBlock,
  InlineBlock,
  ParagraphBlock,
  StepChild,
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

function indent(text: string, depth: number): string {
  if (text.length === 0) return ''
  const pad = '  '.repeat(depth)
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? `${pad}${line}` : line))
    .join('\n')
}

function paragraphToTextIndented(block: ParagraphBlock, depth: number): string {
  const raw = paragraphToText(block)
  return indent(raw, depth)
}

function codeBlockToTextIndented(block: CodeBlock, depth: number): string {
  const raw = codeBlockToText(block)
  return indent(raw, depth)
}

function codeBlockToText(block: CodeBlock): string {
  return block.children.map((child) => child.text).join('')
}

function stepChildToTextIndented(block: StepChild, depth: number): string {
  switch (block.type) {
    case BLOCK_EDITOR_TYPE.MESSAGE: {
      const content = block.children
        .map((child) => {
          if (child.type === BLOCK_EDITOR_TYPE.CODE) {
            return codeBlockToTextIndented(child as CodeBlock, depth + 1)
          }
          return paragraphToTextIndented(child as ParagraphBlock, depth + 1)
        })
        .join('\n')
      const open = `${'  '.repeat(depth)}<${block.role}>`
      const close = `${'  '.repeat(depth)}</${block.role}>`
      return `${open}\n${content}\n${close}`
    }
    case BLOCK_EDITOR_TYPE.PARAGRAPH:
      return paragraphToTextIndented(block, depth)
    case BLOCK_EDITOR_TYPE.CODE:
      return codeBlockToTextIndented(block, depth)
    default:
      return ''
  }
}

export function fromBlocksToText(rootNode: BlockRootNode): string {
  const parts: string[] = []

  for (let i = 0; i < rootNode.children.length; i++) {
    const block = rootNode.children[i]!
    let text = ''

    switch (block.type) {
      case BLOCK_EDITOR_TYPE.CODE:
        text = codeBlockToTextIndented(block, 0)
        break
      case BLOCK_EDITOR_TYPE.STEP: {
        const attr = attributesToString({
          attributes: {
            as: (block as any).attributes?.as,
            isolated: (block as any).attributes?.isolated,
            ...(block as any).attributes?.otherAttributes,
          },
          shouldKebabCase: ['as', 'isolated'],
        })

        const children = (block as any).children ?? []
        const content = children
          .map((child: StepChild) => `${stepChildToTextIndented(child, 1)}\n`)
          .join('')

        text = `<step${attr}>\n${content}</step>`
        break
      }
      case BLOCK_EDITOR_TYPE.MESSAGE:
        text = stepChildToTextIndented(block, 0)
        break
      case BLOCK_EDITOR_TYPE.PARAGRAPH:
        text = paragraphToTextIndented(block, 0)
        break
      default:
        text = ''
    }

    parts.push(text)

    // Newline rules at root level:
    // - Always append a single newline after MESSAGE or STEP blocks
    // - For other blocks, append a single newline only if there is a following block
    if (
      block.type === BLOCK_EDITOR_TYPE.MESSAGE ||
      block.type === BLOCK_EDITOR_TYPE.STEP
    ) {
      parts.push('\n')
    } else if (i < rootNode.children.length - 1) {
      parts.push('\n')
    }
  }

  return parts.join('')
}
