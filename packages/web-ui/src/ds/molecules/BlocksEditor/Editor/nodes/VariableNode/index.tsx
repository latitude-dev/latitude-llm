import { DecoratorNode } from 'lexical'
import { JSX } from 'react'
import { Badge } from '../../../../../atoms/Badge'
import { BLOCK_EDITOR_TYPE, Variable } from '../../state/promptlToLexical/types'

export class VariableNode extends DecoratorNode<JSX.Element> {
  __name: string

  static getType() {
    return BLOCK_EDITOR_TYPE.VARIABLE
  }

  static clone(node: VariableNode) {
    return new VariableNode(node.__name, node.__key)
  }

  constructor(name: string, key?: string) {
    super(key)
    this.__name = name
  }

  createDOM() {
    // Lexical manages the DOM for React components, so just return a span
    const span = document.createElement('span')
    span.className = 'variable-pill'
    return span
  }

  updateDOM() {
    return false
  }

  decorate() {
    return <Badge variant='accent'>&#123;&#123;{this.__name}&#125;&#125;</Badge>
  }

  static importJSON(serializedNode: Variable) {
    return new VariableNode(serializedNode.name)
  }

  exportJSON(): Variable {
    return {
      ...super.exportJSON(),
      version: 1,
      type: BLOCK_EDITOR_TYPE.VARIABLE,
      name: this.__name,
    }
  }

  isInline() {
    return true
  }
}
