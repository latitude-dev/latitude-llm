import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { $nodesOfType, DecoratorNode } from 'lexical'
import type { JSX } from 'react'
import { BLOCK_EDITOR_TYPE, type Variable } from '../../state/promptlToLexical/types'

export class VariableNode extends DecoratorNode<JSX.Element> {
  __name: string
  __readOnly?: boolean

  static getType() {
    return BLOCK_EDITOR_TYPE.VARIABLE
  }

  static clone(node: VariableNode) {
    return new VariableNode(node.__name, node.__readOnly, node.__key)
  }

  constructor(name: string, readOnly?: boolean, key?: string) {
    super(key)
    this.__name = name
    this.__readOnly = readOnly
  }

  createDOM() {
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
    return new VariableNode(serializedNode.name, serializedNode.readOnly)
  }

  exportJSON(): Variable {
    return {
      ...super.exportJSON(),
      version: 1,
      type: BLOCK_EDITOR_TYPE.VARIABLE,
      name: this.__name,
      readOnly: this.getReadOnly(),
    }
  }

  isInline() {
    return true
  }

  getReadOnly(): boolean | undefined {
    return this.getLatest().__readOnly
  }
}

export function $getVariableNames(): string[] {
  return $nodesOfType(VariableNode).map((node) => node.__name)
}
