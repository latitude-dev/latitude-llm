import {
  LexicalEditor,
  SerializedLexicalNode,
  SerializedRootNode,
} from 'lexical'
import { BlockRootNode, fromBlocksToText } from './promptlToLexical'

function isBlockRootNode(
  node: SerializedRootNode<SerializedLexicalNode>,
): node is BlockRootNode {
  return node.type === 'root' && Array.isArray(node.children)
}

export function fromLexicalToText({ editor }: { editor: LexicalEditor }) {
  const root = editor.toJSON().editorState.root
  if (!isBlockRootNode(root)) {
    console.error('Invalid root node:', root)
    return null
  }
  return fromBlocksToText(root)
}
