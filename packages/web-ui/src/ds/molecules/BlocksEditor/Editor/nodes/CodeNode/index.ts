import {
  CodeNode as LexicalCodeNode,
  SerializedCodeNode as LexicalSerializedCodeNode,
} from '@lexical/code'
import {
  $applyNodeReplacement,
  EditorConfig,
  LexicalUpdateJSON,
  NodeKey,
  Spread,
} from 'lexical'
import { BLOCK_EDITOR_TYPE } from '../../state/promptlToLexical/types'
import { AstError } from '@latitude-data/constants/promptl'

export type SerializedCodeNode = Spread<
  {
    errors?: AstError[] | null | undefined
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

  static getType() {
    return BLOCK_EDITOR_TYPE.CODE
  }

  static clone(node: CodeNode): CodeNode {
    return new CodeNode(node.__language, node.__errors, node.__key)
  }

  constructor(
    language?: string | null | undefined,
    errors?: AstError[] | null,
    key?: NodeKey,
  ) {
    super(language, key)
    this.__errors = errors || undefined
  }

  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config)

    dom.setAttribute('data-block-type', 'code')
    this.updateErrorOverlay({
      dom,
      errors: this.getErrors(),
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
    }
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (this.getErrors() !== prevNode.getErrors()) {
      this.updateErrorOverlay({
        dom,
        errors: this.getErrors(),
      })
    }

    return super.updateDOM(prevNode, dom, config)
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedCodeNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setLanguage(serializedNode.language)
      .setErrors(serializedNode.errors)
  }

  updateErrorOverlay({
    dom,
    errors,
  }: {
    dom: HTMLElement
    errors: AstError[] | null | undefined
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
    newOverlay.className = [
      'code-error-overlay',
      'flex items-center px-4 py-2 mb-2',
      'bg-destructive text-destructive-foreground rounded pointer-events-none',
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
}

export function $createCodeNode(
  language?: string | null | undefined,
  errors?: AstError[] | null | undefined,
): CodeNode {
  return $applyNodeReplacement(new CodeNode(language, errors))
}
