import { DecoratorNode } from 'lexical'
import { JSX } from 'react'
import {
  BLOCK_EDITOR_TYPE,
  ConfigBlock,
} from '../../state/promptlToLexical/types'

export class ConfigNode extends DecoratorNode<JSX.Element> {
  __config: string

  static getType() {
    return BLOCK_EDITOR_TYPE.CONFIG
  }

  static clone(node: ConfigNode) {
    return new ConfigNode(node.__config, node.__key)
  }

  constructor(config: string, key?: string) {
    super(key)
    this.__config = config
  }

  createDOM() {
    const span = document.createElement('span')
    span.className = 'promptl-config hidden'
    return span
  }

  updateDOM() {
    return false
  }

  decorate() {
    return <span className='hidden promptl-config' />
  }

  static importJSON(serializedNode: ConfigBlock) {
    return new ConfigNode(serializedNode.config)
  }

  exportJSON(): ConfigBlock {
    return {
      ...super.exportJSON(),
      version: 1,
      type: BLOCK_EDITOR_TYPE.CONFIG,
      config: this.__config,
    }
  }

  isInline() {
    return true
  }
}
