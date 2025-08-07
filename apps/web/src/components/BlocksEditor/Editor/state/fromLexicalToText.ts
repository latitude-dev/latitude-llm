import type { EditorState, SerializedLexicalNode, SerializedRootNode } from 'lexical'
import type { BlocksEditorProps } from '../../types'
import { type BlockRootNode, fromBlocksToText } from './promptlToLexical'

function isBlockRootNode(node: SerializedRootNode<SerializedLexicalNode>): node is BlockRootNode {
  return node.type === 'root' && Array.isArray(node.children)
}

export const fromLexicalToText =
  ({ onChange }: { onChange: BlocksEditorProps['onChange'] }) =>
  (editorState: EditorState) => {
    const jsonState = editorState.toJSON()
    const root = jsonState.root

    if (!isBlockRootNode(jsonState.root)) {
      // Typescript happiness is the most important to me.
      // This can't happen because `EditorState.toJSON()` always returns a root node.
      console.error('Invalid root node:', root)
      return
    }

    onChange(fromBlocksToText(jsonState.root))
  }
