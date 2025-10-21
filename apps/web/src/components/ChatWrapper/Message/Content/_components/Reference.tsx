import { useState } from 'react'
import { Reference } from '../helpers'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { cn } from '@latitude-data/web-ui/utils'
import { colors, font } from '@latitude-data/web-ui/tokens'
import { Image } from '@latitude-data/web-ui/atoms/Image'
import { FileComponent } from './FileComponent'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function ReferenceComponent({ reference }: { reference: Reference }) {
  const [collapseReference, setCollapseReference] = useState(true)

  if (collapseReference) {
    return (
      <Tooltip
        asChild
        variant={reference.type === 'text' ? 'inverse' : 'ghost'}
        trigger={
          reference.identifier ? (
            <Badge
              variant='accent'
              className='cursor-pointer inline-flex align-text-top'
              onClick={() => setCollapseReference(!collapseReference)}
            >
              <Text.H5M color='primary'>{`{{${reference.identifier}}}`}</Text.H5M>
            </Badge>
          ) : (
            <span
              className={cn(
                colors.textColors.accentForeground,
                'cursor-pointer',
              )}
              onClick={() => setCollapseReference(!collapseReference)}
            >
              (...)
            </span>
          )
        }
      >
        {reference.type === 'text' && (
          <div className='line-clamp-6'>{reference.content}</div>
        )}
        {reference.type === 'image' && (
          <Image
            src={reference.content}
            className='max-h-72 rounded-xl w-fit object-contain'
          />
        )}
        {reference.type === 'file' && <FileComponent src={reference.content} />}
      </Tooltip>
    )
  }

  return (
    <Tooltip
      asChild
      trigger={
        <span
          className={cn(colors.textColors.accentForeground, 'cursor-pointer', {
            [font.weight.semibold]: !!reference.identifier,
            inline: reference.type === 'text',
            'inline-flex py-2': reference.type !== 'text',
          })}
          onClick={() => setCollapseReference(!collapseReference)}
        >
          {reference.type === 'text' && (
            <Text.H4 color='primary'>{reference.content}</Text.H4>
          )}
          {reference.type === 'image' && (
            <Image src={reference.content} className='max-h-72 rounded-xl' />
          )}
          {reference.type === 'file' && (
            <FileComponent src={reference.content} />
          )}
        </span>
      }
    >
      <div className='line-clamp-6'>{reference.identifier || 'dynamic'}</div>
    </Tooltip>
  )
}
