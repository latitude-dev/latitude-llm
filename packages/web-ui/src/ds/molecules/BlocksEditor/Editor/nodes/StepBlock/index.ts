import {
  ElementNode,
  NodeKey,
  LexicalNode,
  EditorConfig,
  setDOMUnmanaged,
  $applyNodeReplacement,
  $createParagraphNode,
  $createTextNode,
  SerializedLexicalNode,
} from 'lexical'
import { cn } from '../../../../../../lib/utils'
import { VERTICAL_SPACE_CLASS } from '../utils'
import { createLabel, onUpdateHeader } from './createLabel'
import {
  BLOCK_EDITOR_TYPE,
  StepBlock,
} from '../../state/promptlToLexical/types'

interface SerializedStepBlock extends Omit<StepBlock, 'children'> {
  children: SerializedLexicalNode[]
}
export class StepBlockNode extends ElementNode {
  __stepName: string | undefined
  __isolated: boolean = false

  static getType(): string {
    return BLOCK_EDITOR_TYPE.STEP
  }

  static clone(node: StepBlockNode): StepBlockNode {
    return new StepBlockNode(node.__stepName, node.__isolated, node.__key)
  }

  constructor(stepName?: string, isolated?: boolean, key?: NodeKey) {
    super(key)
    this.__stepName = stepName
    this.__isolated = isolated ?? false
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-block-type', 'step-block')
    wrapper.setAttribute('data-lexical-key', this.__key)
    wrapper.setAttribute('data-draggable-area', 'true')

    const div = document.createElement('div')
    wrapper.appendChild(div)
    div.className = cn(
      'step-block border-2 border-indigo-400 rounded-lg bg-indigo-50',
    )
    const stepLabel = createLabel({ block: this })
    div.appendChild(stepLabel)
    setDOMUnmanaged(stepLabel)

    // Create content area where children will be inserted
    const contentArea = document.createElement('div')
    contentArea.setAttribute('data-content-area', 'true')
    contentArea.className = cn(
      'step-content pb-4 [&_>*]:px-4',
      VERTICAL_SPACE_CLASS,
    )
    div.appendChild(contentArea)

    return wrapper
  }

  updateDOM(prevNode: this, dom: HTMLElement): boolean {
    return onUpdateHeader({ prevNode, currentBlock: this, dom })
  }

  getStepName() {
    return this.getLatest().__stepName
  }

  setStepName(newName: string): StepBlockNode {
    const writable = this.getWritable()
    writable.__stepName = newName
    return writable
  }

  static importJSON(serializedNode: SerializedStepBlock): StepBlockNode {
    return new StepBlockNode(
      serializedNode.attributes?.as,
      serializedNode.attributes?.isolated ?? false,
    )
  }

  exportJSON(): SerializedStepBlock {
    return {
      ...super.exportJSON(),
      type: BLOCK_EDITOR_TYPE.STEP,
      attributes: {
        as: this.__stepName,
        isolated: this.__isolated,
      },
    }
  }

  canBeEmpty(): boolean {
    return false
  }

  isInline(): boolean {
    return false
  }

  canInsertChild(child: LexicalNode): boolean {
    return !$isStepBlockNode(child)
  }

  canReplaceWith(_replacement: LexicalNode): boolean {
    // Can be replaced with any other block type
    return true
  }

  canMergeWith(node: LexicalNode): boolean {
    // Can only merge with other step blocks
    return $isStepBlockNode(node)
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

export function $isStepBlockNode(
  node: LexicalNode | null | undefined,
): node is StepBlockNode {
  return node instanceof StepBlockNode
}

export function $createStepBlockNode(stepName: string = 'Step'): StepBlockNode {
  const block = new StepBlockNode(stepName)
  const paragraph = $createParagraphNode()
  paragraph.append($createTextNode(''))
  block.append(paragraph)
  return $applyNodeReplacement(block)
}
