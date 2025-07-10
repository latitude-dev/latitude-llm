import { DecoratorNode, LexicalNode } from 'lexical'
import { JSX } from 'react'
import { ReferenceLink } from './ReferenceLink'
import {
  BLOCK_EDITOR_TYPE,
  type ReferenceLink as SerializedReferenceLink,
} from '../../state/promptlToLexical/types'
import { AstError } from '@latitude-data/constants/promptl'

export class ReferenceNode extends DecoratorNode<JSX.Element> {
  __errors: AstError[] | undefined = undefined
  __path: string
  __attributes: SerializedReferenceLink['attributes']
  __isLoading: boolean = false

  static getType() {
    return BLOCK_EDITOR_TYPE.REFERENCE_LINK
  }

  static clone(node: ReferenceNode) {
    return new ReferenceNode({
      key: node.__key,
      errors: node.__errors,
      attributes: node.__attributes,
      path: node.__path,
    })
  }

  constructor({
    key,
    errors,
    attributes,
    isLoading = false,
    path,
  }: Omit<SerializedReferenceLink, 'type' | 'version'> & {
    errors?: AstError[]
    path: string
    isLoading?: boolean
    key?: string
  }) {
    super(key)
    this.__errors = errors
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
        isLoading={this.__isLoading}
        nodeKey={this.getKey()}
        path={this.__path}
        attributes={this.__attributes}
        errors={this.__errors}
      />
    )
  }

  static importJSON(serializedNode: SerializedReferenceLink): ReferenceNode {
    return new ReferenceNode({
      errors: serializedNode.errors,
      path: serializedNode.path,
      attributes: serializedNode.attributes,
    })
  }

  setPath(newPath: string) {
    const writable = this.getWritable()
    writable.__path = newPath
    return writable
  }

  updateAttributes(attributes: SerializedReferenceLink['attributes']) {
    const writable = this.getWritable()
    writable.__attributes = {
      ...writable.__attributes,
      ...attributes,
    }
    writable.__isLoading = false
  }

  exportJSON(): SerializedReferenceLink {
    return {
      version: 1,
      type: BLOCK_EDITOR_TYPE.REFERENCE_LINK,
      path: this.__path,
      attributes: this.__attributes,
    }
  }

  isInline() {
    return true
  }
}

export function $isReferenceNode(
  node: LexicalNode | null | undefined,
): node is ReferenceNode {
  return node instanceof ReferenceNode
}
