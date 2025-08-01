import { AstError } from '@latitude-data/constants/promptl'
import {
  createTextNode,
  extractTextContent,
  getContentFileAttributes,
  getPromptAttributes,
  getStepAttributes,
  getToolCallAttributes,
  isBlockWithChildren,
  isConfigNode,
  isContentBlock,
  isMessageBlock,
  isReferenceLink,
  isStepBlock,
  isVariable,
} from './astParsingUtils'
import { createCodeBlock } from './createCodeBlock'
import {
  BLOCK_EDITOR_TYPE,
  BlockAttributes,
  BlockRootNode,
  CodeBlock,
  type ContentBlock,
  type ElementTag,
  FileBlock,
  Fragment,
  ImageBlock,
  InlineBlock,
  MessageBlock,
  MessageBlockType,
  ParagraphBlock,
  ReferenceLink,
  StepBlock,
  TemplateNode,
  ToolCallBlock,
  Variable,
} from './types'

function findErrorsForNode({
  node,
  errors,
  findRemainingErrors = false,
}: {
  node: ElementTag | TemplateNode
  errors: AstError[]
  findRemainingErrors?: boolean
}): AstError[] {
  if (!('start' in node) || node.start === undefined) {
    return []
  }

  return errors
    .filter((error) => {
      if (!findRemainingErrors) return error.startIndex === node.start

      if (node.end === null) return false
      return node.end <= error.startIndex
    })
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
  const blockErrors = errors ? findErrorsForNode({ node: tag, errors }) : []
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
  const nodeErrors = errors ? findErrorsForNode({ node, errors }) : []
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
  const blockErrors = findErrorsForNode({ node: tag, errors })

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

function lastNodeEndIsPromptEnd({
  children,
  prompt,
}: {
  children: TemplateNode[]
  prompt: string
}): boolean {
  const lastNode = children[children.length - 1]
  if (!lastNode) return false

  const endLastNode = lastNode.end
  if (endLastNode === null) return false

  return endLastNode >= prompt.length
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
      const nextIsBlock = isContentBlock(nextNode)
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
    } else if (node) {
      // Any unprocessable entity in Promptl is shown as code.
      flushChildren()
      const codeBlock = createCodeBlock({
        node,
        prompt,
        errors: errors.length ? findErrorsForNode({ node, errors }) : undefined,
      })
      if (codeBlock) {
        blocks.push(codeBlock)
        previousWasBlock = true
        endsWithEmptyLine = false
        endsWithEmptyLine = false
      }
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
  const blockErrors = errors ? findErrorsForNode({ node, errors }) : []

  if (isStepBlock(node)) {
    const children = node.children ?? []
    return {
      attributes: getStepAttributes({ tag: node, prompt }),
      version: 1,
      direction: 'ltr',
      format: 'left',
      indent: 0,
      type: BLOCK_EDITOR_TYPE.STEP,
      errors: blockErrors?.length > 0 ? blockErrors : undefined,
      // @ts-expect-error - Improve Typescript types for children
      children:
        children.length > 0
          ? processNodes({ nodes: node.children, prompt, errors })
          : [createEmptyParagraph({ content: '' })],
    } satisfies StepBlock
  }

  if (isMessageBlock(node)) {
    const message = node as ElementTag
    const children = message.children ?? []
    return {
      version: 1,
      direction: 'ltr',
      format: 'left',
      indent: 0,
      type: BLOCK_EDITOR_TYPE.MESSAGE,
      role: message.name as MessageBlockType,
      errors: blockErrors?.length > 0 ? blockErrors : undefined,
      // @ts-expect-error - Improve Typescript types for children
      children:
        children.length > 0
          ? processNodes({ nodes: children, prompt, errors })
          : [createEmptyParagraph({ content: '' })],
    } satisfies MessageBlock
  }

  // Any unprocessable entity in Promptl is shown as code
  return createCodeBlock({ node, prompt, errors })
}

function processNodes({
  nodes,
  prompt,
  errors = [],
  isRoot = false,
}: {
  nodes: TemplateNode[]
  prompt: string
  errors?: AstError[]
  isRoot?: boolean
}) {
  // Only when we're on the root of the AST we know we can have
  // an incompleted text due to parsing errors
  const textCompleted = isRoot
    ? lastNodeEndIsPromptEnd({
        children: nodes,
        prompt,
      })
    : true

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
        isLastNode: textCompleted && endIdx === nodes.length,
      })

      blocks.push(...processedInlineBlocks)

      i = endIdx
    }
  }

  return blocks
}

function maybeCreateCodeBlockWithFailedAst({
  ast,
  prompt,
  errors: parseErrors = [],
}: {
  ast: Fragment
  prompt: string
  errors?: AstError[]
}): CodeBlock | null | undefined {
  const children = ast.children
  const textCompleted = lastNodeEndIsPromptEnd({ children, prompt })
  if (textCompleted) return undefined

  const lastNode = children[children.length - 1]
  if (!lastNode) return undefined
  const startLastNode = lastNode.start
  const endLastNode = lastNode.end
  if (startLastNode === null || endLastNode === null) return

  const promptEnd = prompt.length

  const errors = parseErrors.length
    ? findErrorsForNode({
        node: lastNode,
        errors: parseErrors,
        findRemainingErrors: true,
      })
    : undefined
  // If the last node ends before the end of the prompt, it means there is
  // some content that was not parsed correctly.
  return createCodeBlock({
    node: lastNode,
    prompt,
    errors: errors,
    getText: () => {
      return prompt.slice(endLastNode, promptEnd)
    },
  })
}

function childrenWithoutConfig(children: TemplateNode[]): TemplateNode[] {
  return children.filter((node) => !isConfigNode(node))
}

function trimLeadingTexts(
  blocks: ParagraphBlock['children'],
): ParagraphBlock['children'] {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!

    if (block.type != 'text') {
      return blocks.slice(i)
    }

    const trimmed = block.text.trimStart()
    if (trimmed !== '') {
      block.text = trimmed
      return blocks.slice(i)
    }
  }

  return []
}

function trimTrailingTexts(
  blocks: ParagraphBlock['children'],
): ParagraphBlock['children'] {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!

    if (block.type != 'text') {
      return blocks.slice(0, i + 1)
    }

    const trimmed = block.text.trimEnd()
    if (trimmed !== '') {
      block.text = trimmed
      return blocks.slice(0, i + 1)
    }
  }

  return []
}

function trimLeadingParagraphs(
  blocks: BlockRootNode['children'],
): BlockRootNode['children'] {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!

    if (block.type != 'paragraph') {
      return blocks.slice(i)
    }

    const trimmed = trimLeadingTexts(block.children)
    if (trimmed.length > 0) {
      block.children = trimmed
      return blocks.slice(i)
    }
  }

  return []
}

function trimTrailingParagraphs(
  blocks: BlockRootNode['children'],
): BlockRootNode['children'] {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!

    if (block.type != 'paragraph') {
      return blocks.slice(0, i + 1)
    }

    const trimmed = trimTrailingTexts(block.children)
    if (trimmed.length > 0) {
      block.children = trimmed
      return blocks.slice(0, i + 1)
    }
  }

  return []
}

function trimEmptyBlocks(
  blocks: BlockRootNode['children'],
): BlockRootNode['children'] {
  return trimTrailingParagraphs(trimLeadingParagraphs(blocks))
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
  const nodes = childrenWithoutConfig(ast.children)
  let children = processNodes({
    nodes,
    prompt,
    errors,
    isRoot: true,
  })

  const astMissingTextAsCodeBlock = maybeCreateCodeBlockWithFailedAst({
    ast,
    prompt,
    errors,
  })

  if (astMissingTextAsCodeBlock) {
    children.push(astMissingTextAsCodeBlock)
  }

  // Note: trimming empty blocks to see the placeholder
  children = trimEmptyBlocks(children)

  // Note: Lexical must have at least one root child
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
