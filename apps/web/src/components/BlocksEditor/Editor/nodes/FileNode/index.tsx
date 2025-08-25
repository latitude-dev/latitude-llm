import { isSafeUrl } from '@latitude-data/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { DecoratorNode } from 'lexical'
import type { JSX } from 'react'
import { BLOCK_EDITOR_TYPE, type FileBlock } from '../../state/promptlToLexical/types'

function FileComponent({ src }: { src: string }) {
  if (!isSafeUrl(src)) {
    return (
      <div className='min-w-[20.5rem] w-fit flex flex-row p-4 gap-2 bg-muted rounded-xl justify-center items-center border border-border'>
        <Icon name='fileOff' color='foregroundMuted' />
        <Text.H5
          color='foregroundMuted'
          whiteSpace='preWrap'
          wordBreak='breakAll'
          userSelect={false}
        >
          File preview unavailable
        </Text.H5>
      </div>
    )
  }

  return (
    <a
      href={src}
      target='_blank'
      rel='noopener noreferrer'
      className={cn(
        'flex flex-row p-4 gap-2 rounded-xl min-w-[20.5rem] w-fit justify-center items-center',
        'text-muted-foreground bg-muted border border-border',
      )}
    >
      <Icon name='file' color='foregroundMuted' />
      <Text.H5 whiteSpace='preWrap' wordBreak='breakAll' color='foregroundMuted' userSelect={false}>
        {src.split('/').at(-1) || 'Unnamed file'}
      </Text.H5>
    </a>
  )
}

export class FileNode extends DecoratorNode<JSX.Element> {
  __content: string
  __attributes: FileBlock['attributes']
  __readOnly?: boolean

  static getType() {
    return BLOCK_EDITOR_TYPE.FILE_CONTENT
  }

  static clone(node: FileNode) {
    return new FileNode(node.__content, node.__attributes, node.__readOnly, node.__key)
  }

  constructor(
    content: string,
    attributes: FileBlock['attributes'],
    readOnly?: boolean,
    key?: string,
  ) {
    super(key)
    this.__content = content
    this.__attributes = attributes
    this.__readOnly = readOnly
  }

  createDOM() {
    const dom = document.createElement('span')
    dom.className = 'align-baseline standalone-tooltip table-cell'
    // Note: prevent modifying file blocks or triggering the /menu
    dom.setAttribute('contenteditable', 'false')
    dom.style.userSelect = 'none'
    // Note: using css-only standalone tooltip
    dom.setAttribute('data-tooltip', 'Switch to Dev Mode to edit file blocks')
    dom.setAttribute('data-tooltip-position', 'center')
    return dom
  }

  updateDOM() {
    return false
  }

  decorate() {
    return <FileComponent src={this.__content} />
  }

  static importJSON(serializedNode: FileBlock) {
    return new FileNode(serializedNode.content, serializedNode.attributes, serializedNode.readOnly)
  }

  exportJSON(): FileBlock {
    return {
      ...super.exportJSON(),
      version: 1,
      type: BLOCK_EDITOR_TYPE.FILE_CONTENT,
      content: this.__content,
      attributes: this.__attributes,
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
