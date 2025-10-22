import { memo, useMemo } from 'react'

import {
  ImageContent,
  PromptlSourceRef,
} from '@latitude-data/constants/legacyCompiler'

import {
  isEncodedImage,
  isInlineImage,
  isSafeUrl,
} from '@latitude-data/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Image } from '@latitude-data/web-ui/atoms/Image'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { computeSegments } from './helpers'
import { ReferenceComponent } from './_components/Reference'

export const ImageMessageContent = memo(
  ({
    index = 0,
    color,
    size,
    image,
    parameters = [],
    sourceMap = [],
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    image: ImageContent['image']
    parameters?: string[]
    sourceMap?: PromptlSourceRef[]
  }) => {
    const TextComponent = size === 'small' ? Text.H5 : Text.H4
    const segment = useMemo(
      () => computeSegments('image', image.toString(), sourceMap, parameters),
      [image, sourceMap, parameters],
    )[0]

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
  },
)
