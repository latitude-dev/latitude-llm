import type { AstError } from '@latitude-data/constants/promptl'
import {
  CodeNode as LexicalCodeNode,
  type SerializedCodeNode as LexicalSerializedCodeNode,
} from '@lexical/code'
import {
  $applyNodeReplacement,
  type EditorConfig,
  type LexicalUpdateJSON,
  type NodeKey,
  type Spread,
} from 'lexical'
import { BLOCK_EDITOR_TYPE } from '../../state/promptlToLexical/types'

export type SerializedCodeNode = Spread<
  {
    errors?: AstError[] | null | undefined
    readOnly?: boolean
  },
  LexicalSerializedCodeNode
>

/**
 * This node extends the Lexical CodeNode to:
 * 1. Make code node draggable
 * 2. Add support for errors
 */
export class CodeNode extends LexicalCodeNode {
  __errors?: AstError[] | null
  __readOnly?: boolean

  static getType() {
    return BLOCK_EDITOR_TYPE.CODE
  }

  static clone(node: CodeNode): CodeNode {
    return new CodeNode(node.__language, node.__errors, node.__readOnly, node.__key)
  }

  constructor(
    language?: string | null | undefined,
    errors?: AstError[] | null,
    readOnly?: boolean,
    key?: NodeKey,
  ) {
    super(language, key)
    this.__errors = errors || undefined
    this.__readOnly = readOnly
  }

  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config)

    dom.setAttribute('data-block-type', 'code')
    // Note: prevent modifying code blocks or triggering the /menu
    dom.setAttribute('contenteditable', 'false')
    dom.style.userSelect = 'none'
    // Note: using css-only standalone tooltip
    dom.setAttribute('data-tooltip', 'Switch to Dev Mode to edit code blocks')
    dom.setAttribute('data-tooltip-position', 'center')
    this.updateErrorOverlay({
      dom,
      errors: this.getErrors(),
      readOnly: this.getReadOnly(),
    })
    return dom
  }

  static importJSON(serializedNode: SerializedCodeNode): CodeNode {
    return $createCodeNode().updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedCodeNode {
    return {
      ...super.exportJSON(),
      language: this.getLanguage(),
      errors: this.getErrors(),
      readOnly: this.getReadOnly(),
    }
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (this.getErrors() !== prevNode.getErrors()) {
      this.updateErrorOverlay({
        dom,
        errors: this.getErrors(),
        readOnly: this.getReadOnly(),
      })
    }

    return super.updateDOM(prevNode, dom, config)
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedCodeNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setLanguage(serializedNode.language)
      .setErrors(serializedNode.errors)
      .setReadOnly(serializedNode.readOnly)
  }

  updateErrorOverlay({
    dom,
    errors,
  }: {
    dom: HTMLElement
    errors: AstError[] | null | undefined
    readOnly?: boolean
  }) {
    const overlay = this.getOverlay(dom)

    const errorMessage = errors?.[0]?.message
    if (errorMessage) {
      dom.appendChild(overlay)
      dom.classList.add('has-errors')
      dom.style.position = 'relative'
      overlay.textContent = errorMessage
      overlay.style.display = ''
    } else if (overlay) {
      overlay.style.display = 'none'
      dom.classList.remove('has-errors')
    }
  }

  getOverlay(dom: HTMLElement): HTMLDivElement {
    const overlay = dom.querySelector('.code-error-overlay')
    if (overlay) return overlay as HTMLDivElement

    const newOverlay = document.createElement('div')
    newOverlay.setAttribute('contenteditable', 'false')
    newOverlay.className = [
      'code-error-overlay',
      'pointer-events-none select-none',
      'flex items-center px-4 py-2 mb-2',
      'border border-destructive-muted-foreground/10 bg-destructive-muted text-destructive-muted-foreground rounded-lg ',
    ].join(' ')
    dom.appendChild(newOverlay)
    return newOverlay
  }

  setErrors(errors: AstError[] | null | undefined): this {
    const writable = this.getWritable()
    writable.__errors = errors || undefined
    return writable
  }

  getErrors(): AstError[] | null | undefined {
    return this.getLatest().__errors
  }

  setReadOnly(readOnly?: boolean): this {
    const writable = this.getWritable()
    writable.__readOnly = readOnly
    return writable
  }

  getReadOnly(): boolean | undefined {
    return this.getLatest().__readOnly
  }
}

export function $createCodeNode(
  language?: string | null | undefined,
  errors?: AstError[] | null | undefined,
  readOnly?: boolean,
): CodeNode {
  return $applyNodeReplacement(new CodeNode(language, errors, readOnly))
}
