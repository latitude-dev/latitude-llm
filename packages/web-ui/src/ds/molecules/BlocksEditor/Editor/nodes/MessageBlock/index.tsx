import { Root } from 'react-dom/client'
import {
  ElementNode,
  NodeKey,
  LexicalNode,
  EditorConfig,
  $createParagraphNode,
  $createTextNode,
  $applyNodeReplacement,
  SerializedLexicalNode,
} from 'lexical'
import { cn } from '../../../../../../lib/utils'
import {
  createReactDivWrapper,
  replaceReactRoot,
  VERTICAL_SPACE_CLASS,
} from '../utils'
import {
  BLOCK_EDITOR_TYPE,
  MessageBlock,
  MessageBlockType,
} from '../../state/promptlToLexical/types'
import { $isStepBlockNode } from '../StepBlock'
import { MessageHeader } from './MessageHeader'

interface SerializedMessageBlock extends Omit<MessageBlock, 'children'> {
  children: SerializedLexicalNode[]
}

const HEADER_CLASS = 'message-header'

export class MessageBlockNode extends ElementNode {
  __role: MessageBlockType

  static getType(): string {
    return BLOCK_EDITOR_TYPE.MESSAGE
  }

  static clone(node: MessageBlockNode): MessageBlockNode {
    return new MessageBlockNode(node.__role, node.__key)
  }

  constructor(role: MessageBlockType = 'user', key?: NodeKey) {
    super(key)
    this.__role = role
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-block-type', 'message-block')
    wrapper.setAttribute('data-lexical-key', this.__key)
    wrapper.setAttribute('data-draggable-area', 'true')

    const div = document.createElement('div')
    wrapper.appendChild(div)
    div.className = cn(
      'message-block',
      'p-3 border border-border bg-secondary',
      'rounded-lg flex flex-col gap-y-3',
    )

    createReactDivWrapper({
      className: cn('flex', HEADER_CLASS),
      parentDiv: div,
      onRender: (headerDiv) => {
        if (!headerDiv.__reactHeaderRoot__) return // Ensure the root is set

        this.__renderHeader(headerDiv.__reactHeaderRoot__)
      },
    })

    // Create content area where children will be inserted
    const contentArea = document.createElement('div')
    contentArea.setAttribute('data-content-area', 'true')
    contentArea.className = cn('message-content', VERTICAL_SPACE_CLASS)
    div.appendChild(contentArea)

    return wrapper
  }

  updateDOM(_prevNode: this, dom: HTMLElement): boolean {
    replaceReactRoot({
      className: HEADER_CLASS,
      dom,
      onRender: (root) => {
        this.__renderHeader(root)
      },
    })
    return false
  }

  __renderHeader(root: Root) {
    root.render(<MessageHeader nodeKey={this.getKey()} role={this.getRole()} />)
  }

  getRole(): MessageBlockType {
    return this.getLatest().__role
  }

  setRole(role: MessageBlockType): this {
    const writable = this.getWritable()
    writable.__role = role
    return writable
  }

  static importJSON(serializedNode: SerializedMessageBlock): MessageBlockNode {
    return new MessageBlockNode(serializedNode.role)
  }

  exportJSON(): SerializedMessageBlock {
    return {
      ...super.exportJSON(),
      type: BLOCK_EDITOR_TYPE.MESSAGE,
      role: this.__role,
      version: 1,
    }
  }

  canBeEmpty(): boolean {
    return false
  }

  isInline(): boolean {
    return false
  }

  canInsertChild(child: LexicalNode): boolean {
    return !$isMessageBlockNode(child) && !$isStepBlockNode(child)
  }

  canReplaceWith(_replacement: LexicalNode): boolean {
    // Can be replaced with any other block type
    return true
  }

  canMergeWith(node: LexicalNode): boolean {
    return $isMessageBlockNode(node) && node.getRole() === this.getRole()
  }

  canInsertTextBefore(): boolean {
    return false
  }

  canInsertTextAfter(): boolean {
    return false
  }

  getDOMSlot(element: HTMLElement) {
    const contentArea = element.querySelector(
      '[data-content-area="true"]',
    ) as HTMLElement
    return super.getDOMSlot(element).withElement(contentArea)
  }
}

export function $createMessageBlockNode(
  role: MessageBlockType = 'user',
): MessageBlockNode {
  const block = new MessageBlockNode(role)
  const paragraph = $createParagraphNode()
  paragraph.append($createTextNode(''))
  block.append(paragraph)
  return $applyNodeReplacement(block)
}

export function $isMessageBlockNode(
  node: LexicalNode | null | undefined,
): node is MessageBlockNode {
  return node instanceof MessageBlockNode
}
