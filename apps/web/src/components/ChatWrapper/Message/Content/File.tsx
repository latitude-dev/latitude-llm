import {
  FileContent,
  PromptlSourceRef,
} from '@latitude-data/constants/legacyCompiler'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { memo, useMemo } from 'react'
import { computeSegments } from './helpers'
import {
  isMainSpan,
  isSafeUrl,
  MainSpanType,
  SpanWithDetails,
} from '@latitude-data/constants'
import { ReferenceComponent } from './_components/Reference'
import { FileComponent } from './_components/FileComponent'
import { useAnnotations } from '../../AnnotationsContext'
import { AnnotationForm } from '$/components/evaluations/Annotation/Form'

export const FileMessageContent = memo(
  ({
    index = 0,
    color,
    size,
    file,
    parameters = [],
    sourceMap = [],
    messageIndex,
    contentBlockIndex,
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    file: FileContent['file']
    parameters?: string[]
    sourceMap?: PromptlSourceRef[]
    messageIndex?: number
    contentBlockIndex?: number
  }) => {
    const { getAnnotationsForBlock, evaluations = [], span } = useAnnotations()
    const TextComponent = size === 'small' ? Text.H6 : Text.H5
    const segment = useMemo(
      () => computeSegments('file', file.toString(), sourceMap, parameters),
      [file, sourceMap, parameters],
    )[0]

    // Get annotations for this specific block
    const blockAnnotations = useMemo(() => {
      if (
        messageIndex === undefined ||
        contentBlockIndex === undefined ||
        !getAnnotationsForBlock ||
        !span ||
        !isMainSpan(span)
      ) {
        return []
      }
      return getAnnotationsForBlock(messageIndex, contentBlockIndex).filter(
        (ann) => ann.context.contentType === 'file',
      )
    }, [messageIndex, contentBlockIndex, getAnnotationsForBlock, span])

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

    const evaluation = evaluations[0]

    return (
      <div className='flex flex-col gap-4'>
        {fileContent}
        {(blockAnnotations.length > 0 || evaluation) && span && (
          <div className='flex flex-col gap-y-4 border-t pt-4'>
            {blockAnnotations.map((annotation) => (
              <AnnotationForm
                key={`${annotation.result.uuid}-${annotation.evaluation.uuid}`}
                evaluation={annotation.evaluation}
                span={span as SpanWithDetails<MainSpanType>}
                result={annotation.result}
                initialExpanded={false}
              />
            ))}
            {!blockAnnotations.length &&
              evaluation &&
              messageIndex &&
              contentBlockIndex &&
              span !== undefined &&
              isMainSpan(span) && (
                <AnnotationForm
                  evaluation={evaluation}
                  span={span as SpanWithDetails<MainSpanType>}
                  initialExpanded={false}
                  selectedContext={{
                    messageIndex,
                    contentBlockIndex,
                    contentType: 'file',
                  }}
                />
              )}
          </div>
        )}
      </div>
    )
  },
)
