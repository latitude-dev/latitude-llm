import { DecoratorNode } from 'lexical'
import { JSX } from 'react'
import { BlocksEditorProps, IncludedPrompt } from '../../../types'

type SerializedNode = {
  type: 'reference'
  version: 1
  path: string
  prompt: IncludedPrompt
  ReferenceLink: BlocksEditorProps['ReferenceLink']
}

export class ReferenceNode extends DecoratorNode<JSX.Element> {
  __path: string
  __prompt: IncludedPrompt
  __ReferenceLink: BlocksEditorProps['ReferenceLink']

  static getType() {
    return 'reference'
  }

  static clone(node: ReferenceNode) {
    return new ReferenceNode({
      key: node.__key,
      path: node.__path,
      prompt: node.__prompt,
      ReferenceLink: node.__ReferenceLink,
    })
  }

  constructor({
    key,
    path,
    prompt,
    ReferenceLink,
  }: {
    prompt: IncludedPrompt
    path: string
    ReferenceLink: BlocksEditorProps['ReferenceLink']
    key?: string
  }) {
    super(key)
    this.__path = path
    this.__prompt = prompt
    this.__ReferenceLink = ReferenceLink
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
    return <this.__ReferenceLink url={this.__prompt.url} path={this.__path} />
  }

  static importJSON(serializedNode: SerializedNode) {
    return new ReferenceNode({
      prompt: serializedNode.prompt,
      path: serializedNode.path,
      ReferenceLink: serializedNode.ReferenceLink,
    })
  }

  exportJSON() {
    return {
      type: 'reference',
      version: 1,
      path: this.__path,
      prompt: this.__prompt,
    }
  }

  isInline() {
    return true
  }
}
