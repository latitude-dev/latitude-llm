import { AstError } from '@latitude-data/constants/promptl'
import {
  convertElementToText,
  extractTextContent,
  getStepAttributes,
  getPromptAttributes,
  getContentFileAttributes,
  getToolCallAttributes,
  isContentBlock,
  isMessageBlock,
  isStepBlock,
  isConfigNode,
  isReferenceLink,
  isVariable,
  isBlockWithChildren,
  isContentBlockOrCodeBlock,
  nodeToText,
} from './astParsingUtils'
import {
  type ElementTag,
  type ContentBlock,
  TemplateNode,
  Fragment,
  BlockRootNode,
  ParagraphBlock,
  TextBlock,
  ImageBlock,
  FileBlock,
  ToolCallBlock,
  ReferenceLink,
  BLOCK_EDITOR_TYPE,
  BlockAttributes,
  Variable,
  InlineBlock,
  CodeBlock,
  StepBlock,
  MessageBlock,
  MessageBlockType,
} from './types'

function findErrorsForNode(
  node: ElementTag | TemplateNode,
  errors: AstError[],
): AstError[] {
  if (!('start' in node) || node.start === undefined) {
    return []
  }

  return errors
    .filter((error) => error.startIndex === node.start)
    .map((error) => ({
      start: error.start,
      end: error.end,
      name: error.name,
      message: error.message,
      startIndex: error.startIndex,
      endIndex: error.endIndex,
    }))
}

function createParagraph({
  children,
}: {
  children: ParagraphBlock['children']
}): ParagraphBlock {
  return {
    type: BLOCK_EDITOR_TYPE.PARAGRAPH,
    children,
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
  }
}

function createTextNode({ text }: { text: string }) {
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

function createCodeBlock({
  text,
  errors,
}: {
  text: string
  errors?: AstError[]
}) {
  return {
    type: BLOCK_EDITOR_TYPE.CODE,
    version: 1,
    errors,
    text,
  } satisfies CodeBlock
}

function createEmptyParagraph({
  content,
}: {
  content: string
}): ParagraphBlock {
  return createParagraph({ children: [createTextNode({ text: content })] })
}

function createReferenceLink({
  prompt,
  tag,
  errors,
}: {
  prompt: string
  tag: ElementTag
  errors?: AstError[]
}) {
  const refAttrs = getPromptAttributes({ tag, prompt })
  const blockErrors = errors ? findErrorsForNode(tag, errors) : []
  const { attributes, path } = Object.keys(refAttrs).reduce(
    (acc, key) => {
      if (key === 'path') {
        acc.path = refAttrs[key] ? String(refAttrs[key]) : ''
      } else {
        acc.attributes[key] = refAttrs[key]
      }
      return acc
    },
    { attributes: {} as BlockAttributes, path: '' },
  )
  return {
    type: BLOCK_EDITOR_TYPE.REFERENCE_LINK,
    path,
    attributes,
    version: 1,
    errors: blockErrors.length > 0 ? blockErrors : undefined,
  } as ReferenceLink
}

function createVariable({
  node,
  errors,
}: {
  node: TemplateNode
  errors?: AstError[]
}): Variable {
  const nodeErrors = errors ? findErrorsForNode(node, errors) : []
  return {
    type: BLOCK_EDITOR_TYPE.VARIABLE,
    name: node.expression.name,
    version: 1,
    errors: nodeErrors.length > 0 ? nodeErrors : undefined,
  } satisfies Variable
}

function createContentBlock({
  prompt,
  tag,
  errors = [],
}: {
  prompt: string
  tag: ElementTag
  errors?: AstError[]
}): ContentBlock | undefined {
  const blockErrors = findErrorsForNode(tag, errors)

  if (tag.name === 'content-image') {
    return {
      type: BLOCK_EDITOR_TYPE.IMAGE_CONTENT,
      content: extractTextContent(tag.children),
      version: 1,
      ...(blockErrors.length > 0 && { errors: blockErrors }),
    } as ImageBlock
  } else if (tag.name === 'content-file') {
    return {
      type: BLOCK_EDITOR_TYPE.FILE_CONTENT,
      content: extractTextContent(tag.children),
      attributes: getContentFileAttributes({ tag, prompt }),
      version: 1,
      ...(blockErrors.length > 0 && { errors: blockErrors }),
    } as FileBlock
  } else if (tag.name === 'tool-call') {
    return {
      type: BLOCK_EDITOR_TYPE.TOOL_CALL,
      attributes: getToolCallAttributes({ tag, prompt }),
      version: 1,
      ...(blockErrors.length > 0 && { errors: blockErrors }),
    } as ToolCallBlock
  }
}

function proccesInlineNodes({
  nodes,
  prompt,
  errors = [],
  isLastNode,
  previousWasBlockWithChildren,
}: {
  nodes: TemplateNode[]
  prompt: string
  previousWasBlockWithChildren: boolean
  isLastNode: boolean
  errors?: AstError[]
}): Array<ParagraphBlock | CodeBlock> {
  const blocks: Array<ParagraphBlock | CodeBlock> = []
  let paragraphChildren: InlineBlock[] = []
  let prevWasWithChildren = previousWasBlockWithChildren

  const flushChildren = () => {
    if (paragraphChildren.length > 0) {
      blocks.push(createParagraph({ children: paragraphChildren }))
      paragraphChildren = []
    }
  }

  let previousWasBlock = false
  let previousWasInlineBlock = false
  let endsWithEmptyLine = false

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx]!
    const previousNode = nodes[idx - 1]

    if (node.type === 'Text') {
      let lines = node.data.split('\n')

      const nextNode = nodes[idx + 1]
      const nextIsBlock = isContentBlockOrCodeBlock(nextNode)
      const removeTrailingNewline =
        (previousWasBlock || nextIsBlock) && previousNode !== undefined
      if (removeTrailingNewline && lines.length > 1 && lines[0] === '') {
        lines = lines.slice(1)
      }

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const text = lines[lineIdx]
        const isLastLine = lineIdx === lines.length - 1
        if (lineIdx > 0) {
          flushChildren()
        }

        if (text !== undefined && text !== '') {
          paragraphChildren.push(createTextNode({ text }))
        } else if (
          !isLastLine &&
          !prevWasWithChildren &&
          (!previousWasInlineBlock || previousWasBlock)
        ) {
          flushChildren()
          blocks.push(
            createParagraph({ children: [createTextNode({ text: '' })] }),
          )
          endsWithEmptyLine = false
        } else if (isLastLine) {
          // Only set the flag, do NOT flush yet
          if (text === '') endsWithEmptyLine = true
        }

        // Reset this setting to allow empty lines "\n" inside a Text
        // block to create new paragraphs
        previousWasInlineBlock = false
        prevWasWithChildren = false
      }
      previousWasBlock = false
      previousWasInlineBlock = true
    } else if (isReferenceLink(node)) {
      paragraphChildren.push(createReferenceLink({ prompt, tag: node, errors }))

      previousWasInlineBlock = true
      previousWasBlock = false
    } else if (isVariable(node)) {
      paragraphChildren.push(createVariable({ node, errors }))

      previousWasInlineBlock = true
      previousWasBlock = false
    } else if (isContentBlock(node)) {
      flushChildren()
      const contentBlock = createContentBlock({ prompt, tag: node, errors })
      if (contentBlock) {
        blocks.push(createParagraph({ children: [contentBlock] }))
      }

      previousWasBlock = true
      endsWithEmptyLine = false
    } else {
      flushChildren()
      blocks.push(
        createCodeBlock({
          text: nodeToText(node as unknown as ElementTag),
          errors: errors.length ? findErrorsForNode(node, errors) : undefined,
        }),
      )

      previousWasBlock = true
      endsWithEmptyLine = false
    }
  }

  flushChildren()

  if (endsWithEmptyLine && isLastNode) {
    // Add a trailing empty paragraph if the last line was empty
    blocks.push(createParagraph({ children: [createTextNode({ text: '' })] }))
  }

  return blocks
}

function processBlockNode({
  node,
  prompt,
  errors,
}: {
  node: TemplateNode
  prompt: string
  errors?: AstError[]
}): StepBlock | MessageBlock | ParagraphBlock | CodeBlock | undefined {
  const blockErrors = errors ? findErrorsForNode(node, errors) : []

  if (isStepBlock(node)) {
    return {
      attributes: getStepAttributes({ tag: node, prompt }),
      version: 1,
      direction: 'ltr',
      format: 'left',
      indent: 0,
      type: BLOCK_EDITOR_TYPE.STEP,
      errors: blockErrors?.length > 0 ? blockErrors : undefined,
      // @ts-expect-error - Improve Typescript types for children
      children: node.children
        ? processNodes({ nodes: node.children, prompt, errors })
        : [],
    } satisfies StepBlock
  }

  if (isMessageBlock(node)) {
    const message = node as ElementTag
    return {
      version: 1,
      direction: 'ltr',
      format: 'left',
      indent: 0,
      type: BLOCK_EDITOR_TYPE.MESSAGE,
      role: message.name as MessageBlockType,
      errors: blockErrors?.length > 0 ? blockErrors : undefined,
      // @ts-expect-error - Improve Typescript types for children
      children: message.children
        ? processNodes({ nodes: message.children, prompt, errors })
        : [],
    } satisfies MessageBlock
  }
}

function processNodes({
  nodes,
  prompt,
  errors = [],
}: {
  nodes: TemplateNode[]
  prompt: string
  errors?: AstError[]
}) {
  const blocks = []
  let i = 0

  while (i < nodes.length) {
    const node = nodes[i]
    if (!node) {
      i++
      continue
    }

    if (isConfigNode(node)) {
      i++
      continue
    }

    if (isBlockWithChildren(node)) {
      const block = processBlockNode({ node, prompt, errors })
      if (block) {
        blocks.push(block)
      }
      i++
    } else {
      const previousNode = nodes[i - 1]
      const startIdx = i
      let endIdx = i
      while (
        endIdx < nodes.length &&
        !isBlockWithChildren(nodes[endIdx]) &&
        !isConfigNode(nodes[endIdx])
      )
        endIdx++

      const inlineNodes = nodes.slice(startIdx, endIdx)
      let previousWasBlockWithChildren = isBlockWithChildren(previousNode)
      const processedInlineBlocks = proccesInlineNodes({
        prompt,
        nodes: inlineNodes,
        errors,
        previousWasBlockWithChildren,
        isLastNode: endIdx === nodes.length,
      })

      blocks.push(...processedInlineBlocks)

      i = endIdx
    }
  }

  return blocks
}

export function fromAstToBlocks({
  ast,
  prompt,
  errors = [],
}: {
  ast: Fragment
  prompt: string
  errors?: AstError[]
}) {
  const children = processNodes({
    nodes: ast.children,
    prompt,
    errors,
  })

  // If no content, create an empty paragraph with empty text
  if (children.length === 0) {
    children.push(createEmptyParagraph({ content: '' }))
  }

  return {
    type: BLOCK_EDITOR_TYPE.ROOT,
    children,
    version: 1,
    direction: 'ltr',
    indent: 0,
    format: '',
  } satisfies BlockRootNode
}

export type { BlockRootNode }
