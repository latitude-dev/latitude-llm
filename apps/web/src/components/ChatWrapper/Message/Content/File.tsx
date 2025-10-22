import {
  FileContent,
  PromptlSourceRef,
} from '@latitude-data/constants/legacyCompiler'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { memo, useMemo } from 'react'
import { computeSegments } from './helpers'
import { isSafeUrl } from '@latitude-data/constants'
import { ReferenceComponent } from './_components/Reference'
import { FileComponent } from './_components/FileComponent'

export const FileMessageContent = memo(
  ({
    index = 0,
    color,
    size,
    file,
    parameters = [],
    sourceMap = [],
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    file: FileContent['file']
    parameters?: string[]
    sourceMap?: PromptlSourceRef[]
  }) => {
    const TextComponent = size === 'small' ? Text.H6 : Text.H5
    const segment = useMemo(
      () => computeSegments('file', file.toString(), sourceMap, parameters),
      [file, sourceMap, parameters],
    )[0]

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
  },
)
