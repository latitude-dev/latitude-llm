import { cn } from '@latitude-data/web-ui/utils'
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $createTextNode,
  $nodesOfType,
  type EditorConfig,
  ElementNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from 'lexical'
import type { Root } from 'react-dom/client'
import { BLOCK_EDITOR_TYPE, type StepBlock } from '../../state/promptlToLexical/types'
import { createReactDivWrapper, replaceReactRoot, VERTICAL_SPACE_CLASS } from '../utils'
import { StepHeader } from './StepHeader'

interface SerializedStepBlock extends Omit<StepBlock, 'children'> {
  children: SerializedLexicalNode[]
}

const HEADER_CLASS = 'step-header'

export class StepBlockNode extends ElementNode {
  __stepName: string | undefined
  __isolated: boolean | undefined
  __otherAttributes: Record<string, unknown> | undefined = undefined
  __headerRoot?: Root
  __readOnly?: boolean

  static getType(): string {
    return BLOCK_EDITOR_TYPE.STEP
  }

  static clone(node: StepBlockNode): StepBlockNode {
    return new StepBlockNode(
      node.__stepName,
      node.__isolated,
      node.__otherAttributes,
      node.__readOnly,
      node.__key,
    )
  }

  constructor(
    stepName?: string,
    isolated?: boolean,
    __otherAttributes?: Record<string, unknown>,
    readOnly?: boolean,
    key?: NodeKey,
  ) {
    super(key)
    this.__stepName = stepName
    this.__isolated = isolated
    this.__otherAttributes = __otherAttributes
    this.__readOnly = readOnly
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-block-type', 'step-block')
    wrapper.setAttribute('data-lexical-key', this.__key)
    wrapper.setAttribute('data-draggable-area', 'true')

    const div = document.createElement('div')
    wrapper.appendChild(div)
    div.className = cn(
      'step-block',
      'p-3 border border-border bg-background',
      'rounded-lg flex flex-col gap-y-3',
    )

    createReactDivWrapper({
      className: HEADER_CLASS,
      parentDiv: div,
      onRender: (headerDiv) => {
        if (!headerDiv.__reactHeaderRoot__) return // Make Typescript happy

        this.__renderHeader(headerDiv.__reactHeaderRoot__)
      },
    })

    // Create content area where children will be inserted
    const contentArea = document.createElement('div')
    contentArea.setAttribute('data-content-area', 'true')
    contentArea.className = cn('step-content', VERTICAL_SPACE_CLASS)
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
    root.render(
      <StepHeader
        stepIndex={this._getStepIndex()}
        stepKey={this.getKey()}
        as={this.getStepName()}
        isolated={this.getIsolated()}
        otherAttributes={this.__otherAttributes}
        readOnly={this.getReadOnly()}
      />,
    )
  }

  setStepName(newName: string): StepBlockNode {
    const writable = this.getWritable()
    // Note: if name is empty, we don't want to set the attribute
    writable.__stepName = newName || undefined
    return writable
  }

  getStepName() {
    return this.getLatest().__stepName
  }

  setIsolated(isolated: boolean): StepBlockNode {
    const writable = this.getWritable()
    // Note: if isolated is false, we don't want to set the attribute
    writable.__isolated = isolated || undefined
    return writable
  }

  getIsolated() {
    return this.getLatest().__isolated
  }

  getReadOnly(): boolean | undefined {
    return this.getLatest().__readOnly
  }

  static importJSON(serializedNode: SerializedStepBlock): StepBlockNode {
    return new StepBlockNode(
      serializedNode.attributes?.as,
      serializedNode.attributes?.isolated,
      serializedNode.attributes?.otherAttributes,
      serializedNode.readOnly,
    )
  }

  exportJSON(): SerializedStepBlock {
    return {
      ...super.exportJSON(),
      type: BLOCK_EDITOR_TYPE.STEP,
      attributes: {
        as: this.__stepName,
        isolated: this.__isolated,
        otherAttributes: this.__otherAttributes,
      },
      readOnly: this.getReadOnly(),
    }
  }

  canBeEmpty(): boolean {
    return false
  }

  isInline(): boolean {
    return false
  }

  _getStepIndex(): number {
    const parent = this.getParent()
    if (!parent) return 1
    const siblings = parent
      .getChildren()
      .filter((child) => child.getType() === StepBlockNode.getType())
    return siblings.findIndex((child) => child.getKey() === this.__key) + 1
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
    const contentArea = element.querySelector('[data-content-area="true"]') as HTMLElement
    return super.getDOMSlot(element).withElement(contentArea)
  }
}

export function $isStepBlockNode(node: LexicalNode | null | undefined): node is StepBlockNode {
  return node instanceof StepBlockNode
}

export function $createStepBlockNode(stepName?: string): StepBlockNode {
  const block = new StepBlockNode(stepName)
  const paragraph = $createParagraphNode()
  paragraph.append($createTextNode(''))
  block.append(paragraph)
  return $applyNodeReplacement(block)
}

export function $getStepNames() {
  return $nodesOfType(StepBlockNode)
    .filter((step) => step.getStepName() !== undefined)
    .map((step) => step.getStepName()!)
}
