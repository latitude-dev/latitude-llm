import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  createCommand,
  LexicalCommand,
  COMMAND_PRIORITY_EDITOR,
  $getRoot,
  LexicalNode,
  $isElementNode,
  $createTextNode,
  $createParagraphNode,
} from 'lexical'
import { AnyBlock } from '@latitude-data/constants/simpleBlocks'
import {
  $createMessageBlockNode,
  $createStepBlockNode,
  $isMessageBlockNode,
  $isStepBlockNode,
  MessageRole,
} from '../nodes/utils'

// Function to validate and fix hierarchy violations
function $validateAndFixHierarchy(): boolean {
  const root = $getRoot()
  let hasViolations = false

  function validateNode(node: LexicalNode): void {
    if (!$isElementNode(node)) return

    const children = node.getChildren()

    for (const child of children) {
      // Check if this child violates hierarchy rules
      if ($isMessageBlockNode(node)) {
        // Message blocks should not contain other message blocks or step blocks
        if ($isMessageBlockNode(child) || $isStepBlockNode(child)) {
          console.warn(
            '🚨 Hierarchy violation: Message block contains invalid block',
            {
              parent: node.getType(),
              child: child.getType(),
            },
          )
          hasViolations = true
          // Move the child to root level
          child.remove()
          root.append(child)
        }
      } else if ($isStepBlockNode(node)) {
        // Step blocks should not contain other step blocks
        if ($isStepBlockNode(child)) {
          console.warn(
            '🚨 Hierarchy violation: Step block contains step block',
            {
              parent: node.getType(),
              child: child.getType(),
            },
          )
          hasViolations = true
          // Move the child to root level
          child.remove()
          root.append(child)
        }
      }

      // Recursively validate children
      validateNode(child)
    }
  }

  validateNode(root)

  if (hasViolations) {
    console.log(
      '✅ Fixed hierarchy violations - moved invalid nested blocks to root level',
    )
  }

  return hasViolations
}

// Helper function to find where to insert a new block based on hierarchy rules
function $findInsertionPoint(
  anchorNode: LexicalNode,
  blockType: 'message' | 'step',
): {
  parent: LexicalNode
  insertMethod: 'append' | 'insertAfter'
  referenceNode?: LexicalNode
} {
  // Walk up the tree to find the appropriate container
  let currentNode: LexicalNode | null = anchorNode

  while (currentNode) {
    if ($isMessageBlockNode(currentNode)) {
      // Inside a message block - messages and steps cannot be inside message blocks
      // Insert after the message block at its parent level
      const parent = currentNode.getParent()
      if (parent) {
        return {
          parent,
          insertMethod: 'insertAfter',
          referenceNode: currentNode,
        }
      }
    }

    if ($isStepBlockNode(currentNode)) {
      // Inside a step block
      if (blockType === 'message') {
        // Messages can be inserted inside step blocks
        return { parent: currentNode, insertMethod: 'append' }
      } else {
        // Steps cannot be inside step blocks
        // Insert after the step block at its parent level
        const parent = currentNode.getParent()
        if (parent) {
          return {
            parent,
            insertMethod: 'insertAfter',
            referenceNode: currentNode,
          }
        }
      }
    }

    currentNode = currentNode.getParent()
  }

  // Default: insert at root level
  return { parent: $getRoot(), insertMethod: 'append' }
}

export const INSERT_MESSAGE_BLOCK_COMMAND: LexicalCommand<MessageRole> =
  createCommand('INSERT_MESSAGE_BLOCK_COMMAND')
export const INSERT_STEP_BLOCK_COMMAND: LexicalCommand<string> = createCommand(
  'INSERT_STEP_BLOCK_COMMAND',
)

export function BlocksPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // Register command handlers
    const removeMessageCommand = editor.registerCommand(
      INSERT_MESSAGE_BLOCK_COMMAND,
      (role: MessageRole) => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode()
          const { parent, insertMethod, referenceNode } = $findInsertionPoint(
            anchorNode,
            'message',
          )

          // Create new message block
          const messageBlock = $createMessageBlockNode(role)

          // Insert using the determined method
          if (insertMethod === 'append' && $isElementNode(parent)) {
            parent.append(messageBlock)
          } else if (insertMethod === 'insertAfter' && referenceNode) {
            referenceNode.insertAfter(messageBlock)
          }

          // Focus the new block
          messageBlock.selectEnd()
        }
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )

    const removeStepCommand = editor.registerCommand(
      INSERT_STEP_BLOCK_COMMAND,
      (stepName: string) => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode()
          const { parent, insertMethod, referenceNode } = $findInsertionPoint(
            anchorNode,
            'step',
          )

          // Create new step block
          const stepBlock = $createStepBlockNode(stepName)

          // Insert using the determined method
          if (insertMethod === 'append' && $isElementNode(parent)) {
            parent.append(stepBlock)
          } else if (insertMethod === 'insertAfter' && referenceNode) {
            referenceNode.insertAfter(stepBlock)
          }

          // Focus the new block
          stepBlock.selectEnd()
        }
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )

    return () => {
      removeMessageCommand()
      removeStepCommand()
    }
  }, [editor])

  return null
}

// Initialize editor with blocks
// Helper function to recursively convert AnyBlock to Lexical nodes
function convertBlockToLexicalNode(block: AnyBlock): LexicalNode | null {
  let lexicalBlock: LexicalNode | null = null

  if (block.type === 'step') {
    lexicalBlock = $createStepBlockNode(block.attributes?.as || 'Step')

    // Process step children - if block has children property, use it (even if empty)
    if ('children' in block) {
      // Remove the default empty paragraph that gets created
      if ($isElementNode(lexicalBlock)) {
        lexicalBlock.clear()

        // Only add children if they exist
        if (block.children && block.children.length > 0) {
          for (const childBlock of block.children) {
            const childNode = convertBlockToLexicalNode(childBlock)
            if (childNode) {
              lexicalBlock.append(childNode)
            }
          }
        } else {
          // If children array is empty, add a paragraph to make the block editable
          lexicalBlock.append($createParagraphNode())
        }
      }
    }
  } else if (
    ['system', 'user', 'assistant', 'developer'].includes(block.type)
  ) {
    lexicalBlock = $createMessageBlockNode(block.type as MessageRole)

    // Process message children - if block has children property, use it (even if empty)
    if ('children' in block) {
      // Remove the default empty paragraph that gets created
      if ($isElementNode(lexicalBlock)) {
        lexicalBlock.clear()

        // Only add children if they exist
        if (block.children && block.children.length > 0) {
          for (const childBlock of block.children) {
            const childNode = convertBlockToLexicalNode(childBlock)
            if (childNode) {
              lexicalBlock.append(childNode)
            }
          }
        } else {
          // If children array is empty, add a paragraph to make the block editable
          lexicalBlock.append($createParagraphNode())
        }
      }
    }
    // If no children, keep the default empty paragraph for editing
  } else if (block.type === 'text') {
    // Create a regular Lexical paragraph for text blocks
    lexicalBlock = $createParagraphNode()
    if ('content' in block && block.content && $isElementNode(lexicalBlock)) {
      lexicalBlock.append($createTextNode(block.content))
    }
  } else {
    console.warn('Unsupported block type for editor:', block.type)
    // Create a regular Lexical paragraph as fallback
    lexicalBlock = $createParagraphNode()
    if ('content' in block && block.content && $isElementNode(lexicalBlock)) {
      lexicalBlock.append($createTextNode(block.content))
    }
  }

  return lexicalBlock
}

export function InitializeBlocksPlugin({
  initialBlocks,
}: {
  initialBlocks: AnyBlock[]
}): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editor.update(() => {
      const root = $getRoot()

      // If we have initial blocks, always use them
      if (initialBlocks.length > 0) {
        console.log('🔄 Initializing editor with blocks:', initialBlocks)

        // Clear existing content
        root.clear()

        // Convert AnyBlock[] to Lexical nodes
        for (const block of initialBlocks) {
          const lexicalBlock = convertBlockToLexicalNode(block)
          if (lexicalBlock) {
            root.append(lexicalBlock)
          }
        }
      } else if (root.getChildrenSize() === 0) {
        // Only add default paragraph if there are no initial blocks and no existing content
        console.log('📝 Adding default paragraph')
        const paragraph = $createParagraphNode()
        root.append(paragraph)
      }
    })
  }, [editor, initialBlocks])

  return null
}

export function HierarchyValidationPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // Validate hierarchy on mount and whenever the editor content changes
    const validateHierarchy = () => {
      editor.update(() => {
        $validateAndFixHierarchy()
      })
    }

    // Run validation on mount
    validateHierarchy()

    // Also run validation whenever the editor state changes
    const removeListener = editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        // Only validate in read mode to avoid infinite loops
        editor.update(() => {
          $validateAndFixHierarchy()
        })
      })
    })

    return removeListener
  }, [editor])

  return null
}
