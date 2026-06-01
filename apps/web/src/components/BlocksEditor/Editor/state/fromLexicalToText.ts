import { SerializedLexicalNode, SerializedRootNode } from 'lexical'
import { BlockRootNode, fromBlocksToText } from './promptlToLexical'

export function isBlockRootNode(
  node: SerializedRootNode<SerializedLexicalNode>,
): node is BlockRootNode {
  return node.type === 'root' && Array.isArray(node.children)
}

/**
 * Creates a stateful deduper for the blocks editor's onChange stream.
 *
 * Lexical emits an onChange shortly after load (node-transform normalization)
 * without any user keystroke, and the serialized text round-trip is lossy
 * (whitespace/indentation are normalized). Both produce a serialized body that
 * is semantically identical to the initial value but differs from the stored
 * raw text, which would otherwise create a phantom document version in the
 * draft. The deduper only forwards a change when the serialized body differs
 * from the last value it emitted (seeded with the serialized initial value),
 * so these no-op emissions are suppressed while genuine edits still pass.
 */
export function createBlocksChangeDeduper(initialValue: BlockRootNode) {
  let last = fromBlocksToText(initialValue)
  return (root: BlockRootNode, onChange: (text: string) => void) => {
    const text = fromBlocksToText(root)
    if (text === last) return
    last = text
    onChange(text)
  }
}
