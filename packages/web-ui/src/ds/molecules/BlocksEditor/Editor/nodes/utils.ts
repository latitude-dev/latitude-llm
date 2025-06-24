import {
  SerializedElementNode,
  LexicalNode,
  $applyNodeReplacement,
  $createParagraphNode,
  $createTextNode,
} from 'lexical'
import { MessageBlockNode } from './MessageBlock'
import { StepBlockNode } from './StepBlock'

export type BlockType = 'message' | 'step'
export type MessageRole = 'system' | 'user' | 'assistant' | 'developer'
export interface SerializedBlockNode extends SerializedElementNode {
  blockType: BlockType
  role?: MessageRole
  stepName?: string
}

export function $isMessageBlockNode(
  node: LexicalNode | null | undefined,
): node is MessageBlockNode {
  return node instanceof MessageBlockNode
}

export function $isStepBlockNode(
  node: LexicalNode | null | undefined,
): node is StepBlockNode {
  return node instanceof StepBlockNode
}

export function $createMessageBlockNode(
  role: MessageRole = 'user',
): MessageBlockNode {
  const block = new MessageBlockNode(role)
  const paragraph = $createParagraphNode()
  paragraph.append($createTextNode(''))
  block.append(paragraph)
  return $applyNodeReplacement(block)
}

export function $createStepBlockNode(stepName: string = 'Step'): StepBlockNode {
  const block = new StepBlockNode(stepName)
  const paragraph = $createParagraphNode()
  paragraph.append($createTextNode(''))
  block.append(paragraph)
  return $applyNodeReplacement(block)
}
export const VERTICAL_SPACE_CLASS = 'space-y-2'
