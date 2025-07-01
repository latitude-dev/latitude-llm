import { DecoratorNode } from 'lexical'
import { JSX } from 'react'
import { ReferenceLink } from './ReferenceLink'

export type SerializedNode = {
  type: 'prompt'
  version: number
  attributes: Record<string, string | undefined | null>
  path: string
}

export class ReferenceNode extends DecoratorNode<JSX.Element> {
  __path: SerializedNode['path']
  __attributes: SerializedNode['attributes']
  __isLoading: boolean

  static getType() {
    return 'prompt'
  }

  static clone(node: ReferenceNode) {
    return new ReferenceNode({
      key: node.__key,
      attributes: node.__attributes,
      path: node.__path,
    })
  }

  constructor({
    key,
    attributes,
    path,
    isLoading = false,
  }: Omit<SerializedNode, 'type' | 'version'> & {
    isLoading?: boolean
    key?: string
  }) {
    super(key)
    this.__path = path
    this.__attributes = attributes
    this.__isLoading = isLoading
  }

  createDOM() {
    const span = document.createElement('span')
    span.className = 'align-baseline'
    return span
  }

  updateDOM() {
    return false
  }

  decorate() {
    return (
      <ReferenceLink
        path={this.__path}
        attributes={this.__attributes}
        isLoading={this.__isLoading}
      />
    )
  }

  updateAttributes(attributes: SerializedNode['attributes']) {
    const writable = this.getWritable()
    writable.__attributes = {
      ...writable.__attributes,
      ...attributes,
    }
    writable.__isLoading = false
  }

  setLoading(isLoading: boolean) {
    const writable = this.getWritable()
    writable.__isLoading = isLoading
  }

  static importJSON(serializedNode: SerializedNode): ReferenceNode {
    const { path, attributes } = serializedNode
    return new ReferenceNode({
      path,
      attributes,
    })
  }

  exportJSON(): SerializedNode & { type: 'prompt'; version: number } {
    return {
      type: 'prompt',
      version: 1,
      path: this.__path,
      attributes: {
        ...this.__attributes,
        path: this.__path, // Ensure path is always included
      },
    }
  }

  isInline() {
    return true
  }
}
