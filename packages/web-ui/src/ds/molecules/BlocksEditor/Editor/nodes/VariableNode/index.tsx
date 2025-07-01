import { DecoratorNode } from 'lexical'
import { JSX } from 'react'
import { Badge } from '../../../../../atoms/Badge'

export class VariableNode extends DecoratorNode<JSX.Element> {
  __name: string

  static getType() {
    return 'variable'
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

  static importJSON(serializedNode: any) {
    return new VariableNode(serializedNode.name)
  }

  exportJSON() {
    return {
      type: 'variable',
      version: 1,
      name: this.__name,
    }
  }

  isInline() {
    return true
  }
}
