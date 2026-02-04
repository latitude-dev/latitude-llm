import { isSafeUrl } from '@latitude-data/constants'
import {
  FileContent,
  PromptlSourceRef,
} from '@latitude-data/constants/messages'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { memo, useMemo } from 'react'
import { AnnotationSection } from './_components/AnnotationSection'
import { FileComponent } from './_components/FileComponent'
import { ReferenceComponent } from './_components/Reference'
import { useBlockAnnotations } from './_hooks/useBlockAnnotations'
import { computeSegments } from './helpers'

export const FileMessageContent = memo(
  ({
    index = 0,
    color,
    size,
    file,
    sourceMap = [],
    messageIndex,
    contentBlockIndex,
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    file: FileContent['file']
    sourceMap?: PromptlSourceRef[]
    messageIndex?: number
    contentBlockIndex?: number
  }) => {
    const TextComponent = size === 'small' ? Text.H6 : Text.H5
    const { blockAnnotations, evaluation, span } = useBlockAnnotations({
      contentType: 'file',
      messageIndex,
      contentBlockIndex,
      requireMainSpan: true,
    })
    const segment = useMemo(
      () => computeSegments('file', file.toString(), sourceMap),
      [file, sourceMap],
    )[0]

    const fileContent = (() => {
      if (!isSafeUrl(file)) {
        return (
          <div className='flex flex-row p-4 gap-2 bg-muted rounded-xl w-fit items-center'>
            <Icon name='fileOff' color='foregroundMuted' />
            <Text.H5 color={color} whiteSpace='preWrap' wordBreak='breakAll'>
              {'<File preview unavailable>'}
            </Text.H5>
          </div>
        )
      }

      if (!segment || typeof segment === 'string') {
        return <FileComponent src={file.toString()} />
      }

      return (
        <TextComponent
          color={color}
          whiteSpace='preWrap'
          wordBreak='breakAll'
          key={`${index}`}
        >
          <ReferenceComponent reference={segment} />
        </TextComponent>
      )
    })()

    return (
      <div className='flex flex-col gap-4'>
        {fileContent}
        <AnnotationSection
          blockAnnotations={blockAnnotations}
          evaluation={evaluation}
          span={span}
          messageIndex={messageIndex}
          contentBlockIndex={contentBlockIndex}
          contentType='file'
          initialExpanded={false}
          includeSelectedContextForExisting={false}
        />
      </div>
    )
  },
)
