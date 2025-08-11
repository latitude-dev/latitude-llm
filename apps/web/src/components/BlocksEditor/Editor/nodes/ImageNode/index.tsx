import { isSafeUrl } from '@latitude-data/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Image } from '@latitude-data/web-ui/atoms/Image'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DecoratorNode } from 'lexical'
import { JSX } from 'react'
import {
  BLOCK_EDITOR_TYPE,
  ImageBlock,
} from '../../state/promptlToLexical/types'

function ImageComponent({ src }: { src: string }) {
  if (!isSafeUrl(src)) {
    return (
      <div className='min-w-[20.5rem] w-fit flex flex-row p-4 gap-2 bg-muted rounded-xl justify-center items-center border border-border'>
        <Icon name='imageOff' color='foregroundMuted' />
        <Text.H5
          color='foregroundMuted'
          whiteSpace='preWrap'
          wordBreak='breakAll'
          userSelect={false}
        >
          Image preview unavailable
        </Text.H5>
      </div>
    )
  }

  return (
    <Image
      src={src}
      className='max-h-72 min-w-[20.5rem] w-fit object-contain rounded-xl'
    />
  )
}

export class ImageNode extends DecoratorNode<JSX.Element> {
  __content: string
  __readOnly?: boolean

  static getType() {
    return BLOCK_EDITOR_TYPE.IMAGE_CONTENT
  }

  static clone(node: ImageNode) {
    return new ImageNode(node.__content, node.__readOnly, node.__key)
  }

  constructor(content: string, readOnly?: boolean, key?: string) {
    super(key)
    this.__content = content
    this.__readOnly = readOnly
  }

  createDOM() {
    const dom = document.createElement('span')
    dom.className = 'align-baseline standalone-tooltip table-cell'
    // Note: prevent modifying image blocks or triggering the /menu
    dom.setAttribute('contenteditable', 'false')
    dom.style.userSelect = 'none'
    // Note: using css-only standalone tooltip
    dom.setAttribute('data-tooltip', 'Switch to Dev Mode to edit image blocks')
    dom.setAttribute('data-tooltip-position', 'center')
    return dom
  }

  updateDOM() {
    return false
  }

  decorate() {
    return <ImageComponent src={this.__content} />
  }

  static importJSON(serializedNode: ImageBlock) {
    return new ImageNode(serializedNode.content, serializedNode.readOnly)
  }

  exportJSON(): ImageBlock {
    return {
      ...super.exportJSON(),
      version: 1,
      type: BLOCK_EDITOR_TYPE.IMAGE_CONTENT,
      content: this.__content,
      readOnly: this.getReadOnly(),
    }
  }

  isInline() {
    return false
  }

  getReadOnly(): boolean | undefined {
    return this.getLatest().__readOnly
  }
}
