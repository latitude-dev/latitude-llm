import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'
import { TextNode, $getSelection, $isRangeSelection } from 'lexical'
import { VariableNode } from '../nodes/VariableNode'
import { $isCodeNode } from '@lexical/code'

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/

/**
 * Transforms text nodes containing variable syntax into VariableNode components.
 *
 * This function searches for variable patterns like {{variable}} or {{ variable }}
 * in text nodes and replaces them with interactive VariableNode pills.
 *
 * Features:
 * - Matches variables with optional whitespace: {{var}}, {{ var }}, etc.
 * - Preserves surrounding text before and after variables
 * - Automatically adds a space after each variable for better UX
 * - Maintains cursor position after transformation to prevent selection errors
 * - Recursively processes remaining text for multiple variables
 *
 * Process:
 * 1. Find variable pattern using regex
 * 2. Split text into: before_text + {{variable}} + after_text
 * 3. Replace {{variable}} with VariableNode + space
 * 4. Preserve cursor position if the node was focused
 * 5. Recursively process any remaining text for more variables
 *
 * @param node - The TextNode to scan and transform
 *
 * @example
 * Input:  "Hello {{name}}, welcome to {{app}}!"
 * Output: "Hello [NAME_PILL] , welcome to [APP_PILL] !"
 */
function transformTextNode(node: TextNode) {
  if ($isCodeNode(node.getParent())) return

  const text = node.getTextContent()
  const match = VARIABLE_REGEX.exec(text)

  if (!match) return

  const [fullMatch, variableName] = match
  const start = match.index
  const end = start + fullMatch.length

  if (!variableName) return

  const beforeText = text.substring(0, start)
  const afterText = text.substring(end)

  // Create the variable node
  const variableNode = new VariableNode(variableName)

  // Check if we need to preserve cursor position
  const selection = $getSelection()
  const shouldSetCursor =
    $isRangeSelection(selection) && selection.focus.getNode() === node

  if (start > 0) {
    node.setTextContent(beforeText)

    node.insertAfter(variableNode)

    const spaceNode = new TextNode(' ')
    variableNode.insertAfter(spaceNode)

    if (shouldSetCursor) {
      spaceNode.select(1, 1)
    }

    if (afterText) {
      const afterNode = new TextNode(afterText)
      spaceNode.insertAfter(afterNode)
      transformTextNode(afterNode)
    }
  } else {
    node.replace(variableNode)

    const spaceNode = new TextNode(' ')
    variableNode.insertAfter(spaceNode)

    if (shouldSetCursor) {
      spaceNode.select(1, 1)
    }

    if (afterText) {
      const afterNode = new TextNode(afterText)
      spaceNode.insertAfter(afterNode)
      transformTextNode(afterNode)
    }
  }
}

export function VariableTransformPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerNodeTransform(TextNode, transformTextNode)
  }, [editor])

  return null
}
