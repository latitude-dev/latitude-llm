import { memo, useMemo } from 'react'

import {
  ImageContent,
  PromptlSourceRef,
} from '@latitude-data/constants/messages'

import {
  isEncodedImage,
  isInlineImage,
  isSafeUrl,
} from '@latitude-data/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Image } from '@latitude-data/web-ui/atoms/Image'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { AnnotationSection } from './_components/AnnotationSection'
import { ReferenceComponent } from './_components/Reference'
import { useBlockAnnotations } from './_hooks/useBlockAnnotations'
import { computeSegments } from './helpers'

export const ImageMessageContent = memo(
  ({
    index = 0,
    color,
    size,
    image,
    sourceMap = [],
    messageIndex,
    contentBlockIndex,
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    image: ImageContent['image']
    sourceMap?: PromptlSourceRef[]
    messageIndex?: number
    contentBlockIndex?: number
  }) => {
    const TextComponent = size === 'small' ? Text.H5 : Text.H4
    const { blockAnnotations, evaluation, span } = useBlockAnnotations({
      contentType: 'image',
      messageIndex,
      contentBlockIndex,
      requireMainSpan: true,
    })
    const segment = useMemo(
      () => computeSegments('image', image.toString(), sourceMap),
      [image, sourceMap],
    )[0]

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

    return (
      <div className='flex flex-col gap-4'>
        {imageContent}
        <AnnotationSection
          blockAnnotations={blockAnnotations}
          evaluation={evaluation}
          span={span}
          messageIndex={messageIndex}
          contentBlockIndex={contentBlockIndex}
          contentType='image'
        />
      </div>
    )
  },
)
