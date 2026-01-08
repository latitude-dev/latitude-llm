import { memo, useMemo } from 'react'

import {
  ImageContent,
  PromptlSourceRef,
} from '@latitude-data/constants/legacyCompiler'

import {
  isEncodedImage,
  isInlineImage,
  isMainSpan,
  isSafeUrl,
  MainSpanType,
  SpanWithDetails,
} from '@latitude-data/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Image } from '@latitude-data/web-ui/atoms/Image'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { computeSegments } from './helpers'
import { ReferenceComponent } from './_components/Reference'
import { useAnnotations } from '../../AnnotationsContext'
import { AnnotationForm } from '$/components/evaluations/Annotation/Form'

export const ImageMessageContent = memo(
  ({
    index = 0,
    color,
    size,
    image,
    parameters = [],
    sourceMap = [],
    messageIndex,
    contentBlockIndex,
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    image: ImageContent['image']
    parameters?: string[]
    sourceMap?: PromptlSourceRef[]
    messageIndex?: number
    contentBlockIndex?: number
  }) => {
    const { getAnnotationsForBlock, evaluations = [], span } = useAnnotations()
    const TextComponent = size === 'small' ? Text.H5 : Text.H4
    const segment = useMemo(
      () => computeSegments('image', image.toString(), sourceMap, parameters),
      [image, sourceMap, parameters],
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
        (ann) => ann.context.contentType === 'image',
      )
    }, [messageIndex, contentBlockIndex, getAnnotationsForBlock, span])

    const imageContent = (() => {
      if (!isSafeUrl(image)) {
        if (isInlineImage(image)) {
          return (
            <Image
              src={image.toString()}
              className='max-h-72 rounded-xl w-fit object-contain'
            />
          )
        }

        if (isEncodedImage(image)) {
          return (
            <Image
              src={`data:image/png;base64,${image.toString()}`}
              className='max-h-72 rounded-xl w-fit object-contain'
            />
          )
        }

        return (
          <div className='flex flex-row p-4 gap-2 bg-muted rounded-xl w-fit items-center'>
            <Icon name='imageOff' color='foregroundMuted' />
            <TextComponent
              color={color}
              whiteSpace='preWrap'
              wordBreak='breakAll'
            >
              {'<Image preview unavailable>'}
            </TextComponent>
          </div>
        )
      }

      if (!segment || typeof segment === 'string') {
        return (
          <Image
            src={image.toString()}
            className='max-h-72 rounded-xl w-fit object-contain'
          />
        )
      }

      return (
        <TextComponent
          key={index}
          color={color}
          whiteSpace='preWrap'
          wordBreak='breakAll'
        >
          {typeof segment === 'string' ? (
            segment
          ) : (
            <ReferenceComponent reference={segment} />
          )}
        </TextComponent>
      )
    })()

    const evaluation = evaluations[0]

    return (
      <div className='flex flex-col gap-4'>
        {imageContent}
        {(blockAnnotations.length > 0 || evaluation) && span && (
          <div className='flex flex-col gap-y-4 border-t pt-4'>
            {blockAnnotations.map((annotation) => (
              <AnnotationForm
                key={`${annotation.result.uuid}-${annotation.evaluation.uuid}`}
                evaluation={annotation.evaluation}
                result={annotation.result}
                selectedContext={annotation.context}
                span={span as SpanWithDetails<MainSpanType>}
              />
            ))}
            {blockAnnotations.length === 0 &&
              evaluation &&
              messageIndex !== undefined &&
              contentBlockIndex !== undefined &&
              span !== undefined &&
              isMainSpan(span) && (
                <AnnotationForm
                  key={`${evaluation.uuid}-${messageIndex}-${contentBlockIndex}`}
                  evaluation={evaluation}
                  selectedContext={{
                    messageIndex,
                    contentBlockIndex,
                    contentType: 'image',
                  }}
                  span={span as SpanWithDetails<MainSpanType>}
                />
              )}
          </div>
        )}
      </div>
    )
  },
)
