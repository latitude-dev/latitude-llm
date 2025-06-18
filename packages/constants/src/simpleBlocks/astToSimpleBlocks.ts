import {
  convertElementToText,
  extractTextContent,
  getMessageBlockType,
  getStepAttributes,
  getPromptAttributes,
  getContentFileAttributes,
  getToolCallAttributes,
  isContentBlock,
  isMessageBlock,
  isStepBlock,
  isTopLevelBlock,
  nodeToText,
} from './astParsingUtils'
import {
  type ElementTag,
  type ContentBlock,
  TemplateNode,
  Fragment,
  AnyBlock,
  MessageChild,
  StepChild,
  BlockError,
  AstError,
} from './types'

function createIdGenerator() {
  let counter = 0
  return (): string => `block_${Date.now()}_${++counter}`
}
type IdGenerator = ReturnType<typeof createIdGenerator>

// Helper function to find errors for a given AST node based on start position
function findErrorsForNode(
  node: ElementTag | TemplateNode,
  errors: AstError[],
): BlockError[] {
  if (!('start' in node) || node.start === undefined) {
    return []
  }

  return errors
    .filter((error) => error.startIndex === node.start)
    .map((error) => ({
      message: error.message,
      startIndex: error.startIndex,
      endIndex: error.endIndex,
    }))
}

function createContentBlock({
  prompt,
  tag,
  generateIdFn,
  errors = [],
}: {
  prompt: string
  tag: ElementTag
  generateIdFn: IdGenerator
  errors?: AstError[]
}): ContentBlock {
  const blockErrors = findErrorsForNode(tag, errors)

  if (tag.name === 'prompt') {
    return {
      id: generateIdFn(),
      type: 'prompt',
      attributes: getPromptAttributes({ tag, prompt }),
      ...(blockErrors.length > 0 && { errors: blockErrors }),
    }
  } else if (tag.name === 'content-image') {
    return {
      id: generateIdFn(),
      type: 'content-image',
      content: extractTextContent(tag.children),
      ...(blockErrors.length > 0 && { errors: blockErrors }),
    }
  } else if (tag.name === 'content-file') {
    return {
      id: generateIdFn(),
      type: 'content-file',
      content: extractTextContent(tag.children),
      attributes: getContentFileAttributes({ tag, prompt }),
      ...(blockErrors.length > 0 && { errors: blockErrors }),
    }
  } else if (tag.name === 'tool-call') {
    return {
      id: generateIdFn(),
      type: 'tool-call',
      attributes: getToolCallAttributes({ tag, prompt }),
      ...(blockErrors.length > 0 && { errors: blockErrors }),
    }
  } else {
    return {
      id: generateIdFn(),
      type: 'text',
      content: extractTextContent(tag.children),
      ...(blockErrors.length > 0 && { errors: blockErrors }),
    }
  }
}

function messageTagToBlock({
  prompt,
  tag,
  generateIdFn,
  errors = [],
}: {
  prompt: string
  tag: ElementTag
  generateIdFn: IdGenerator
  errors?: AstError[]
}): {
  id: string
  type: 'system' | 'user' | 'assistant' | 'developer'
  children: MessageChild[]
  errors?: BlockError[]
} {
  const messageChildren: MessageChild[] = []
  let textContent = ''
  const blockErrors = findErrorsForNode(tag, errors)

  for (const child of tag.children) {
    if (child.type === 'ElementTag') {
      const childTag = child as ElementTag
      if (isContentBlock(childTag)) {
        if (textContent) {
          messageChildren.push({
            id: generateIdFn(),
            type: 'text',
            content: textContent,
          })
          textContent = ''
        }

        messageChildren.push(
          createContentBlock({ prompt, tag: childTag, generateIdFn, errors }),
        )
      } else {
        textContent += convertElementToText(childTag, true)
      }
    } else {
      textContent += nodeToText(child, true)
    }
  }

  if (textContent) {
    messageChildren.push({
      id: generateIdFn(),
      type: 'text',
      content: textContent,
    })
  }

  return {
    id: generateIdFn(),
    type: getMessageBlockType(tag),
    children: messageChildren,
    ...(blockErrors.length > 0 && { errors: blockErrors }),
  }
}

// Helper function to process nodes and convert them to blocks
function processNodes({
  nodes,
  generateIdFn,
  prompt,
  errors = [],
}: {
  nodes: TemplateNode[]
  generateIdFn: IdGenerator
  prompt: string
  errors?: AstError[]
}): AnyBlock[] {
  const blocks: AnyBlock[] = []
  let i = 0

  while (i < nodes.length) {
    const node = nodes[i]!

    if (node.type === 'Config') {
      i++
      continue
    }

    if (node.type === 'ElementTag') {
      const tag = node as ElementTag

      if (isMessageBlock(tag)) {
        blocks.push(messageTagToBlock({ prompt, tag, generateIdFn, errors }))
      } else if (isContentBlock(tag)) {
        blocks.push(createContentBlock({ prompt, tag, generateIdFn, errors }))
      } else if (isStepBlock(tag)) {
        const stepChildren: StepChild[] = []
        const blockErrors = findErrorsForNode(tag, errors)

        for (const child of tag.children) {
          if (child.type === 'ElementTag') {
            const childTag = child as ElementTag
            if (isMessageBlock(childTag)) {
              stepChildren.push(
                messageTagToBlock({
                  prompt,
                  tag: childTag,
                  generateIdFn,
                  errors,
                }),
              )
            } else if (isContentBlock(childTag)) {
              stepChildren.push(
                createContentBlock({
                  prompt,
                  tag: childTag,
                  generateIdFn,
                  errors,
                }),
              )
            } else {
              const content = convertElementToText(childTag, true)
              if (content) {
                stepChildren.push({
                  id: generateIdFn(),
                  type: 'text',
                  content: content,
                })
              }
            }
          } else {
            const content = nodeToText(child, true)
            if (content) {
              stepChildren.push({
                id: generateIdFn(),
                type: 'text',
                content: content,
              })
            }
          }
        }

        const stepAttributes = getStepAttributes({ tag, prompt })
        blocks.push({
          id: generateIdFn(),
          type: 'step',
          children: stepChildren,
          attributes: stepAttributes,
          ...(blockErrors.length > 0 && { errors: blockErrors }),
        })
      } else {
        const childBlocks = processNodes({
          nodes: tag.children,
          generateIdFn,
          prompt,
          errors,
        })
        blocks.push(...childBlocks)
      }
      i++
    } else {
      // Accumulate consecutive non-ElementTag nodes into a single block
      const accumulatedContent: string[] = []

      while (i < nodes.length) {
        const currentNode = nodes[i]!

        // Stop if we hit an ElementTag that creates a block
        if (currentNode.type === 'ElementTag') {
          const tag = currentNode as ElementTag
          if (isTopLevelBlock(tag)) {
            break
          }
        }

        // Accumulate content from this node
        if (currentNode.type === 'Config') {
          // Skip config nodes in content accumulation
        } else {
          accumulatedContent.push(nodeToText(currentNode))
        }

        i++
      }

      const content = accumulatedContent.join('')

      if (content) {
        const systemTagMatch = content.match(/^<s>([\s\S]*?)<\/system>/)
        if (systemTagMatch) {
          blocks.push({
            id: generateIdFn(),
            type: 'system',
            children: [],
          })
        } else {
          blocks.push({
            id: generateIdFn(),
            type: 'text',
            content: content,
          })
        }
      }
    }
  }

  return blocks
}

export function astToSimpleBlocks({
  ast,
  prompt,
  errors = [],
}: {
  ast: Fragment
  prompt: string
  errors?: AstError[]
}): AnyBlock[] {
  const generateIdFn = createIdGenerator()
  return processNodes({ nodes: ast.children, generateIdFn, prompt, errors })
}
